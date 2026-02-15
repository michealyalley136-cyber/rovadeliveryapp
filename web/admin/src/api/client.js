const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
const API_ROOT = `${API_BASE_URL}/api`;

const ADMIN_KEY_STORAGE = 'rova_admin_api_key';

export const getAdminKey = () => localStorage.getItem(ADMIN_KEY_STORAGE) || '';
export const setAdminKey = (key) => {
  if (!key) {
    localStorage.removeItem(ADMIN_KEY_STORAGE);
  } else {
    localStorage.setItem(ADMIN_KEY_STORAGE, key);
  }
};

const buildHeaders = (admin = true) => {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (admin) {
    const key = getAdminKey();
    if (key) headers['X-Admin-API-Key'] = key;
  }
  return headers;
};

const request = async (path, { method = 'GET', body, admin = true } = {}) => {
  const res = await fetch(`${API_ROOT}${path}`, {
    method,
    headers: buildHeaders(admin),
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    const message = data.error || data.msg || 'Request failed';
    throw new Error(message);
  }
  return data;
};

export const apiGet = (path, opts = {}) => request(path, { ...opts, method: 'GET' });
export const apiPost = (path, body, opts = {}) => request(path, { ...opts, method: 'POST', body });
export const apiPut = (path, body, opts = {}) => request(path, { ...opts, method: 'PUT', body });
export const apiPatch = (path, body, opts = {}) => request(path, { ...opts, method: 'PATCH', body });

export const publicGet = (path) => request(path, { admin: false, method: 'GET' });
