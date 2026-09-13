import { Injectable } from '@nestjs/common';
import { notFound } from '../common/errors.js';
import { InjectEnv } from '../config/inject-env.js';
import type { Env } from '../config/env.js';
import type { Venue } from '../generated/prisma/client.js';
import { PrismaService } from '../infra/prisma/prisma.service.js';
import { DiscoveryService } from './discovery/discovery.service.js';
import { haversineMeters, joinVerdict } from './geo.js';

export const PLACE_ATTRIBUTION = 'Place data © OpenStreetMap contributors';

export interface VenueView {
  id: string;
  slug: string;
  name: string;
  label: string;
  category: string;
  address: string | null;
}

export interface NearbyVenueView extends VenueView {
  lat: number;
  lng: number;
  /** Distance from the requesting fix, rounded to 10 m. */
  distanceM: number;
  /** Whether a join attempt from the given fix would currently succeed. */
  eligible: boolean;
  memberCount: number;
}

export interface NearbyResult {
  venues: NearbyVenueView[];
  /** Places for this area are still being discovered; poll again in a few seconds. */
  pending: boolean;
  degraded: boolean;
  attribution: string;
}

export interface NearbyQuery {
  lat: number;
  lng: number;
  accuracy: number;
  viewLat?: number;
  viewLng?: number;
  viewRadiusM?: number;
}

/** Even a fully zoomed-in map lists places this far around its centre. */
const MIN_VIEW_RADIUS_M = 500;

export function toVenueView(v: Pick<Venue, 'id' | 'slug' | 'name' | 'label' | 'category' | 'address'>): VenueView {
  return { id: v.id, slug: v.slug, name: v.name, label: v.label, category: v.category, address: v.address };
}

@Injectable()
export class VenuesService {
  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly discovery: DiscoveryService,
  ) {}

  async getActive(id: string): Promise<Venue> {
    const venue = await this.prisma.venue.findUnique({ where: { id } });
    if (!venue || !venue.active) throw notFound('This chat is not available.');
    return venue;
  }

  /**
   * Real places where the map is looking (the viewport, or around the fix when the client sends
   * none), discovered on demand. Distances and eligibility are always measured from the fix, and
   * the result is sorted nearest to the fix first.
   */
  async nearby(query: NearbyQuery): Promise<NearbyResult> {
    const fix = { lat: query.lat, lng: query.lng, accuracy: query.accuracy };
    const view =
      query.viewLat !== undefined && query.viewLng !== undefined && query.viewRadiusM !== undefined
        ? { lat: query.viewLat, lng: query.viewLng, radiusM: Math.min(Math.max(query.viewRadiusM, MIN_VIEW_RADIUS_M), this.env.DISCOVERY_MAX_RADIUS_M) }
        : { lat: fix.lat, lng: fix.lng, radiusM: this.env.DISCOVERY_RADIUS_M };
    const { pending, degraded } = await this.discovery.ensureCoverage(view.lat, view.lng, view.radiusM);
    // Cafés are dense and only discovered close by: they show once the map is zoomed in.
    const includeCafes = view.radiusM <= this.env.DISCOVERY_RADIUS_M;

    const r = view.radiusM;
    const dLat = r / 111_320;
    const dLng = r / (111_320 * Math.max(0.1, Math.cos((view.lat * Math.PI) / 180)));
    const venues = await this.prisma.venue.findMany({
      where: {
        active: true,
        lat: { gte: view.lat - dLat, lte: view.lat + dLat },
        lng: { gte: view.lng - dLng, lte: view.lng + dLng },
        ...(includeCafes ? {} : { category: { not: 'cafe' } }),
      },
    });
    const inView = venues
      .map((v) => ({ venue: v, fromView: haversineMeters(view, v) }))
      .filter((x) => x.fromView <= r)
      .sort((a, b) => a.fromView - b.fromView)
      .slice(0, this.env.NEARBY_MAX_VENUES);
    if (inView.length === 0) return { venues: [], pending, degraded, attribution: PLACE_ATTRIBUTION };

    const counts = await this.prisma.membership.groupBy({
      by: ['venueId'],
      where: { status: 'ACTIVE', venueId: { in: inView.map((x) => x.venue.id) } },
      _count: { _all: true },
    });
    const countByVenue = new Map(counts.map((c) => [c.venueId, c._count._all]));

    const rows = inView
      .map(({ venue }) => ({ venue, distance: haversineMeters(fix, venue) }))
      .sort((a, b) => a.distance - b.distance);
    return {
      venues: rows.map(({ venue, distance }) => ({
        ...toVenueView(venue),
        lat: venue.lat,
        lng: venue.lng,
        distanceM: Math.round(distance / 10) * 10,
        eligible:
          joinVerdict(distance, fix.accuracy, { joinRadiusM: venue.joinRadiusM, maxAccuracyM: this.env.MAX_ACCURACY_M }) === 'ok',
        memberCount: countByVenue.get(venue.id) ?? 0,
      })),
      pending,
      degraded,
      attribution: PLACE_ATTRIBUTION,
    };
  }

  async activeMemberCount(venueId: string): Promise<number> {
    return this.prisma.membership.count({ where: { venueId, status: 'ACTIVE' } });
  }
}
