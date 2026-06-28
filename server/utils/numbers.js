export function isBlankValue(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

export function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function parseOptionalNumber(value) {
  if (isBlankValue(value)) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function parseRequiredNumber(value, fallback = 0) {
  return safeNumber(value, fallback);
}

export function shouldPatchNumber(value) {
  return parseOptionalNumber(value) !== undefined;
}
