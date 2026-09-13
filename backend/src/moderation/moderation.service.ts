import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectEnv } from '../config/inject-env.js';
import type { Env } from '../config/env.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { MODERATION_CLIENT, type ModerationClient, type ModerationDecision, type ModerationImage, ModerationUnavailableError } from './moderation.types.js';
import { detectSignals } from './rules.js';

export interface MessageContext {
  text: string;
  venueName: string;
  recent: { displayName: string; text: string }[];
}

const DECISION_RANK = { allow: 0, warn: 1, censor: 2, block: 3 } as const;
const rank = (d: ModerationDecision) => DECISION_RANK[d.decision] * 10 + d.severity;

/** Fail-closed gateway in front of the classifier: circuit breaker plus rule signals. */
@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);
  private readonly breaker = new CircuitBreaker({ failureThreshold: 5, windowMs: 60_000, openMs: 30_000 });

  constructor(
    @InjectEnv() private readonly env: Env,
    @Inject(MODERATION_CLIENT) private readonly client: ModerationClient,
  ) {}

  get isDegraded(): boolean {
    return this.breaker.isOpen;
  }

  /** Throws ModerationUnavailableError when no verdict can be obtained. */
  async evaluateMessage(ctx: MessageContext): Promise<ModerationDecision> {
    return this.guarded(() =>
      this.client.evaluate({
        kind: 'message',
        text: ctx.text,
        venueName: ctx.venueName,
        recent: ctx.recent,
        signals: detectSignals(ctx.text),
      }),
    );
  }

  /** A photo with an optional caption; the image is always shown to the verdict model. */
  async evaluateImageMessage(ctx: MessageContext & { image: ModerationImage }): Promise<ModerationDecision> {
    return this.guarded(() =>
      this.client.evaluate({
        kind: 'message',
        text: ctx.text,
        image: ctx.image,
        venueName: ctx.venueName,
        recent: ctx.recent,
        signals: detectSignals(ctx.text),
      }),
    );
  }

  /** Listing text first, then each photo with the text as context; the worst verdict wins. */
  async evaluateListing(ctx: { text: string; images: ModerationImage[] }): Promise<ModerationDecision> {
    const text = await this.guarded(() => this.client.evaluate({ kind: 'listing', text: ctx.text, signals: detectSignals(ctx.text) }));
    if (text.decision === 'block' || ctx.images.length === 0) return text;
    const verdicts = await Promise.all(
      ctx.images.map((image) => this.guarded(() => this.client.evaluate({ kind: 'listing', text: ctx.text, image, signals: [] }))),
    );
    return [text, ...verdicts].reduce((worst, v) => (rank(v) > rank(worst) ? v : worst));
  }

  async checkDisplayName(name: string): Promise<'allow' | 'block'> {
    const decision = await this.guarded(() => this.client.evaluate({ kind: 'display_name', text: name, signals: detectSignals(name) }));
    return decision.decision === 'allow' || decision.decision === 'warn' ? 'allow' : 'block';
  }

  private async guarded(run: () => Promise<ModerationDecision>): Promise<ModerationDecision> {
    if (this.breaker.isOpen) throw new ModerationUnavailableError('circuit open');
    try {
      const decision = await run();
      this.breaker.recordSuccess();
      return decision;
    } catch (err) {
      this.breaker.recordFailure();
      if (err instanceof ModerationUnavailableError) throw err;
      this.logger.error({ err }, 'unexpected moderation error');
      throw new ModerationUnavailableError();
    }
  }
}
