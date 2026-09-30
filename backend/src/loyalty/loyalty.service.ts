import { Injectable } from '@nestjs/common';
import { InjectEnv } from '../config/inject-env.js';
import { type Env, loyaltyThresholds } from '../config/env.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { levelFor, levelName, nextLevelAt, REGULAR } from './levels.js';

export interface LoyaltyView {
  venueId: string;
  venueName: string;
  stamps: number;
  level: number;
  levelName: string;
  /** Stamps needed for the next level; null at Legend. */
  nextLevelAt: number | null;
}

/**
 * Loyalty levels per place, counted from confirmed check-in stamps. Stamps are soulbound and minted
 * by Larea, so the stamp table is the exact record of what each wallet holds.
 */
@Injectable()
export class LoyaltyService {
  readonly thresholds: readonly number[];

  constructor(
    @InjectEnv() env: Env,
    private readonly prisma: PrismaService,
  ) {
    this.thresholds = loyaltyThresholds(env);
  }

  levelFor(stamps: number): number {
    return levelFor(stamps, this.thresholds);
  }

  stamps(userId: string, venueId: string): Promise<number> {
    return this.prisma.stamp.count({ where: { userId, venueId, status: 'CONFIRMED' } });
  }

  async level(userId: string, venueId: string): Promise<number> {
    return this.levelFor(await this.stamps(userId, venueId));
  }

  async isRegular(userId: string, venueId: string): Promise<boolean> {
    return (await this.level(userId, venueId)) >= REGULAR;
  }

  /** Everyone who is a Regular or above at the place. */
  async regularsAt(venueId: string): Promise<string[]> {
    const rows = await this.prisma.stamp.groupBy({
      by: ['userId'],
      where: { venueId, status: 'CONFIRMED' },
      _count: { _all: true },
      having: { userId: { _count: { gte: this.thresholds[0] } } },
    });
    return rows.map((r) => r.userId);
  }

  view(venue: { id: string; name: string }, stamps: number): LoyaltyView {
    const level = this.levelFor(stamps);
    return { venueId: venue.id, venueName: venue.name, stamps, level, levelName: levelName(level), nextLevelAt: nextLevelAt(level, this.thresholds) };
  }

  /** The user's level at every place they have checked in, highest first. */
  async mine(userId: string): Promise<LoyaltyView[]> {
    const rows = await this.prisma.stamp.groupBy({ by: ['venueId'], where: { userId, status: 'CONFIRMED' }, _count: { _all: true } });
    if (rows.length === 0) return [];
    const venues = await this.prisma.venue.findMany({ where: { id: { in: rows.map((r) => r.venueId) } }, select: { id: true, name: true } });
    const names = new Map(venues.map((v) => [v.id, v]));
    return rows
      .flatMap((r) => {
        const venue = names.get(r.venueId);
        return venue ? [this.view(venue, r._count._all)] : [];
      })
      .sort((a, b) => b.stamps - a.stamps || a.venueName.localeCompare(b.venueName));
  }
}
