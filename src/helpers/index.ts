// helpers/scope.ts
export function normalizeScope(input: string) {
  if (!input) throw new Error('scope is required');

  // Trim, strip query/fragment
  let s = input.trim().split('?')[0].split('#')[0];

  // Ensure leading slash
  if (!s.startsWith('/')) s = '/' + s;

  // Disallow parent traversals
  if (s.includes('..')) throw new Error('scope must not contain ".."');

  // Collapse duplicate slashes
  s = s.replace(/\/{2,}/g, '/');

  // If a filename is passed, drop it to target the folder
  if (!s.endsWith('/') && /\.[A-Za-z0-9]{2,5}$/.test(s)) {
    const parts = s.split('/');
    parts.pop();
    s = parts.join('/') + '/';
  }

  // Remove any trailing "/*" or "*" the caller might have passed
  s = s.replace(/\/\*$/, '/').replace(/\*$/, '');

  // Ensure trailing slash (folder)
  if (!s.endsWith('/')) s += '/';

  // Produce exactly one wildcard for the policy Resource
  const wildcard = s + '*'; // e.g. /fast-6/trailer/*

  // Cookie Path MUST NOT contain '*'
  const cookiePath = s; // e.g. /fast-6/trailer/

  return { wildcard, cookiePath };
}

// helper: epoch seconds
const toEpoch = (d: Date) => Math.floor(d.getTime() / 1000);

export function makeCookiePolicy(resourceWildcard: string, expiresAt: Date) {
  return JSON.stringify({
    Statement: [
      {
        Resource: resourceWildcard, // e.g. https://media.cinego.live/fast-6/trailer/*
        Condition: {
          DateLessThan: { 'AWS:EpochTime': toEpoch(expiresAt) },
          // Optional:
          // DateGreaterThan: { 'AWS:EpochTime': toEpoch(startAt) },
          // IpAddress: { 'AWS:SourceIp': 'x.x.x.x/32' },
        },
      },
    ],
  });
}
