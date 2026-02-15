const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
const API_ROOT = `${API_BASE_URL}/api`;

const TOKEN_KEY = 'vendorToken';
const VENDOR_ID_KEY = 'vendorId';
const SELECTED_VENDOR_KEY = 'selectedVendorId';
const VENDOR_LIST_CACHE_KEY = 'vendorListCache';

let apiHandlers = {
  onNetworkError: null,
  onClear: null,
};

export const setApiHandlers = (handlers = {}) => {
  apiHandlers = { ...apiHandlers, ...handlers };
};

export const getVendorToken = () => localStorage.getItem(TOKEN_KEY) || '';
export const getVendorId = () => localStorage.getItem(VENDOR_ID_KEY) || '';
export const getSelectedVendorId = () => localStorage.getItem(SELECTED_VENDOR_KEY) || '';

export const setVendorSession = (token, vendorId) => {
  if (!token) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(VENDOR_ID_KEY);
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(VENDOR_ID_KEY, String(vendorId || ''));
};

export const clearVendorSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(VENDOR_ID_KEY);
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

export const clearVendorState = () => {
  clearVendorSession();
  clearSelectedVendorId();
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

const request = async (path, { method = 'GET', body, auth = true } = {}) => {
  let res;
  try {
    res = await fetch(`${API_ROOT}${path}`, {
      method,
      headers: buildHeaders(auth),
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    const message = 'Network error: Cannot reach server. Check backend is running on :5000.';
    if (apiHandlers.onNetworkError) apiHandlers.onNetworkError(message);
    throw new Error(message);
  }
  if (apiHandlers.onClear) apiHandlers.onClear();
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    if (auth && (res.status === 401 || res.status === 403)) {
      clearVendorState();
    }
    const message = data.error || data.msg || 'Request failed';
    throw new Error(message);
  }
  return data;
};

export const apiGet = (path, opts = {}) => request(path, { ...opts, method: 'GET' });
export const apiPost = (path, body, opts = {}) => request(path, { ...opts, method: 'POST', body });
export const apiPatch = (path, body, opts = {}) => request(path, { ...opts, method: 'PATCH', body });

export const publicGet = (path) => request(path, { auth: false, method: 'GET' });
