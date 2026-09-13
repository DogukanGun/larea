import { createHash } from 'node:crypto';
import sharp, { type Metadata } from 'sharp';

export class UnsupportedImageError extends Error {}

export interface ProcessedImage {
  main: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  thumbWidth: number;
  thumbHeight: number;
  sha256: string;
}

const DECODABLE = new Set(['jpeg', 'png', 'webp']);

/**
 * Re-encodes an upload as a JPEG with the EXIF orientation applied and every other piece of
 * metadata (GPS, camera, XMP, ICC) dropped, plus a small thumbnail. Anything sharp cannot
 * decode, animated images and absurd pixel counts are rejected.
 */
export async function processImage(input: Buffer, options: { maxPx: number; thumbPx: number }): Promise<ProcessedImage> {
  let meta: Metadata;
  try {
    meta = await sharp(input, { failOn: 'error', limitInputPixels: 40_000_000, animated: false }).metadata();
  } catch {
    throw new UnsupportedImageError('not a decodable image');
  }
  if (!meta.format || !DECODABLE.has(meta.format)) throw new UnsupportedImageError(`unsupported format ${meta.format ?? 'unknown'}`);
  if ((meta.pages ?? 1) > 1) throw new UnsupportedImageError('animated images are not supported');
  if (!meta.width || !meta.height || meta.width < 32 || meta.height < 32) throw new UnsupportedImageError('image too small');

  const base = sharp(input, { failOn: 'error', limitInputPixels: 40_000_000, animated: false }).rotate().toColorspace('srgb');
  const main = await base
    .clone()
    .resize({ width: options.maxPx, height: options.maxPx, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const thumb = await sharp(main.data)
    .resize({ width: options.thumbPx, height: options.thumbPx, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return {
    main: main.data,
    thumb: thumb.data,
    width: main.info.width,
    height: main.info.height,
    thumbWidth: thumb.info.width,
    thumbHeight: thumb.info.height,
    sha256: createHash('sha256').update(main.data).digest('hex'),
  };
}

/** A smaller copy for the classifier: enough detail to judge, small enough to send inline. */
export async function moderationRendition(main: Buffer, maxPx = 1024): Promise<Buffer> {
  return sharp(main).resize({ width: maxPx, height: maxPx, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
}
