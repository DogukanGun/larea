# Larea realtime protocol

Plain WebSocket (RFC 6455), JSON text frames, one event per frame. No Socket.IO.

## Connecting

`GET /ws` with the header `Authorization: Bearer <access token>` on the upgrade request.

| Outcome | Response |
|---|---|
| Missing, invalid, or expired token | HTTP `401` on the upgrade (no socket). Refresh the token and reconnect. |
| Suspended account | HTTP `403` on the upgrade. |
| Wrong path | HTTP `404`. |
| Server revokes an open connection | Close code `4401` (session invalid, e.g. account deleted) or `4403` (suspended). |

The server pings every 30 s and terminates a socket that does not answer within the next ping cycle. Reconnect with exponential backoff (1 s, 2 s, 4 s, ... max 30 s). On every reconnect, and whenever the app returns to the foreground: send `join` for the venue you are in, then an immediate `heartbeat`.

Frames larger than 4 KB are rejected.

## Client → server

Every message may carry a `reqId` (string, ≤ 64 chars); the server answers with an `ack` carrying the same `reqId`.

```json
{"type":"join","reqId":"1","venueId":"<venue id>"}
{"type":"leave","reqId":"2","venueId":"<venue id>"}
{"type":"heartbeat","reqId":"3","venueId":"<venue id>","lat":52.5219,"lng":13.4132,"accuracy":12,"mocked":false}
{"type":"ping","reqId":"4"}
```

- `join` subscribes this socket to the venue room. It requires an ACTIVE membership created with `POST /venues/:id/join` first. Ack: `{ok:true, data:{membershipId, memberCount, timing}}` or `{ok:false, reason:"not_member"}` → run the REST join again with a fresh fix.
- `heartbeat` should be sent every `timing.heartbeatIntervalSec` (default 25 s) while the chat screen is open, and immediately after reconnect or foregrounding. Ack `data.state` is one of:
  - `eligible` – precise fix inside the venue; you may keep chatting.
  - `weak_gps` – imprecise fix that still overlaps the venue; show a "weak GPS" hint. After `timing.weakGpsGraceSec` without an `eligible` fix the server removes you (`unconfirmed`).
  - `outside` – the whole error circle is beyond the leave radius. Two consecutive `outside` fixes remove you (`removed:true` in the ack and a `removed` event).
  - `ignored` – the fix was discarded (`reason`: `mock_location` or `implausible_movement`).
  - `{ok:false, reason:"not_member"}` – you are no longer a member; rejoin via REST when back in range.
- `leave` ends the membership and unsubscribes the socket.
- `ping` → `pong`.

Coordinates sent in heartbeats are used for the eligibility check only. They are never stored in the database, never logged, and never shown to other users.

## Server → client

```json
{"type":"ack","reqId":"1","ok":true,"data":{...}}
{"type":"message","message":{"id":"…","venueId":"…","author":{"id":"…","displayName":"anna_k"},"kind":"TEXT","text":"Anyone want to get food?","status":"APPROVED","createdAt":"2026-09-06T21:00:00.000Z"}}
{"type":"message","message":{"id":"…","venueId":"…","author":{"id":"…","displayName":"anna_k"},"kind":"IMAGE","text":"lunch spot","caption":"lunch spot","image":{"url":"https://…/media/<id>.jpg","thumbUrl":"https://…/media/<id>_thumb.jpg","width":1600,"height":1200},"status":"APPROVED","createdAt":"…"}}
{"type":"message","message":{"id":"…","venueId":"…","author":{"id":"…","displayName":"anna_k"},"kind":"POLL","text":"Poll: Pizza or ramen?","poll":{"id":"…","question":"Pizza or ramen?","options":[{"id":"…","text":"Pizza","votes":3},{"id":"…","text":"Ramen","votes":1}],"totalVotes":4,"closed":false,"closesAt":null},"status":"APPROVED","createdAt":"…"}}
{"type":"message","message":{"id":"…","venueId":"…","author":{"id":"…","displayName":"ben"},"kind":"TEXT","text":"which side?","replyTo":{"id":"…","author":{"id":"…","displayName":"anna_k"},"kind":"TEXT","text":"found a quiet corner on the 3rd floor"},"status":"APPROVED","createdAt":"…"}}
{"type":"poll_update","venueId":"…","messageId":"…","poll":{"id":"…","question":"Pizza or ramen?","options":[{"id":"…","text":"Pizza","votes":4},{"id":"…","text":"Ramen","votes":1}],"totalVotes":5,"closed":false,"closesAt":null}}
{"type":"market_update","kind":"offer_received","listingId":"…","offerId":"…"}
{"type":"message_hidden","venueId":"…","messageId":"…"}
{"type":"removed","venueId":"…","reason":"out_of_range","message":"You're no longer near this location. You've been removed from the chat."}
{"type":"enforcement","kind":"mute","until":"2026-09-06T22:00:00.000Z","message":"…"}
{"type":"presence","venueId":"…","count":7}
{"type":"pong","reqId":"4"}
{"type":"error","reqId":"3","code":"BAD_MESSAGE","message":"…"}
```

`removed.reason` values and the expected client behaviour:

| reason | Show the message? | Then |
|---|---|---|
| `out_of_range` | Yes | Leave the chat screen; the user can rejoin when back in range. |
| `stale` | No | Silently try `POST /venues/:id/join` with a fresh fix (the app was backgrounded or offline). |
| `unconfirmed` | Yes (soft) | Ask the user to move somewhere with better GPS, then rejoin. |
| `venue_closed` | Yes | Leave the chat screen. |
| `suspended` | Yes | Leave the chat screen; the account is read-only. |
| `replaced` | No | This device's membership moved to another venue (another device joined elsewhere). |
| `user_left` | No | Confirmation of a `leave`. |

Messages from users you blocked, or who blocked you, are never delivered to you (filtered server-side).
Messages are sent over REST (`POST /venues/:id/messages`) so the moderation verdict comes back synchronously; approved messages then arrive on this socket for everyone in the room, including the sender.

### Message kinds

`message.kind` is `TEXT` (default), `IMAGE` or `POLL`. `text` is always present and readable: for photos it is the caption or `[Photo]`, for polls `Poll: <question>`, so clients that predate a kind can still render something. `IMAGE` messages add `caption` (possibly empty) and `image {url, thumbUrl, width, height}`; the files are served under `/media/` with immutable caching and disappear when the message is hidden or purged. Photos are uploaded first with `POST /uploads` (multipart field `file`, JPEG/PNG/WebP, re-encoded and stripped of metadata on the server) and then sent as `{ "kind": "IMAGE", "mediaId": "…", "text": "optional caption", "clientKey": "…" }`. `POLL` messages add `poll {id, question, options[{id, text, votes}], totalVotes, closed, closesAt}`; REST responses (history, `POST /venues/:id/polls`, `POST /polls/:id/vote`) also carry `myOptionId` for the caller, fan-out never does (keep your own selection). Votes go over REST (`POST /polls/:id/vote {optionId}`, members only, changeable while open; `POST /polls/:id/close` for the author or a moderator) and the room receives `poll_update` with fresh counts, coalesced to at most one per poll every 500 ms. `market_update` goes to the people involved in a marketplace listing (never to a room): `kind` is one of `offer_received`, `offer_accepted`, `offer_declined`, `offer_withdrawn`, `offer_expired`, `order_paid`, `order_completed`, `order_cancelled`, `order_refunded`, `listing_removed`, `listing_expired`, `payouts_ready`, with `listingId` and, when relevant, `offerId` / `orderId`. The payload is deliberately thin: refetch `GET /market/me` (or the listing/order) to render. Solana build (dApp Store) additions: a message may carry `authorLevel` (the author's loyalty level at the place: 1 Visitor, 2 Regular, 3 Local, 4 Legend; absent when none) and `room: "REGULARS"` for the place's Regulars room. Regulars messages are only fanned out to Regulars whose socket sent `X-Larea-Build: solana` on the upgrade, are sent with `{ "room": "REGULARS", … }` and read with `GET /venues/:id/messages?room=REGULARS` (both 403 `LEVEL_REQUIRED` below Regular); the main room and its history never contain them. `kind: "TIP"` messages announce a confirmed tip (text `"anna tipped ben 2 USDC"`, plus `tip {id, token, amount, to {id, displayName}, signature}`); tips are created with `POST /venues/:id/tips {toUserId, token: USDC|SKR, amount}`, which returns a transfer for the sender's wallet to sign. Replies: send `{ "text": "…", "replyToId": "<message id>", "clientKey": "…" }` (also with `kind: "IMAGE"`); the answered message must be visible, in the same place and room, and not a `TIP` (404 otherwise, also when either of you has blocked the other). A reply carries `replyTo {id, author {id, displayName}, kind, text}`, where `text` is the shown (possibly masked) text, `[Photo]` or `Poll: <question>`, cut to 140 characters. It is `replyTo {id, unavailable: true}` when the answered message was hidden or its author is blocked for you, and absent once that message is deleted; on `message_hidden` mark quotes of that id unavailable. Clients that predate replies show them as plain messages. Clients must ignore event types and message kinds they do not know.
