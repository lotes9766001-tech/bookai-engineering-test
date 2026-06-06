import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

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

section('BookAI v3.5b 健康檢查');

if (!fs.existsSync(dbPath)) {
  fail(`找不到 SQLite 資料庫：${dbPath}`);
  process.exit(1);
}

ok(`SQLite 資料庫存在：${dbPath}`);

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
  'products',
  'job_sites',
  'job_site_payments',
  'inventory_movements',
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
    'created_at'
  ],
  companies: [
    'id',
    'name',
    'tax_id',
    'industry',
    'plan',
    'owner_id',
    'created_at'
  ],
  company_users: [
    'id',
    'company_id',
    'user_id',
    'role',
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
  products: countRows('products'),
  job_sites: countRows('job_sites'),
  job_site_payments: countRows('job_site_payments'),
  inventory_movements: countRows('inventory_movements'),
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
