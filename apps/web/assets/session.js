export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function requestJson(path, { method = 'GET', body } = {}) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    throw new TypeError('Only same-origin API paths are allowed');
  }
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, value?.error ?? 'Layanan tidak tersedia');
  }
  return value;
}

export const getSession = () => requestJson('/auth/session');
export const getPermissions = () => requestJson('/auth/permissions');
export const signIn = (email, password) => requestJson('/auth/login', {
  method: 'POST', body: { email, password },
});
export const signOut = () => requestJson('/auth/logout', { method: 'POST' });
