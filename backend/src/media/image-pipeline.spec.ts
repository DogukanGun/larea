import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { UnsupportedImageError, moderationRendition, processImage } from './image-pipeline.js';

const OPTS = { maxPx: 1600, thumbPx: 400 };

async function photo(width: number, height: number, extra: { orientation?: number; format?: 'jpeg' | 'png' | 'webp' } = {}): Promise<Buffer> {
  let img = sharp({ create: { width, height, channels: 3, background: { r: 74, g: 144, b: 226 } } });
  img = img.withMetadata({ orientation: extra.orientation, exif: { IFD0: { ImageDescription: 'taken at home', Copyright: 'me' } } });
  switch (extra.format ?? 'jpeg') {
    case 'png':
      return img.png().toBuffer();
    case 'webp':
      return img.webp().toBuffer();
    default:
      return img.jpeg().toBuffer();
  }
}

describe('processImage', () => {
  it('applies the EXIF orientation and drops every other piece of metadata', async () => {
    const input = await photo(800, 600, { orientation: 6 });
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const out = await processImage(input, OPTS);
    expect([out.width, out.height]).toEqual([600, 800]); // rotated upright
    const meta = await sharp(out.main).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(out.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('downsizes to the limits without enlarging and keeps the aspect ratio', async () => {
    const big = await processImage(await photo(5000, 4000), OPTS);
    expect([big.width, big.height]).toEqual([1600, 1280]);
    expect(Math.max(big.thumbWidth, big.thumbHeight)).toBe(400);
    const small = await processImage(await photo(300, 200), OPTS);
    expect([small.width, small.height]).toEqual([300, 200]);
    expect([small.thumbWidth, small.thumbHeight]).toEqual([300, 200]);
  });

  it('turns PNG and WebP into JPEG', async () => {
    for (const format of ['png', 'webp'] as const) {
      const out = await processImage(await photo(400, 300, { format }), OPTS);
      expect((await sharp(out.main).metadata()).format).toBe('jpeg');
      expect((await sharp(out.thumb).metadata()).format).toBe('jpeg');
    }
  });

  it('rejects things that are not still images', async () => {
    await expect(processImage(Buffer.from('definitely not an image'), OPTS)).rejects.toBeInstanceOf(UnsupportedImageError);
    const tiny = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#000' } }).jpeg().toBuffer();
    await expect(processImage(tiny, OPTS)).rejects.toBeInstanceOf(UnsupportedImageError);
    const gif = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#000' } }).gif().toBuffer();
    await expect(processImage(gif, OPTS)).rejects.toBeInstanceOf(UnsupportedImageError);
  });

  it('makes a smaller rendition for the classifier', async () => {
    const out = await processImage(await photo(3000, 3000), OPTS);
    const rendition = await sharp(await moderationRendition(out.main)).metadata();
    expect(Math.max(rendition.width!, rendition.height!)).toBe(1024);
  });
});
