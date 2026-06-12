import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const nodeEnv = process.env.NODE_ENV || 'development';
const databaseUrl = process.env.DATABASE_URL || '';
const dbProvider = databaseUrl ? 'postgresql' : 'sqlite';
const dbPath = process.env.DB_PATH || path.join(rootDir, 'server', 'bookai.sqlite');

function ok(msg) {
  console.log(`✅ ${msg}`);
}

function warn(msg) {
  console.log(`⚠️  ${msg}`);
}

function fail(msg) {
  console.log(`❌ ${msg}`);
}

function section(title) {
  console.log('');
  console.log(`==============================`);
  console.log(title);
  console.log(`==============================`);
}

let hasError = false;

section('BookAI v5.6 Commercial Readiness 健康檢查');

if (!fs.existsSync(dbPath)) {
  fail(`找不到 SQLite 資料庫：${dbPath}`);
  process.exit(1);
}

ok(`SQLite 資料庫存在：${dbPath}`);
ok(`NODE_ENV：${nodeEnv}`);
ok(`DB Provider：${dbProvider}`);

if (databaseUrl) {
  ok('DATABASE_URL 已設定；正式 PostgreSQL 遷移前仍會檢查 SQLite 相容資料表。');
}

if (nodeEnv === 'production' && dbProvider === 'sqlite' && !dbPath.startsWith('/data/')) {
  warn('Production 目前使用 SQLite fallback，Render Free 可啟動，但資料可能不會永久保存。');
} else if (nodeEnv === 'production' && dbProvider === 'sqlite') {
  ok('Production SQLite path 使用 /data persistent path。');
}

const stat = fs.statSync(dbPath);
ok(`資料庫大小：約 ${Math.round(stat.size / 1024)} KB`);

const db = new Database(dbPath, { readonly: true });

function tableExists(name) {
  const row = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name = ?
  `).get(name);

  return Boolean(row);
}

function getColumns(table) {
  if (!tableExists(table)) return [];
  return db.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name);
}

function countRows(table) {
  if (!tableExists(table)) return 0;
  return db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
}

const requiredTables = [
  'users',
  'companies',
  'company_users',
  'company_feature_overrides',
  'user_login_logs',
  'visitor_logs',
  'traffic_events',
  'products',
  'suppliers',
  'customers',
  'purchases',
  'purchase_items',
  'sales',
  'sale_items',
  'sale_receipts',
  'purchase_payments',
  'job_sites',
  'job_site_payments',
  'inventory_movements',
  'feedbacks',
  'audit_logs'
];

section('資料表檢查');

for (const table of requiredTables) {
  if (tableExists(table)) {
    ok(`資料表存在：${table}`);
  } else {
    hasError = true;
    fail(`缺少資料表：${table}`);
  }
}

const requiredColumns = {
  users: [
    'id',
    'name',
    'email',
    'password_hash',
    'last_login_at',
    'created_source',
    'created_utm_source',
    'login_count',
    'created_at'
  ],
  companies: [
    'id',
    'name',
    'tax_id',
    'industry',
    'plan',
    'owner_id',
    'is_tester',
    'tester_started_at',
    'tester_note',
    'tester_feedback_status',
    'created_at'
  ],
  company_users: [
    'id',
    'company_id',
    'user_id',
    'role',
    'created_at'
  ],
  company_feature_overrides: [
    'id',
    'company_id',
    'feature_key',
    'enabled',
    'note',
    'updated_at'
  ],
  user_login_logs: [
    'id',
    'user_id',
    'email',
    'ip',
    'user_agent',
    'status',
    'fail_reason',
    'created_at'
  ],
  visitor_logs: [
    'id',
    'visitor_id',
    'page',
    'referrer',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'source',
    'ip',
    'user_agent',
    'created_at'
  ],
  traffic_events: [
    'id',
    'visitor_id',
    'user_id',
    'event_type',
    'source',
    'page',
    'referrer',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'ip',
    'user_agent',
    'created_at'
  ],
  products: [
    'id',
    'company_id',
    'sku',
    'name',
    'category',
    'unit',
    'price',
    'cost',
    'stock',
    'safety_stock',
    'supplier',
    'storage_location',
    'note'
  ],
  suppliers: [
    'id',
    'company_id',
    'name',
    'phone',
    'email',
    'tax_id',
    'address',
    'contact_person',
    'note',
    'created_at'
  ],
  customers: [
    'id',
    'company_id',
    'name',
    'phone',
    'email',
    'tax_id',
    'address',
    'contact_person',
    'note',
    'created_at'
  ],
  purchases: [
    'id',
    'company_id',
    'supplier_id',
    'supplier_name',
    'purchase_no',
    'purchase_date',
    'category',
    'subtotal',
    'tax',
    'total',
    'payment_status',
    'paid_amount',
    'status',
    'note',
    'created_at'
  ],
  purchase_items: [
    'id',
    'company_id',
    'purchase_id',
    'product_id',
    'item_name',
    'quantity',
    'unit',
    'unit_cost',
    'subtotal',
    'note',
    'created_at'
  ],
  sales: [
    'id',
    'company_id',
    'customer_id',
    'customer_name',
    'sale_no',
    'sale_date',
    'category',
    'subtotal',
    'tax',
    'total',
    'collection_status',
    'received_amount',
    'status',
    'note',
    'created_at'
  ],
  sale_items: [
    'id',
    'company_id',
    'sale_id',
    'product_id',
    'item_name',
    'quantity',
    'unit',
    'unit_price',
    'subtotal',
    'note',
    'created_at'
  ],
  sale_receipts: [
    'id',
    'company_id',
    'sale_id',
    'amount',
    'receipt_date',
    'method',
    'note',
    'created_at'
  ],
  purchase_payments: [
    'id',
    'company_id',
    'purchase_id',
    'amount',
    'payment_date',
    'method',
    'note',
    'created_at'
  ],
  feedbacks: [
    'id',
    'company_id',
    'user_id',
    'category',
    'rating',
    'message',
    'page',
    'status',
    'admin_note',
    'created_at',
    'updated_at'
  ],
  job_sites: [
    'id',
    'company_id',
    'name',
    'site_name',
    'client_name',
    'client_phone',
    'address',
    'project_type',
    'area_pings',
    'price_per_ping',
    'food_cost',
    'quote_amount',
    'received_amount',
    'material_cost',
    'labor_cost',
    'outsourced_cost',
    'misc_cost',
    'status',
    'note'
  ],
  inventory_movements: [
    'id',
    'company_id',
    'product_id',
    'job_site_id',
    'movement_type',
    'quantity',
    'before_stock',
    'after_stock',
    'unit_cost',
    'note',
    'created_at'
  ],
  job_site_payments: [
    'id',
    'company_id',
    'job_site_id',
    'amount',
    'payment_date',
    'method',
    'note',
    'created_at'
  ]
};

section('核心欄位檢查');

for (const [table, columns] of Object.entries(requiredColumns)) {
  const existing = getColumns(table);

  if (!existing.length) {
    hasError = true;
    fail(`無法檢查欄位，資料表不存在：${table}`);
    continue;
  }

  for (const col of columns) {
    if (existing.includes(col)) {
      ok(`${table}.${col}`);
    } else {
      hasError = true;
      fail(`缺少欄位：${table}.${col}`);
    }
  }
}

section('資料量檢查');

const counts = {
  users: countRows('users'),
  companies: countRows('companies'),
  company_users: countRows('company_users'),
  company_feature_overrides: countRows('company_feature_overrides'),
  user_login_logs: countRows('user_login_logs'),
  visitor_logs: countRows('visitor_logs'),
  traffic_events: countRows('traffic_events'),
  products: countRows('products'),
  suppliers: countRows('suppliers'),
  customers: countRows('customers'),
  purchases: countRows('purchases'),
  purchase_items: countRows('purchase_items'),
  sales: countRows('sales'),
  sale_items: countRows('sale_items'),
  sale_receipts: countRows('sale_receipts'),
  purchase_payments: countRows('purchase_payments'),
  job_sites: countRows('job_sites'),
  job_site_payments: countRows('job_site_payments'),
  inventory_movements: countRows('inventory_movements'),
  feedbacks: countRows('feedbacks'),
  audit_logs: countRows('audit_logs')
};

for (const [table, count] of Object.entries(counts)) {
  console.log(`📦 ${table}: ${count} 筆`);
}

section('核心資料合理性檢查');

if (counts.companies === 0) {
  warn('目前沒有公司資料，請先註冊或建立測試公司。');
} else {
  ok('已有公司資料。');
}

section('RBAC 權限資料檢查');

const allowedRoles = ['owner', 'admin', 'accounting', 'staff', 'viewer'];
const allowedFeatureKeys = [
  'dashboard',
  'purchases',
  'sales',
  'receivables',
  'payables',
  'suppliers',
  'customers',
  'inventory',
  'transactions',
  'invoices',
  'vouchers',
  'reports',
  'leads',
  'jobsites',
  'integrations',
  'commerce_site',
  'accounting_engine',
  'tax_center',
  'accountant_console',
  'feedbacks',
  'settings'
];

if (!tableExists('company_users')) {
  hasError = true;
  fail('缺少 company_users，RBAC 權限系統無法運作。');
} else {
  const invalidRoles = db.prepare(`
    SELECT
      cu.id,
      cu.company_id AS companyId,
      cu.user_id AS userId,
      cu.role
    FROM company_users cu
    WHERE cu.role NOT IN ('owner', 'admin', 'accounting', 'staff', 'viewer')
  `).all();

  if (invalidRoles.length) {
    hasError = true;
    fail(`發現 ${invalidRoles.length} 筆非法 role。`);
    invalidRoles.forEach((r) => {
      console.log(`  - company_user #${r.id}: company_id=${r.companyId}, user_id=${r.userId}, role=${r.role}`);
    });
  } else {
    ok(`company_users.role 皆為合法角色：${allowedRoles.join(', ')}`);
  }

  const companiesWithoutOwner = db.prepare(`
    SELECT
      c.id,
      c.name
    FROM companies c
    LEFT JOIN company_users cu
      ON cu.company_id = c.id
     AND cu.role = 'owner'
    WHERE cu.id IS NULL
  `).all();

  if (companiesWithoutOwner.length) {
    hasError = true;
    fail(`發現 ${companiesWithoutOwner.length} 間公司沒有 owner。`);
    companiesWithoutOwner.forEach((c) => {
      console.log(`  - company #${c.id}: ${c.name}`);
    });
  } else {
    ok('每間公司至少都有一個 owner。');
  }

  const orphanCompanyUsers = db.prepare(`
    SELECT
      cu.id,
      cu.company_id AS companyId,
      cu.user_id AS userId,
      cu.role
    FROM company_users cu
    LEFT JOIN companies c ON c.id = cu.company_id
    LEFT JOIN users u ON u.id = cu.user_id
    WHERE c.id IS NULL
       OR u.id IS NULL
  `).all();

  if (orphanCompanyUsers.length) {
    hasError = true;
    fail(`發現 ${orphanCompanyUsers.length} 筆 company_users 關聯異常。`);
    orphanCompanyUsers.forEach((r) => {
      console.log(`  - company_user #${r.id}: company_id=${r.companyId}, user_id=${r.userId}, role=${r.role}`);
    });
  } else {
    ok('company_users 與 users / companies 關聯正常。');
  }

  if (counts.company_users === 0 && counts.companies > 0) {
    hasError = true;
    fail('已有公司資料，但 company_users 為 0，權限系統資料不完整。');
  } else {
    ok(`company_users 目前共有 ${counts.company_users} 筆角色關聯。`);
  }
}

section('公司功能授權檢查');

if (!tableExists('company_feature_overrides')) {
  hasError = true;
  fail('缺少 company_feature_overrides，系統管理員無法快速調整公司功能授權。');
} else {
  const invalidFeatureRows = db.prepare(`
    SELECT
      id,
      company_id AS companyId,
      feature_key AS featureKey,
      enabled
    FROM company_feature_overrides
    WHERE feature_key NOT IN (${allowedFeatureKeys.map(() => '?').join(',')})
       OR enabled NOT IN (0, 1)
  `).all(...allowedFeatureKeys);

  if (invalidFeatureRows.length) {
    hasError = true;
    fail(`發現 ${invalidFeatureRows.length} 筆非法功能授權資料。`);
    invalidFeatureRows.forEach((row) => {
      console.log(`  - override #${row.id}: company_id=${row.companyId}, feature=${row.featureKey}, enabled=${row.enabled}`);
    });
  } else {
    ok('公司功能授權資料皆為合法 feature key 與 0/1 開關。');
  }
}

if (counts.job_sites === 0) {
  warn('目前沒有案場資料，案場工作台可新增測試案場。');
} else {
  ok('已有案場資料。');
}

if (counts.products === 0) {
  warn('目前沒有材料 / 工具資料，材料庫存 ERP 可新增測試材料。');
} else {
  ok('已有材料 / 工具資料。');
}

if (counts.inventory_movements === 0) {
  warn('目前沒有庫存異動紀錄，可測試進貨入庫、案場用料、退料回庫。');
} else {
  ok('已有庫存異動紀錄。');
}

const negativeStock = tableExists('products')
  ? db.prepare(`
      SELECT id, name, stock
      FROM products
      WHERE stock < 0
    `).all()
  : [];

if (negativeStock.length) {
  hasError = true;
  fail(`發現 ${negativeStock.length} 筆負庫存，請檢查庫存異動。`);
  negativeStock.forEach((p) => {
    console.log(`  - #${p.id} ${p.name}: ${p.stock}`);
  });
} else {
  ok('沒有負庫存。');
}

const negativePurchaseItems = tableExists('purchase_items')
  ? db.prepare(`
      SELECT id, item_name, quantity
      FROM purchase_items
      WHERE quantity < 0
    `).all()
  : [];

if (negativePurchaseItems.length) {
  hasError = true;
  fail(`發現 ${negativePurchaseItems.length} 筆進貨明細數量為負數。`);
  negativePurchaseItems.forEach((item) => {
    console.log(`  - #${item.id} ${item.item_name}: ${item.quantity}`);
  });
} else {
  ok('進貨明細數量沒有負數。');
}

const negativeSaleItems = tableExists('sale_items')
  ? db.prepare(`
      SELECT id, item_name, quantity
      FROM sale_items
      WHERE quantity < 0
    `).all()
  : [];

if (negativeSaleItems.length) {
  hasError = true;
  fail(`發現 ${negativeSaleItems.length} 筆銷貨明細數量為負數。`);
  negativeSaleItems.forEach((item) => {
    console.log(`  - #${item.id} ${item.item_name}: ${item.quantity}`);
  });
} else {
  ok('銷貨明細數量沒有負數。');
}

const badPurchaseTotals = tableExists('purchases')
  ? db.prepare(`
      SELECT id, purchase_no, total
      FROM purchases
      WHERE total IS NULL
        OR typeof(total) NOT IN ('integer', 'real')
    `).all()
  : [];

if (badPurchaseTotals.length) {
  hasError = true;
  fail(`發現 ${badPurchaseTotals.length} 筆進貨單總額異常。`);
  badPurchaseTotals.forEach((row) => {
    console.log(`  - #${row.id} ${row.purchase_no || ''}: ${row.total}`);
  });
} else {
  ok('進貨單總額沒有空值或非數字。');
}

const badSaleTotals = tableExists('sales')
  ? db.prepare(`
      SELECT id, sale_no, total
      FROM sales
      WHERE total IS NULL
        OR typeof(total) NOT IN ('integer', 'real')
    `).all()
  : [];

if (badSaleTotals.length) {
  hasError = true;
  fail(`發現 ${badSaleTotals.length} 筆銷貨單總額異常。`);
  badSaleTotals.forEach((row) => {
    console.log(`  - #${row.id} ${row.sale_no || ''}: ${row.total}`);
  });
} else {
  ok('銷貨單總額沒有空值或非數字。');
}

const badReceipts = tableExists('sale_receipts')
  ? db.prepare(`
      SELECT id, sale_id, amount
      FROM sale_receipts
      WHERE amount <= 0
    `).all()
  : [];

if (badReceipts.length) {
  hasError = true;
  fail(`發現 ${badReceipts.length} 筆收款金額小於或等於 0。`);
} else {
  ok('收款金額皆大於 0。');
}

const badPayments = tableExists('purchase_payments')
  ? db.prepare(`
      SELECT id, purchase_id, amount
      FROM purchase_payments
      WHERE amount <= 0
    `).all()
  : [];

if (badPayments.length) {
  hasError = true;
  fail(`發現 ${badPayments.length} 筆付款金額小於或等於 0。`);
} else {
  ok('付款金額皆大於 0。');
}

const overReceivedSales = tableExists('sales')
  ? db.prepare(`
      SELECT id, sale_no, total, received_amount
      FROM sales
      WHERE COALESCE(received_amount, 0) > COALESCE(total, 0)
    `).all()
  : [];

if (overReceivedSales.length) {
  hasError = true;
  fail(`發現 ${overReceivedSales.length} 筆銷貨單已收款大於總額。`);
} else {
  ok('銷貨單沒有超收。');
}

const overPaidPurchases = tableExists('purchases')
  ? db.prepare(`
      SELECT id, purchase_no, total, paid_amount
      FROM purchases
      WHERE COALESCE(paid_amount, 0) > COALESCE(total, 0)
    `).all()
  : [];

if (overPaidPurchases.length) {
  hasError = true;
  fail(`發現 ${overPaidPurchases.length} 筆進貨單已付款大於總額。`);
} else {
  ok('進貨單沒有超付。');
}

const negativeMaterialCost = tableExists('job_sites')
  ? db.prepare(`
      SELECT id, COALESCE(site_name, name) AS name, material_cost
      FROM job_sites
      WHERE material_cost < 0
    `).all()
  : [];

if (negativeMaterialCost.length) {
  hasError = true;
  fail(`發現 ${negativeMaterialCost.length} 筆案場材料費為負數。`);
  negativeMaterialCost.forEach((s) => {
    console.log(`  - #${s.id} ${s.name}: ${s.material_cost}`);
  });
} else {
  ok('案場材料費沒有負數。');
}

section('檢查結果');

if (hasError) {
  fail('健康檢查發現問題，請先修正上方紅色項目。');
  process.exit(1);
}

ok('BookAI 技術核心健康檢查通過。');
console.log('🚀 系統地基目前穩定，可以進行下一步測試或開發。');
