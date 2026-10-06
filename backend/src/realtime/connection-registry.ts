import { Injectable } from '@nestjs/common';
import type { WebSocket } from 'ws';

export interface ClientConnection {
  id: string;
  userId: string;
  /** The app build from the upgrade's X-Larea-Build header ("solana" for the dApp Store build). */
  build?: string;
  socket: WebSocket;
  venueIds: Set<string>;
  /** Pin chats this socket follows (any number, unlike venues). */
  pinIds: Set<string>;
  alive: boolean;
}

/** In-memory index of this instance's sockets by user, by venue room and by pin chat. */
@Injectable()
export class ConnectionRegistry {
  private readonly byUser = new Map<string, Set<ClientConnection>>();
  private readonly byVenue = new Map<string, Set<ClientConnection>>();
  private readonly byPin = new Map<string, Set<ClientConnection>>();
  private readonly all = new Set<ClientConnection>();

  add(conn: ClientConnection): void {
    this.all.add(conn);
    this.index(this.byUser, conn.userId, conn);
  }

  remove(conn: ClientConnection): void {
    this.all.delete(conn);
    this.unindex(this.byUser, conn.userId, conn);
    for (const venueId of conn.venueIds) this.unindex(this.byVenue, venueId, conn);
    conn.venueIds.clear();
    for (const pinId of conn.pinIds) this.unindex(this.byPin, pinId, conn);
    conn.pinIds.clear();
  }

  joinVenue(conn: ClientConnection, venueId: string): void {
    conn.venueIds.add(venueId);
    this.index(this.byVenue, venueId, conn);
  }

  leaveVenue(conn: ClientConnection, venueId: string): void {
    conn.venueIds.delete(venueId);
    this.unindex(this.byVenue, venueId, conn);
  }

  joinPin(conn: ClientConnection, pinId: string): void {
    conn.pinIds.add(pinId);
    this.index(this.byPin, pinId, conn);
  }

  leavePin(conn: ClientConnection, pinId: string): void {
    conn.pinIds.delete(pinId);
    this.unindex(this.byPin, pinId, conn);
  }

  forPin(pinId: string): ClientConnection[] {
    return [...(this.byPin.get(pinId) ?? [])];
  }

  forUser(userId: string): ClientConnection[] {
    return [...(this.byUser.get(userId) ?? [])];
  }

  forVenue(venueId: string): ClientConnection[] {
    return [...(this.byVenue.get(venueId) ?? [])];
  }

  connections(): ClientConnection[] {
    return [...this.all];
  }

  get size(): number {
    return this.all.size;
  }

  private index(map: Map<string, Set<ClientConnection>>, key: string, conn: ClientConnection): void {
    let set = map.get(key);
    if (!set) map.set(key, (set = new Set()));
    set.add(conn);
  }

  private unindex(map: Map<string, Set<ClientConnection>>, key: string, conn: ClientConnection): void {
    const set = map.get(key);
    if (!set) return;
    set.delete(conn);
    if (set.size === 0) map.delete(key);
  }
}
