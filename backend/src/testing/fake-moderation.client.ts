import { type ModerationClient, type ModerationDecision, type ModerationInput, ModerationUnavailableError } from '../moderation/moderation.types.js';

/**
 * Deterministic stand-in used in tests and in development without an API key.
 * Recognises a few phrases from the product spec plus explicit markers.
 */
export class FakeModerationClient implements ModerationClient {
  async evaluate(input: ModerationInput): Promise<ModerationDecision> {
    const text = input.text.toLowerCase();
    if (text.includes('[unavailable]')) throw new ModerationUnavailableError('fake outage');

    if (input.kind === 'display_name') {
      const bad = /admin|moderator|police|polizei|\[block\]/i.test(input.text);
      return {
        decision: bad ? 'block' : 'allow',
        severity: bad ? 2 : 0,
        categories: bad ? ['other'] : [],
        censoredText: null,
        reason: bad ? 'reserved or offensive name' : 'ok',
      };
    }

    if (text.includes('[block3]') || /i know where you live|coming to your house|i'?m coming for you/.test(text)) {
      return { decision: 'block', severity: 3, categories: ['threat'], censoredText: null, reason: 'threat against a participant' };
    }
    if (text.includes('[block2]') || /scam|crypto giveaway/.test(text)) {
      return { decision: 'block', severity: 2, categories: ['scam_spam'], censoredText: null, reason: 'scam or spam' };
    }
    if (text.includes('[warn]')) {
      return { decision: 'warn', severity: 1, categories: ['other'], censoredText: null, reason: 'mild issue' };
    }
    if (/\bdamn\b/.test(text)) {
      return {
        decision: 'censor',
        severity: 1,
        categories: ['profanity'],
        censoredText: input.text.replace(/\bdamn\b/gi, (w) => w[0] + '***'),
        reason: 'mild profanity',
      };
    }
    return { decision: 'allow', severity: 0, categories: [], censoredText: null, reason: 'ok' };
  }
}
