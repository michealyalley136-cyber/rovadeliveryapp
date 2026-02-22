const API_ROOT = '/api';

const TOKEN_KEY = 'vendorToken';
const VENDOR_ID_KEY = 'vendorId';
const VENDOR_NAME_KEY = 'vendorName';
const SELECTED_VENDOR_KEY = 'selectedVendorId';
const SELECTED_VENDOR_NAME_KEY = 'selectedVendorName';
const VENDOR_LIST_CACHE_KEY = 'vendorListCache';
const AUTH_MESSAGE_KEY = 'rova_vendor_auth_message';
const AUTH_REDIRECT = '/vendor/select';

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

export const getVendorToken = () => localStorage.getItem(TOKEN_KEY) || '';
export const getVendorId = () => localStorage.getItem(VENDOR_ID_KEY) || '';
export const getVendorName = () => localStorage.getItem(VENDOR_NAME_KEY) || '';
export const getSelectedVendorId = () => localStorage.getItem(SELECTED_VENDOR_KEY) || '';
export const getSelectedVendorName = () => localStorage.getItem(SELECTED_VENDOR_NAME_KEY) || '';

export const setVendorSession = (token, vendorId, vendorName) => {
  if (!token) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(VENDOR_ID_KEY);
    localStorage.removeItem(VENDOR_NAME_KEY);
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(VENDOR_ID_KEY, String(vendorId || ''));
  if (vendorName) {
    localStorage.setItem(VENDOR_NAME_KEY, String(vendorName));
  }
  localStorage.removeItem(SELECTED_VENDOR_KEY);
  localStorage.removeItem(SELECTED_VENDOR_NAME_KEY);
};

export const clearVendorSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(VENDOR_ID_KEY);
  localStorage.removeItem(VENDOR_NAME_KEY);
};

export const setSelectedVendorId = (vendorId) => {
  if (!vendorId) {
    localStorage.removeItem(SELECTED_VENDOR_KEY);
    return;
  }
  localStorage.setItem(SELECTED_VENDOR_KEY, String(vendorId));
};

export const clearSelectedVendorId = () => {
  localStorage.removeItem(SELECTED_VENDOR_KEY);
};

export const setSelectedVendor = (vendorId, vendorName) => {
  if (!vendorId) {
    clearSelectedVendorId();
    localStorage.removeItem(SELECTED_VENDOR_NAME_KEY);
    return;
  }
  localStorage.setItem(SELECTED_VENDOR_KEY, String(vendorId));
  if (vendorName) {
    localStorage.setItem(SELECTED_VENDOR_NAME_KEY, String(vendorName));
  }
};

export const clearSelectedVendor = () => {
  localStorage.removeItem(SELECTED_VENDOR_KEY);
  localStorage.removeItem(SELECTED_VENDOR_NAME_KEY);
};

export const clearVendorState = () => {
  clearVendorSession();
  clearSelectedVendor();
};

const setAuthMessage = (message) => {
  if (message) sessionStorage.setItem(AUTH_MESSAGE_KEY, message);
};

export const consumeAuthMessage = () => {
  const message = sessionStorage.getItem(AUTH_MESSAGE_KEY) || '';
  if (message) sessionStorage.removeItem(AUTH_MESSAGE_KEY);
  return message;
};

export const setVendorListCache = (vendors = []) => {
  localStorage.setItem(
    VENDOR_LIST_CACHE_KEY,
    JSON.stringify({ ts: Date.now(), vendors })
  );
};

export const getVendorListCache = () => {
  const raw = localStorage.getItem(VENDOR_LIST_CACHE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.vendors) ? parsed.vendors : [];
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
    const token = getVendorToken();
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
  clearVendorState();
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
