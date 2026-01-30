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
- Frontend roster: roster presence uses profileId-only keys; server roster resolves `profileName`; UI labels the current profile as “(Me)”.
- Frontend RTC defaults: auto-join on party connect; Join/Leave RTC buttons are not shown to end users; camera/mic controls remain. Local mic starts muted; camera is off until toggled.
- Frontend remote tiles: remote cards persist on unpublish and show “Waiting for video...” until video is published; the label clears on publish. Meet-cards use 16:9; media renders with `object-fit: contain`.
- Frontend robustness: on SEND_VIDEO_BITRATE_TOO_LOW (1003), the client progressively downscales local video (360p_4→240p_2→180p_2 @ 15fps) and periodically attempts upgrades (~every 2 min) when stable. A short-lived remote subscription sync runs for ~60s after join (every 2s) and on user-joined to ensure tracks attach if user-published was missed.

### Freemium Trial Semantics

- Freemium users are permitted to start/join watch parties subject to concurrency limits.
- Additional trial constraint: when a freemium user voluntarily leaves a party (`POST /watch-party/party/leave`) or is removed (`kick`/`ban`) from an `ACTIVE` party, their watch-party trial is marked as used and future starts/joins are denied.
- Party-level end (`POST /watch-party/party/end`) still downgrades freemium participants to `FREE_TIER` as before.

### Why Join by ID Exists

- Host recovery and management: allows the host to rejoin their active party to refresh session state and tokens using the canonical `partyId`.
- Operational safety: prevents uninvited access by restricting join-by-ID to the host; guests use `joinCode`.

## Usage Guide

- Prerequisites

  - Obtain an access token by logging in and selecting a profile.
  - Use the access token in `Authorization: Bearer <token>` for all endpoints.
  - For playback of MAIN media, ensure policy requirements (premium or active party via premium host) are met.

- Start a party (ACTIVE)

  - Request:

    ```bash
    curl -X POST "$API_BASE/watch-party/party/start" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"movieId":"<uuid>","channelName":"wp-demo"}'
    ```

  - Response shape:

    ```json
    {
      "status": true,
      "message": "Action Completed",
      "data": {
        "party": { "id": "uuid", "status": "ACTIVE", "joinCode": "ABC123" },
        "rtmToken": "rtm-token",
        "expireSeconds": 7200,
        "role": "HOST",
        "channelName": "wp-demo-<uuid-suffix>"
      }
    }
    ```

  - Notes
    - `channelName` is suffixed by the server to guarantee uniqueness.
    - Hosts receive an RTM token to connect signaling immediately.

- Join by code (SCHEDULED or ACTIVE)

  - Request:

    ```bash
    curl -X POST "$API_BASE/watch-party/party/join-by-code" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"code":"ABC123"}'
    ```

  - Response includes `party`, `rtmToken`, `expireSeconds`, dynamic `role`, and `channelName`.
  - Constraints:
    - Scheduled parties are invite-only until started.
    - One-active-party invariant enforced.
    - Banned users are rejected.

- Join by id (ACTIVE only, host)

  - Request:

    ```bash
    curl -X POST "$API_BASE/watch-party/party/join" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"partyId":"<uuid>"}'
    ```

- Schedule

  - Create scheduled party:

    ```bash
    curl -X POST "$API_BASE/watch-party/party/schedule" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"movieId":"<uuid>","scheduledFor":"2026-02-01T18:00:00Z","inviteeIds":["u1","u2"],"emails":["a@b.com"],"phones":[],"channelName":"premiere"}'
    ```

  - List my scheduled:

    ```bash
    curl -X GET "$API_BASE/watch-party/my/scheduled" \
      -H "Authorization: Bearer $ACCESS_TOKEN"
    ```

  - Start scheduled (idempotent):

    ```bash
    curl -X POST "$API_BASE/watch-party/party/start-scheduled" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"partyId":"<uuid>","idempotencyKey":"start-123"}'
    ```

- Moderation

  - Rotate code (host):

    ```bash
    curl -X POST "$API_BASE/watch-party/party/rotate-code" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"partyId":"<uuid>"}'
    ```

  - Kick / Ban / Unban / Mute / Unmute (host):

    ```bash
    curl -X POST "$API_BASE/watch-party/party/kick" -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" -d '{"partyId":"<uuid>","userId":"u2"}'
    curl -X POST "$API_BASE/watch-party/party/ban" -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" -d '{"partyId":"<uuid>","userId":"u2"}'
    curl -X POST "$API_BASE/watch-party/party/unban" -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" -d '{"partyId":"<uuid>","userId":"u2"}'
    curl -X POST "$API_BASE/watch-party/party/mute" -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" -d '{"partyId":"<uuid>","userId":"u2"}'
    curl -X POST "$API_BASE/watch-party/party/unmute" -H "Authorization: Bearer $ACCESS_TOKEN" -H "Content-Type: application/json" -d '{"partyId":"<uuid>","userId":"u2"}'
    ```

- End party (host)

  ```bash
  curl -X POST "$API_BASE/watch-party/party/end" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"partyId":"<uuid>","idempotencyKey":"end-123"}'
  ```

## Token Endpoints

- Integrated RTM + RTC (signaling + media)

  - Always generate both tokens for the same `channelName` of the party.
  - Typical sequence when you are HOST or PARTICIPANT:

    1. Call start/join/join-by-code/start-scheduled to obtain `party`, `role`, and `channelName`
    2. Request RTM token to connect signaling (presence, sync, control)
    3. Request RTC token to connect audio/video media for the same channel
    4. Connect RTM and RTC with consistent `uid` (e.g. profileId) to unify identity

  - RTM token:

    ```bash
    curl -X POST "$API_BASE/watch-party/rtm/token" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"expireSeconds":600}'
    ```

    - Returns `{ token, expireSeconds }`. Use with Agora RTM client `login({ token })`.

  - RTC token:

    ```bash
    curl -X POST "$API_BASE/watch-party/rtc/token" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"channelName":"<party-channel>","expireSeconds":600}'
    ```

    - Returns `{ token, expireSeconds }`. Use with Agora RTC client `client.join(appId, channelName, token, uid)`.
    - `channelName` must match the party’s channel from the start/join response.
    - Refresh with `POST /watch-party/rtc/token/refresh` before expiry; renew token on the client.

## RTC Integration Quickstart

- Goal: real-time audio/video between participants layered on top of RTM signaling.
- Steps

  - Include Agora RTC SDK (web/js or native SDK depending on client).
  - Obtain RTC token from `POST /watch-party/rtc/token` using the party’s `channelName`.
  - Use a stable `uid` (profileId) when joining the RTC channel to unify identity across signaling and media.
  - Create local audio/video tracks and publish them to the channel.
  - Subscribe to remote tracks and render them in a participant grid.
  - Handle token expiry by calling `POST /watch-party/rtc/token/refresh` and `client.renewToken(newToken)` (or re-join, depending on SDK).

- Example (web, pseudocode):

  ```javascript
  // assumes AgoraRTC global (CDN) or imported module
  const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
  await client.join(APP_ID, CHANNEL_NAME, RTC_TOKEN, UID);
  const mic = await AgoraRTC.createMicrophoneAudioTrack();
  const cam = await AgoraRTC.createCameraVideoTrack();
  await client.publish([mic, cam]);
  client.on('user-published', async (user, mediaType) => {
    await client.subscribe(user, mediaType);
    const track = mediaType === 'video' ? user.videoTrack : user.audioTrack;
    track.play(/* container element */);
  });
  ```

- UI recommendations
  - Buttons: Mute/Unmute mic, Enable/Disable camera (Join/Leave RTC is automated and not shown to end users).
  - Show participant grid and media state (muted, speaking).
  - Display network quality and handle auto-reconnect.

### Frontend Behavior Snapshot

- Playback sync uses anchor + heartbeat; channel attributes hold `{hostId,state,mediaTime,at}`; clients snap on subscribe and reconnect.
- Roster renders `profileName` and role; current profile shows “(Me)”.
- Tiles render whole feed (contain) in 16:9 cards; remote tiles persist and display a waiting label when not sending.
- Bitrate auto-recovery and periodic upgrade attempts on the client; short-lived remote subscription sync covers late publishes.

## Scenarios (Endpoint Sequences)

- Host schedules a party and invites users

  - POST /watch-party/party/schedule with movieId, scheduledFor, optional channelName, inviteeIds/emails/phones
  - GET /watch-party/my/scheduled for invited users and host to view upcoming party
  - When time arrives:
    - Host POST /watch-party/party/start-scheduled (optionally with idempotencyKey)
    - Response includes channelName; host then:
      - POST /watch-party/rtm/token
      - POST /watch-party/rtc/token with the same channelName
      - Connect RTM and RTC with consistent uid

- Invited user joins scheduled party

  - POST /watch-party/party/join-by-code with the joinCode (invite-only check enforced)
  - On success:
    - POST /watch-party/rtm/token
    - POST /watch-party/rtc/token with party channelName
    - Connect RTM and RTC

- Outsider attempts to join scheduled party

  - POST /watch-party/party/join-by-code without being invited
  - Result: 403 Invite required until party starts

- Host starts an active party immediately

  - POST /watch-party/party/start with movieId, optional channelName
  - Response has channelName:
    - POST /watch-party/rtm/token
    - POST /watch-party/rtc/token with the same channelName
    - Connect RTM and RTC

- Host rotates the join code

  - POST /watch-party/party/rotate-code (returns new joinCode)
  - Old code becomes invalid for new joins; existing participants remain connected

- Guest attempts to join with old (rotated) code

  - POST /watch-party/party/join-by-code with old code
  - Result: 404 not found (invalid join code)

- Host kicks a participant

  - POST /watch-party/party/kick with partyId and userId
  - Participant is removed from `participants` and will need a valid code/invite to rejoin (if allowed)

- Host bans a participant and later unbans

  - POST /watch-party/party/ban with partyId, userId (removes from participants/invites; adds to `bannedUsers`)
  - Attempting to join-by-code yields 403 (banned)
  - POST /watch-party/party/unban allows future joins again

- Host leaves; failover and reassignment

  - POST /watch-party/party/leave (if host) sets `hostLeftAt`
  - After ~60 seconds without host rejoining, fetching metadata:
    - GET /watch-party/party/:partyId triggers reassignment to first available participant
  - Host rejoins later:
    - POST /watch-party/party/join-by-code or /watch-party/party/join (host-only) clears `hostLeftAt`

- End party

  - Host POST /watch-party/party/end (optional idempotencyKey)
  - Party transitions to ENDED; freemium participants downgraded to FREE_TIER

- Freemium user constraints during joins
  - If freemium trial is marked used (`hasUsedWatchPartyTrial`), new joins are denied unless already participant
  - If `lastFreemiumMovieId` is set and differs from target party, joins are denied
  - Only one scheduled or active party total per freemium user

## Watch Party Invariants

- One-active-party per user

  - A user cannot be host or participant in more than one ACTIVE party at a time

- Scheduled invite-only

  - Until started, only invited users (and host) can join scheduled parties by code

- Unique join code with collision handling

  - `joinCode` has a unique DB constraint; save-level retry regenerates codes on Postgres 23505 collisions

- Host-only actions

  - End, rotate-code, start-scheduled, transfer-host, invite/remove-invite, kick, ban/unban, mute/unmute require host privileges

- Idempotency on critical transitions

  - `start-scheduled` and `end` support idempotency keys to prevent duplicate transitions on retries

- Host failover

  - If the host leaves and does not rejoin within ~60s while party remains ACTIVE, host is reassigned to a participant
  - Host rejoin clears `hostLeftAt`

- Rate limiting

  - `start`, `join`, and `rotate-code` are throttled (≈ 5/sec per user); clients should also obey Agora API guidance per client

- Freemium rules

  - One scheduled or active party per freemium user at any time
  - Trial semantics: leaving or being removed from an ACTIVE party marks trial used; future starts/joins are denied
  - On end, freemium participants are downgraded to FREE_TIER

- Channel naming
  - Server appends a UUID suffix when creating channelName to ensure uniqueness
  - RTM and RTC must use the same channelName for unified signaling and media

## Error & Scenario Reference

- Freemium

  - One scheduled or active party per freemium user.
  - Trial semantics: leaving or being removed from an ACTIVE party marks trial used; future starts/joins are denied.
  - On end, freemium participants are downgraded to `FREE_TIER`.

- Scheduled parties

  - Invite-only until activation; uninvited joins by code are rejected.
  - `start-scheduled` is idempotent with `idempotencyKey`.

- Join code rotation

  - Old code becomes invalid for new joins; existing participants remain.
  - Server retries on unique collisions transparently during persistence.

- Concurrency

  - One ACTIVE party per user (host or participant).
  - Rate limiting: `start`, `join`, `rotate-code` throttled (~5/sec per user).

- Common HTTP status notes
  - 401: Missing/invalid auth.
  - 403: Eligibility or policy violation (ban, tier, concurrency, invite requirement).
  - 404: Party or code not found.
  - 400: Bad request (missing fields, invalid schedule time).
  - 500: Unexpected server error (retry recommended).
