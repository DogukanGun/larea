import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { forbidden, unprocessable } from '../common/errors.js';
import { InjectEnv } from '../config/inject-env.js';
import type { Env } from '../config/env.js';
import type { Membership, MembershipEndReason } from '../generated/prisma/client.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { RedisService } from '../infra/redis/redis.service.js';
import { RealtimeBus } from '../realtime/realtime.bus.js';
import { type RemovalReason, removalMessage } from '../realtime/protocol.js';
import { classifyFix, haversineMeters, impliedSpeedMps, joinVerdict } from '../venues/geo.js';
import { type VenueView, VenuesService, toVenueView } from '../venues/venues.service.js';

export interface LocationFix {
  lat: number;
  lng: number;
  accuracy: number;
  mocked?: boolean;
}

export interface JoinResult {
  membership: { id: string; venueId: string; joinedAt: string };
  venue: VenueView;
  timing: { heartbeatIntervalSec: number; staleAfterSec: number; weakGpsGraceSec: number };
  memberCount: number;
}

export type HeartbeatState = 'eligible' | 'weak_gps' | 'outside' | 'ignored';

export interface HeartbeatResult {
  ok: boolean;
  state?: HeartbeatState;
  reason?: 'not_member' | 'mock_location' | 'implausible_movement' | 'out_of_range';
  removed?: boolean;
}

const FIX_TTL_SEC = 300;
const SWEEP_INTERVAL_MS = 30_000;
const OUT_COUNTER_TTL_SEC = 90;

const wireReason: Record<MembershipEndReason, RemovalReason> = {
  USER_LEFT: 'user_left',
  OUT_OF_RANGE: 'out_of_range',
  STALE: 'stale',
  UNCONFIRMED: 'unconfirmed',
  VENUE_CLOSED: 'venue_closed',
  SUSPENDED: 'suspended',
  REPLACED: 'replaced',
};

@Injectable()
export class PresenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PresenceService.name);
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly venues: VenuesService,
    private readonly bus: RealtimeBus,
  ) {}

  onModuleInit(): void {
    if (this.env.NODE_ENV !== 'test') {
      this.sweepTimer = setInterval(() => void this.sweep().catch((e) => this.logger.error(e)), SWEEP_INTERVAL_MS);
      this.sweepTimer.unref();
    }
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  get timing(): JoinResult['timing'] {
    return {
      heartbeatIntervalSec: this.env.HEARTBEAT_INTERVAL_SEC,
      staleAfterSec: this.env.STALE_AFTER_SEC,
      weakGpsGraceSec: this.env.WEAK_GPS_GRACE_SEC,
    };
  }

  async findActive(userId: string, venueId: string): Promise<Membership | null> {
    return this.prisma.membership.findFirst({ where: { userId, venueId, status: 'ACTIVE' } });
  }

  /** Whether the user may currently send messages in the venue (present and recently confirmed). */
  async isEligibleToPost(userId: string, venueId: string): Promise<boolean> {
    const m = await this.findActive(userId, venueId);
    if (!m) return false;
    return m.lastEligibleAt.getTime() >= Date.now() - this.env.WEAK_GPS_GRACE_SEC * 1000;
  }

  async join(userId: string, venueId: string, fix: LocationFix): Promise<JoinResult> {
    const venue = await this.venues.getActive(venueId);

    if (fix.mocked && !this.env.ALLOW_MOCK_LOCATIONS) {
      throw unprocessable('MOCK_LOCATION', 'Mock locations are not allowed.');
    }
    if (!(await this.isPlausible(userId, fix))) {
      throw unprocessable('IMPLAUSIBLE_MOVEMENT', "We couldn't confirm your location. Please try again in a moment.");
    }
    const distance = haversineMeters(fix, venue);
    const verdict = joinVerdict(distance, fix.accuracy, { joinRadiusM: venue.joinRadiusM, maxAccuracyM: this.env.MAX_ACCURACY_M });
    if (verdict === 'imprecise') {
      throw unprocessable('LOCATION_IMPRECISE', "We can't confirm your location yet. Move outdoors or wait for a better GPS fix.");
    }
    if (verdict === 'too_far') {
      throw forbidden('TOO_FAR', 'You need to be closer to this location to join the chat.');
    }

    await this.rememberFix(userId, fix);

    const existing = await this.findActive(userId, venueId);
    let membership: Membership;
    if (existing) {
      membership = await this.prisma.membership.update({
        where: { id: existing.id },
        data: { lastHeartbeatAt: new Date(), lastEligibleAt: new Date() },
      });
    } else {
      membership = await this.createMembership(userId, venueId);
    }

    const memberCount = await this.broadcastPresence(venueId);
    return {
      membership: { id: membership.id, venueId, joinedAt: membership.joinedAt.toISOString() },
      venue: toVenueView(venue),
      timing: this.timing,
      memberCount,
    };
  }

  private async createMembership(userId: string, venueId: string): Promise<Membership> {
    for (let attempt = 0; attempt < 2; attempt++) {
      await this.endAllForUser(userId, 'REPLACED');
      try {
        return await this.prisma.membership.create({ data: { userId, venueId } });
      } catch (err) {
        // Partial unique index: another request created an ACTIVE membership concurrently.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      }
    }
    throw new Error('could not create membership');
  }

  async leave(userId: string, venueId: string): Promise<boolean> {
    const m = await this.findActive(userId, venueId);
    if (!m) return false;
    return this.end(m.id, 'USER_LEFT');
  }

  async heartbeat(userId: string, venueId: string, fix: LocationFix): Promise<HeartbeatResult> {
    const m = await this.findActive(userId, venueId);
    if (!m) return { ok: false, reason: 'not_member' };

    if (fix.mocked && !this.env.ALLOW_MOCK_LOCATIONS) return { ok: true, state: 'ignored', reason: 'mock_location' };
    if (!(await this.isPlausible(userId, fix))) return { ok: true, state: 'ignored', reason: 'implausible_movement' };
    await this.rememberFix(userId, fix);

    const venue = await this.venues.getActive(venueId);
    const state = classifyFix(haversineMeters(fix, venue), fix.accuracy, {
      leaveRadiusM: venue.leaveRadiusM,
      maxAccuracyM: this.env.MAX_ACCURACY_M,
    });
    const now = new Date();
    const outKey = `out:${m.id}`;

    if (state === 'eligible') {
      await Promise.all([
        this.prisma.membership.update({ where: { id: m.id }, data: { lastHeartbeatAt: now, lastEligibleAt: now } }),
        this.redis.client.del(outKey),
      ]);
      return { ok: true, state };
    }
    if (state === 'weak_gps') {
      await Promise.all([
        this.prisma.membership.update({ where: { id: m.id }, data: { lastHeartbeatAt: now } }),
        this.redis.client.del(outKey),
      ]);
      return { ok: true, state };
    }

    const [[, strikes]] = (await this.redis.client.multi().incr(outKey).expire(outKey, OUT_COUNTER_TTL_SEC).exec()) as [
      [null, number],
      [null, number],
    ];
    await this.prisma.membership.update({ where: { id: m.id }, data: { lastHeartbeatAt: now } });
    if (strikes >= this.env.OUT_OF_RANGE_STRIKES) {
      const removed = await this.end(m.id, 'OUT_OF_RANGE');
      await this.redis.client.del(outKey);
      return { ok: true, state, reason: 'out_of_range', removed };
    }
    return { ok: true, state };
  }

  /** Ends one ACTIVE membership; returns false if it was already ended (no duplicate events). */
  async end(membershipId: string, reason: MembershipEndReason): Promise<boolean> {
    const ended = await this.prisma.membership.updateManyAndReturn({
      where: { id: membershipId, status: 'ACTIVE' },
      data: { status: 'ENDED', endReason: reason, endedAt: new Date() },
    });
    if (ended.length === 0) return false;
    await this.notifyEnded(ended);
    return true;
  }

  async endAllForUser(userId: string, reason: MembershipEndReason): Promise<number> {
    const ended = await this.prisma.membership.updateManyAndReturn({
      where: { userId, status: 'ACTIVE' },
      data: { status: 'ENDED', endReason: reason, endedAt: new Date() },
    });
    await this.notifyEnded(ended);
    return ended.length;
  }

  /** Removes members that went quiet, could not be confirmed nearby, or whose venue closed. */
  async sweep(): Promise<{ stale: number; unconfirmed: number; closed: number }> {
    if (!(await this.redis.acquireLock('lock:presence-sweep', SWEEP_INTERVAL_MS - 5000))) {
      return { stale: 0, unconfirmed: 0, closed: 0 };
    }
    const now = Date.now();
    const stale = await this.prisma.membership.updateManyAndReturn({
      where: { status: 'ACTIVE', lastHeartbeatAt: { lt: new Date(now - this.env.STALE_AFTER_SEC * 1000) } },
      data: { status: 'ENDED', endReason: 'STALE', endedAt: new Date() },
    });
    const unconfirmed = await this.prisma.membership.updateManyAndReturn({
      where: { status: 'ACTIVE', lastEligibleAt: { lt: new Date(now - this.env.WEAK_GPS_GRACE_SEC * 1000) } },
      data: { status: 'ENDED', endReason: 'UNCONFIRMED', endedAt: new Date() },
    });
    const closed = await this.prisma.membership.updateManyAndReturn({
      where: { status: 'ACTIVE', venue: { active: false } },
      data: { status: 'ENDED', endReason: 'VENUE_CLOSED', endedAt: new Date() },
    });
    await this.notifyEnded([...stale, ...unconfirmed, ...closed]);
    return { stale: stale.length, unconfirmed: unconfirmed.length, closed: closed.length };
  }

  private async notifyEnded(ended: Membership[]): Promise<void> {
    const venueIds = new Set<string>();
    for (const m of ended) {
      const reason = wireReason[m.endReason ?? 'USER_LEFT'];
      this.bus.toUser(m.userId, { type: 'removed', venueId: m.venueId, reason, message: removalMessage(reason) });
      venueIds.add(m.venueId);
    }
    await Promise.all([...venueIds].map((venueId) => this.broadcastPresence(venueId)));
  }

  private async broadcastPresence(venueId: string): Promise<number> {
    const count = await this.venues.activeMemberCount(venueId);
    this.bus.toVenue(venueId, { type: 'presence', venueId, count });
    return count;
  }

  private fixKey(userId: string): string {
    return `fix:${userId}`;
  }

  /** The only place raw coordinates are kept, for at most five minutes, to detect teleporting. */
  private async rememberFix(userId: string, fix: LocationFix): Promise<void> {
    await this.redis.client.set(
      this.fixKey(userId),
      JSON.stringify({ lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, at: Date.now() }),
      'EX',
      FIX_TTL_SEC,
    );
  }

  private async isPlausible(userId: string, fix: LocationFix): Promise<boolean> {
    const raw = await this.redis.client.get(this.fixKey(userId));
    if (!raw) return true;
    const prev = JSON.parse(raw) as { lat: number; lng: number; accuracy: number; at: number };
    return impliedSpeedMps(prev, { ...fix, at: Date.now() }) <= this.env.MAX_SPEED_MPS;
  }
}
