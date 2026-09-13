import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { MODERATION_POLICY_PROMPT } from './prompt.js';
import {
  MODERATION_CATEGORIES,
  type ModerationCategory,
  type ModerationClient,
  type ModerationDecision,
  type ModerationImage,
  type ModerationInput,
  ModerationUnavailableError,
  REFUSAL_DECISION,
  moderationDecisionSchema,
} from './moderation.types.js';

export interface OpenAIModerationOptions {
  apiKey: string;
  /** Model for the nuanced verdict (structured output). */
  model: string;
  /** Free moderation endpoint used as a hard floor before the verdict model. */
  moderationModel: string;
  timeoutMs: number;
  maxRetries?: number;
  /** Injectable for tests. */
  fetch?: typeof fetch;
}

type FloorCategory = keyof OpenAI.Moderations.Moderation.CategoryScores;

/**
 * Categories where the moderation endpoint alone is enough to block. Scores are
 * probabilities; the threshold keeps casual banter ("this match will be a bloodbath")
 * out of the floor and leaves it to the verdict model.
 */
const FLOOR_RULES: { category: FloorCategory; threshold: number; severity: 2 | 3; mapped: ModerationCategory }[] = [
  { category: 'sexual/minors', threshold: 0.8, severity: 3, mapped: 'sexual' },
  { category: 'harassment/threatening', threshold: 0.8, severity: 3, mapped: 'threat' },
  { category: 'hate/threatening', threshold: 0.8, severity: 3, mapped: 'hate' },
  { category: 'self-harm/intent', threshold: 0.8, severity: 3, mapped: 'dangerous' },
  { category: 'self-harm/instructions', threshold: 0.8, severity: 3, mapped: 'dangerous' },
  { category: 'self-harm', threshold: 0.9, severity: 3, mapped: 'dangerous' },
  { category: 'violence/graphic', threshold: 0.9, severity: 2, mapped: 'violence' },
  { category: 'violence', threshold: 0.9, severity: 2, mapped: 'violence' },
];

/**
 * Extra floor for photos. The moderation endpoint scores images only for sexual, self-harm
 * and violence, and Larea allows no nudity at all, so the bar is lower than for text.
 */
const IMAGE_FLOOR_RULES: typeof FLOOR_RULES = [
  { category: 'sexual', threshold: 0.9, severity: 3, mapped: 'sexual' },
  { category: 'sexual', threshold: 0.5, severity: 2, mapped: 'sexual' },
  { category: 'violence/graphic', threshold: 0.7, severity: 2, mapped: 'violence' },
  { category: 'self-harm', threshold: 0.7, severity: 3, mapped: 'dangerous' },
];

const dataUrl = (image: ModerationImage) => `data:${image.mimeType};base64,${image.data.toString('base64')}`;

/** Schema handed to the model: same fields as the decision, without numeric bounds (validated afterwards). */
const verdictFormat = z.object({
  decision: z.enum(['allow', 'warn', 'censor', 'block']),
  severity: z.number().int(),
  categories: z.array(z.enum(MODERATION_CATEGORIES)),
  censoredText: z.string().nullable(),
  reason: z.string(),
});

/**
 * Two-stage classifier on OpenAI:
 *  1. `moderations` (free) as a hard floor for the unambiguous categories;
 *  2. a small reasoning model with structured output for the policy verdict
 *     (threats without profanity, doxxing, location exposure, scams, censoring).
 * Any failure surfaces as ModerationUnavailableError so the service fails closed.
 */
export class OpenAIModerationClient implements ModerationClient {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly moderationModel: string;

  constructor(options: OpenAIModerationOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      timeout: options.timeoutMs,
      maxRetries: options.maxRetries ?? 1,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
    this.model = options.model;
    this.moderationModel = options.moderationModel;
  }

  async evaluate(input: ModerationInput): Promise<ModerationDecision> {
    try {
      const floor = await this.floor(input.text, input.image);
      if (floor.decision) return floor.decision;
      return await this.verdict(input, floor.scores);
    } catch (error) {
      if (error instanceof ModerationUnavailableError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new ModerationUnavailableError(`openai: ${message}`);
    }
  }

  private async floor(
    text: string,
    image?: ModerationImage,
  ): Promise<{ decision: ModerationDecision | null; scores: Partial<Record<FloorCategory, number>> }> {
    const input: string | OpenAI.Moderations.ModerationMultiModalInput[] = image
      ? [...(text ? [{ type: 'text' as const, text }] : []), { type: 'image_url' as const, image_url: { url: dataUrl(image) } }]
      : text;
    const response = await this.client.moderations.create({ model: this.moderationModel, input });
    const result = response.results[0];
    if (!result) throw new ModerationUnavailableError('openai: empty moderation result');
    const scores: Partial<Record<FloorCategory, number>> = {};
    for (const [category, score] of Object.entries(result.category_scores) as [FloorCategory, number | null][]) {
      if (typeof score === 'number' && score >= 0.2) scores[category] = Number(score.toFixed(3));
    }
    for (const rule of image ? [...IMAGE_FLOOR_RULES, ...FLOOR_RULES] : FLOOR_RULES) {
      const score = result.category_scores[rule.category];
      if (typeof score === 'number' && score >= rule.threshold) {
        return {
          decision: { decision: 'block', severity: rule.severity, categories: [rule.mapped], censoredText: null, reason: `moderation floor: ${rule.category}` },
          scores,
        };
      }
    }
    return { decision: null, scores };
  }

  private async verdict(input: ModerationInput, floorScores: Partial<Record<FloorCategory, number>>): Promise<ModerationDecision> {
    const payload = {
      kind: input.kind,
      candidate: input.text,
      hasImage: Boolean(input.image),
      venue: input.venueName ?? null,
      recentMessages: input.recent ?? [],
      signals: input.signals,
      moderationEndpointScores: floorScores,
    };
    const userContent: OpenAI.Responses.ResponseInputContent[] = [{ type: 'input_text', text: JSON.stringify(payload) }];
    if (input.image) userContent.push({ type: 'input_image', image_url: dataUrl(input.image), detail: 'low' });
    const response = await this.client.responses.parse({
      model: this.model,
      reasoning: { effort: 'low' },
      input: [
        { role: 'system', content: MODERATION_POLICY_PROMPT },
        { role: 'user', content: userContent },
      ],
      text: { format: zodTextFormat(verdictFormat, 'moderation_verdict') },
      max_output_tokens: 1500,
      store: false,
    });

    const parsed = response.output_parsed;
    if (!parsed) {
      const refused = response.output.some(
        (item) => item.type === 'message' && item.content.some((part) => part.type === 'refusal'),
      );
      if (refused) return REFUSAL_DECISION;
      throw new ModerationUnavailableError(`openai: no verdict (status ${response.status ?? 'unknown'})`);
    }
    const decision = moderationDecisionSchema.safeParse({
      ...parsed,
      severity: Math.min(3, Math.max(0, Math.round(parsed.severity))),
      reason: parsed.reason.slice(0, 300),
      censoredText: parsed.decision === 'censor' ? parsed.censoredText : null,
    });
    if (!decision.success) throw new ModerationUnavailableError('openai: verdict failed validation');
    return decision.data;
  }
}
