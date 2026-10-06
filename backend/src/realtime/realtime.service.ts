import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { WebSocketServer, type WebSocket } from 'ws';
import { TokenService } from '../auth/token.service.js';
import { PinsService } from '../pins/pins.service.js';
import { PresenceService } from '../presence/presence.service.js';
import { UsersService } from '../users/users.service.js';
import { VenuesService } from '../venues/venues.service.js';
import { type ClientConnection, ConnectionRegistry } from './connection-registry.js';
import { type ClientMessage, type ServerEvent, clientMessageSchema } from './protocol.js';

const WS_PATH = '/ws';
const PING_INTERVAL_MS = 30_000;
const MAX_MESSAGE_BYTES = 4096;

/**
 * Plain WebSocket endpoint. Authentication happens on the HTTP upgrade (Bearer header),
 * so an unauthenticated client gets a normal 401 response instead of a socket.
 */
@Injectable()
export class RealtimeService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private wss: WebSocketServer | null = null;
  private pingTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly tokens: TokenService,
    private readonly users: UsersService,
    private readonly presence: PresenceService,
    private readonly venues: VenuesService,
    private readonly registry: ConnectionRegistry,
    private readonly pins: PinsService,
  ) {}

  onApplicationBootstrap(): void {
    const server = this.adapterHost.httpAdapter.getHttpServer() as import('node:http').Server;
    this.wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
    server.on('upgrade', (req, socket, head) => void this.onUpgrade(req, socket, head));
    this.pingTimer = setInterval(() => this.pingAll(), PING_INTERVAL_MS);
    this.pingTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    for (const conn of this.registry.connections()) conn.socket.terminate();
    this.wss?.close();
  }

  private async onUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== WS_PATH) {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    if (!token) return this.rejectUpgrade(socket, 401, 'Unauthorized');

    let userId: string;
    try {
      ({ userId } = await this.tokens.verifyAccess(token));
    } catch {
      return this.rejectUpgrade(socket, 401, 'Unauthorized');
    }
    const user = await this.users.getSnapshot(userId);
    if (!user) return this.rejectUpgrade(socket, 401, 'Unauthorized');
    if (user.suspendedAt) return this.rejectUpgrade(socket, 403, 'Forbidden');

    const build = typeof req.headers['x-larea-build'] === 'string' ? req.headers['x-larea-build'].slice(0, 32) : undefined;
    this.wss!.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws, userId, build));
  }

  private rejectUpgrade(socket: Duplex, status: number, text: string): void {
    socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
  }

  private onConnection(socket: WebSocket, userId: string, build?: string): void {
    const conn: ClientConnection = { id: randomUUID(), userId, build, socket, venueIds: new Set(), pinIds: new Set(), alive: true };
    this.registry.add(conn);
    socket.on('pong', () => (conn.alive = true));
    socket.on('message', (data) => void this.onMessage(conn, data.toString()));
    socket.on('close', () => this.registry.remove(conn));
    socket.on('error', (err) => this.logger.debug({ err: err.message }, 'socket error'));
  }

  private async onMessage(conn: ClientConnection, raw: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return this.send(conn, { type: 'error', code: 'BAD_JSON', message: 'Messages must be JSON.' });
    }
    const result = clientMessageSchema.safeParse(parsed);
    if (!result.success) {
      const reqId = typeof (parsed as { reqId?: unknown })?.reqId === 'string' ? (parsed as { reqId: string }).reqId : undefined;
      return this.send(conn, { type: 'error', reqId, code: 'BAD_MESSAGE', message: result.error.issues[0]?.message ?? 'Invalid message.' });
    }
    try {
      await this.dispatch(conn, result.data);
    } catch (err) {
      this.logger.error({ err }, 'realtime handler failed');
      this.send(conn, { type: 'error', reqId: result.data.reqId, code: 'INTERNAL', message: 'Something went wrong. Please try again.' });
    }
  }

  private async dispatch(conn: ClientConnection, msg: ClientMessage): Promise<void> {
    switch (msg.type) {
      case 'ping':
        return this.send(conn, { type: 'pong', reqId: msg.reqId });
      case 'join': {
        const membership = await this.presence.findActive(conn.userId, msg.venueId);
        if (!membership) return this.send(conn, { type: 'ack', reqId: msg.reqId, ok: false, reason: 'not_member' });
        this.registry.joinVenue(conn, msg.venueId);
        const memberCount = await this.venues.activeMemberCount(msg.venueId);
        return this.send(conn, {
          type: 'ack',
          reqId: msg.reqId,
          ok: true,
          data: { membershipId: membership.id, memberCount, timing: this.presence.timing },
        });
      }
      case 'leave': {
        this.registry.leaveVenue(conn, msg.venueId);
        const left = await this.presence.leave(conn.userId, msg.venueId);
        return this.send(conn, { type: 'ack', reqId: msg.reqId, ok: true, data: { left } });
      }
      case 'pin_subscribe': {
        const result = await this.pins.canFollow(conn.userId, msg.pinId, msg);
        if (!result.ok) return this.send(conn, { type: 'ack', reqId: msg.reqId, ok: false, reason: result.reason });
        this.registry.joinPin(conn, msg.pinId);
        return this.send(conn, { type: 'ack', reqId: msg.reqId, ok: true });
      }
      case 'pin_unsubscribe': {
        this.registry.leavePin(conn, msg.pinId);
        return this.send(conn, { type: 'ack', reqId: msg.reqId, ok: true });
      }
      case 'heartbeat': {
        const result = await this.presence.heartbeat(conn.userId, msg.venueId, msg);
        if (!result.ok) {
          this.registry.leaveVenue(conn, msg.venueId);
          return this.send(conn, { type: 'ack', reqId: msg.reqId, ok: false, reason: result.reason });
        }
        if (result.removed) this.registry.leaveVenue(conn, msg.venueId);
        return this.send(conn, {
          type: 'ack',
          reqId: msg.reqId,
          ok: true,
          reason: result.reason,
          data: { state: result.state, removed: result.removed ?? false },
        });
      }
    }
  }

  private send(conn: ClientConnection, event: ServerEvent): void {
    if (conn.socket.readyState === conn.socket.OPEN) conn.socket.send(JSON.stringify(event));
  }

  private pingAll(): void {
    for (const conn of this.registry.connections()) {
      if (!conn.alive) {
        conn.socket.terminate();
        continue;
      }
      conn.alive = false;
      conn.socket.ping();
    }
  }
}
