
const API_BASE_URL = 'https://devad-smart-greenhouse.onrender.com';

let accessToken = null;
let refreshing = null;
let onAuthFail = () => {};

export const getAccessToken = () => accessToken;
export const setAccessToken = (token) => {
  accessToken = token;
};
export const setAuthFailHandler = (fn) => {
  onAuthFail = fn;
};

async function raw(path, { method = 'GET', body, auth = true } = {}) {
  const res = await fetch(`${API_BASE_URL}/api${path}`, {
    method,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(auth && accessToken
        ? { Authorization: `Bearer ${accessToken}` }
        : {}),
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
      .then((data) => {
        accessToken = data.accessToken;
        return data;
      })
      .finally(() => {
        refreshing = null;
      });
  }

  return refreshing;
}

export async function api(path, opts = {}) {
  try {
    return await raw(path, opts);
  } catch (error) {
    const isAuthRoute = path.startsWith('/auth/');

    if (error.status === 401 && !isAuthRoute && opts.auth !== false) {
      try {
        await refreshSession();
        return await raw(path, opts);
      } catch (refreshError) {
        onAuthFail();
        throw refreshError;
      }
    }

    throw error;
  }
}
