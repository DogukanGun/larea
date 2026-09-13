import { z } from 'zod';

/** Wire-level realtime protocol. Keep in sync with docs/realtime-protocol.md. */

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('join'), reqId: z.string().max(64).optional(), venueId: z.string().min(1).max(64) }),
  z.object({ type: z.literal('leave'), reqId: z.string().max(64).optional(), venueId: z.string().min(1).max(64) }),
  z.object({
    type: z.literal('heartbeat'),
    reqId: z.string().max(64).optional(),
    venueId: z.string().min(1).max(64),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(100_000),
    mocked: z.boolean().optional(),
  }),
  z.object({ type: z.literal('ping'), reqId: z.string().max(64).optional() }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type RemovalReason = 'user_left' | 'out_of_range' | 'stale' | 'unconfirmed' | 'venue_closed' | 'suspended' | 'replaced';

export interface ChatMessageView {
  id: string;
  venueId: string;
  author: { id: string; displayName: string };
  text: string;
  status: 'APPROVED' | 'CENSORED';
  createdAt: string;
}

export type ServerEvent =
  | { type: 'ack'; reqId?: string; ok: boolean; reason?: string; data?: Record<string, unknown> }
  | { type: 'message'; message: ChatMessageView }
  | { type: 'message_hidden'; venueId: string; messageId: string }
  | { type: 'removed'; venueId: string; reason: RemovalReason; message: string }
  | { type: 'enforcement'; kind: 'mute' | 'suspend'; until: string | null; message: string }
  | { type: 'presence'; venueId: string; count: number }
  | { type: 'pong'; reqId?: string }
  | { type: 'error'; reqId?: string; code: string; message: string };

const removalMessages: Record<RemovalReason, string> = {
  out_of_range: "You're no longer near this location. You've been removed from the chat.",
  stale: 'Your connection went quiet, so you were removed from the chat.',
  unconfirmed: "We couldn't confirm you're still nearby, so you were removed from the chat.",
  venue_closed: 'This chat is no longer available.',
  suspended: 'Your account has been suspended.',
  replaced: 'You joined another chat.',
  user_left: 'You left the chat.',
};

export function removalMessage(reason: RemovalReason): string {
  return removalMessages[reason];
}

/** Close codes used when the server terminates an authenticated connection. */
export const CLOSE_UNAUTHORIZED = 4401;
export const CLOSE_SUSPENDED = 4403;
