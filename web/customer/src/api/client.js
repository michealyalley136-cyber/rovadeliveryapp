const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
const API_ROOT = `${API_BASE_URL}/api`;

let apiHandlers = {
  onNetworkError: null,
  onClear: null,
};

export const setApiHandlers = (handlers = {}) => {
  apiHandlers = { ...apiHandlers, ...handlers };
};

const buildHeaders = () => ({
  Accept: 'application/json',
  'Content-Type': 'application/json',
});

const request = async (path, { method = 'GET', body } = {}) => {
  let res;
  try {
    res = await fetch(`${API_ROOT}${path}`, {
      method,
      headers: buildHeaders(),
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
    const message = data.error || data.msg || 'Request failed';
    throw new Error(message);
  }
  return data;
};

export const apiGet = (path, opts = {}) => request(path, { ...opts, method: 'GET' });
export const apiPost = (path, body, opts = {}) => request(path, { ...opts, method: 'POST', body });
