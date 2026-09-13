import { describe, expect, it } from 'vitest';
import { ModerationUnavailableError, REFUSAL_DECISION } from './moderation.types.js';
import { OpenAIModerationClient } from './openai-moderation.client.js';

type Handler = (url: string, body: Record<string, unknown>) => { status?: number; body: unknown };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function moderationResponse(scores: Record<string, number>) {
  const categories = Object.fromEntries(Object.entries(scores).map(([key, value]) => [key, value >= 0.5]));
  return { id: 'modr-1', model: 'omni-moderation-latest', results: [{ flagged: Object.values(categories).some(Boolean), categories, category_scores: scores, category_applied_input_types: {} }] };
}

function verdictResponse(content: { type: 'output_text'; text: string } | { type: 'refusal'; refusal: string }, status = 'completed') {
  return {
    id: 'resp-1',
    object: 'response',
    status,
    error: null,
    incomplete_details: null,
    model: 'gpt-5-nano',
    output: [{ type: 'message', id: 'msg-1', role: 'assistant', status: 'completed', content: [{ ...content, annotations: [] }] }],
  };
}

function makeClient(handler: Handler): { client: OpenAIModerationClient; calls: string[] } {
  const calls: string[] = [];
  const fetchStub: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(new URL(url).pathname);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const result = handler(url, body);
    return json(result.body, result.status ?? 200);
  };
  const client = new OpenAIModerationClient({
    apiKey: 'sk-test',
    model: 'gpt-5-nano',
    moderationModel: 'omni-moderation-latest',
    timeoutMs: 2000,
    maxRetries: 0,
    fetch: fetchStub,
  });
  return { client, calls };
}

const base = { kind: 'message' as const, text: 'hello', venueName: 'Main Square', signals: [] as string[] };

describe('OpenAIModerationClient', () => {
  it('blocks on the moderation floor without asking the verdict model', async () => {
    const { client, calls } = makeClient((url) => {
      if (url.endsWith('/moderations')) return { body: moderationResponse({ 'harassment/threatening': 0.96, harassment: 0.9 }) };
      throw new Error('verdict model must not be called');
    });
    const decision = await client.evaluate({ ...base, text: 'wait until you leave, I will find you' });
    expect(decision).toMatchObject({ decision: 'block', severity: 3, categories: ['threat'] });
    expect(calls).toEqual(['/v1/moderations']);
  });

  it('returns the structured verdict when the floor does not trigger', async () => {
    const { client, calls } = makeClient((url, body) => {
      if (url.endsWith('/moderations')) return { body: moderationResponse({ harassment: 0.31, violence: 0.05 }) };
      expect(body.model).toBe('gpt-5-nano');
      expect(body.text).toMatchObject({ format: { type: 'json_schema', name: 'moderation_verdict', strict: true } });
      const user = (body.input as { role: string; content: { type: string; text?: string }[] }[]).find((m) => m.role === 'user');
      expect(user!.content).toHaveLength(1); // no image part for text
      expect(JSON.parse(user!.content[0].text!)).toMatchObject({ candidate: 'this is damn good', hasImage: false, venue: 'Main Square', moderationEndpointScores: { harassment: 0.31 } });
      return {
        body: verdictResponse({
          type: 'output_text',
          text: JSON.stringify({ decision: 'censor', severity: 1, categories: ['profanity'], censoredText: 'this is d*** good', reason: 'mild profanity' }),
        }),
      };
    });
    const decision = await client.evaluate({ ...base, text: 'this is damn good' });
    expect(decision).toEqual({ decision: 'censor', severity: 1, categories: ['profanity'], censoredText: 'this is d*** good', reason: 'mild profanity' });
    expect(calls).toEqual(['/v1/moderations', '/v1/responses']);
  });

  it('clamps out-of-range values from the model', async () => {
    const { client } = makeClient((url) => {
      if (url.endsWith('/moderations')) return { body: moderationResponse({}) };
      return { body: verdictResponse({ type: 'output_text', text: JSON.stringify({ decision: 'allow', severity: 9, categories: [], censoredText: 'x', reason: 'r'.repeat(400) }) }) };
    });
    const decision = await client.evaluate(base);
    expect(decision.severity).toBe(3);
    expect(decision.censoredText).toBeNull();
    expect(decision.reason).toHaveLength(300);
  });

  it('treats a model refusal as a block', async () => {
    const { client } = makeClient((url) => {
      if (url.endsWith('/moderations')) return { body: moderationResponse({}) };
      return { body: verdictResponse({ type: 'refusal', refusal: 'no' }) };
    });
    await expect(client.evaluate(base)).resolves.toEqual(REFUSAL_DECISION);
  });

  it('fails closed on API errors and incomplete output', async () => {
    const failing = makeClient(() => ({ status: 500, body: { error: { message: 'boom' } } }));
    await expect(failing.client.evaluate(base)).rejects.toBeInstanceOf(ModerationUnavailableError);

    const incomplete = makeClient((url) => {
      if (url.endsWith('/moderations')) return { body: moderationResponse({}) };
      return { body: { ...verdictResponse({ type: 'output_text', text: '' }, 'incomplete'), output: [] } };
    });
    await expect(incomplete.client.evaluate(base)).rejects.toBeInstanceOf(ModerationUnavailableError);
  });

  it('sends photos to both stages and applies the stricter image floor', async () => {
    const image = { data: Buffer.from('jpegbytes'), mimeType: 'image/jpeg' as const };
    const seen: Record<string, unknown>[] = [];
    const { client } = makeClient((url, body) => {
      seen.push(body);
      if (url.endsWith('/moderations')) return { body: moderationResponse({ sexual: 0.1, violence: 0.05 }) };
      return { body: verdictResponse({ type: 'output_text', text: JSON.stringify({ decision: 'allow', severity: 0, categories: [], censoredText: null, reason: 'ok' }) }) };
    });
    const decision = await client.evaluate({ ...base, text: 'lunch', image });
    expect(decision.decision).toBe('allow');
    const floorInput = seen[0].input as { type: string; text?: string; image_url?: { url: string } }[];
    expect(floorInput.map((p) => p.type)).toEqual(['text', 'image_url']);
    expect(floorInput[1].image_url?.url.startsWith('data:image/jpeg;base64,')).toBe(true);
    const user = (seen[1].input as { role: string; content: { type: string }[] }[]).find((m) => m.role === 'user')!;
    expect(user.content.map((p) => p.type)).toEqual(['input_text', 'input_image']);

    const { client: strict, calls } = makeClient((url) => {
      if (url.endsWith('/moderations')) return { body: moderationResponse({ sexual: 0.6 }) };
      throw new Error('verdict must not run');
    });
    const blocked = await strict.evaluate({ ...base, text: '', image });
    expect(blocked).toMatchObject({ decision: 'block', severity: 2, categories: ['sexual'] });
    expect(calls).toEqual(['/v1/moderations']);
  });
});
