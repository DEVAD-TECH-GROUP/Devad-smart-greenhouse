// Tiny fetch wrapper: bearer access token in memory, refresh token in an httpOnly cookie.
let accessToken = null;
let refreshing = null;
let onAuthFail = () => {};

export const getAccessToken = () => accessToken;
export const setAccessToken = (t) => { accessToken = t; };
export const setAuthFailHandler = (fn) => { onAuthFail = fn; };

async function raw(path, { method = 'GET', body, auth = true } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    err.fields = data.fields;
    throw err;
  }
  return data;
}

export function refreshSession() {
  if (!refreshing) {
    refreshing = raw('/auth/refresh', { method: 'POST', auth: false })
      .then((d) => { accessToken = d.accessToken; return d; })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

export async function api(path, opts = {}) {
  try {
    return await raw(path, opts);
  } catch (e) {
    const isAuthRoute = path.startsWith('/auth/');
    if (e.status === 401 && !isAuthRoute && opts.auth !== false) {
      try {
        await refreshSession();
        return await raw(path, opts);
      } catch {
        onAuthFail();
      }
    }
    throw e;
  }
}
