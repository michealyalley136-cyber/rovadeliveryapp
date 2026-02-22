const API_ROOT = '/api';

const TOKEN_KEY = 'driverToken';
const DRIVER_ID_KEY = 'driverId';
const DRIVER_NAME_KEY = 'driverName';
const SELECTED_DRIVER_KEY = 'selectedDriverId';
const DRIVER_LIST_CACHE_KEY = 'driverListCache';
const AUTH_MESSAGE_KEY = 'rova_driver_auth_message';
const AUTH_REDIRECT = '/driver/select';

let apiHandlers = {
  onNetworkError: null,
  onClear: null,
  onAuthError: null,
};
let authHandling = false;
let lastAuthHandledAt = 0;

export const setApiHandlers = (handlers = {}) => {
  apiHandlers = { ...apiHandlers, ...handlers };
};

export const getDriverToken = () => localStorage.getItem(TOKEN_KEY) || '';
export const getDriverId = () => localStorage.getItem(DRIVER_ID_KEY) || '';
export const getDriverName = () => localStorage.getItem(DRIVER_NAME_KEY) || '';
export const getSelectedDriverId = () => localStorage.getItem(SELECTED_DRIVER_KEY) || '';

export const setDriverSession = (token, driverId, driverName) => {
  if (!token) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(DRIVER_ID_KEY);
    localStorage.removeItem(DRIVER_NAME_KEY);
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(DRIVER_ID_KEY, String(driverId || ''));
  if (driverName) {
    localStorage.setItem(DRIVER_NAME_KEY, driverName);
  }
};

export const clearDriverSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(DRIVER_ID_KEY);
  localStorage.removeItem(DRIVER_NAME_KEY);
};

export const setSelectedDriverId = (driverId) => {
  if (!driverId) {
    localStorage.removeItem(SELECTED_DRIVER_KEY);
    return;
  }
  localStorage.setItem(SELECTED_DRIVER_KEY, String(driverId));
};

export const clearSelectedDriverId = () => {
  localStorage.removeItem(SELECTED_DRIVER_KEY);
};

export const clearDriverState = () => {
  clearDriverSession();
  clearSelectedDriverId();
};

const setAuthMessage = (message) => {
  if (message) sessionStorage.setItem(AUTH_MESSAGE_KEY, message);
};

export const consumeAuthMessage = () => {
  const message = sessionStorage.getItem(AUTH_MESSAGE_KEY) || '';
  if (message) sessionStorage.removeItem(AUTH_MESSAGE_KEY);
  return message;
};

export const setDriverListCache = (drivers = []) => {
  localStorage.setItem(
    DRIVER_LIST_CACHE_KEY,
    JSON.stringify({ ts: Date.now(), drivers })
  );
};

export const getDriverListCache = () => {
  const raw = localStorage.getItem(DRIVER_LIST_CACHE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.drivers) ? parsed.drivers : [];
  } catch {
    return [];
  }
};

const buildHeaders = (auth = true) => {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (auth) {
    const token = getDriverToken();
    if (token) headers.Authorization = `Bearer ${token}`;
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
  clearDriverState();
  const message =
    status === 403
      ? 'Access denied. Please sign in again.'
      : 'Session expired. Please sign in again.';
  setAuthMessage(message);
  if (apiHandlers.onAuthError) apiHandlers.onAuthError(message);
  if (!window.location.pathname.startsWith(AUTH_REDIRECT)) {
    window.location.assign(AUTH_REDIRECT);
  }
};

export const apiRequest = async (method, path, body, { auth = true } = {}) => {
  const url = `${API_ROOT}${normalizePath(path)}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: buildHeaders(auth),
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    const message = `${method} ${url} -> 0 ${err?.message || 'Network error'}`;
    if (apiHandlers.onNetworkError) apiHandlers.onNetworkError(message);
    throw new Error(message);
  }
  const text = await res.text();
  const { data, text: fallbackText } = parsePayload(text);
  if (!res.ok) {
    if (auth && (res.status === 401 || res.status === 403)) {
      handleAuthFailure(res.status);
      const err = new Error('');
      err.authFailure = true;
      throw err;
    }
    throw new Error(
      buildErrorMessage(method, url, res.status, data, fallbackText, res.statusText)
    );
  }
  if (apiHandlers.onClear) apiHandlers.onClear();
  return data ?? (fallbackText ? fallbackText : {});
};

export const apiGet = (path, opts = {}) => apiRequest('GET', path, undefined, opts);
export const apiPost = (path, body, opts = {}) => apiRequest('POST', path, body, opts);
export const apiPatch = (path, body, opts = {}) => apiRequest('PATCH', path, body, opts);

export const publicGet = (path) => apiRequest('GET', path, undefined, { auth: false });
