import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { RedisService } from '../infra/redis/redis.service.js';
import { ConnectionRegistry } from './connection-registry.js';
import type { ServerEvent } from './protocol.js';

const CHANNEL = 'rt:events';

/** Narrows a venue fan-out to some people, optionally on one app build (the Regulars room). */
export interface Audience {
  userIds: string[];
  /** Only sockets of this app build; any build when absent. */
  build?: string;
}

interface Envelope {
  target: { venueId?: string; pinId?: string; userId?: string };
  /** Pin targets: drop the reached sockets from the pin chat after delivering (ban, close). */
  leavePin?: boolean;
  excludeUserIds?: string[];
  audience?: Audience;
  event?: ServerEvent;
  close?: { code: number; reason: string };
}

/**
 * Publishes realtime events through Redis so every backend instance delivers them to
 * the sockets it holds. Events are fire-and-forget.
 */
@Injectable()
export class RealtimeBus implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeBus.name);
  private subscriber: Redis | null = null;

  constructor(
    private readonly redis: RedisService,
    private readonly registry: ConnectionRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    this.subscriber = this.redis.createSubscriber();
    this.subscriber.on('message', (_channel: string, raw: string) => {
      try {
        this.deliver(JSON.parse(raw) as Envelope);
      } catch (err) {
        this.logger.error({ err }, 'failed to deliver realtime envelope');
      }
    });
    await this.subscriber.subscribe(CHANNEL);
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscriber?.unsubscribe(CHANNEL).catch(() => undefined);
  }

  toVenue(venueId: string, event: ServerEvent, excludeUserIds: string[] = [], audience?: Audience): void {
    this.publish({ target: { venueId }, excludeUserIds, audience, event });
  }

  /** Everyone following a pin's chat. */
  toPin(pinId: string, event: ServerEvent, excludeUserIds: string[] = []): void {
    this.publish({ target: { pinId }, excludeUserIds, event });
  }

  /** Tells the pin's followers (or one of them) that the chat is gone for them, and unsubscribes them. */
  closePin(pinId: string, event: ServerEvent, onlyUserId?: string): void {
    this.publish({ target: { pinId, userId: onlyUserId }, event, leavePin: true });
  }

  toUser(userId: string, event: ServerEvent): void {
    this.publish({ target: { userId }, event });
  }

  closeUser(userId: string, code: number, reason: string): void {
    this.publish({ target: { userId }, close: { code, reason } });
  }

  private publish(envelope: Envelope): void {
    void this.redis.client.publish(CHANNEL, JSON.stringify(envelope)).catch((err) => this.logger.error({ err }, 'publish failed'));
  }

  /** Delivers an envelope to sockets held by this instance. */
  deliver(envelope: Envelope): void {
    const excluded = new Set(envelope.excludeUserIds ?? []);
    const audience = envelope.audience ? { userIds: new Set(envelope.audience.userIds), build: envelope.audience.build } : null;
    const { pinId } = envelope.target;
    const conns = envelope.target.venueId
      ? this.registry.forVenue(envelope.target.venueId)
      : pinId
        ? this.registry.forPin(pinId).filter((c) => !envelope.target.userId || c.userId === envelope.target.userId)
        : envelope.target.userId
        ? this.registry.forUser(envelope.target.userId)
        : [];
    const payload = envelope.event ? JSON.stringify(envelope.event) : null;
    for (const conn of conns) {
      if (excluded.has(conn.userId)) continue;
      if (audience && ((audience.build && conn.build !== audience.build) || !audience.userIds.has(conn.userId))) continue;
      if (envelope.close) {
        conn.socket.close(envelope.close.code, envelope.close.reason);
        continue;
      }
      if (payload && conn.socket.readyState === conn.socket.OPEN) conn.socket.send(payload);
      if (pinId && envelope.leavePin) this.registry.leavePin(conn, pinId);
    }
  }
}
