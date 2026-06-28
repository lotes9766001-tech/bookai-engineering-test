export function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

export function normalizePatchValue(value, normalizer) {
  if (value === undefined || value === null) return undefined;
  return typeof normalizer === 'function' ? normalizer(value) : value;
}

export function pickDefinedPatchFields(body = {}, fields = []) {
  const updates = new Map();
  for (const [inputKey, column, normalize] of fields) {
    if (!hasOwn(body, inputKey)) continue;
    const normalized = normalizePatchValue(body[inputKey], normalize);
    if (normalized === undefined) continue;
    updates.set(column, normalized);
  }
  return updates;
}

export function buildPatchSet(updates, placeholder = '?') {
  const entries = Array.from(updates.entries());
  const setSql = entries
    .map(([column], index) => `${column} = ${placeholder === '$' ? `$${index + 1}` : placeholder}`)
    .join(', ');
  const values = entries.map(([, value]) => value);
  return { entries, setSql, values };
}
