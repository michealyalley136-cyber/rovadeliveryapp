const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
const API_ROOT = `${API_BASE_URL}/api`;

const TOKEN_KEY = 'driverToken';
const DRIVER_ID_KEY = 'driverId';
const DRIVER_NAME_KEY = 'driverName';
const SELECTED_DRIVER_KEY = 'selectedDriverId';
const DRIVER_LIST_CACHE_KEY = 'driverListCache';

let apiHandlers = {
  onNetworkError: null,
  onClear: null,
};

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
      clearDriverState();
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
