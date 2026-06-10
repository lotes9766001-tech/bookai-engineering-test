import { db, initDb } from '../server/db.js';

const allowedStatuses = new Set(['trial', 'active', 'expired', 'paused']);
const allowedPlans = new Set([
  'engineering_trial',
  'engineering_starter',
  'engineering_pro',
  'engineering_premium'
]);

function parseArgs(argv) {
  const args = {};

  for (let i = 2; i < argv.length; i += 1) {
    const item = argv[i];

    if (!item.startsWith('--')) {
      continue;
    }

    const key = item.slice(2);
    const next = argv[i + 1];

    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }

  return args;
}

function fail(message) {
  console.error(`開通失敗：${message}`);
  db.close();
  process.exit(1);
}

function parsePaid(value, status) {
  if (value === undefined) {
    return status === 'active' ? 1 : 0;
  }

  const normalized = String(value).trim().toLowerCase();

  if (['1', 'true', 'yes'].includes(normalized)) {
    return 1;
  }

  if (['0', 'false', 'no'].includes(normalized)) {
    return 0;
  }

  fail('--paid 只接受 1 / 0 / true / false / yes / no');
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

const args = parseArgs(process.argv);

initDb();

const companyId = Number(args['company-id']);
const plan = args.plan || 'engineering_pro';
const status = args.status || 'active';
const days = Number(args.days ?? 30);
const note = args.note || '';

if (!companyId || !Number.isInteger(companyId)) {
  fail('請提供有效的 --company-id');
}

if (!allowedPlans.has(plan)) {
  fail(`不支援的 --plan：${plan}`);
}

if (!allowedStatuses.has(status)) {
  fail(`不支援的 --status：${status}`);
}

if (!Number.isFinite(days)) {
  fail('--days 必須是可轉成數字的值');
}

const paid = parsePaid(args.paid, status);
const startedAt = new Date();
const expiresAt = new Date(startedAt);
expiresAt.setDate(expiresAt.getDate() + days);

const company = db.prepare(`
  SELECT id, name
  FROM companies
  WHERE id = ?
`).get(companyId);

if (!company) {
  fail(`找不到 company-id ${companyId}`);
}

db.prepare(`
  UPDATE companies
  SET
    billing_status = ?,
    subscription_plan = ?,
    subscription_started_at = ?,
    subscription_expires_at = ?,
    is_paid_customer = ?,
    billing_note = ?
  WHERE id = ?
`).run(
  status,
  plan,
  formatDate(startedAt),
  formatDate(expiresAt),
  paid,
  note,
  companyId
);

const updated = db.prepare(`
  SELECT
    id,
    name,
    billing_status,
    subscription_plan,
    subscription_started_at,
    subscription_expires_at,
    is_paid_customer,
    billing_note
  FROM companies
  WHERE id = ?
`).get(companyId);

console.log('公司收費狀態已更新');
console.log(`company id: ${updated.id}`);
console.log(`company name: ${updated.name}`);
console.log(`billing_status: ${updated.billing_status}`);
console.log(`subscription_plan: ${updated.subscription_plan}`);
console.log(`subscription_started_at: ${updated.subscription_started_at}`);
console.log(`subscription_expires_at: ${updated.subscription_expires_at}`);
console.log(`is_paid_customer: ${updated.is_paid_customer}`);
console.log(`billing_note: ${updated.billing_note || ''}`);

db.close();
