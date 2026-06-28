import { isBlankValue, parseOptionalNumber } from '../utils/numbers.js';
import { hasOwn } from '../utils/patch.js';

function optionalNumber(value) {
  return parseOptionalNumber(value);
}

const JOBSITE_UPDATE_FIELDS = [
  ['siteName', 'name', (value) => String(value || '').trim()],
  ['siteName', 'site_name', (value) => String(value || '').trim()],
  ['name', 'name', (value) => String(value || '').trim()],
  ['name', 'site_name', (value) => String(value || '').trim()],
  ['clientName', 'client_name', (value) => String(value || '')],
  ['clientPhone', 'client_phone', (value) => String(value || '')],
  ['address', 'address', (value) => String(value || '')],
  ['projectType', 'project_type', (value) => String(value || '')],
  ['areaPings', 'area_pings', optionalNumber],
  ['areaPing', 'area_pings', optionalNumber],
  ['paintAreaPing', 'area_pings', optionalNumber],
  ['pricePerPing', 'price_per_ping', optionalNumber],
  ['paintPricePerPing', 'price_per_ping', optionalNumber],
  ['foodCost', 'food_cost', optionalNumber],
  ['quoteAmount', 'quote_amount', optionalNumber],
  ['taxMode', 'tax_mode', (value) => value || 'not_taxed'],
  ['taxRate', 'tax_rate', optionalNumber],
  ['subtotalAmount', 'subtotal_amount', optionalNumber],
  ['taxAmount', 'tax_amount', optionalNumber],
  ['totalAmount', 'total_amount', optionalNumber],
  ['receivedAmount', 'received_amount', optionalNumber],
  ['materialCost', 'material_cost', optionalNumber],
  ['laborCost', 'labor_cost', optionalNumber],
  ['outsourcedCost', 'outsourced_cost', optionalNumber],
  ['miscCost', 'misc_cost', optionalNumber],
  ['status', 'status', (value) => value || '已報價'],
  ['note', 'note', (value) => String(value || '')]
];

const JOBSITE_NUMERIC_COLUMNS = new Set([
  'area_pings',
  'price_per_ping',
  'food_cost',
  'quote_amount',
  'tax_rate',
  'subtotal_amount',
  'tax_amount',
  'total_amount',
  'received_amount',
  'material_cost',
  'labor_cost',
  'outsourced_cost',
  'misc_cost'
]);

export function buildJobSitePatch(body = {}) {
  const updates = new Map();

  for (const [inputKey, column, normalize] of JOBSITE_UPDATE_FIELDS) {
    if (!hasOwn(body, inputKey)) continue;
    const rawValue = body[inputKey];
    if (rawValue === undefined || rawValue === null) continue;
    if (JOBSITE_NUMERIC_COLUMNS.has(column) && isBlankValue(rawValue)) continue;
    if ((inputKey === 'taxMode' || inputKey === 'status') && String(rawValue || '').trim() === '') continue;

    const normalized = normalize(rawValue);
    if (JOBSITE_NUMERIC_COLUMNS.has(column) && !Number.isFinite(normalized)) continue;
    updates.set(column, normalized);
  }

  if (updates.has('name') || updates.has('site_name')) {
    const finalName = String(updates.get('site_name') || updates.get('name') || '').trim();
    if (!finalName) {
      return { error: '請輸入案場名稱' };
    }
    updates.set('name', finalName);
    updates.set('site_name', finalName);
  }

  return { updates };
}
