export type PlaceCategory = 'library' | 'station' | 'square' | 'university' | 'stadium' | 'museum' | 'mall' | 'park' | 'cafe';

export const PLACE_CATEGORIES: readonly PlaceCategory[] = ['library', 'station', 'square', 'university', 'stadium', 'museum', 'mall', 'park', 'cafe'];

export const CATEGORY_LABELS: Record<PlaceCategory, string> = {
  library: 'Library',
  station: 'Station',
  square: 'Square',
  university: 'University',
  stadium: 'Stadium',
  museum: 'Museum & theatre',
  mall: 'Shopping',
  park: 'Park',
  cafe: 'Café',
};

/** OpenStreetMap tag selectors that become chat rooms, in priority order. */
export const TAG_SELECTORS: readonly { key: string; value: string; category: PlaceCategory }[] = [
  { key: 'amenity', value: 'library', category: 'library' },
  { key: 'railway', value: 'station', category: 'station' },
  { key: 'public_transport', value: 'station', category: 'station' },
  { key: 'place', value: 'square', category: 'square' },
  { key: 'amenity', value: 'university', category: 'university' },
  { key: 'amenity', value: 'college', category: 'university' },
  { key: 'leisure', value: 'stadium', category: 'stadium' },
  { key: 'tourism', value: 'museum', category: 'museum' },
  { key: 'amenity', value: 'theatre', category: 'museum' },
  { key: 'amenity', value: 'arts_centre', category: 'museum' },
  { key: 'shop', value: 'mall', category: 'mall' },
  { key: 'shop', value: 'department_store', category: 'mall' },
  { key: 'leisure', value: 'park', category: 'park' },
  { key: 'leisure', value: 'garden', category: 'park' },
  { key: 'amenity', value: 'cafe', category: 'cafe' },
];

export function categoryForTags(tags: Record<string, string>): PlaceCategory | null {
  for (const s of TAG_SELECTORS) if (tags[s.key] === s.value) return s.category;
  return null;
}
