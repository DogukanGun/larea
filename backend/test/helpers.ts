import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import WebSocket from 'ws';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisService } from '../src/infra/redis/redis.service.js';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  redis: RedisService;
  http: () => request.Agent;
  baseUrl: string;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true, logger: false });
  await app.init();
  await app.listen(0);
  const address = app.getHttpServer().address() as { port: number };
  const prisma = app.get(PrismaService);
  const redis = app.get(RedisService);
  await redis.client.flushdb();
  return {
    app,
    prisma,
    redis,
    http: () => request(app.getHttpServer()),
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await app.close();
    },
  };
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  displayName: string;
  accessToken: string;
  refreshToken: string;
}

export async function registerUser(ctx: TestContext, overrides: Partial<{ email: string; password: string; displayName: string }> = {}): Promise<TestUser> {
  const suffix = randomUUID().slice(0, 8);
  const body = {
    email: overrides.email ?? `e2e-${suffix}@example.test`,
    password: overrides.password ?? 'correct-horse-battery',
    displayName: overrides.displayName ?? `tester_${suffix}`,
  };
  const res = await ctx.http().post('/auth/register').send(body).expect(201);
  return { id: res.body.user.id, ...body, accessToken: res.body.accessToken, refreshToken: res.body.refreshToken };
}

/** Uses the test-only shortcut (TestingModule is loaded because NODE_ENV=test). */
export async function verifyAge(ctx: TestContext, user: TestUser): Promise<void> {
  await ctx.http().post('/testing/verify-age').set(auth(user)).send().expect(200);
}

export function auth(user: { accessToken: string }): { Authorization: string } {
  return { Authorization: `Bearer ${user.accessToken}` };
}

export interface WsClient {
  socket: WebSocket;
  send: (msg: Record<string, unknown>) => void;
  /** Resolves with the next event matching the predicate (events are buffered). */
  waitFor: <T extends { type: string }>(predicate: (e: T) => boolean, timeoutMs?: number) => Promise<T>;
  request: <T extends { type: string }>(msg: Record<string, unknown>) => Promise<T>;
  close: () => Promise<void>;
}

export function connectWs(ctx: TestContext, user: { accessToken: string }): Promise<WsClient> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${ctx.baseUrl.replace('http', 'ws')}/ws`, { headers: auth(user) });
    const buffer: { type: string }[] = [];
    const waiters: { predicate: (e: { type: string }) => boolean; resolve: (e: { type: string }) => void }[] = [];
    socket.on('message', (data) => {
      const event = JSON.parse(data.toString()) as { type: string };
      const idx = waiters.findIndex((w) => w.predicate(event));
      if (idx >= 0) waiters.splice(idx, 1)[0].resolve(event);
      else buffer.push(event);
    });
    socket.once('unexpected-response', (_req, res) => reject(Object.assign(new Error(`ws upgrade rejected: ${res.statusCode}`), { statusCode: res.statusCode })));
    socket.once('error', reject);
    let counter = 0;
    const waitFor = <T extends { type: string }>(predicate: (e: T) => boolean, timeoutMs = 5000): Promise<T> => {
      const idx = buffer.findIndex((e) => predicate(e as T));
      if (idx >= 0) return Promise.resolve(buffer.splice(idx, 1)[0] as T);
      return new Promise<T>((res, rej) => {
        const timer = setTimeout(() => rej(new Error('timed out waiting for ws event')), timeoutMs);
        waiters.push({
          predicate: (e) => predicate(e as T),
          resolve: (e) => {
            clearTimeout(timer);
            res(e as T);
          },
        });
      });
    };
    socket.once('open', () =>
      resolve({
        socket,
        send: (msg) => socket.send(JSON.stringify(msg)),
        waitFor,
        request: <T extends { type: string }>(msg: Record<string, unknown>) => {
          const reqId = `r${++counter}`;
          socket.send(JSON.stringify({ ...msg, reqId }));
          return waitFor<T>((e) => (e as { reqId?: string }).reqId === reqId);
        },
        close: () =>
          new Promise<void>((res) => {
            if (socket.readyState === WebSocket.CLOSED) return res();
            socket.once('close', () => res());
            socket.close();
          }),
      }),
    );
  });
}

export function expectWsRejected(ctx: TestContext, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${ctx.baseUrl.replace('http', 'ws')}/ws`, { headers });
    socket.once('unexpected-response', (_req, res) => {
      socket.terminate();
      resolve(res.statusCode ?? 0);
    });
    socket.once('open', () => reject(new Error('expected the upgrade to be rejected')));
    socket.once('error', (err) => reject(err));
  });
}
