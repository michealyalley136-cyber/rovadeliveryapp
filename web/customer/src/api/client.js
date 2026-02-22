const API_ROOT = '/api';

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

export const apiRequest = async (method, path, body) => {
  const url = `${API_ROOT}${normalizePath(path)}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: buildHeaders(),
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
    throw new Error(
      buildErrorMessage(method, url, res.status, data, fallbackText, res.statusText)
    );
  }
  if (apiHandlers.onClear) apiHandlers.onClear();
  return data ?? (fallbackText ? fallbackText : {});
};

export const apiGet = (path) => apiRequest('GET', path);
export const apiPost = (path, body) => apiRequest('POST', path, body);
