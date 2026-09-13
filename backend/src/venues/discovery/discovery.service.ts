import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectEnv } from '../../config/inject-env.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RedisService } from '../../infra/redis/redis.service.js';
import type { LatLng } from '../geo.js';
import { decodeGeohash, encodeGeohash, geohashCellRadiusM, geohashCellsWithin } from './geohash.js';
import { type DiscoveredPlace, OVERPASS_CLIENT, type OverpassClient, type SearchKind } from './overpass.client.js';

const CELL_PRECISION = 6;
/** A city-wide run needs a few minutes on the public Overpass instance. */
const AREA_LOCK_MS = 300_000;
const FAILURE_TTL_SEC = 120;
/** Cafés are dense; only fetch them close to the point of interest. */
export const CAFE_RADIUS_M = 700;

export interface CoverageStatus {
  /** A discovery run for this area is in progress; the client should poll again shortly. */
  pending: boolean;
  /** The last discovery attempt for this area failed recently. */
  degraded: boolean;
}

export interface WarmUpResult {
  landmarks: number;
  parks: number;
  cafes: number;
  cells: number;
}

interface AreaRun {
  /** Lock / failure key: centre cell plus tier. */
  area: string;
  center: LatLng;
  /** Query radius around the centre cell. */
  radiusM: number;
  /** Cells that are fully inside the query circle; flagged when landmarks succeed. */
  cells: string[];
  landmarks: boolean;
  cafes: { key: string; radiusM: number } | null;
}

/**
 * Discovers real places from OpenStreetMap around a point, in the background. The world is
 * split into geohash cells (~1.2 km x 0.6 km) and each cell remembers for OSM_CACHE_TTL_SEC that
 * its landmarks and parks are known. A request names the radius it cares about (the map
 * viewport); it is rounded up to one of a few discovery tiers (neighbourhood, district, city)
 * so panning and zooming never spawns a query per camera position. Cafés are only fetched for
 * the neighbourhood tier, close to the centre. Callers never wait for Overpass.
 */
@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);
  private queue: Promise<unknown> = Promise.resolve();
  private readonly running = new Set<string>();

  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(OVERPASS_CLIENT) private readonly overpass: OverpassClient,
  ) {}

  /** Discovery radii in metres, smallest first: neighbourhood, district, city. */
  get tiers(): number[] {
    const min = this.env.DISCOVERY_RADIUS_M;
    const max = Math.max(min, this.env.DISCOVERY_MAX_RADIUS_M);
    const mid = Math.round(Math.sqrt(min * max));
    return [...new Set([min, mid, max])].sort((a, b) => a - b);
  }

  /** The smallest tier that contains the requested radius (the largest tier when nothing does). */
  tierFor(radiusM: number): number {
    const tiers = this.tiers;
    return tiers.find((t) => t >= radiusM) ?? tiers[tiers.length - 1];
  }

  async ensureCoverage(lat: number, lng: number, radiusM = this.env.DISCOVERY_RADIUS_M): Promise<CoverageStatus> {
    const tier = this.tierFor(radiusM);
    const center = encodeGeohash(lat, lng, CELL_PRECISION);
    const centerCell = decodeGeohash(center);
    const cellRadius = geohashCellRadiusM(centerCell);
    // Everything within the tier of any point in the centre cell lies within tier + cellRadius of
    // its centre, which is what one run fetches; the cells whose centre is within the tier are
    // then fully covered and get flagged. Users in the same cell share the run.
    const cells = geohashCellsWithin(centerCell.lat, centerCell.lng, tier, CELL_PRECISION);
    const wantCafes = tier <= this.env.DISCOVERY_RADIUS_M;
    const area = `${center}:${tier}`;

    const [flags, cafeFlag, failed] = await Promise.all([
      this.redis.client.mget(cells.map((h) => `osm:cell:${h}`)),
      wantCafes ? this.redis.client.get(`osm:cafe:${center}`) : Promise.resolve('1'),
      this.redis.client.get(`osm:fail:${area}`),
    ]);
    const landmarksMissing = flags.some((f) => !f);
    const cafesMissing = !cafeFlag;
    if (!landmarksMissing && !cafesMissing) return { pending: false, degraded: false };
    if (failed) return { pending: false, degraded: true };

    const inProgress = this.running.has(area) || !(await this.redis.acquireLock(`lock:osm:area:${area}`, AREA_LOCK_MS));
    if (!inProgress) {
      this.running.add(area);
      const run: AreaRun = {
        area,
        center: centerCell,
        radiusM: tier + cellRadius,
        cells,
        landmarks: landmarksMissing,
        cafes: cafesMissing ? { key: `osm:cafe:${center}`, radiusM: CAFE_RADIUS_M + cellRadius } : null,
      };
      void this.discoverArea(run).finally(() => this.running.delete(area));
    }
    return { pending: true, degraded: false };
  }

  /**
   * Fetches everything within radiusM of the point right away (landmarks, parks and optionally
   * cafés) and flags the covered cells for ttlSec. Used to pre-load a whole city so the map is
   * complete everywhere from the first look instead of filling in piece by piece.
   */
  async warmUp(lat: number, lng: number, radiusM: number, opts: { cafes?: boolean; ttlSec?: number } = {}): Promise<WarmUpResult> {
    const point = { lat, lng };
    const cellRadius = geohashCellRadiusM(decodeGeohash(encodeGeohash(lat, lng, CELL_PRECISION)));
    const cells = geohashCellsWithin(lat, lng, radiusM, CELL_PRECISION);
    const ttl = opts.ttlSec ?? this.env.OSM_CACHE_TTL_SEC;
    const landmarks = await this.fetchAndStore(point, radiusM + cellRadius, 'landmarks');
    const parks = await this.fetchAndStore(point, radiusM + cellRadius, 'parks');
    const pipeline = this.redis.client.multi();
    for (const h of cells) pipeline.set(`osm:cell:${h}`, '1', 'EX', ttl);
    let cafes = 0;
    if (opts.cafes) {
      // A user anywhere in a flagged cell expects cafés within CAFE_RADIUS_M of their own cell centre.
      cafes = await this.fetchAndStore(point, radiusM + cellRadius + CAFE_RADIUS_M, 'cafes');
      for (const h of cells) pipeline.set(`osm:cafe:${h}`, '1', 'EX', ttl);
    }
    await pipeline.exec();
    return { landmarks, parks, cafes, cells: cells.length };
  }

  /** Runs the queries for one area and flags the cells; failures are remembered briefly. */
  private async discoverArea(run: AreaRun): Promise<void> {
    let failed = false;
    try {
      if (run.landmarks) {
        const ok = await this.runQuery(run.center, run.radiusM, 'landmarks');
        if (ok) {
          await this.runQuery(run.center, run.radiusM, 'parks'); // best effort: parks are heavy polygons
          const pipeline = this.redis.client.multi();
          for (const h of run.cells) pipeline.set(`osm:cell:${h}`, '1', 'EX', this.env.OSM_CACHE_TTL_SEC);
          await pipeline.exec();
        } else {
          failed = true;
        }
      }
      if (run.cafes) {
        const ok = await this.runQuery(run.center, run.cafes.radiusM, 'cafes');
        if (ok) await this.redis.client.set(run.cafes.key, '1', 'EX', this.env.OSM_CACHE_TTL_SEC);
        else failed = true;
      }
    } finally {
      if (failed) await this.redis.client.set(`osm:fail:${run.area}`, '1', 'EX', FAILURE_TTL_SEC);
      await this.redis.client.del(`lock:osm:area:${run.area}`);
    }
  }

  private async runQuery(center: LatLng, radiusM: number, kind: SearchKind): Promise<boolean> {
    try {
      await this.fetchAndStore(center, radiusM, kind);
      return true;
    } catch (err) {
      this.logger.warn({ kind, radiusM: Math.round(radiusM), reason: err instanceof Error ? err.message : String(err) }, 'place discovery failed');
      return false;
    }
  }

  /** One Overpass query, stored; returns the number of places found. Throws when the source fails. */
  private async fetchAndStore(center: LatLng, radiusM: number, kind: SearchKind): Promise<number> {
    const places = await this.serialized(() => this.overpass.search(center.lat, center.lng, radiusM, kind));
    await this.upsert(places);
    this.logger.log({ kind, places: places.length, radiusM: Math.round(radiusM) }, 'discovered places');
    return places.length;
  }

  /** One Overpass request at a time per instance. */
  private serialized<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async upsert(places: DiscoveredPlace[]): Promise<void> {
    for (let i = 0; i < places.length; i += 20) {
      await Promise.all(
        places.slice(i, i + 20).map((p) =>
          this.prisma.venue.upsert({
            where: { source_sourceRef: { source: 'osm', sourceRef: p.sourceRef } },
            update: { name: p.name, category: p.category, address: p.address, lat: p.lat, lng: p.lng, active: true },
            create: {
              slug: `osm-${p.sourceRef.replace('/', '-')}`,
              name: p.name,
              category: p.category,
              address: p.address,
              source: 'osm',
              sourceRef: p.sourceRef,
              lat: p.lat,
              lng: p.lng,
            },
          }),
        ),
      );
    }
  }
}
