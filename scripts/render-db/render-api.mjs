/**
 * Minimal client for the Render REST API (https://api.render.com/v1).
 *
 * Only the handful of endpoints the rotation CLI needs. No dependencies —
 * Node 18+ ships global fetch.
 */

const DEFAULT_BASE = 'https://api.render.com/v1';
const RETRY_STATUSES = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

export class RenderApiError extends Error {
  constructor(status, method, path, body) {
    super(
      `Render API ${method} ${path} -> ${status}: ${body || '(empty body)'}`,
    );
    this.name = 'RenderApiError';
    this.status = status;
    this.method = method;
    this.path = path;
    this.body = body;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * List endpoints wrap each item as `{ <resourceKey>: {...}, cursor }`.
 * Unwrap defensively so a shape change doesn't break the caller.
 */
const unwrap = (items, key) =>
  (Array.isArray(items) ? items : [])
    .map((item) => item?.[key] ?? item)
    .filter(Boolean);

export function createClient(
  apiKey,
  { baseUrl = process.env.RENDER_API_BASE || DEFAULT_BASE } = {},
) {
  if (!apiKey) throw new Error('A Render API key is required.');

  async function request(method, path, { body, query } = {}) {
    const url = new URL(baseUrl + path);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null || value === '') continue;
      for (const item of Array.isArray(value) ? value : [value]) {
        url.searchParams.append(key, String(item));
      }
    }

    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let res;
      try {
        res = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
      } catch (err) {
        // Network blip — retry with backoff.
        lastError = err;
        if (attempt === MAX_ATTEMPTS) throw err;
        await sleep(attempt * 1500);
        continue;
      }

      if (res.status === 204) return null;

      const text = await res.text();
      if (res.ok) return text ? JSON.parse(text) : null;

      lastError = new RenderApiError(
        res.status,
        method,
        path,
        text.slice(0, 600),
      );
      if (!RETRY_STATUSES.has(res.status) || attempt === MAX_ATTEMPTS)
        throw lastError;

      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : attempt * 2000,
      );
    }
    throw lastError;
  }

  return {
    request,

    async listOwners() {
      return unwrap(
        await request('GET', '/owners', { query: { limit: 100 } }),
        'owner',
      );
    },

    /** Render's `name` filter is not an exact match, so callers should still compare names themselves. */
    async listPostgres({ name, ownerId } = {}) {
      return unwrap(
        await request('GET', '/postgres', {
          query: { name, ownerId, limit: 100, includeReplicas: 'false' },
        }),
        'postgres',
      );
    },

    getPostgres: (id) => request('GET', `/postgres/${id}`),
    createPostgres: (body) => request('POST', '/postgres', { body }),
    updatePostgres: (id, body) => request('PATCH', `/postgres/${id}`, { body }),
    deletePostgres: (id) => request('DELETE', `/postgres/${id}`),
    getConnectionInfo: (id) =>
      request('GET', `/postgres/${id}/connection-info`),

    async listServices({ name, ownerId } = {}) {
      return unwrap(
        await request('GET', '/services', {
          query: { name, ownerId, limit: 100 },
        }),
        'service',
      );
    },

    async listEnvVars(serviceId) {
      return unwrap(
        await request('GET', `/services/${serviceId}/env-vars`, {
          query: { limit: 100 },
        }),
        'envVar',
      );
    },

    putEnvVar: (serviceId, key, value) =>
      request(
        'PUT',
        `/services/${serviceId}/env-vars/${encodeURIComponent(key)}`,
        {
          body: { value: String(value) },
        },
      ),

    createDeploy: (serviceId, body = { clearCache: 'do_not_clear' }) =>
      request('POST', `/services/${serviceId}/deploys`, { body }),
  };
}

/** Split a `postgres://user:pass@host:port/db` string into discrete fields. */
export function parseConnectionString(connectionString) {
  const url = new URL(connectionString);
  return {
    host: url.hostname,
    port: url.port || '5432',
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    url: connectionString,
  };
}
