const el = (id) => document.getElementById(id);
const logBox = el('log');
const logList = document.getElementById('logList');
const filterInfo = el('filterInfo');
const filterWarn = el('filterWarn');
const filterErr = el('filterErr');
const autoScrollEl = el('autoScroll');
const btnClearLog = el('btnClearLog');
const btnFetchMovies = document.getElementById('btnFetchMovies');
const movieSelect = document.getElementById('movieSelect');
const btnRefreshToken = el('btnRefreshToken');
let serverManifestUrl = '';

function shouldShow(level) {
  return (
    (level === 'info' && filterInfo?.checked) ||
    (level === 'warn' && filterWarn?.checked) ||
    (level === 'err' && filterErr?.checked)
  );
}

function createLogEntry(level, category, msg, detailsText) {
  const li = document.createElement('li');
  li.className = 'log-entry';
  li.setAttribute('data-level', level);
  const tDiv = document.createElement('div');
  tDiv.className = 'log-time';
  tDiv.textContent = new Date().toLocaleTimeString();
  const badgesWrap = document.createElement('div');
  badgesWrap.style.display = 'flex';
  badgesWrap.style.gap = '6px';
  const levelBadge = document.createElement('div');
  levelBadge.className = 'badge ' + (level === 'error' ? 'err' : level);
  levelBadge.textContent = (level === 'err' ? 'ERROR' : level.toUpperCase());
  const catBadge = document.createElement('div');
  catBadge.className = 'badge cat';
  catBadge.textContent = category || 'General';
  badgesWrap.appendChild(levelBadge);
  badgesWrap.appendChild(catBadge);
  const msgDiv = document.createElement('div');
  msgDiv.className = 'log-msg';
  msgDiv.textContent = msg || '';
  li.appendChild(tDiv);
  li.appendChild(badgesWrap);
  li.appendChild(msgDiv);
  if (detailsText) {
    const detailsRow = document.createElement('div');
    detailsRow.style.gridColumn = '1 / -1';
    const details = document.createElement('details');
    details.className = 'log-details';
    const summary = document.createElement('summary');
    summary.textContent = 'Details';
    const pre = document.createElement('pre');
    pre.textContent = detailsText;
    details.appendChild(summary);
    details.appendChild(pre);
    detailsRow.appendChild(details);
    li.appendChild(detailsRow);
  }
  li.style.display = shouldShow(level) ? '' : 'none';
  return li;
}

function pruneLog(maxItems) {
  const max = Math.max(50, maxItems || 500);
  while (logList.children.length > max) {
    logList.removeChild(logList.firstChild);
  }
}

function renderLogEntry(entryEl) {
  logList.appendChild(entryEl);
  pruneLog(500);
  if (autoScrollEl?.checked) {
    logBox.scrollTop = logBox.scrollHeight;
  }
}

function logEx(level = 'info', category = 'General', msg, detailsText) {
  const entry = createLogEntry(level, category, msg, detailsText);
  renderLogEntry(entry);
}
function log(msg) { logEx('info', 'General', msg); }
function logInfo(msg, cat = 'General', detailsText) { logEx('info', cat, msg, detailsText); }
function logWarn(msg, cat = 'General', detailsText) { logEx('warn', cat, msg, detailsText); }
function logErr(msg, cat = 'General', detailsText) { logEx('err', cat, msg, detailsText); }

const applyFilters = () => {
  const items = logList.querySelectorAll('li[data-level]');
  items.forEach((li) => {
    const level = li.getAttribute('data-level');
    li.style.display = shouldShow(level) ? '' : 'none';
  });
};
filterInfo?.addEventListener('change', applyFilters);
filterWarn?.addEventListener('change', applyFilters);
filterErr?.addEventListener('change', applyFilters);
btnClearLog?.addEventListener('click', () => {
  logList.innerHTML = '';
});
function setStatus(msg, cls = '') {
  const s = el('status');
  s.textContent = msg;
  s.className = `status ${cls}`;
}

const video = el('video');
let hls;
const qualitySel = el('quality');
let cookieRefreshTimer = null;
let lastCookieTTL = null;
let tempAccessToken = null;
let accessToken = null;
let refreshToken = null;
let userData = null;
let currentProfile = null;
let currentMovieId = null;
let currentUseTrailer = true;

function resetQualitySelector() {
  qualitySel.innerHTML = '<option value="-1" selected>Auto</option>';
  qualitySel.disabled = true;
}

function populateQualitySelector(hlsInstance) {
  resetQualitySelector();
  const levels = hlsInstance.levels || [];
  const sorted = levels
    .slice()
    .sort((a, b) => (b.height || 0) - (a.height || 0));
  sorted.forEach((lvl) => {
    const idx = hlsInstance.levels.indexOf(lvl);
    const kbps = lvl.bitrate
      ? ` (${Math.round(lvl.bitrate / 1000)} kbps)`
      : '';
    const label = lvl.height
      ? `${lvl.height}p${kbps}`
      : `Level ${idx}${kbps}`;
    const opt = document.createElement('option');
    opt.value = String(idx);
    opt.textContent = label;
    qualitySel.appendChild(opt);
  });
  qualitySel.disabled = levels.length === 0;
}

qualitySel.onchange = (e) => {
  if (!hls || !Hls.isSupported()) return;
  const val = parseInt(e.target.value, 10);
  if (val === -1) {
    hls.autoLevelEnabled = true;
    hls.currentLevel = -1;
    log('Quality set to Auto (ABR)');
  } else {
    hls.autoLevelEnabled = false;
    hls.currentLevel = val;
    const h = hls.levels[val]?.height || '?';
    log(`Quality locked to level ${val} (${h}p)`);
  }
};

async function login() {
  const apiBase = el('apiBaseUrl').value.trim().replace(/\/$/, '');
  const email = el('email').value.trim();
  const phoneNumber = el('phoneNumber').value.trim();
  const password = el('password').value;
  if (!apiBase) return setStatus('Please provide API Base URL', 'err');
  if (!password) return setStatus('Please enter password', 'err');
  if (!email && !phoneNumber)
    return setStatus('Enter email or phone number', 'err');

  const payload = { password };
  if (email) payload.email = email; else payload.phoneNumber = phoneNumber;
  const endpoint = apiBase + '/auth/login';
  setStatus('Logging in...');
  logInfo(`POST ${endpoint}`, 'Auth', JSON.stringify({ ...payload, password: '••••••••' }));
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => null);
    logInfo(`Response ${res.status} ${res.statusText}`, 'Auth', JSON.stringify(body).slice(0, 300));
    if (!res.ok) {
      setStatus(`Login failed: HTTP ${res.status}`, 'err');
      logErr('Login failed', 'Auth', JSON.stringify(body).slice(0, 300));
      return;
    }
    const data = body?.data || body;
    userData = data?.user;
    tempAccessToken = data?.tempAccessToken;
    if (!tempAccessToken || !userData) {
      setStatus('Unexpected login response. Missing token or user.', 'err');
      logErr('Unexpected login response', 'Auth', JSON.stringify(body).slice(0, 400));
      return;
    }
    const profiles = Array.isArray(userData?.profiles)
      ? userData.profiles
      : [];
    const select = el('profileSelect');
    select.innerHTML = '';
    profiles.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.profileName || p.id;
      select.appendChild(opt);
    });
    select.disabled = profiles.length === 0;
    el('btnLoginProfile').disabled = profiles.length === 0;
    el('btnLogout').disabled = false;
    el('btnLogin').disabled = true;
    setStatus('Login successful. Select a profile to continue.', 'ok');
    el('authStatus').textContent = `Pre-profile session ready; ${profiles.length} profiles available.`;
  } catch (e) {
    setStatus(`Login error: ${e?.message || e}`, 'err');
    logErr(`Login error: ${e?.message || e}`, 'Auth', e?.stack || String(e));
  }
}

async function loginWithProfile() {
  const apiBase = el('apiBaseUrl').value.trim().replace(/\/$/, '');
  if (!tempAccessToken)
    return setStatus('Login first to get temp token.', 'err');
  const select = el('profileSelect');
  const profileId = select.value;
  if (!profileId)
    return setStatus('Select a profile to continue', 'err');
  const endpoint = apiBase + '/auth/login/profile';
  setStatus('Creating full session...');
  logInfo(`POST ${endpoint}`, 'Auth', JSON.stringify({ profileId }));
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tempAccessToken}`,
      },
      body: JSON.stringify({ profileId }),
    });
    const body = await res.json().catch(() => null);
    logInfo(`Response ${res.status} ${res.statusText}`, 'Auth', JSON.stringify(body).slice(0, 300));
    if (!res.ok) {
      setStatus(`Profile login failed: HTTP ${res.status}`, 'err');
      logErr('Profile login failed', 'Auth', JSON.stringify(body).slice(0, 300));
      return;
    }
    const data = body?.data || body;
    accessToken = data?.accessToken;
    refreshToken = data?.refreshToken;
    currentProfile = data?.profile;
    userData = data?.user || userData;
    if (!accessToken) {
      setStatus('Missing accessToken in response.', 'err');
      log(`Response data: ${JSON.stringify(body).slice(0, 400)}`);
      return;
    }
    el('btnLoginProfile').disabled = true;
    el('profileSelect').disabled = true;
    if (btnRefreshToken) btnRefreshToken.disabled = !refreshToken;
    el('authStatus').textContent = `Full session active for profile ${currentProfile?.profileName || currentProfile?.id}`;
    setStatus(
      `Logged in as ${userData?.email || userData?.phoneNumber || 'user'}; active profile ${currentProfile?.profileName || currentProfile?.id}`,
      'ok',
    );
  } catch (e) {
    setStatus(`Profile login error: ${e?.message || e}`, 'err');
    logErr(`Profile login error: ${e?.message || e}`, 'Auth', e?.stack || String(e));
  }
}

function logout() {
  tempAccessToken = null;
  accessToken = null;
  refreshToken = null;
  userData = null;
  currentProfile = null;
  el('btnLogin').disabled = false;
  el('btnLoginProfile').disabled = true;
  el('profileSelect').disabled = true;
  if (btnRefreshToken) btnRefreshToken.disabled = true;
  el('authStatus').textContent = 'Not logged in.';
  setStatus('Logged out. Tokens cleared.');
}

async function refreshAccessToken() {
  const apiBase = el('apiBaseUrl').value.trim().replace(/\/$/, '');
  if (!apiBase) return setStatus('Please provide API Base URL', 'err');
  if (!refreshToken) return setStatus('No refresh token. Login with profile first.', 'err');
  const endpoint = apiBase + '/auth/refresh-token';
  setStatus('Refreshing access token...');
  logInfo(`POST ${endpoint}`, 'Auth', JSON.stringify({ refreshToken }).slice(0, 200));
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    const body = await res.json().catch(() => null);
    logInfo(`Refresh response ${res.status} ${res.statusText}`, 'Auth', JSON.stringify(body).slice(0, 300));
    if (!res.ok) {
      setStatus(`Refresh failed: HTTP ${res.status}`, 'err');
      logErr('Refresh failed', 'Auth', JSON.stringify(body).slice(0, 300));
      return;
    }
    const data = body?.data || body;
    accessToken = data?.accessToken || accessToken;
    refreshToken = data?.refreshToken || refreshToken;
    if (btnRefreshToken) btnRefreshToken.disabled = !refreshToken;
    setStatus('Access token refreshed.', 'ok');
    el('authStatus').textContent = 'Access token refreshed and active.';
  } catch (e) {
    setStatus(`Refresh error: ${e?.message || e}`, 'err');
    logErr(`Refresh error: ${e?.message || e}`, 'Auth', e?.stack || String(e));
  }
}

async function getSignedCookies() {
  const apiBase = el('apiBaseUrl').value.trim().replace(/\/$/, '');
  const ttl = Math.min(
    3600,
    Math.max(60, parseInt(el('ttl').value || '900', 10)),
  );
  const movieId = (movieSelect && movieSelect.value) ? String(movieSelect.value).trim() : el('movieId').value.trim();
  const useTrailer = !!el('useTrailer').checked;
  if (!apiBase) return setStatus('Please provide API Base URL', 'err');
  if (!accessToken)
    return setStatus('Login and select a profile first.', 'err');
  if (!movieId) return setStatus('Provide a movie ID for cookies', 'err');

  const endpoint = apiBase + '/aws-services/cloudfront/signed-cookies';
  setStatus(
    `Requesting signed cookies for movie ${movieId}${useTrailer ? ' (trailer)' : ''}...`,
  );
  logInfo(`[POST] ${endpoint}`, 'Cookies', JSON.stringify({ movieId, ttlSeconds: ttl, useTrailer }));

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: 'include',
      body: JSON.stringify({ movieId, ttlSeconds: ttl, useTrailer }),
    });
    const txt = await res.text();
    let data = null;
    try { data = JSON.parse(txt); } catch {}
    logInfo(`Response ${res.status} ${res.statusText}`, 'Cookies', txt.slice(0, 200));
    const urlBase = (data && data.data && data.data.url) ? data.data.url : data?.url;
    if (urlBase) {
      serverManifestUrl = urlBase;
      logInfo(`Manifest URL from API: ${urlBase}`, 'Cookies');
      const serverUrlInput = el('serverUrl');
      if (serverUrlInput) {
        serverUrlInput.value = urlBase;
        logInfo('Displayed manifest URL from API response', 'Cookies');
      }
    }
    if (!res.ok)
      return setStatus(
        `Failed to set cookies: HTTP ${res.status}`,
        'err',
      );
    setStatus('Signed cookies set. You can load the video now.', 'ok');
    currentMovieId = movieId;
    currentUseTrailer = useTrailer;
    lastCookieTTL = ttl;
    scheduleCookieRefresh(ttl);
  } catch (e) {
    setStatus(`Error requesting cookies: ${e?.message || e}`, 'err');
    logErr(`Cookie request error: ${e?.message || e}`, 'Cookies', e?.stack || String(e));
  }
}

function scheduleCookieRefresh(ttlSeconds) {
  try {
    if (cookieRefreshTimer) {
      clearTimeout(cookieRefreshTimer);
      cookieRefreshTimer = null;
    }
    const lead = Math.min(60, Math.max(15, Math.floor(ttlSeconds * 0.1)));
    const ms = Math.max(0, (ttlSeconds - lead) * 1000);
    const when = new Date(Date.now() + ms).toLocaleTimeString();
    logInfo(
      `Scheduled cookie refresh in ${Math.round(ms / 1000)}s (at ${when})`,
      'Cookies'
    );
    cookieRefreshTimer = setTimeout(
      () => refreshSignedCookies('timer'),
      ms,
    );
  } catch (e) {
    logWarn(`Failed to schedule cookie refresh: ${e?.message || e}`, 'Cookies');
  }
}

async function refreshSignedCookies(source = 'timer') {
  const apiBase = el('apiBaseUrl').value.trim().replace(/\/$/, '');
  const ttl = Math.min(
    3600,
    Math.max(
      60,
      parseInt(el('ttl').value || String(lastCookieTTL || 900), 10),
    ),
  );
  const movieId = currentMovieId || el('movieId').value.trim();
  const useTrailer =
    currentUseTrailer !== undefined ? currentUseTrailer : !!el('useTrailer').checked;
  if (!apiBase || !movieId || !accessToken) {
    logWarn('Cannot refresh cookies: missing API base, movieId, or accessToken', 'Cookies');
    return;
  }
  const endpoint = apiBase + '/aws-services/cloudfront/signed-cookies';
  logInfo(
    `[${source}] Refreshing signed cookies for movie ${movieId}${useTrailer ? ' (trailer)' : ''}...`,
    'Cookies'
  );
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: 'include',
      body: JSON.stringify({ movieId, ttlSeconds: ttl, useTrailer }),
    });
    const txt = await res.text();
    let data = null;
    try { data = JSON.parse(txt); } catch {}
    logInfo(
      `Refresh response: ${res.status} ${res.statusText}`,
      'Cookies',
      txt.slice(0, 200)
    );
    const newUrl = (data && data.data && data.data.url) ? data.data.url : data?.url;
    if (newUrl) {
      serverManifestUrl = newUrl;
      const serverUrlInput = el('serverUrl');
      if (serverUrlInput) serverUrlInput.value = newUrl;
      logInfo('Updated manifest URL from refresh response', 'Cookies');
    }
    if (!res.ok) {
      setStatus(`Cookie refresh failed: HTTP ${res.status}`, 'err');
      return;
    }
    setStatus('Cookies refreshed.', 'ok');
    lastCookieTTL = ttl;
    scheduleCookieRefresh(ttl);
    if (source === 'reactive') {
      attemptHlsRecovery();
    }
  } catch (e) {
    setStatus(`Cookie refresh error: ${e?.message || e}`, 'err');
    logErr(`Cookie refresh error: ${e?.message || e}`, 'Cookies', e?.stack || String(e));
  }
}

async function fetchMovies() {
  try {
    const apiBase = el('apiBaseUrl').value.trim().replace(/\/$/, '');
    if (!apiBase) return setStatus('Please provide API Base URL', 'err');
    if (!accessToken) return setStatus('Login and select a profile first.', 'err');
    const endpoint = `${apiBase}/movie?page=1&limit=25&sortBy=title:ASC`;
    logInfo(`[GET] ${endpoint}`, 'Movies');
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: 'include',
    });
    const txt = await res.text();
    let data = null; try { data = JSON.parse(txt); } catch {}
    logInfo(`Movies response: ${res.status} ${res.statusText}`, 'Movies', txt.slice(0, 200));
    if (!res.ok) {
      setStatus(`Failed to fetch movies: HTTP ${res.status}`, 'err');
      return;
    }
    const payload = data?.data || {};
    const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.items) ? payload.items : [];
    if (!items.length) {
      logWarn('No movies returned in first page.', 'Movies');
    }
    populateMovieSelect(items);
    setStatus('Movies loaded. Select one and get cookies.', 'ok');
  } catch (e) {
    setStatus(`Error fetching movies: ${e?.message || e}`, 'err');
    logErr(`Error fetching movies: ${e?.message || e}`, 'Movies', e?.stack || String(e));
  }
}

function populateMovieSelect(items) {
  try {
    if (!movieSelect) return;
    movieSelect.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.selected = true;
    opt0.textContent = 'Select a movie';
    movieSelect.appendChild(opt0);
    items.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m.id || '';
      const title = m.title || m.name || m.slug || m.id;
      const isPremium = m.isPremium ? ' (Premium)' : '';
      opt.textContent = `${title}${isPremium}`;
      if (m.mediaKeys?.trailer) opt.setAttribute('data-hasTrailer', '1');
      movieSelect.appendChild(opt);
    });
    movieSelect.disabled = false;
    const idVal = movieSelect.value || '';
    el('movieId').value = idVal;
    movieSelect.addEventListener('change', () => {
      const id = movieSelect.value || '';
      el('movieId').value = id;
      const sel = movieSelect.selectedOptions[0];
      const hasTrailer = sel?.getAttribute('data-hasTrailer') === '1';
      if (!hasTrailer && el('useTrailer')?.checked) {
        logWarn('Selected movie has no trailer key; switching to main.', 'Movies');
        el('useTrailer').checked = false;
      }
    }, { once: true });
    logInfo(`Populated ${items.length} movies into selector`, 'Movies');
  } catch (e) {
    logErr(`Failed to populate movie selector: ${e?.message || e}`, 'Movies');
  }
}

if (btnFetchMovies) {
  btnFetchMovies.addEventListener('click', (e) => {
    e.preventDefault();
    fetchMovies();
  });
}

function is403FromHlsError(data) {
  const code =
    data?.response?.code ??
    data?.response?.status ??
    data?.networkDetails?.status ??
    data?.xhr?.status;
  return Number(code) === 403;
}

function attemptHlsRecovery(errData) {
  try {
    const url = serverManifestUrl?.trim();
    if (!url) return;
    if (!hls) return;
    const isFatal = !!(errData && errData.fatal);
    const isManifestIssue = !!(
      errData &&
      String(errData.details || '')
        .toLowerCase()
        .includes('manifest')
    );
    if (isFatal || isManifestIssue) {
      logWarn('Reinitializing Hls after cookie refresh...', 'HLS');
      hls.destroy();
      initHls(url);
    } else {
      logInfo('Resuming Hls after cookie refresh...', 'HLS');
      hls.startLoad();
    }
    setStatus('Resumed playback after cookie refresh.', 'ok');
    video.play().catch(() => {});
  } catch (e) {
    logErr(`Recovery error: ${e?.message || e}`, 'HLS');
  }
}

function initHls(url) {
  hls = new Hls({
    lowLatencyMode: true,
    enableWorker: true,
    fetchSetup: (ctx, init) => ({ ...init, credentials: 'include' }),
    xhrSetup: (xhr) => { xhr.withCredentials = true; },
  });
  hls.on(Hls.Events.ERROR, (_, data) => {
    logErr(
      `HLS.js error: type=${data.type}, details=${data.details}, fatal=${!!data.fatal}`,
      'HLS'
    );
    if (is403FromHlsError(data)) {
      setStatus('Access denied (403). Refreshing cookies...', 'err');
      refreshSignedCookies('reactive');
      return;
    }
    if (data.fatal) {
      setStatus(`HLS fatal: ${data.details}`, 'err');
      probeManifest();
    }
  });
  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    setStatus('Video loaded (Hls.js)', 'ok');
    populateQualitySelector(hls);
    video.play().catch(() => {});
  });
  hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
    const h = hls.levels[data.level]?.height || '?';
    logInfo(`Level switched to ${data.level} (${h}p)`, 'HLS');
    if (!hls.autoLevelEnabled) {
      qualitySel.value = String(data.level);
    }
  });
  hls.loadSource(url);
  hls.attachMedia(video);
  el('btnStop').disabled = false;
}

async function probeManifest() {
  const url = serverManifestUrl?.trim();
  if (!url) return setStatus('Get signed cookies to obtain manifest URL first', 'err');
  const pageOrigin = window.location.origin;
  let manifestOrigin = '';
  try { manifestOrigin = new URL(url).origin; } catch {}
  logInfo(`Page origin: ${pageOrigin}; Manifest origin: ${manifestOrigin || 'unknown'}`, 'Probe');
  try {
    logInfo(`HEAD (no credentials): ${url}`, 'Probe');
    const r0 = await fetch(url, { method: 'HEAD', mode: 'cors', credentials: 'omit', cache: 'no-store' });
    const ct0 = r0.headers.get('content-type') || '';
    logInfo(`HEAD response: type=${r0.type}; status=${r0.status} ${r0.statusText}; ct=${ct0}`, 'Probe');
    const acao = r0.headers.get('access-control-allow-origin');
    const acc = r0.headers.get('access-control-allow-credentials');
    if (acao || acc) {
      logInfo(`Readable CORS headers: A-C-A-O='${acao}', A-C-A-C='${acc}'`, 'Probe');
    } else {
      logWarn('CORS headers not readable by JS (normal unless exposed). This does not prove absence.', 'Probe');
    }
    if (r0.type === 'opaque') {
      logWarn('Opaque HEAD response: origin not permitted for CORS (likely missing Access-Control-Allow-Origin).', 'Probe');
    } else {
      logInfo('Origin appears permitted for credentialless CORS HEAD.', 'Probe');
    }
  } catch (e0) {
    logWarn(`HEAD (no credentials) failed: ${e0?.message || e0}`, 'Probe');
    try {
      const r0b = await fetch(url, { method: 'HEAD', mode: 'no-cors', credentials: 'omit', cache: 'no-store' });
      logWarn(`HEAD (no-cors) returned type=${r0b.type}. Opaque indicates CORS not permitted or headers not exposed.`, 'Probe');
    } catch (e0b) {
      logErr(`HEAD (no-cors) also failed: ${e0b?.message || e0b}`, 'Probe');
    }
  }
  logInfo(`GET manifest (with credentials): ${url}`, 'Probe');
  try {
    const r = await fetch(url, { credentials: 'include', mode: 'cors', cache: 'no-store' });
    const ct = r.headers.get('content-type') || '';
    logInfo(`Manifest response: type=${r.type}; status=${r.status} ${r.statusText}; ct=${ct}`, 'Probe');
    const txt = await r.text().catch(() => '');
    if (txt) logInfo('Body (first 500 chars):', 'Probe', txt.slice(0, 500));
    if (r.status === 403) {
      setStatus('Manifest 403 (likely cookies expired). Refreshing...', 'err');
      await refreshSignedCookies('reactive');
      return;
    }
    if (r.ok && (ct.includes('application/vnd.apple.mpegurl') || txt.startsWith('#EXTM3U'))) {
      setStatus('Manifest looks valid. If playback fails, check segment requests.');
    } else if (txt.includes('<Error>')) {
      setStatus('Manifest returned XML error (likely AccessDenied/MissingKey).', 'err');
    } else {
      setStatus('Manifest fetched but content-type doesn’t look like HLS.', 'err');
    }
  } catch (e) {
    const msg = e?.message || String(e);
    setStatus(`Manifest fetch error: ${msg}`, 'err');
    logErr(`Manifest fetch error: ${msg}`, 'Probe', e?.stack || String(e));
    if (String(msg).toLowerCase().includes('failed to fetch')) {
      logWarn('Credentialed CORS likely blocked. The browser prevents inspecting response headers when blocked.', 'Probe');
      logInfo(`Ensure media origin sends: Access-Control-Allow-Origin: ${pageOrigin} and Access-Control-Allow-Credentials: true`, 'Probe');
      logInfo('Also ensure allowed methods/headers and optionally expose headers: Accept-Ranges, Content-Length, Content-Range', 'Probe');
    }
  }
}

function loadVideo() {
  const url = serverManifestUrl?.trim();
  if (!url || !url.includes('.m3u8'))
    return setStatus('Get signed cookies to obtain a valid .m3u8 URL', 'err');
  if (hls) { hls.destroy(); hls = null; }
  video.pause();
  video.removeAttribute('src');
  video.load();
  resetQualitySelector();
  setStatus('Loading video...');
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url;
    video.addEventListener('loadedmetadata', () => {
      setStatus('Video loaded (native HLS)', 'ok');
      el('btnStop').disabled = false;
      resetQualitySelector();
    }, { once: true });
    video.addEventListener('error', (e) => {
      setStatus(`Video error: ${e?.message || 'unknown'}`, 'err');
      probeManifest();
    }, { once: true });
    video.play().catch(() => {});
    return;
  }
  if (Hls.isSupported()) { initHls(url); return; }
  setStatus('HLS not supported in this browser', 'err');
}

function stopVideo() {
  if (hls) { hls.destroy(); hls = null; }
  video.pause();
  video.removeAttribute('src');
  video.load();
  el('btnStop').disabled = true;
  resetQualitySelector();
  if (cookieRefreshTimer) { clearTimeout(cookieRefreshTimer); cookieRefreshTimer = null; }
  setStatus('Stopped');
}

el('btnCookies').onclick = getSignedCookies;
el('btnLoad').onclick = loadVideo;
el('btnStop').onclick = stopVideo;
el('btnProbe').onclick = probeManifest;
el('btnLogin').onclick = login;
el('btnLoginProfile').onclick = loginWithProfile;
el('btnLogout').onclick = logout;
btnRefreshToken && (btnRefreshToken.onclick = refreshAccessToken);

const rtmControls = {
  appIdEl: el('rtmAppId'),
  channelEl: el('rtmChannel'),
  displayEl: el('rtmDisplay'),
  textEl: el('rtmText'),
  btnConnect: el('btnConnectRtm'),
  btnSend: el('btnSendRtm'),
  btnDisconnect: el('btnDisconnectRtm'),
};
let rtmClient = null;
let rtmUserId = null;

function appendRtmMessage(user, msg) {
  const d = rtmControls.displayEl;
  const t = document.createTextNode(String(user) + ': ' + String(msg));
  const br = document.createElement('br');
  d.appendChild(t);
  d.appendChild(br);
  d.scrollTop = d.scrollHeight;
}

function connectRtm() {
  const appId = rtmControls.appIdEl?.value?.trim();
  const channel = rtmControls.channelEl?.value?.trim() || 'Chat_room';
  const apiBase = el('apiBaseUrl')?.value?.trim()?.replace(/\/$/, '');
  if (!appId || !apiBase) return;
  rtmUserId = (currentProfile?.id || userData?.id || Math.random().toString(36).slice(2, 10));
  try {
    rtmClient = new AgoraRTM.RTM(appId, rtmUserId);
  } catch (e) {
    logErr('RTM init failed', 'RTM', e?.stack || String(e));
    return;
  }
  rtmClient.addEventListener('message', (event) => {
    if (event.publisher === rtmUserId) return;
    appendRtmMessage(event.publisher, event.message);
  });
  rtmClient.addEventListener('presence', (event) => {
    appendRtmMessage('INFO', event.eventType === 'SNAPSHOT' ? 'Join snapshot' : (event.publisher + ' ' + event.eventType));
  });
  rtmClient.addEventListener('status', (event) => {
    logInfo('RTM status', 'RTM', JSON.stringify(event));
  });
  fetch(apiBase + '/watch-party/rtm/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: accessToken ? `Bearer ${accessToken}` : '' },
    body: JSON.stringify({}),
  })
    .then((res) => res.json())
    .then((json) => {
      const token = json?.data?.token || json?.token;
      if (!token) throw new Error('token missing');
      return rtmClient.login({ token });
    })
    .then(() => rtmClient.subscribe(channel))
    .then(() => { logInfo('RTM connected', 'RTM'); })
    .catch((e) => { logErr('RTM connect error', 'RTM', e?.stack || String(e)); });
}

function publishRtmMessage() {
  if (!rtmClient) return;
  const channel = rtmControls.channelEl?.value?.trim() || 'Chat_room';
  const message = rtmControls.textEl?.value || '';
  if (!message) return;
  const payload = JSON.stringify({ type: 'text', message });
  const options = { channelType: 'MESSAGE' };
  rtmClient
    .publish(channel, payload, options)
    .then(() => { appendRtmMessage(rtmUserId, payload); rtmControls.textEl.value = ''; })
    .catch((e) => { logErr('Publish failed', 'RTM', e?.stack || String(e)); });
}

function disconnectRtm() {
  if (!rtmClient) return;
  rtmClient
    .logout()
    .catch(() => {})
    .finally(() => { rtmClient = null; logInfo('RTM disconnected', 'RTM'); });
}

rtmControls.btnConnect?.addEventListener('click', connectRtm);
rtmControls.btnDisconnect?.addEventListener('click', disconnectRtm);
rtmControls.btnSend?.addEventListener('click', publishRtmMessage);
rtmControls.textEl?.addEventListener('keydown', (e) => { if (e.key === 'Enter') publishRtmMessage(); });

const wpControls = {
  partyIdEl: el('wpPartyId'),
  channelNameEl: el('wpChannelName'),
  joinCodeEl: el('wpJoinCode'),
  joinCodeDisplayEl: el('wpJoinCodeDisplay'),
  roleStatusEl: el('wpRoleStatus'),
  rosterEl: el('wpRoster'),
  targetUserEl: el('wpTargetUserId'),
  inviteUserIdsEl: el('wpInviteUserIds'),
  inviteEmailsEl: el('wpInviteEmails'),
  invitePhonesEl: el('wpInvitePhones'),
  scheduleAtEl: el('wpScheduleAt'),
  btnStart: el('btnWpStart'),
  btnJoinId: el('btnWpJoinId'),
  btnJoinCode: el('btnWpJoinCode'),
  btnMetadata: el('btnWpMetadata'),
  btnRotate: el('btnWpRotate'),
  btnEnd: el('btnWpEnd'),
  btnKick: el('btnWpKick'),
  btnBan: el('btnWpBan'),
  btnUnban: el('btnWpUnban'),
  btnMute: el('btnWpMute'),
  btnUnmute: el('btnWpUnmute'),
  btnInvite: el('btnWpInvite'),
  btnRemoveInvite: el('btnWpRemoveInvite'),
  btnSchedule: el('btnWpSchedule'),
  btnListScheduled: el('btnWpListScheduled'),
  btnStartScheduled: el('btnWpStartScheduled'),
};
const wpState = {
  partyId: null,
  channelName: null,
  role: null,
  rtmToken: null,
  isHost: false,
  rtm: null,
  rtmUid: null,
  roster: new Map(),
  driftToleranceMs: 400,
  lastAnchor: null,
  hbTimer: null,
  scrubTimer: null,
  rateBucket: { count: 0, start: 0 },
};

function wpSetRole(role) {
  wpState.role = role || null;
  wpState.isHost = role === 'HOST';
  if (wpControls.roleStatusEl) wpControls.roleStatusEl.textContent = role ? role : 'No party';
}
function wpUpdateRosterView() {
  const d = wpControls.rosterEl; if (!d) return;
  d.innerHTML = '';
  const items = Array.from(wpState.roster.entries());
  items.sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
  items.forEach(([uid, status]) => {
    const t = document.createTextNode(uid + ' • ' + status);
    const br = document.createElement('br');
    d.appendChild(t); d.appendChild(br);
  });
}
function wpRateLimit() {
  const now = Date.now();
  if (!wpState.rateBucket.start || now - wpState.rateBucket.start > 1000) {
    wpState.rateBucket.start = now; wpState.rateBucket.count = 0; return true;
  }
  wpState.rateBucket.count++;
  return wpState.rateBucket.count <= 20;
}
function wpLoginRtmToken() {
  const apiBase = el('apiBaseUrl')?.value?.trim()?.replace(/\/$/, '');
  if (!apiBase || !accessToken) return Promise.reject('missing apiBase/accessToken');
  return fetch(apiBase + '/watch-party/rtm/token', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({}) })
    .then((r)=>r.json()).then((j)=>j?.data?.token || j?.token);
}
function wpConnectRtm(channel) {
  const appId = rtmControls.appIdEl?.value?.trim();
  if (!appId) return Promise.reject('missing appId');
  const uid = (currentProfile?.id || userData?.id || Math.random().toString(36).slice(2,10));
  wpState.rtmUid = uid;
  try { wpState.rtm = new AgoraRTM.RTM(appId, uid); } catch (e) { logErr('RTM init failed', 'WP', e?.stack || String(e)); return Promise.reject(e); }
  wpState.rtm.addEventListener('message', (event) => {
    if (event.publisher === uid) return;
    try {
      const data = JSON.parse(event.message);
      if (data && data.t && (data.t === 'play' || data.t === 'pause' || data.t === 'seek' || data.t === 'hb')) {
        wpApplyAnchor(data);
        return;
      }
    } catch {}
    appendRtmMessage(event.publisher, event.message);
  });
  wpState.rtm.addEventListener('presence', (event) => {
    const who = event.publisher || 'unknown';
    const status = event.eventType || 'event';
    wpState.roster.set(who, status);
    wpUpdateRosterView();
  });
  wpState.rtm.addEventListener('status', (event) => {
    const st = String(event.state || '');
    if (st === 'RECONNECTED') { wpReadChannelAttrs(channel).catch(()=>{}); }
  });
  return wpLoginRtmToken()
    .then((token) => wpState.rtm.login({ token }))
    .then(() => wpState.rtm.subscribe(channel))
    .then(() => { logInfo('Watch party RTM connected', 'WP'); return wpReadChannelAttrs(channel); })
    .catch((e)=>{ logErr('Watch party RTM connect error', 'WP', e?.stack || String(e)); throw e; });
}
function wpSetChannelAttrs(channel, attrs) {
  if (!wpState.rtm) return Promise.resolve();
  const a = { hostId: String(attrs.hostId||''), state: String(attrs.state||''), mediaTime: Number(attrs.mediaTime||0), at: Number(attrs.at||0) };
  return wpState.rtm.setChannelAttributes(channel, a, { enableNotificationToChannelMembers: true }).catch(()=>{});
}
function wpReadChannelAttrs(channel) {
  if (!wpState.rtm) return Promise.resolve();
  return wpState.rtm.getChannelAttributes(channel).then((a)=>{
    const hostId = a?.hostId; const state = a?.state; const mediaTime = Number(a?.mediaTime||0); const at = Number(a?.at||0);
    if (hostId && (state === 'playing' || state === 'paused')) {
      wpApplyAnchor({ t: state === 'playing' ? 'play' : 'pause', mediaTime, at });
    }
  }).catch(()=>{});
}
function wpPublishControl(t, mediaTime) {
  if (!wpState.rtm || !wpRateLimit()) return;
  const payload = JSON.stringify({ t, mediaTime: Number(mediaTime||0), at: Date.now() });
  const opts = { channelType: 'MESSAGE' };
  wpState.rtm.publish(wpState.channelName, payload, opts).catch(()=>{});
}
function wpApplyAnchor(msg) {
  const now = Date.now();
  const playing = msg.t === 'play' || msg.t === 'seek' || msg.t === 'hb';
  const target = playing ? Number(msg.mediaTime || 0) + (now - Number(msg.at || now))/1000 : Number(msg.mediaTime || 0);
  const cur = Number(video.currentTime || 0);
  const driftMs = Math.abs((target - cur) * 1000);
  if (driftMs > wpState.driftToleranceMs) { try { video.currentTime = target; } catch {} }
  if (playing) { if (video.paused) { video.play().catch(()=>{}); } } else { try { video.pause(); } catch {} }
  wpState.lastAnchor = { t: msg.t, mediaTime: msg.mediaTime, at: msg.at };
}
function wpHeartbeatStart() {
  if (wpState.hbTimer) { clearInterval(wpState.hbTimer); wpState.hbTimer = null; }
  wpState.hbTimer = setInterval(()=>{ if (wpState.isHost) { wpPublishControl('hb', video.currentTime || 0); } }, 3000);
}
function wpHeartbeatStop() { if (wpState.hbTimer) { clearInterval(wpState.hbTimer); wpState.hbTimer = null; } }
function wpOnPlay() {
  if (!wpState.partyId || !wpState.isHost) return;
  const mediaTime = Number(video.currentTime || 0);
  wpPublishControl('play', mediaTime);
  wpSetChannelAttrs(wpState.channelName, { hostId: wpState.rtmUid, state: 'playing', mediaTime, at: Date.now() });
  wpHeartbeatStart();
}
function wpOnPause() {
  if (!wpState.partyId || !wpState.isHost) return;
  const mediaTime = Number(video.currentTime || 0);
  wpPublishControl('pause', mediaTime);
  wpSetChannelAttrs(wpState.channelName, { hostId: wpState.rtmUid, state: 'paused', mediaTime, at: Date.now() });
  wpHeartbeatStop();
}
function wpOnSeeked() {
  if (!wpState.partyId || !wpState.isHost) return;
  const fire = () => {
    const mediaTime = Number(video.currentTime || 0);
    wpPublishControl('seek', mediaTime);
    wpSetChannelAttrs(wpState.channelName, { hostId: wpState.rtmUid, state: video.paused ? 'paused' : 'playing', mediaTime, at: Date.now() });
  };
  if (wpState.scrubTimer) { clearTimeout(wpState.scrubTimer); }
  wpState.scrubTimer = setTimeout(fire, 250);
}
video.addEventListener('play', wpOnPlay);
video.addEventListener('pause', wpOnPause);
video.addEventListener('seeked', wpOnSeeked);

function wpEnsureAuth() { return !!accessToken; }
function wpApiBase() { return el('apiBaseUrl')?.value?.trim()?.replace(/\/$/, ''); }
function wpMovieId() { return (movieSelect && movieSelect.value) ? String(movieSelect.value).trim() : el('movieId')?.value?.trim(); }
function wpPartyId() { return wpControls.partyIdEl?.value?.trim(); }
function wpJoinCode() { return wpControls.joinCodeEl?.value?.trim(); }
function wpChannelName() { return wpControls.channelNameEl?.value?.trim(); }
function wpHeaders() { return { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }; }
function wpSetMetadataView(meta) {
  const code = meta?.party?.joinCode || meta?.joinCode;
  if (code && wpControls.joinCodeDisplayEl) wpControls.joinCodeDisplayEl.textContent = 'Join Code: ' + code;
  const roster = (meta?.party?.participants || []).map((u)=>u.id||'user');
  wpState.roster.clear(); roster.forEach((id)=>wpState.roster.set(id, 'ONLINE'));
  wpUpdateRosterView();
}
function wpConnectFromResponse(payload) {
  const party = payload?.party; const channel = payload?.channelName || party?.channelName; const role = payload?.role;
  if (!party || !channel) { setStatus('Party response missing channel', 'err'); return; }
  wpState.partyId = party.id; wpState.channelName = channel; wpSetRole(role || 'PARTICIPANT');
  wpSetMetadataView({ party });
  wpConnectRtm(channel).then(()=>{
    if (rtmControls.channelEl) rtmControls.channelEl.value = channel;
    if (!rtmClient) connectRtm();
  }).catch(()=>{});
}
async function wpStart() {
  if (!wpEnsureAuth()) { setStatus('Login first', 'err'); return; }
  const apiBase = wpApiBase(); const movieId = wpMovieId(); const channelName = wpChannelName();
  if (!apiBase || !movieId) { setStatus('Provide API base and movieId', 'err'); return; }
  const body = { movieId, channelName };
  logInfo(`[POST] ${apiBase}/watch-party/party/start`, 'WP', JSON.stringify(body));
  const res = await fetch(`${apiBase}/watch-party/party/start`, { method: 'POST', headers: wpHeaders(), body: JSON.stringify(body) });
  const j = await res.json().catch(()=>null);
  if (!res.ok) { setStatus(`Start failed: ${res.status}`, 'err'); logErr('Start failed', 'WP', JSON.stringify(j).slice(0,300)); return; }
  wpConnectFromResponse(j?.data || j);
}
async function wpJoinId() {
  if (!wpEnsureAuth()) { setStatus('Login first', 'err'); return; }
  const apiBase = wpApiBase(); const pid = wpPartyId(); if (!apiBase || !pid) { setStatus('Provide partyId', 'err'); return; }
  logInfo(`[POST] ${apiBase}/watch-party/party/join`, 'WP', JSON.stringify({ partyId: pid }));
  const res = await fetch(`${apiBase}/watch-party/party/join`, { method: 'POST', headers: wpHeaders(), body: JSON.stringify({ partyId: pid }) });
  const j = await res.json().catch(()=>null);
  if (!res.ok) { setStatus(`Join failed: ${res.status}`, 'err'); logErr('Join failed', 'WP', JSON.stringify(j).slice(0,300)); return; }
  wpConnectFromResponse(j?.data || j);
}
async function wpJoinCodeAction() {
  if (!wpEnsureAuth()) { setStatus('Login first', 'err'); return; }
  const apiBase = wpApiBase(); const code = wpJoinCode(); if (!apiBase || !code) { setStatus('Provide join code', 'err'); return; }
  logInfo(`[POST] ${apiBase}/watch-party/party/join-by-code`, 'WP', JSON.stringify({ code }));
  const res = await fetch(`${apiBase}/watch-party/party/join-by-code`, { method: 'POST', headers: wpHeaders(), body: JSON.stringify({ code }) });
  const j = await res.json().catch(()=>null);
  if (!res.ok) { setStatus(`Join-by-code failed: ${res.status}`, 'err'); logErr('Join-by-code failed', 'WP', JSON.stringify(j).slice(0,300)); return; }
  wpConnectFromResponse(j?.data || j);
}
async function wpMetadata() {
  const apiBase = wpApiBase(); const pid = wpPartyId(); if (!apiBase || !pid || !accessToken) { return; }
  logInfo(`[GET] ${apiBase}/watch-party/party/${pid}`, 'WP');
  const res = await fetch(`${apiBase}/watch-party/party/${pid}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const j = await res.json().catch(()=>null);
  if (!res.ok) { logErr('Metadata failed', 'WP', JSON.stringify(j).slice(0,300)); return; }
  wpSetMetadataView(j?.data || j);
}
async function wpRotate() {
  const apiBase = wpApiBase(); const pid = wpPartyId(); if (!apiBase || !pid || !accessToken) { return; }
  logInfo(`[POST] ${apiBase}/watch-party/party/rotate-code`, 'WP', JSON.stringify({ partyId: pid }));
  const res = await fetch(`${apiBase}/watch-party/party/rotate-code`, { method: 'POST', headers: wpHeaders(), body: JSON.stringify({ partyId: pid }) });
  const j = await res.json().catch(()=>null);
  if (!res.ok) { logErr('Rotate failed', 'WP', JSON.stringify(j).slice(0,300)); return; }
  const code = (j?.data || j)?.joinCode; if (code && wpControls.joinCodeDisplayEl) wpControls.joinCodeDisplayEl.textContent = 'Join Code: ' + code;
}
async function wpEnd() {
  const apiBase = wpApiBase(); const pid = wpPartyId(); if (!apiBase || !pid || !accessToken) { return; }
  logInfo(`[POST] ${apiBase}/watch-party/party/end`, 'WP', JSON.stringify({ partyId: pid }));
  const res = await fetch(`${apiBase}/watch-party/party/end`, { method: 'POST', headers: wpHeaders(), body: JSON.stringify({ partyId: pid }) });
  const j = await res.json().catch(()=>null);
  if (!res.ok) { logErr('End failed', 'WP', JSON.stringify(j).slice(0,300)); return; }
  wpSetRole(null); wpState.partyId = null; wpState.channelName = null; wpHeartbeatStop();
}
async function wpInvite() {
  const apiBase = wpApiBase(); const pid = wpPartyId(); if (!apiBase || !pid || !accessToken) { return; }
  const ids = (wpControls.inviteUserIdsEl?.value||'').split(',').map(s=>s.trim()).filter(Boolean);
  const emails = (wpControls.inviteEmailsEl?.value||'').split(',').map(s=>s.trim()).filter(Boolean);
  const phones = (wpControls.invitePhonesEl?.value||'').split(',').map(s=>s.trim()).filter(Boolean);
  logInfo(`[POST] ${apiBase}/watch-party/party/invite`, 'WP', JSON.stringify({ partyId: pid, userIds: ids, emails, phones }));
  const res = await fetch(`${apiBase}/watch-party/party/invite`, { method: 'POST', headers: wpHeaders(), body: JSON.stringify({ partyId: pid, userIds: ids, emails, phones }) });
  const j = await res.json().catch(()=>null);
  if (!res.ok) { logErr('Invite failed', 'WP', JSON.stringify(j).slice(0,300)); return; }
}
async function wpRemoveInvite() {
  const apiBase = wpApiBase(); const pid = wpPartyId(); const uid = wpControls.targetUserEl?.value?.trim(); if (!apiBase || !pid || !uid || !accessToken) { return; }
  logInfo(`[POST] ${apiBase}/watch-party/party/remove-invite`, 'WP', JSON.stringify({ partyId: pid, userId: uid }));
  const res = await fetch(`${apiBase}/watch-party/party/remove-invite`, { method: 'POST', headers: wpHeaders(), body: JSON.stringify({ partyId: pid, userId: uid }) });
  await res.text();
}
async function wpModerate(path) {
  const apiBase = wpApiBase(); const pid = wpPartyId(); const uid = wpControls.targetUserEl?.value?.trim(); if (!apiBase || !pid || !uid || !accessToken) { return; }
  logInfo(`[POST] ${apiBase}/watch-party/party/${path}`, 'WP', JSON.stringify({ partyId: pid, userId: uid }));
  const res = await fetch(`${apiBase}/watch-party/party/${path}`, { method: 'POST', headers: wpHeaders(), body: JSON.stringify({ partyId: pid, userId: uid }) });
  await res.text();
}
async function wpListScheduled() {
  const apiBase = wpApiBase(); if (!apiBase || !accessToken) return;
  logInfo(`[GET] ${apiBase}/watch-party/my/scheduled`, 'WP');
  const res = await fetch(`${apiBase}/watch-party/my/scheduled`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const j = await res.json().catch(()=>null);
  if (res.ok) { logInfo('Scheduled parties', 'WP', JSON.stringify(j).slice(0,400)); }
}
async function wpSchedule() {
  const apiBase = wpApiBase(); const movieId = wpMovieId(); const when = wpControls.scheduleAtEl?.value?.trim(); const channelName = wpChannelName(); if (!apiBase || !movieId || !when || !accessToken) return;
  const body = { movieId, channelName, scheduledFor: when, inviteeIds: (wpControls.inviteUserIdsEl?.value||'').split(',').map(s=>s.trim()).filter(Boolean), emails: (wpControls.inviteEmailsEl?.value||'').split(',').map(s=>s.trim()).filter(Boolean), phones: (wpControls.invitePhonesEl?.value||'').split(',').map(s=>s.trim()).filter(Boolean) };
  logInfo(`[POST] ${apiBase}/watch-party/party/schedule`, 'WP', JSON.stringify(body).slice(0,400));
  const res = await fetch(`${apiBase}/watch-party/party/schedule`, { method: 'POST', headers: wpHeaders(), body: JSON.stringify(body) });
  const j = await res.json().catch(()=>null);
  if (!res.ok) { logErr('Schedule failed', 'WP', JSON.stringify(j).slice(0,300)); return; }
}
async function wpStartScheduled() {
  const apiBase = wpApiBase(); const pid = wpPartyId(); if (!apiBase || !pid || !accessToken) return;
  logInfo(`[POST] ${apiBase}/watch-party/party/start-scheduled`, 'WP', JSON.stringify({ partyId: pid }));
  const res = await fetch(`${apiBase}/watch-party/party/start-scheduled`, { method: 'POST', headers: wpHeaders(), body: JSON.stringify({ partyId: pid }) });
  const j = await res.json().catch(()=>null);
  if (!res.ok) { logErr('Start scheduled failed', 'WP', JSON.stringify(j).slice(0,300)); return; }
  wpConnectFromResponse(j?.data || j);
}
wpControls.btnStart?.addEventListener('click', wpStart);
wpControls.btnJoinId?.addEventListener('click', wpJoinId);
wpControls.btnJoinCode?.addEventListener('click', wpJoinCodeAction);
wpControls.btnMetadata?.addEventListener('click', wpMetadata);
wpControls.btnRotate?.addEventListener('click', wpRotate);
wpControls.btnEnd?.addEventListener('click', wpEnd);
wpControls.btnInvite?.addEventListener('click', wpInvite);
wpControls.btnRemoveInvite?.addEventListener('click', wpRemoveInvite);
wpControls.btnKick?.addEventListener('click', ()=>wpModerate('kick'));
wpControls.btnBan?.addEventListener('click', ()=>wpModerate('ban'));
wpControls.btnUnban?.addEventListener('click', ()=>wpModerate('unban'));
wpControls.btnMute?.addEventListener('click', ()=>wpModerate('mute'));
wpControls.btnUnmute?.addEventListener('click', ()=>wpModerate('unmute'));
wpControls.btnListScheduled?.addEventListener('click', wpListScheduled);
wpControls.btnSchedule?.addEventListener('click', wpSchedule);
wpControls.btnStartScheduled?.addEventListener('click', wpStartScheduled);

const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
function showTab(name) {
  const playerWrap = document.getElementById('playerWrap');
  const playerMain = document.getElementById('playerMain');
  const authAcc = document.getElementById('authAccordion');
  const chatWrap = document.getElementById('chatWrap');
  const watchWrap = document.getElementById('watchPartyWrap');
  if (name === 'player') {
    playerWrap.style.display = '';
    playerMain.style.display = '';
    authAcc.style.display = 'none';
    chatWrap.style.display = 'none';
    watchWrap.style.display = '';
  } else if (name === 'chat') {
    playerWrap.style.display = 'none';
    chatWrap.style.display = '';
    watchWrap.style.display = 'none';
  } else if (name === 'auth') {
    playerWrap.style.display = '';
    playerMain.style.display = 'none';
    authAcc.style.display = '';
    chatWrap.style.display = 'none';
    watchWrap.style.display = 'none';
  }
}
tabButtons.forEach((b)=>{ b.addEventListener('click', ()=> showTab(b.getAttribute('data-tab'))); });
showTab('player');