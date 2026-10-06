import { describe, expect, it } from 'vitest';
import { scrubUrl } from './logger.module.js';

describe('log scrubbing', () => {
  it('blanks coordinates in logged URLs and keeps everything else', () => {
    expect(scrubUrl('/venues/nearby?lat=48.14&lng=11.58&accuracy=5&viewLat=48.1&viewLng=11.5&viewRadiusM=400')).toBe(
      '/venues/nearby?lat=[redacted]&lng=[redacted]&accuracy=[redacted]&viewLat=[redacted]&viewLng=[redacted]&viewRadiusM=400',
    );
    expect(scrubUrl('/market/listings?category=BOOKS')).toBe('/market/listings?category=BOOKS');
    expect(scrubUrl('/health')).toBe('/health');
    expect(scrubUrl(undefined)).toBeUndefined();
  });
});
