#!/usr/bin/env node
/**
 * Dev-database rotation CLI for the Render free Postgres tier.
 *
 * Render deletes free Postgres instances roughly a month after creation, which
 * takes the dev backend down with it. Recovering by hand means: delete the dead
 * instance, create a new one, copy five connection values into .env and into the
 * deployed service, redeploy, then reseed. This automates that round trip.
 *
 * Run `node scripts/render-db/cli.mjs --help` for usage.
 */

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendFileSync } from 'node:fs';

import {
  createClient,
  parseConnectionString,
  RenderApiError,
} from './render-api.mjs';
import { activeKeys, readEnvFile, writeEnvUpdates } from './env-file.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const IN_CI =
  process.env.GITHUB_ACTIONS === 'true' || process.env.CI === 'true';

// Render's free tier expiry, used only to estimate when `expiresAt` is absent.
const FREE_TIER_DAYS = 30;

/* ------------------------------------------------------------------ output */

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (useColor ? `[${code}m${text}[0m` : text);
const bold = (t) => paint('1', t);
const dim = (t) => paint('2', t);
const red = (t) => paint('31', t);
const green = (t) => paint('32', t);
const yellow = (t) => paint('33', t);
const cyan = (t) => paint('36', t);

const log = (msg = '') => console.log(msg);
const step = (msg) => console.log(`${cyan('›')} ${msg}`);
const ok = (msg) => console.log(`${green('✓')} ${msg}`);
const warn = (msg) => console.log(`${yellow('!')} ${msg}`);
const fail = (msg) => console.error(`${red('✗')} ${msg}`);

/** Keep secrets out of CI logs even if something downstream echoes them. */
function maskInCI(value) {
  if (process.env.GITHUB_ACTIONS === 'true' && value)
    console.log(`::add-mask::${value}`);
}

function summary(markdown) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) appendFileSync(file, `${markdown}\n`);
}

/* ------------------------------------------------------------------- args */

function parseArgs(argv) {
  const flags = { timeout: 15 };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--yes' || arg === '-y') flags.yes = true;
    else if (arg === '--dry-run') flags.dryRun = true;
    else if (arg === '--no-seed') flags.noSeed = true;
    else if (arg === '--no-service') flags.noService = true;
    else if (arg === '--no-env-file') flags.noEnvFile = true;
    else if (arg === '--no-health-check') flags.noHealthCheck = true;
    else if (arg === '--help' || arg === '-h') flags.help = true;
    else if (arg === '--config') flags.config = argv[++i];
    else if (arg === '--timeout') flags.timeout = Number(argv[++i]);
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else positional.push(arg);
  }
  if (!Number.isFinite(flags.timeout) || flags.timeout <= 0) {
    throw new Error('--timeout must be a positive number of minutes.');
  }
  return { command: positional[0], flags };
}

const HELP = `
${bold('Render dev-database rotation')}

  ${dim('node scripts/render-db/cli.mjs <command> [options]')}

${bold('Commands')}
  status      Show the current database, its age, and when Render will expire it
  rotate      Recreate the database, repoint env vars, redeploy and reseed
  pull-env    Rewrite the local .env from the CURRENT database (no rotation)
  health      Poll the deployed service until its database check passes
  discover    List workspaces, databases and services your API key can see

${bold('Options')}
  -y, --yes            Skip the confirmation prompt (required for non-interactive runs)
      --dry-run        Show the plan without changing anything
      --no-seed        Skip build + seed
      --no-service     Leave the Render web service alone (no env update, no deploy)
      --no-env-file    Leave the local .env alone
      --no-health-check  Skip the post-deploy health poll
      --config <path>  Use an alternate config file
      --timeout <min>  Provisioning/health wait budget in minutes (default 15)

${bold('Environment')}
  RENDER_API_KEY       Required. Create one at https://dashboard.render.com/u/settings#api-keys
`;

/* ----------------------------------------------------------------- config */

function loadConfig(configPath) {
  const path = configPath
    ? isAbsolute(configPath)
      ? configPath
      : resolve(process.cwd(), configPath)
    : resolve(SCRIPT_DIR, 'config.json');

  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`Could not read config at ${path}: ${err.message}`);
  }

  const config = {
    ...raw,
    ownerId: process.env.RENDER_OWNER_ID || raw.ownerId || '',
    service: {
      ...raw.service,
      name: process.env.RENDER_SERVICE_NAME || raw.service?.name || '',
    },
    database: { ...raw.database },
    envKeys: { ...raw.envKeys },
    allowedPlans: (raw.allowedPlans ?? ['free']).map((p) =>
      String(p).toLowerCase(),
    ),
    configPath: path,
  };

  if (!config.database.name)
    throw new Error('config.database.name must be set.');
  if (!config.envKeys.host)
    throw new Error('config.envKeys is missing entries.');
  return config;
}

function requireApiKey() {
  const key = process.env.RENDER_API_KEY;
  if (!key) {
    throw new Error(
      'RENDER_API_KEY is not set.\n' +
        '  Create a key at https://dashboard.render.com/u/settings#api-keys\n' +
        '  then run: export RENDER_API_KEY=rnd_...',
    );
  }
  return key;
}

/* --------------------------------------------------------------- helpers */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function resolveOwnerId(api, config) {
  if (config.ownerId) return config.ownerId;

  const owners = await api.listOwners();
  if (owners.length === 1) {
    warn(
      `config.ownerId is empty; using the only workspace on this key: ${bold(owners[0].name)} (${owners[0].id}).\n` +
        `  Pin it in ${dim(config.configPath)} so this stays deterministic.`,
    );
    return owners[0].id;
  }
  throw new Error(
    `config.ownerId is empty and this API key can see ${owners.length} workspaces.\n` +
      owners.map((o) => `    ${o.id}  ${o.name}`).join('\n') +
      '\n  Set the right one in config.json (or RENDER_OWNER_ID).',
  );
}

/**
 * Render returns the workspace as a nested `owner` object on some resources and
 * a flat `ownerId` on others. Accept either — comparing against the wrong one
 * silently yields "no such database" for a database that plainly exists.
 */
const ownerIdOf = (resource) => resource?.ownerId ?? resource?.owner?.id;

/** Exact-name lookup — Render's `name` query filter is fuzzy, so re-filter locally. */
async function findDatabase(api, config, ownerId) {
  const candidates = await api.listPostgres({
    name: config.database.name,
    ownerId,
  });
  const exact = candidates.filter(
    (db) =>
      db.name === config.database.name &&
      (!ownerId || ownerIdOf(db) === ownerId),
  );
  if (exact.length > 1) {
    throw new Error(
      `Found ${exact.length} databases named "${config.database.name}" in this workspace. ` +
        'Refusing to guess which one to delete — remove the duplicate in the dashboard first.',
    );
  }
  return exact[0] ?? null;
}

async function findService(api, config, ownerId) {
  if (!config.service.name) return null;
  const candidates = await api.listServices({
    name: config.service.name,
    ownerId,
  });
  const exact = candidates.filter((s) => s.name === config.service.name);
  if (exact.length === 0) {
    throw new Error(
      `No Render service named "${config.service.name}" in this workspace. ` +
        'Fix config.service.name, or pass --no-service.',
    );
  }
  if (exact.length > 1) {
    throw new Error(
      `Found ${exact.length} services named "${config.service.name}". Cannot disambiguate.`,
    );
  }
  return exact[0];
}

/**
 * The one destructive guardrail that matters: never delete anything that isn't
 * the cheap, disposable dev instance this config describes.
 */
function assertSafeToDelete(db, config) {
  const plan = String(db.plan ?? '').toLowerCase();
  if (!config.allowedPlans.includes(plan)) {
    throw new Error(
      `Refusing to delete "${db.name}" (${db.id}): its plan is "${db.plan}", which is not in ` +
        `allowedPlans [${config.allowedPlans.join(', ')}].\n` +
        '  This guard exists so the script can never destroy a paid or production database.',
    );
  }
  if (db.name !== config.database.name) {
    throw new Error(
      `Refusing to delete "${db.name}" — it does not exactly match config.database.name.`,
    );
  }
}

function expiryInfo(db) {
  const created = db.createdAt ? new Date(db.createdAt) : null;
  const explicit = db.expiresAt ? new Date(db.expiresAt) : null;
  const expires =
    explicit ??
    (created ? new Date(created.getTime() + FREE_TIER_DAYS * 86400_000) : null);
  if (!expires) return { expires: null, daysLeft: null, estimated: !explicit };
  const daysLeft = Math.floor((expires.getTime() - Date.now()) / 86400_000);
  return { expires, daysLeft, estimated: !explicit };
}

function describeDatabase(db) {
  const { expires, daysLeft, estimated } = expiryInfo(db);
  log(`  name      ${bold(db.name)}`);
  log(`  id        ${db.id}`);
  log(
    `  status    ${db.status === 'available' ? green(db.status) : yellow(db.status ?? 'unknown')}`,
  );
  log(
    `  plan      ${db.plan}   region ${db.region}   postgres ${db.version ?? '?'}`,
  );
  if (db.createdAt)
    log(`  created   ${new Date(db.createdAt).toISOString().slice(0, 10)}`);
  if (expires) {
    const label = `${expires.toISOString().slice(0, 10)}${estimated ? dim(' (estimated)') : ''}`;
    const countdown =
      daysLeft < 0
        ? red('expired')
        : daysLeft <= 5
          ? red(`${daysLeft}d left`)
          : `${daysLeft}d left`;
    log(`  expires   ${label}  —  ${countdown}`);
  }
}

async function waitForStatus(api, id, target, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const db = await api.getPostgres(id);
    if (db.status !== last) {
      last = db.status;
      step(`${label}: ${last}`);
    }
    if (db.status === target) return db;
    if (['recovery_failed', 'unknown'].includes(db.status)) {
      throw new Error(`Database entered terminal status "${db.status}".`);
    }
    await sleep(5000);
  }
  throw new Error(
    `Timed out waiting for ${label} to reach "${target}" (last status: ${last}).`,
  );
}

async function waitForDeletion(api, id, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await api.getPostgres(id);
    } catch (err) {
      if (err instanceof RenderApiError && err.status === 404) return;
      throw err;
    }
    await sleep(4000);
  }
  throw new Error('Timed out waiting for the old database to finish deleting.');
}

function buildEnvUpdates(conn, keys, { includeUrl }) {
  const updates = {
    [keys.host]: conn.host,
    [keys.port]: conn.port,
    [keys.user]: conn.user,
    [keys.password]: conn.password,
    [keys.database]: conn.database,
    [keys.ssl]: 'true',
  };
  if (includeUrl && keys.url) updates[keys.url] = conn.url;
  return updates;
}

async function confirm(question) {
  if (!process.stdin.isTTY) {
    throw new Error(
      'Refusing to run destructively without a TTY. Pass --yes to confirm explicitly.',
    );
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} `);
    return answer.trim().toLowerCase();
  } finally {
    rl.close();
  }
}

function run(command, env) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      shell: true,
      env,
    });
    child.on('error', rejectPromise);
    child.on('close', (code) =>
      code === 0
        ? resolvePromise()
        : rejectPromise(new Error(`\`${command}\` exited with code ${code}`)),
    );
  });
}

/**
 * Wait until the database actually answers a query.
 *
 * Render reports `status: available` before the instance accepts external
 * traffic, and a missing IP allowlist fails at the TLS handshake rather than
 * with an auth error. Both surface to TypeORM as a bare "Connection terminated
 * unexpectedly" retry loop, so probe here and fail with something actionable.
 */
async function waitForConnectivity(conn, timeoutMs) {
  const { default: pg } = await import('pg');
  const deadline = Date.now() + timeoutMs;
  let lastError = 'unknown';
  let announced = false;

  while (Date.now() < deadline) {
    const client = new pg.Client({
      host: conn.host,
      port: Number(conn.port),
      user: conn.user,
      password: conn.password,
      database: conn.database,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10_000,
    });
    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return true;
    } catch (err) {
      lastError = err.message;
      await client.end().catch(() => {});
      if (!announced) {
        step(`waiting for the database to accept connections… (${lastError})`);
        announced = true;
      }
    }
    await sleep(5000);
  }

  throw new Error(
    `Database never accepted a connection (last error: ${lastError}).\n` +
      '  The usual cause is an empty IP allowlist — check `ipAllowList` on the\n' +
      '  instance in the Render dashboard, or in config.database.ipAllowList.',
  );
}

async function pollHealth(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  let lastNote = '';
  while (Date.now() < deadline) {
    attempt++;
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const text = await res.text();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
      const dbCheck = payload?.data?.checks?.database;
      if (res.ok && dbCheck?.status === 'up') {
        return { healthy: true, latencyMs: dbCheck.latencyMs, payload };
      }
      const note = dbCheck?.error ?? `HTTP ${res.status}`;
      if (note !== lastNote) {
        lastNote = note;
        step(
          `health: ${note}${attempt === 1 ? dim(' (cold start can take ~1 min)') : ''}`,
        );
      }
    } catch (err) {
      if (err.message !== lastNote) {
        lastNote = err.message;
        step(
          `health: ${err.message}${attempt === 1 ? dim(' (cold start can take ~1 min)') : ''}`,
        );
      }
    }
    await sleep(6000);
  }
  return { healthy: false, note: lastNote };
}

/* -------------------------------------------------------------- commands */

async function cmdDiscover(config) {
  const api = createClient(requireApiKey());

  const owners = await api.listOwners();
  log(bold('\nWorkspaces'));
  for (const o of owners)
    log(`  ${o.id}  ${o.name} ${dim(`(${o.email ?? o.type ?? ''})`)}`);

  const ownerId =
    config.ownerId || (owners.length === 1 ? owners[0].id : undefined);

  const databases = await api.listPostgres({ ownerId });
  log(bold('\nPostgres instances'));
  if (databases.length === 0) log(dim('  (none)'));
  for (const db of databases) {
    const { daysLeft } = expiryInfo(db);
    const left =
      daysLeft === null
        ? ''
        : daysLeft < 0
          ? red(' expired')
          : dim(` ${daysLeft}d left`);
    log(
      `  ${db.id}  ${bold(db.name)} ${dim(`[${db.plan} · ${db.region} · ${db.status}]`)}${left}`,
    );
  }

  const services = await api.listServices({ ownerId });
  log(bold('\nServices'));
  if (services.length === 0) log(dim('  (none)'));
  for (const s of services)
    log(`  ${s.id}  ${bold(s.name)} ${dim(`[${s.type}]`)}`);

  log(`\n${dim(`Copy the ids you need into ${config.configPath}.`)}\n`);
}

async function cmdStatus(config) {
  const api = createClient(requireApiKey());
  const ownerId = await resolveOwnerId(api, config);
  const db = await findDatabase(api, config, ownerId);

  log('');
  if (!db) {
    warn(
      `No database named "${config.database.name}" exists — Render has already reclaimed it.`,
    );
    log(`  Run ${bold('pnpm db:rotate')} to create a fresh one.\n`);
    return 1;
  }

  describeDatabase(db);
  const { daysLeft } = expiryInfo(db);
  log('');
  if (daysLeft !== null && daysLeft <= 5) {
    warn(`Rotate soon: run ${bold('pnpm db:rotate')}.`);
  } else {
    ok('Database is within its lifetime.');
  }
  log('');
  return 0;
}

async function cmdHealth(config, flags) {
  const url = config.service.healthCheckUrl;
  if (!url) throw new Error('config.service.healthCheckUrl is not set.');
  step(`Polling ${url}`);
  const result = await pollHealth(url, flags.timeout * 60_000);
  if (result.healthy) {
    ok(
      `Service is healthy — database check passed in ${result.latencyMs ?? '?'}ms.`,
    );
    return 0;
  }
  fail(
    `Service did not become healthy within ${flags.timeout} minutes. Last: ${result.note}`,
  );
  return 1;
}

async function cmdPullEnv(config, flags) {
  const api = createClient(requireApiKey());
  const ownerId = await resolveOwnerId(api, config);
  const db = await findDatabase(api, config, ownerId);
  if (!db)
    throw new Error(
      `No database named "${config.database.name}" to pull credentials from.`,
    );

  const info = await api.getConnectionInfo(db.id);
  const conn = parseConnectionString(info.externalConnectionString);
  maskInCI(conn.password);

  const envPath = resolve(REPO_ROOT, config.envFile);
  const includeUrl =
    Boolean(config.envKeys.url) &&
    activeKeys(readEnvFile(envPath)).has(config.envKeys.url);
  const updates = buildEnvUpdates(conn, config.envKeys, { includeUrl });

  if (flags.dryRun) {
    log(`\n${bold('Would write to')} ${envPath}`);
    for (const key of Object.keys(updates)) log(`  ${key}=${dim('<value>')}`);
    log('');
    return 0;
  }

  const { backupPath } = writeEnvUpdates(envPath, updates, {
    stamp: timestamp(),
  });
  ok(`Updated ${config.envFile} → ${conn.host}/${conn.database}`);
  if (backupPath) log(`  ${dim(`backup: ${backupPath}`)}`);
  return 0;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function cmdRotate(config, flags) {
  const api = createClient(requireApiKey());
  const timeoutMs = flags.timeout * 60_000;
  const ownerId = await resolveOwnerId(api, config);
  const ipAllowList = config.database.ipAllowList ?? [];

  if (ipAllowList.length === 0) {
    warn(
      'config.database.ipAllowList is empty. The new database will reject every ' +
        'external connection, so seeding and local dev will fail.',
    );
  }

  const existing = await findDatabase(api, config, ownerId);
  const service = flags.noService
    ? null
    : await findService(api, config, ownerId);

  log(`\n${bold('Rotation plan')}`);
  if (existing) {
    assertSafeToDelete(existing, config);
    log(
      `  ${red('delete')}  ${existing.name} ${dim(`(${existing.id}, ${existing.plan}, ${existing.status})`)}`,
    );
  } else {
    log(
      `  ${dim('delete')}  ${dim('nothing — no existing database with that name')}`,
    );
  }
  log(
    `  ${green('create')}  ${config.database.name} ${dim(
      `(${config.database.plan}, ${config.region}, postgres ${config.database.version})`,
    )}`,
  );
  if (!flags.noEnvFile)
    log(`  ${cyan('write')}   ${config.envFile} ${dim('(backed up first)')}`);
  if (service) {
    log(
      `  ${cyan('update')}  service ${service.name} ${dim(`(${service.id})`)}`,
    );
    if (config.service.triggerDeploy)
      log(`  ${cyan('deploy')}  ${service.name}`);
  }
  if (!flags.noSeed) log(`  ${cyan('seed')}    pnpm build && pnpm seed`);
  if (config.service.healthCheckUrl && !flags.noHealthCheck) {
    log(`  ${cyan('verify')}  ${config.service.healthCheckUrl}`);
  }
  log('');

  if (flags.dryRun) {
    ok('Dry run — nothing was changed.');
    return 0;
  }

  if (!flags.yes) {
    warn(
      'This permanently destroys the current dev database and all data in it.',
    );
    const answer = await confirm(`Type ${bold('rotate')} to continue:`);
    if (answer !== 'rotate') {
      fail('Aborted.');
      return 1;
    }
  }

  // Render's free tier allows only one instance at a time, so the old one must
  // be fully gone before the new one can be created.
  if (existing) {
    step(`Deleting ${existing.name} (${existing.id})…`);
    await api.deletePostgres(existing.id);
    await waitForDeletion(api, existing.id, timeoutMs);
    ok('Old database deleted.');
  }

  step(`Creating ${config.database.name}…`);
  const created = await api.createPostgres({
    name: config.database.name,
    ownerId,
    plan: config.database.plan,
    version: String(config.database.version),
    region: config.region,
    ...(config.database.databaseName
      ? { databaseName: config.database.databaseName }
      : {}),
    ...(config.database.databaseUser
      ? { databaseUser: config.database.databaseUser }
      : {}),
    ...(config.database.diskSizeGB
      ? { diskSizeGB: config.database.diskSizeGB }
      : {}),
    // Must be sent explicitly: the API does not apply the dashboard's default
    // rule, and a null allowlist blocks every external connection.
    ...(ipAllowList.length > 0 ? { ipAllowList } : {}),
  });
  ok(`Created ${created.name} (${created.id}).`);

  const ready = await waitForStatus(
    api,
    created.id,
    'available',
    timeoutMs,
    'provisioning',
  );
  ok('Database is available.');

  // Creation silently ignores ipAllowList on some plans, so verify rather than
  // assume — an empty list here is the difference between a working database
  // and an opaque "connection terminated unexpectedly" during seeding.
  if (ipAllowList.length > 0 && !(ready.ipAllowList?.length > 0)) {
    step('Allowlist was not applied at creation; setting it explicitly…');
    await api.updatePostgres(ready.id, { ipAllowList });
    ok('IP allowlist applied.');
  }

  const info = await api.getConnectionInfo(ready.id);
  const external = parseConnectionString(info.externalConnectionString);
  maskInCI(external.password);
  maskInCI(info.internalConnectionString);
  maskInCI(info.externalConnectionString);

  // Seeding and local dev always go over the external endpoint; only the
  // deployed service may opt into the internal one.
  const serviceConn =
    config.service.useInternalConnection && info.internalConnectionString
      ? parseConnectionString(info.internalConnectionString)
      : external;

  /* --- local .env --- */
  const envPath = resolve(REPO_ROOT, config.envFile);
  const envHasUrl =
    Boolean(config.envKeys.url) &&
    activeKeys(readEnvFile(envPath)).has(config.envKeys.url);
  const localUpdates = buildEnvUpdates(external, config.envKeys, {
    includeUrl: envHasUrl,
  });

  if (!flags.noEnvFile) {
    const { backupPath, created: madeNew } = writeEnvUpdates(
      envPath,
      localUpdates,
      { stamp: timestamp() },
    );
    ok(
      `Wrote credentials to ${config.envFile}${madeNew ? dim(' (new file)') : ''}.`,
    );
    if (backupPath) log(`  ${dim(`backup: ${backupPath}`)}`);
  }

  /* --- deployed service --- */
  if (service) {
    const existingKeys = new Set(
      (await api.listEnvVars(service.id)).map((v) => v.key),
    );
    const serviceUpdates = buildEnvUpdates(serviceConn, config.envKeys, {
      // Only touch DATABASE_URL if the service already relies on it — otherwise
      // adding it would silently override the discrete POSTGRES_* values.
      includeUrl:
        Boolean(config.envKeys.url) && existingKeys.has(config.envKeys.url),
    });
    step(
      `Updating ${Object.keys(serviceUpdates).length} env vars on ${service.name}…`,
    );
    for (const [key, value] of Object.entries(serviceUpdates)) {
      await api.putEnvVar(service.id, key, value);
    }
    ok('Service env vars updated.');

    if (config.service.triggerDeploy) {
      const deploy = await api.createDeploy(service.id);
      ok(`Triggered deploy ${deploy?.id ?? ''}.`);
    }
  }

  /* --- seed --- */
  if (!flags.noSeed) {
    await waitForConnectivity(external, Math.min(timeoutMs, 5 * 60_000));
    ok('Database is accepting connections.');

    step('Building and seeding…');
    const childEnv = {
      ...process.env,
      ...localUpdates,
      NODE_ENV: 'development',
    };
    await run('pnpm build', childEnv);
    await run('pnpm seed', childEnv);
    ok('Seed complete.');
  }

  /* --- verify --- */
  let healthy = null;
  if (
    config.service.healthCheckUrl &&
    !flags.noHealthCheck &&
    service &&
    config.service.triggerDeploy
  ) {
    step('Waiting for the redeployed service to come back up…');
    const result = await pollHealth(config.service.healthCheckUrl, timeoutMs);
    healthy = result.healthy;
    if (healthy)
      ok(
        `Service healthy — database check passed in ${result.latencyMs ?? '?'}ms.`,
      );
    else
      warn(
        `Service not healthy yet after ${flags.timeout}m (last: ${result.note}). Deploy may still be building.`,
      );
  }

  /* --- report --- */
  const { expires } = expiryInfo(ready);
  log(`\n${bold(green('Rotation complete.'))}`);
  log(`  database  ${external.database} on ${external.host}`);
  log(`  id        ${ready.id}`);
  if (expires) log(`  expires   ~${expires.toISOString().slice(0, 10)}`);
  if (!flags.noEnvFile) log(`  env file  ${config.envFile} updated`);
  log('');

  summary(
    [
      '### Dev database rotated',
      '',
      `| | |`,
      `|---|---|`,
      `| Database | \`${external.database}\` |`,
      `| Host | \`${external.host}\` |`,
      `| Instance id | \`${ready.id}\` |`,
      expires ? `| Expires | ~${expires.toISOString().slice(0, 10)} |` : '',
      service ? `| Service | \`${service.name}\` redeployed |` : '',
      healthy === null
        ? ''
        : `| Health check | ${healthy ? '✅ passing' : '⚠️ not yet passing'} |`,
      '',
      'Credentials were written directly to the Render service. They are not printed here.',
    ]
      .filter(Boolean)
      .join('\n'),
  );

  return healthy === false ? 1 : 0;
}

/* ----------------------------------------------------------------- entry */

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));

  if (flags.help || !command) {
    log(HELP);
    return command ? 0 : 1;
  }

  const config = loadConfig(flags.config);

  // A destructive run with no human at the keyboard must say so explicitly.
  if (command === 'rotate' && IN_CI && !flags.yes && !flags.dryRun) {
    throw new Error(
      'Non-interactive environment detected: pass --yes to confirm rotation.',
    );
  }

  switch (command) {
    case 'discover':
      return (await cmdDiscover(config)) ?? 0;
    case 'status':
      return cmdStatus(config);
    case 'rotate':
      return cmdRotate(config, flags);
    case 'pull-env':
      return cmdPullEnv(config, flags);
    case 'health':
      return cmdHealth(config, flags);
    default:
      throw new Error(`Unknown command "${command}". Run with --help.`);
  }
}

main()
  .then((code) => {
    process.exitCode = code ?? 0;
  })
  .catch((err) => {
    log('');
    fail(err.message);
    if (process.env.DEBUG) console.error(err);
    process.exitCode = 1;
  });
