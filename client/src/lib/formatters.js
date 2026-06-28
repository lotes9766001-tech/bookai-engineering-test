import { safeText, toNumberOrZeroDisplay } from './sanitize';

export function formatDate(value, fallback = '尚未設定') {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function money(value) {
  const amount = toNumberOrZeroDisplay(value);
  return `NT$ ${amount.toLocaleString()}`;
}

export function rate(part, total) {
  const totalNumber = Number(total || 0);
  const partNumber = Number(part || 0);
  if (!Number.isFinite(totalNumber) || !Number.isFinite(partNumber) || totalNumber === 0) return '-';
  return `${Math.round((partNumber / totalNumber) * 1000) / 10}%`;
}

export function safeCopyValue(value, fallback = '-') {
  return safeText(value, fallback);
}

export function taxRateText(value) {
  const rateValue = Number(value);
  if (!Number.isFinite(rateValue)) return '-';
  return `${Math.round(rateValue * 1000) / 10}%`;
}
