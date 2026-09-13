import { z } from 'zod';

export const MODERATION_CATEGORIES = [
  'profanity',
  'harassment',
  'hate',
  'threat',
  'violence',
  'sexual',
  'scam_spam',
  'doxxing',
  'location_exposure',
  'dangerous',
  'other',
] as const;

export type ModerationCategory = (typeof MODERATION_CATEGORIES)[number];

export const moderationDecisionSchema = z.object({
  decision: z.enum(['allow', 'warn', 'censor', 'block']),
  severity: z.number().int().min(0).max(3),
  categories: z.array(z.enum(MODERATION_CATEGORIES)),
  censoredText: z.string().nullable(),
  reason: z.string().max(300),
});

export type ModerationDecision = z.infer<typeof moderationDecisionSchema>;

export interface ModerationImage {
  /** JPEG bytes, already downsized for the classifier. */
  data: Buffer;
  mimeType: 'image/jpeg';
}

export interface ModerationInput {
  kind: 'message' | 'display_name' | 'listing';
  text: string;
  /** Present for photo messages and listing photos; judged together with the text. */
  image?: ModerationImage;
  venueName?: string;
  recent?: { displayName: string; text: string }[];
  signals: string[];
}

/** Anything that can judge content. Production uses OpenAI; tests use a fake. */
export interface ModerationClient {
  evaluate(input: ModerationInput): Promise<ModerationDecision>;
}

export const MODERATION_CLIENT = Symbol('MODERATION_CLIENT');

export class ModerationUnavailableError extends Error {
  constructor(message = 'moderation unavailable') {
    super(message);
  }
}

export const REFUSAL_DECISION: ModerationDecision = {
  decision: 'block',
  severity: 2,
  categories: ['other'],
  censoredText: null,
  reason: 'classifier refused to process the content',
};
