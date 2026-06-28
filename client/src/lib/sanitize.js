const UNSAFE_ERROR_PATTERN = /failed to fetch|networkerror|syntaxerror|typeerror|referenceerror|undefined|null|\[object Object\]|select |insert |update |delete |database_url|jwt_secret|bootstrap_secret|token|secret|stack|trace/i;

export function safeText(value, fallback = '-') {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return fallback;
  const text = String(value).trim();
  return text && !['undefined', 'null', '[object Object]'].includes(text) ? text : fallback;
}

export function safeTrim(value) {
  return safeText(value, '').trim();
}

export function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

export function toNumberOrEmpty(value) {
  if (isBlank(value)) return '';
  const number = Number(value);
  return Number.isFinite(number) ? number : '';
}

export function toNumberOrZeroDisplay(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

export function cleanApiError(message, fallback = '操作未完成，請確認欄位後再試。') {
  const text = safeTrim(message);
  if (!text || UNSAFE_ERROR_PATTERN.test(text)) return fallback;
  return text;
}
