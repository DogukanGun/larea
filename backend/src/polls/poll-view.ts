import type { Poll, PollOption } from '../generated/prisma/client.js';
import type { ChatPollView } from '../realtime/protocol.js';

export type PollRow = Poll & { options: (PollOption & { _count: { votes: number } })[] };

export const POLL_INCLUDE = { options: { orderBy: { position: 'asc' as const }, include: { _count: { select: { votes: true } } } } } as const;

export const MAX_POLL_QUESTION = 200;
export const MAX_POLL_OPTION = 60;
export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_OPTIONS = 6;

export function pollFallbackText(question: string): string {
  return `Poll: ${question}`;
}

export function isPollClosed(poll: Pick<Poll, 'closed' | 'closesAt'>, now = new Date()): boolean {
  return poll.closed || (poll.closesAt !== null && poll.closesAt.getTime() <= now.getTime());
}

export function toPollView(poll: PollRow, myOptionId?: string | null): ChatPollView {
  const options = poll.options.map((o) => ({ id: o.id, text: o.text, votes: o._count.votes }));
  const view: ChatPollView = {
    id: poll.id,
    question: poll.question,
    options,
    totalVotes: options.reduce((sum, o) => sum + o.votes, 0),
    closed: isPollClosed(poll),
    closesAt: poll.closesAt?.toISOString() ?? null,
  };
  if (myOptionId !== undefined) view.myOptionId = myOptionId;
  return view;
}
