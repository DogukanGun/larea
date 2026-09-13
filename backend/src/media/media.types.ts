export const MEDIA_ID_RE = /^[a-f0-9]{32}$/;

export interface MediaView {
  id: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
}

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
