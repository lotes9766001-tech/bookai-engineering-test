const API = '/api';
const TOKEN_KEY = 'bookai_token';

function readableErrorMessage(status, code, fallback) {
  const codeMap = {
    ACCOUNT_PENDING_REVIEW: '帳號審核中，請聯繫 BookAI 官方客服完成開通。',
    DATABASE_ERROR: '資料暫時無法載入，請稍後再試或聯繫 BookAI 官方客服。',
    NETWORK_ERROR: '連線異常，請重新整理或稍後再試。',
    UNAUTHORIZED: '請先登入後再繼續操作。',
    FORBIDDEN: '您目前沒有權限使用此功能。',
    VALIDATION_ERROR: '請確認欄位是否填寫完整。',
    FREE_BETA_LIMIT_REACHED: '目前採人工審核制，請聯繫 BookAI 官方客服確認開通狀態。'
  };

  if (code && codeMap[code]) return codeMap[code];
  if (status === 401) return codeMap.UNAUTHORIZED;
  if (status === 403) return codeMap.FORBIDDEN;
  if (status >= 500) return codeMap.DATABASE_ERROR;
  return fallback || '操作未完成，請稍後再試。';
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function api(path, options = {}) {
  const token = getToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${API}${path}`, {
      ...options,
      headers
    });
  } catch {
    const error = new Error(readableErrorMessage(0, 'NETWORK_ERROR'));
    error.status = 0;
    error.code = 'NETWORK_ERROR';
    throw error;
  }

  const text = await res.text();

  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const message = readableErrorMessage(
      res.status,
      data?.code || '',
      data?.error || data?.message || ''
    );

    const error = new Error(message);
    error.status = res.status;
    error.code = data?.code || '';
    throw error;
  }

  return data;
}
