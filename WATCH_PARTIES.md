# Watch Parties – Features and Flow

## Overview

- Real-time group viewing around a movie, managed as `WatchParty` records.
- Party lifecycle: `SCHEDULED` → `ACTIVE` → `ENDED`.
- Access gated by user subscription type and host permissions.

## Key Concepts

- Join Code: unique code per party used to join scheduled or active parties.
- Host: the user who creates the party; only the host can end or invite.
- Participants: users currently in the party.
- Invited Users: users invited to scheduled parties; appear in their scheduled list.

## Eligibility Rules

- Allowed to start/join: `FREEMIUM` or `PREMIUM` users (free trial users are set to `PREMIUM`).
- Default user state: `FREE_TIER` and `isSubscribed=false` for new users.
- One active party per user at a time (host or participant).
- Freemium limit: freemium users can only have one scheduled or active party total.
- End party: only the host can end a party.
- On end: all `FREEMIUM` participants are downgraded to `FREE_TIER`.

## Data Model

- `WatchParty`
  - `channelName`, `movieId`, `joinCode`, `status`, `scheduledFor`, `endedAt`
  - Idempotency fields: `startKey` (for immediate start), `lastStartScheduledKey`, `lastEndKey`
  - Audit: `rotatedAt` records when join code was rotated
  - `hostId` (FK to `User`) and `host` relation
  - `participants` `ManyToMany<User>` via `watch_party_participants`
  - `invitedUsers` `ManyToMany<User>` via `watch_party_invited_users`
- `User`
  - `hostedParties` `OneToMany<WatchParty>`
  - `participatingParties` `ManyToMany<WatchParty>`
  - `invitedWatchParties` `ManyToMany<WatchParty>`
  - Subscription fields: `subscriptionType`, `isSubscribed`, `hasUsedFreeTrial`, etc.

## Endpoints (Auth Required)

- Generate RTM token: `POST /watch-party/rtm/token`
- Refresh RTM token: `POST /watch-party/rtm/token/refresh`
- Start party (ACTIVE now): `POST /watch-party/party/start`
  - Body supports `idempotencyKey` for idempotent creation
- Join party by id (host-only, ACTIVE): `POST /watch-party/party/join`
- End party (host-only): `POST /watch-party/party/end`
  - Body supports `idempotencyKey` for idempotent transition to `ENDED`
- Get party metadata: `GET /watch-party/party/:partyId`
- Schedule party: `POST /watch-party/party/schedule`
- Invite users (host-only): `POST /watch-party/party/invite`
- List my scheduled: `GET /watch-party/my/scheduled`
- Join by code (SCHEDULED or ACTIVE): `POST /watch-party/party/join-by-code`
- Start scheduled party (host-only): `POST /watch-party/party/start-scheduled`
  - Body supports `idempotencyKey` for idempotent activation
 - Reject invite (invited user): `POST /watch-party/party/reject-invite`
 - Remove invite (host-only): `POST /watch-party/party/remove-invite`
- Rotate join code (host-only): `POST /watch-party/party/rotate-code`
 - Kick user (host-only): `POST /watch-party/party/kick`
 - Ban user (host-only): `POST /watch-party/party/ban`
 - Unban user (host-only): `POST /watch-party/party/unban`
 - Mute user (host-only): `POST /watch-party/party/mute`
 - Unmute user (host-only): `POST /watch-party/party/unmute`
 - Transfer host (host-only): `POST /watch-party/party/transfer-host` (body: `partyId`, `newHostId`)
 - Leave party (any participant): `POST /watch-party/party/leave` (body: `partyId`)
  - Returns new `joinCode` and sets `rotatedAt`

## Flows

- Schedule

  1. Host calls `POST /watch-party/party/schedule` with `movieId`, `scheduledFor` (epoch ms recommended), optional `channelName`, and invite targets (`inviteeIds`, `emails`, `phones`).
  2. Party created with `status=SCHEDULED`, a `joinCode` generated.
  3. Invitees see the party in `GET /watch-party/my/scheduled`.
  4. Clock source guidance: host’s client time sends `scheduledFor` as epoch ms; other clients compute targets relative to their local now. Server time sync is not required.

- Start Scheduled

  1. Host calls `POST /watch-party/party/start-scheduled` with `partyId`.
  2. Validates host, `status=SCHEDULED`, and no other active party.
  3. Party transitions to `status=ACTIVE`.
  4. Response includes `rtmToken`, `expireSeconds`, `role='HOST'`, and `channelName`.
  5. Idempotency: include `idempotencyKey` to avoid double activation on retries.

- Start Immediately (Active)

  1. Host calls `POST /watch-party/party/start` with `movieId` and optional `channelName`.
  2. Validates eligibility and active-party constraints.
  3. Party created `status=ACTIVE` with `joinCode` and host as initial participant; server appends `-<UUID>` suffix to `channelName`.
  4. Idempotency: include `idempotencyKey` to avoid duplicate party creation on retries.

- Join by Code

  1. User calls `POST /watch-party/party/join-by-code` with `code`.
  2. Validates eligibility, ended-state, unique constraints.
  3. Adds user to participants for scheduled or active parties (scheduled parties are “pre-joined”).
  4. Response includes `rtmToken`, `expireSeconds`, and `channelName`. Role is dynamic: `HOST` when the caller is the party's `hostId`, otherwise `PARTICIPANT`.
  5. One-active-party invariant: server enforces a single active party per user and denies joins when `status=ENDED`.
  6. Bans: server denies joins for banned users.

- Join by Id (Active Only)

  1. Host calls `POST /watch-party/party/join` with `partyId`.
  2. Host-only. Validates `status=ACTIVE` and constraints; adds host to participants if needed.
  3. Response includes `rtmToken`, `expireSeconds`, `role='HOST'`, and `channelName`.

- Host Transfer

  1. Current host calls `POST /watch-party/party/transfer-host` with `partyId` and `newHostId`.
  2. Validates new host is a current participant; updates `hostId`.
  3. Broadcast new host via channel attributes in the frontend.

- Host Failover

  1. If the host leaves without ending the party, the server records `hostLeftAt`.
  2. If the host does not rejoin within 1 minute and the party remains `ACTIVE`, the server reassigns host to the first available participant.
  3. When the host rejoins (by code or id), `hostLeftAt` is cleared.

- End Party
  1. Host calls `POST /watch-party/party/end` with `partyId`.
  2. Transitions to `ENDED`; downgrades `FREEMIUM` participants to `FREE_TIER`.
  3. Idempotency: include `idempotencyKey` to prevent duplicate end transitions.

## Server References

- Controller: `src/watch-party/watch-party.controller.ts`
- Service: `src/watch-party/watch-party.service.ts`
- Entity: `src/watch-party/entities/watch-party.entity.ts`
- User: `src/user/entities/user.entity.ts`
- Subscription types: `src/user/enum/userType.ts`

## Client Notes

- Include `Authorization: Bearer <token>` for all watch-party endpoints.
- Start/join/join-by-code/start-scheduled responses include `rtmToken` and `expireSeconds` for the caller.
- RTM token endpoints use authenticated user id from the token (`req.user.sub`).
- `joinCode` is included in party metadata and scheduled list responses.
- Rotate join code: host can regenerate the party’s `joinCode` via `POST /watch-party/party/rotate-code`; old code becomes invalid immediately for new joins; existing participants and invites remain intact.
- Rate limiting and abuse controls: server throttles `start`, `join`, and `rotate-code` to a small number of requests per second per user (configurable, currently 5/sec); clients should also respect Agora RTM’s guidance (~20 API calls/sec per client).
- Moderation: kick removes participant; ban prevents future joins; mute is chat-only—prevents the person from texting. Clients should respect `mutedUsers` in metadata when sending chat; the backend records mute state for clients to enforce and does not itself enforce messaging transport.
- Active-party tracking: a user is considered to have an active party if they are the `hostId` or currently appear in the party's `participants` while `status='ACTIVE'`. Kicking or banning a user removes them from `participants`, so they no longer count as having an active party. Banned users cannot rejoin by code until unbanned.

### Freemium Trial Semantics

- Freemium users are permitted to start/join watch parties subject to concurrency limits.
- Additional trial constraint: when a freemium user voluntarily leaves a party (`POST /watch-party/party/leave`) or is removed (`kick`/`ban`) from an `ACTIVE` party, their watch-party trial is marked as used and future starts/joins are denied.
- Party-level end (`POST /watch-party/party/end`) still downgrades freemium participants to `FREE_TIER` as before.

### Why Join by ID Exists

- Host recovery and management: allows the host to rejoin their active party to refresh session state and tokens using the canonical `partyId`.
- Operational safety: prevents uninvited access by restricting join-by-ID to the host; guests use `joinCode`.
