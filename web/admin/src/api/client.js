const API_ROOT = '/api';

const ADMIN_KEY_STORAGE = 'rova_admin_api_key';
const AUTH_MESSAGE_KEY = 'rova_admin_auth_message';
const AUTH_REDIRECT = '/login';
let authHandling = false;
let lastAuthHandledAt = 0;

export const getAdminKey = () => localStorage.getItem(ADMIN_KEY_STORAGE) || '';
export const setAdminKey = (key) => {
  if (!key) {
    localStorage.removeItem(ADMIN_KEY_STORAGE);
  } else {
    localStorage.setItem(ADMIN_KEY_STORAGE, key);
  }
};

const setAuthMessage = (message) => {
  if (message) sessionStorage.setItem(AUTH_MESSAGE_KEY, message);
};

export const consumeAuthMessage = () => {
  const message = sessionStorage.getItem(AUTH_MESSAGE_KEY) || '';
  if (message) sessionStorage.removeItem(AUTH_MESSAGE_KEY);
  return message;
};

const buildHeaders = (admin = true, { json = true } = {}) => {
  const headers = {
    Accept: 'application/json',
  };
  if (json) headers['Content-Type'] = 'application/json';
  if (admin) {
    const key = getAdminKey();
    if (key) headers['X-Admin-API-Key'] = key;
  }
  return headers;
};

const normalizePath = (path) => (path.startsWith('/') ? path : `/${path}`);

const parsePayload = (text) => {
  if (!text) return { data: null, text: '' };
  try {
    return { data: JSON.parse(text), text };
  } catch {
    return { data: null, text };
  }
};

const buildErrorMessage = (method, url, status, payload, fallbackText, statusText) => {
  let detail = '';
  if (payload && typeof payload === 'object') {
    detail = payload.error || payload.message || payload.details || payload.msg || '';
    if (!detail && Object.keys(payload).length) {
      detail = JSON.stringify(payload);
    }
  }
  if (!detail && fallbackText) detail = fallbackText;
  if (!detail) detail = statusText || 'Request failed';
  return `${method} ${url} -> ${status} ${detail}`;
};

const handleAuthFailure = (status) => {
  const now = Date.now();
  if (authHandling && now - lastAuthHandledAt < 3000) return;
  authHandling = true;
  lastAuthHandledAt = now;
  setAdminKey('');
  const message =
    status === 403
      ? 'Access denied. Please sign in again.'
      : 'Session expired. Please sign in again.';
  setAuthMessage(message);
  if (!window.location.pathname.startsWith(AUTH_REDIRECT)) {
    window.location.assign(AUTH_REDIRECT);
  }
};

export const apiRequest = async (method, path, body, { admin = true } = {}) => {
  const url = `${API_ROOT}${normalizePath(path)}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: buildHeaders(admin),
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error(`${method} ${url} -> 0 ${err?.message || 'Network error'}`);
  }
  const text = await res.text();
  const { data, text: fallbackText } = parsePayload(text);
  if (!res.ok) {
    if (admin && (res.status === 401 || res.status === 403)) {
      handleAuthFailure(res.status);
      const err = new Error('');
      err.authFailure = true;
      throw err;
    }
    throw new Error(
      buildErrorMessage(method, url, res.status, data, fallbackText, res.statusText)
    );
  }
  return data ?? (fallbackText ? fallbackText : {});
};

export const apiGet = (path, opts = {}) => apiRequest('GET', path, undefined, opts);
export const apiPost = (path, body, opts = {}) => apiRequest('POST', path, body, opts);
export const apiPut = (path, body, opts = {}) => apiRequest('PUT', path, body, opts);
export const apiPatch = (path, body, opts = {}) => apiRequest('PATCH', path, body, opts);
export const apiDelete = (path, body, opts = {}) => apiRequest('DELETE', path, body, opts);

export const publicGet = (path) => apiRequest('GET', path, undefined, { admin: false });

export const apiUpload = async (path, file, field = 'file') => {
  const url = `${API_ROOT}${normalizePath(path)}`;
  const form = new FormData();
  form.append(field, file);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(true, { json: false }),
      body: form,
    });
  } catch (err) {
    throw new Error(`${'POST'} ${url} -> 0 ${err?.message || 'Network error'}`);
  }
  const text = await res.text();
  const { data, text: fallbackText } = parsePayload(text);
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      handleAuthFailure(res.status);
      const err = new Error('');
      err.authFailure = true;
      throw err;
    }
    throw new Error(
      buildErrorMessage('POST', url, res.status, data, fallbackText, res.statusText)
    );
  }
  return data ?? (fallbackText ? fallbackText : {});
};
