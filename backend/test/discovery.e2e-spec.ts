import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { haversineMeters } from '../src/venues/geo.js';
import { decodeGeohash, encodeGeohash } from '../src/venues/discovery/geohash.js';
import { FakeOverpassClient } from '../src/testing/fake-overpass.client.js';
import { OVERPASS_CLIENT } from '../src/venues/discovery/overpass.client.js';
import { auth, createTestApp, registerUser, type TestContext, type TestUser, verifyAge } from './helpers.js';

describe('place discovery', () => {
  let ctx: TestContext;
  let user: TestUser;
  // A spot with no synthetic venues around it, snapped to its geohash cell centre because the
  // fake place source positions places relative to the cell it is asked about.
  const cell = decodeGeohash(encodeGeohash(48.1374, 11.5755, 6));
  const spot = { lat: cell.lat, lng: cell.lng };

  beforeAll(async () => {
    ctx = await createTestApp();
    user = await registerUser(ctx);
    await verifyAge(ctx, user);
    const keys = await ctx.redis.client.keys('osm:*');
    if (keys.length) await ctx.redis.client.del(...keys);
    // Earlier runs may have left members in discovered venues; the sweep does not run in tests.
    await ctx.prisma.membership.updateMany({ where: { status: 'ACTIVE', venue: { source: 'osm' } }, data: { status: 'ENDED', endReason: 'STALE', endedAt: new Date() } });
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('discovers real places on demand, caches the area, and lets the user join one', async () => {
    const fake = ctx.app.get<FakeOverpassClient>(OVERPASS_CLIENT);
    const before = fake.calls;

    const kickoff = await ctx.http().get('/venues/nearby').query({ ...spot, accuracy: 10 }).set(auth(user)).expect(200);
    expect(kickoff.body.attribution).toContain('OpenStreetMap');
    expect(kickoff.body.pending).toBe(true); // discovery runs in the background
    // Poll like the app does until the area is covered.
    let first = kickoff;
    for (let i = 0; i < 40 && first.body.pending; i++) {
      await new Promise((r) => setTimeout(r, 100));
      first = await ctx.http().get('/venues/nearby').query({ ...spot, accuracy: 10 }).set(auth(user)).expect(200);
    }
    expect(first.body.pending).toBe(false);
    expect(first.body.degraded).toBe(false);
    expect(fake.calls).toBeGreaterThan(before);
    expect(first.body.venues.some((v: { category: string }) => v.category === 'park')).toBe(true);
    // Neighbouring cells get their own fake places; pick the ones belonging to the spot's cell.
    const key = `${spot.lat.toFixed(3)}-${spot.lng.toFixed(3)}`;
    const library = first.body.venues.find((v: { slug: string }) => v.slug === `osm-node-fake-lib-${key}`);
    expect(library).toMatchObject({ name: 'Test Library', eligible: true, address: 'Test Street 1', memberCount: 0 });
    expect(library.lat).toBeCloseTo(spot.lat, 2);
    expect(library.lng).toBeCloseTo(spot.lng, 2);
    expect(library.distanceM).toBeGreaterThanOrEqual(70);
    expect(library.distanceM).toBeLessThanOrEqual(90);
    expect(first.body.venues[0].id).toBe(library.id); // nearest first
    const station = first.body.venues.find((v: { slug: string }) => v.slug === `osm-node-fake-station-${key}`);
    expect(station).toMatchObject({ eligible: false });
    expect(station.distanceM).toBeGreaterThan(800);

    const cached = await ctx.redis.client.keys('osm:cell:*');
    expect(cached.length).toBeGreaterThan(0);

    const afterFirst = fake.calls;
    const second = await ctx.http().get('/venues/nearby').query({ ...spot, accuracy: 10 }).set(auth(user)).expect(200);
    expect(fake.calls).toBe(afterFirst); // served from the database
    expect(second.body.venues.map((v: { id: string }) => v.id)).toEqual(first.body.venues.map((v: { id: string }) => v.id));

    const joined = await ctx.http().post(`/venues/${library.id}/join`).set(auth(user)).send({ ...spot, accuracy: 10 }).expect(201);
    expect(joined.body.venue).toMatchObject({ name: 'Test Library', category: 'library' });
    const row = await ctx.prisma.venue.findUniqueOrThrow({ where: { id: library.id } });
    expect(row.source).toBe('osm');
    expect(row.slug.startsWith('osm-node-')).toBe(true);
  });

  it('shows places where the map is looking, measured from where the phone is', async () => {
    const fake = ctx.app.get<FakeOverpassClient>(OVERPASS_CLIENT);
    // The phone stays at `spot`; the map is panned about 6 km east (again snapped to a cell centre).
    const viewCell = decodeGeohash(encodeGeohash(spot.lat, spot.lng + 0.08, 6));
    const view = { viewLat: viewCell.lat, viewLng: viewCell.lng, viewRadiusM: 1500 };
    expect(haversineMeters(spot, viewCell)).toBeGreaterThan(5000);
    const before = fake.calls;

    let res = await ctx.http().get('/venues/nearby').query({ ...spot, accuracy: 10, ...view }).set(auth(user)).expect(200);
    expect(res.body.pending).toBe(true); // that area has never been looked at
    for (let i = 0; i < 40 && res.body.pending; i++) {
      await new Promise((r) => setTimeout(r, 100));
      res = await ctx.http().get('/venues/nearby').query({ ...spot, accuracy: 10, ...view }).set(auth(user)).expect(200);
    }
    expect(res.body.pending).toBe(false);
    expect(res.body.degraded).toBe(false);
    expect(fake.calls).toBeGreaterThan(before);

    const key = `${viewCell.lat.toFixed(3)}-${viewCell.lng.toFixed(3)}`;
    const library = res.body.venues.find((v: { slug: string }) => v.slug === `osm-node-fake-lib-${key}`);
    expect(library).toMatchObject({ name: 'Test Library', eligible: false });
    expect(library.distanceM).toBeGreaterThan(5000); // distance is from the phone, not the map centre
    expect(res.body.venues.some((v: { category: string }) => v.category === 'cafe')).toBe(true); // zoomed in
    const spotKey = `${spot.lat.toFixed(3)}-${spot.lng.toFixed(3)}`;
    expect(res.body.venues.find((v: { slug: string }) => v.slug === `osm-node-fake-lib-${spotKey}`)).toBeUndefined(); // outside the viewport
    for (const v of res.body.venues as { lat: number; lng: number }[]) expect(haversineMeters(viewCell, v)).toBeLessThanOrEqual(1500);
    const distances = res.body.venues.map((v: { distanceM: number }) => v.distanceM);
    expect(distances).toEqual([...distances].sort((a: number, b: number) => a - b)); // nearest to the phone first

    // Half a viewport must be sent as a whole.
    await ctx.http().get('/venues/nearby').query({ ...spot, accuracy: 10, viewLat: viewCell.lat }).set(auth(user)).expect(400);
  });

  it('covers a whole city in one run when zoomed out and hides cafés at that scale', async () => {
    const fake = ctx.app.get<FakeOverpassClient>(OVERPASS_CLIENT);
    const wide = { viewLat: spot.lat, viewLng: spot.lng, viewRadiusM: 10_000 };
    const before = fake.calls;
    let res = await ctx.http().get('/venues/nearby').query({ ...spot, accuracy: 10, ...wide }).set(auth(user)).expect(200);
    expect(res.body.pending).toBe(true);
    for (let i = 0; i < 40 && res.body.pending; i++) {
      await new Promise((r) => setTimeout(r, 100));
      res = await ctx.http().get('/venues/nearby').query({ ...spot, accuracy: 10, ...wide }).set(auth(user)).expect(200);
    }
    expect(res.body.pending).toBe(false);
    expect(res.body.degraded).toBe(false);
    expect(fake.calls - before).toBe(2); // landmarks + parks, no cafés for the city tier

    const slugs = res.body.venues.map((v: { slug: string }) => v.slug);
    const spotKey = `${spot.lat.toFixed(3)}-${spot.lng.toFixed(3)}`;
    const viewCell = decodeGeohash(encodeGeohash(spot.lat, spot.lng + 0.08, 6));
    const farKey = `${viewCell.lat.toFixed(3)}-${viewCell.lng.toFixed(3)}`;
    expect(slugs).toContain(`osm-node-fake-lib-${spotKey}`);
    expect(slugs).toContain(`osm-node-fake-lib-${farKey}`); // 6 km away, but inside the wide view
    expect(res.body.venues.some((v: { category: string }) => v.category === 'cafe')).toBe(false);

    const cached = await ctx.redis.client.keys('osm:cell:*');
    expect(cached.length).toBeGreaterThan(400); // the city tier flags hundreds of cells at once

    // The same wide view again is served without touching the place source.
    const again = await ctx.http().get('/venues/nearby').query({ ...spot, accuracy: 10, ...wide }).set(auth(user)).expect(200);
    expect(again.body.pending).toBe(false);
    expect(fake.calls - before).toBe(2);
  });

  it('reports degraded mode when the place source fails but still serves known venues', async () => {
    const fake = ctx.app.get<FakeOverpassClient>(OVERPASS_CLIENT);
    const original = fake.search.bind(fake);
    fake.search = async () => {
      throw new Error('overpass down');
    };
    const far = { lat: 50.1109, lng: 8.6821 };
    let res = await ctx.http().get('/venues/nearby').query({ ...far, accuracy: 10 }).set(auth(user)).expect(200);
    expect(res.body.pending).toBe(true);
    for (let i = 0; i < 40 && res.body.pending; i++) {
      await new Promise((r) => setTimeout(r, 100));
      res = await ctx.http().get('/venues/nearby').query({ ...far, accuracy: 10 }).set(auth(user)).expect(200);
    }
    expect(res.body.degraded).toBe(true);
    expect(res.body.venues).toEqual([]);
    fake.search = original;
  });
});
