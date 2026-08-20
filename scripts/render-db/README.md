# Dev database rotation

Render deletes free-tier Postgres instances about **30 days** after creation. When
that happens the dev backend at <https://cinego-backend.onrender.com> starts
failing its database health check and the whole dev environment is down until
someone recreates the database by hand.

This directory automates the recovery: delete the dead instance, create a fresh
one, copy the new credentials into `.env` **and** into the deployed Render
service, redeploy, reseed, then confirm the service is healthy again.

## For clients — no credentials needed

The button lives in a separate private repo,
**[dranoid/cinego-db-rotation](https://github.com/dranoid/cinego-db-rotation)**,
which checks this repo out and runs the CLI below. Keeping it there means the
Render API key sits in a private repo with exactly one workflow, and access is
granted purely through GitHub collaborator permissions.

1. Open that repo's **Actions** tab.
2. Pick **Rotate dev database** → **Run workflow**.
3. Type `rotate` in the confirm box and run it.

It takes roughly 5–10 minutes. The run summary reports the new host and whether
the health check passed. You never see or hold a Render API key.

> Tick **Show the plan without changing anything** first if you just want to see
> what would happen.

## For maintainers — local commands

```bash
export RENDER_API_KEY=rnd_...        # https://dashboard.render.com/u/settings#api-keys

pnpm db:status      # is the database alive, and how long until Render reclaims it?
pnpm db:rotate      # the full recovery, with a typed confirmation prompt
pnpm db:pull-env    # just refresh local .env from the CURRENT database
pnpm db:health      # poll the deployed service until its database check passes
pnpm db:discover    # list workspace / database / service ids
```

Useful flags: `--dry-run`, `--no-seed`, `--no-service`, `--no-env-file`,
`--no-health-check`, `--timeout <minutes>`, `--yes`.

`pnpm db:pull-env` is the one to run after *someone else* rotated via the Actions
button — it pulls the new credentials into your local `.env` without touching any
infrastructure.

## One-time setup

Already done, recorded here for reference:

1. `ownerId` is pinned in [`config.json`](./config.json) — `pnpm db:discover`
   prints it. Everything in that file is non-secret and meant to be committed.
2. `RENDER_API_KEY` is set as a repository secret on
   [dranoid/cinego-db-rotation](https://github.com/dranoid/cinego-db-rotation),
   **not** on this repo — this one is public, and the key cannot be scoped.
3. An Environment named `dev-database` exists on that repo. Add required
   reviewers to it if rotations should need approval before running.

## Safety

Rotation is destructive and irreversible, so the CLI refuses to act unless
everything lines up:

- **Plan allowlist** — it will not delete a database whose plan isn't in
  `allowedPlans` (`free`, `basic_256mb`). A production instance on `starter` or
  above is rejected outright, even if the config points straight at it.
- **Exact name match** — the target must match `database.name` exactly, and an
  ambiguous match aborts rather than guessing.
- **Typed confirmation** — you type `rotate`, not `y`. Non-interactive runs must
  pass `--yes`, and CI additionally requires the `confirm` input.
- **`.env` is backed up** to `.env.backup-<timestamp>` before every write, and
  only the six database keys are touched — comments, ordering and every other
  variable survive byte-for-byte.
- **Single-flight** — the workflow's concurrency group stops two rotations from
  racing and deleting each other's database.
- Credentials are written straight to Render and masked in CI logs. They are
  never printed to the console or the run summary.

## A note on API key scope

Render API keys **cannot be scoped to a single resource**. Per
[Render's docs](https://api-docs.render.com/reference/authentication), a key
"provides access to all workspaces you belong to" — there is no read-only or
per-database key, and the official Render CLI cannot create databases or edit
environment variables at all.

That is exactly why the client-facing path is a GitHub Actions button rather than
a CLI plus a shared key. The key stays in repository secrets, access is granted
and revoked through GitHub permissions, and the plan allowlist above bounds what
the automation can destroy even if the key is misused.

If you ever do need to hand someone a key directly, the only real scoping
mechanism Render offers is a **separate workspace** containing just this dev
infrastructure, with a dedicated bot account invited to that workspace alone —
which requires a Pro workspace, since team invites aren't available on Hobby.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `RENDER_API_KEY is not set` | Export the key, or add the repo secret. |
| `config.ownerId is empty and this API key can see N workspaces` | Run `pnpm db:discover` and pin the right `ownerId`. |
| `Refusing to delete … plan is "starter"` | The guardrail working. Confirm you're pointed at the dev database. |
| `No Render service named …` | Fix `service.name` in `config.json`, or pass `--no-service`. |
| Health check never passes | The deploy may still be building. Watch the Render dashboard, then `pnpm db:health`. |
| Seed fails after rotation | The database exists and `.env` is updated — just rerun `pnpm db:reset-and-seed`. |
| `Connection terminated unexpectedly` / `SSL connection has been closed unexpectedly` | The instance has no IP allowlist, so it drops external connections at the TLS handshake. See below. |

### The IP allowlist gotcha

Creating a Postgres instance **through the API does not apply the dashboard's
default allow-all rule**. If `ipAllowList` is omitted the instance comes up with
`ipAllowList: null` and refuses every external connection — TCP connects fine,
then the TLS handshake is dropped. TypeORM surfaces that only as a bare
`Connection terminated unexpectedly` retry loop, which points nowhere near the
real cause.

The CLI now sends `database.ipAllowList` from [`config.json`](./config.json) at
creation, verifies it was actually applied, and PATCHes it if not. It also probes
the database with a real `SELECT 1` before seeding, so a blocked instance fails
immediately with a message naming the allowlist instead of a stack trace.

The default is `0.0.0.0/0`, matching what the dashboard gives you. The database
is still password-protected, but if you only ever connect from known networks,
narrow that list.
