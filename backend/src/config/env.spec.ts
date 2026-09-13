import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgresql://x',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  OPENAI_API_KEY: 'sk-test',
};

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv(base);
    expect(env.JOIN_RADIUS_M).toBe(200);
    expect(env.LEAVE_RADIUS_M).toBe(250);
    expect(env.OPENAI_MODEL).toBe('gpt-5-nano');
    expect(env.OVERPASS_CONTACT).toBe('dogukangundogan5@gmail.com');
  });

  it('requires the OpenAI key outside the test environment', () => {
    const { OPENAI_API_KEY: _key, ...withoutKey } = base;
    expect(() => loadEnv({ ...withoutKey, NODE_ENV: 'development' })).toThrow(/OPENAI_API_KEY/);
    expect(loadEnv({ ...withoutKey, NODE_ENV: 'test' }).OPENAI_API_KEY).toBeUndefined();
  });

  it('refuses mock locations in production', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', OPENAI_API_KEY: 'sk', ALLOW_MOCK_LOCATIONS: '1' })).toThrow(/ALLOW_MOCK_LOCATIONS/);
  });

  it('rejects a leave radius smaller than the join radius', () => {
    expect(() => loadEnv({ ...base, LEAVE_RADIUS_M: '100' })).toThrow(/LEAVE_RADIUS_M/);
  });
});
