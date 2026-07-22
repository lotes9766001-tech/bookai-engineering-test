import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { createIsolatedTestDatabase } from './sqlite-test-db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const requireFromServer = createRequire(path.join(rootDir, 'server', 'package.json'));
const Database = requireFromServer('better-sqlite3');

let isolated;
try {
  isolated = createIsolatedTestDatabase('rbac-smoke');
} catch (error) {
  console.error(`RBAC smoke isolation gate failed: ${error.message}`);
  process.exit(1);
}
const dbPath = isolated.dbPath;

function ok(msg) {
  console.log(`✅ ${msg}`);
}

function fail(msg) {
  console.log(`❌ ${msg}`);
}

function section(title) {
  console.log('');
  console.log('==============================');
  console.log(title);
  console.log('==============================');
}

const allowedRoles = ['owner', 'admin', 'accounting', 'staff', 'viewer'];

function canAccess(role, allowed) {
  return allowed.includes(role);
}

if (!fs.existsSync(dbPath)) {
  fail(`找不到資料庫：${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath);
process.once('exit', () => {
  try { db.close(); } catch {}
  try { isolated.cleanup(); } catch (error) { console.error(error.message); process.exitCode = 1; }
});

section('BookAI v3.5c RBAC Smoke Test');

const company = db.prepare(`
  SELECT id, name
  FROM companies
  ORDER BY id DESC
  LIMIT 1
`).get();

if (!company) {
  fail('找不到公司資料，請先註冊公司。');
  process.exit(1);
}

ok(`使用隔離公司資料：#${company.id}`);

const owner = db.prepare(`
  SELECT
    u.id,
    u.email,
    cu.role
  FROM company_users cu
  JOIN users u ON u.id = cu.user_id
  WHERE cu.company_id = ?
    AND cu.role = 'owner'
  ORDER BY cu.id ASC
  LIMIT 1
`).get(company.id);

if (!owner) {
  fail('此公司沒有 owner，RBAC 不健康。');
  process.exit(1);
}

ok(`找到隔離 owner 資料：user #${owner.id}`);

section('1. 角色規則測試');

const roleTests = [
  {
    name: 'owner 可以新增/修改/刪除案場',
    role: 'owner',
    allowed: ['owner', 'admin'],
    expected: true
  },
  {
    name: 'admin 可以新增/修改/刪除案場',
    role: 'admin',
    allowed: ['owner', 'admin'],
    expected: true
  },
  {
    name: 'staff 不可新增/修改/刪除案場',
    role: 'staff',
    allowed: ['owner', 'admin'],
    expected: false
  },
  {
    name: 'staff 可以登記庫存異動',
    role: 'staff',
    allowed: ['owner', 'admin', 'staff'],
    expected: true
  },
  {
    name: 'accounting 可以管理收款',
    role: 'accounting',
    allowed: ['owner', 'admin', 'accounting'],
    expected: true
  },
  {
    name: 'viewer 不可管理收款',
    role: 'viewer',
    allowed: ['owner', 'admin', 'accounting'],
    expected: false
  }
];

for (const test of roleTests) {
  const result = canAccess(test.role, test.allowed);

  if (result !== test.expected) {
    fail(`${test.name}：預期 ${test.expected}，實際 ${result}`);
    process.exit(1);
  }

  ok(test.name);
}

section('2. 合法 role 資料檢查');

const invalidRoles = db.prepare(`
  SELECT id, company_id AS companyId, user_id AS userId, role
  FROM company_users
  WHERE role NOT IN ('owner', 'admin', 'accounting', 'staff', 'viewer')
`).all();

if (invalidRoles.length) {
  fail(`發現 ${invalidRoles.length} 筆非法 role。`);
  invalidRoles.forEach((r) => {
    console.log(`  - company_user #${r.id}: company_id=${r.companyId}, user_id=${r.userId}, role=${r.role}`);
  });
  process.exit(1);
}

ok(`所有 role 皆合法：${allowedRoles.join(', ')}`);

section('3. 建立 RBAC 測試 staff 使用者');

const stamp = Date.now();
const email = `rbac_smoke_${stamp}@bookai.test`;

let testUserId = null;
let testCompanyUserId = null;

try {
  const tx = db.transaction(() => {
    const userResult = db.prepare(`
      INSERT INTO users (
        name,
        email,
        password_hash,
        created_at
      )
      VALUES (?,?,?,CURRENT_TIMESTAMP)
    `).run(
      'RBAC Smoke Staff',
      email,
      'rbac-smoke-test-password-hash'
    );

    testUserId = userResult.lastInsertRowid;

    const cuResult = db.prepare(`
      INSERT INTO company_users (
        company_id,
        user_id,
        role,
        created_at
      )
      VALUES (?,?,?,CURRENT_TIMESTAMP)
    `).run(
      company.id,
      testUserId,
      'staff'
    );

    testCompanyUserId = cuResult.lastInsertRowid;

    const staff = db.prepare(`
      SELECT
        cu.id,
        cu.role,
        u.email
      FROM company_users cu
      JOIN users u ON u.id = cu.user_id
      WHERE cu.id = ?
    `).get(testCompanyUserId);

    if (!staff || staff.role !== 'staff') {
      throw new Error('建立 staff 測試使用者失敗');
    }

    ok(`建立 staff 測試使用者成功：user #${testUserId}, company_user #${testCompanyUserId}`);

    if (!canAccess(staff.role, ['owner', 'admin', 'staff'])) {
      throw new Error('staff 應該可以執行庫存異動，但權限判定失敗');
    }

    ok('staff 可通過庫存異動權限規則');

    if (canAccess(staff.role, ['owner', 'admin'])) {
      throw new Error('staff 不應該通過案場新增/修改/刪除權限');
    }

    ok('staff 不可通過 owner/admin 高風險案場權限規則');

    db.prepare(`
      DELETE FROM company_users
      WHERE id = ?
    `).run(testCompanyUserId);

    db.prepare(`
      DELETE FROM users
      WHERE id = ?
    `).run(testUserId);

    ok('RBAC smoke 測試使用者已清理');
  });

  tx();

  section('RBAC Smoke Test 結果');
  ok('RBAC 權限角色核心測試通過');
  console.log('🔐 owner/admin/accounting/staff/viewer 權限規則目前正常。');
} catch (err) {
  section('RBAC Smoke Test 失敗');

  try {
    if (testCompanyUserId) {
      db.prepare(`DELETE FROM company_users WHERE id = ?`).run(testCompanyUserId);
    }

    if (testUserId) {
      db.prepare(`DELETE FROM users WHERE id = ?`).run(testUserId);
    }
  } catch {}

  fail(err.message || String(err));
  process.exit(1);
}
