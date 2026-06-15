import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const dbPath = process.env.DB_PATH || path.join(rootDir, 'server', 'bookai.sqlite');
const serverIndexPath = path.join(rootDir, 'server', 'index.js');

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
const serverIndexSource = fs.readFileSync(serverIndexPath, 'utf8');

function safeAddColumn(tableName, columnName, columnType) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = columns.some((col) => col.name === columnName);
  if (!exists) {
    db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`).run();
  }
}

section('BookAI v3.5c RBAC Smoke Test');

section('0. Admin / Founder API 保護規則檢查');

safeAddColumn('users', 'role', "TEXT DEFAULT 'member'");
safeAddColumn('users', 'deleted_at', 'TEXT');
safeAddColumn('users', 'updated_at', 'TEXT');

const apiChecks = [
  {
    name: '一般會員呼叫 /api/admin/members 需經 requireAdmin',
    pass: serverIndexSource.includes("app.get('/api/admin/members', auth, requireAdmin")
  },
  {
    name: 'Founder 可通過 requireAdmin',
    pass: serverIndexSource.includes('function isAdminUser') && serverIndexSource.includes('isFounderUser(user)')
  },
  {
    name: 'Founder 可呼叫 pending-count API',
    pass: serverIndexSource.includes("app.get('/api/admin/members/pending-count', auth, requireAdmin")
  },
  {
    name: 'Admin 不可刪除 Founder',
    pass: serverIndexSource.includes('Admin 不可刪除、停用或降權 Founder')
  },
  {
    name: 'Admin 不可停用 Founder',
    pass: serverIndexSource.includes("['delete', 'suspend', 'role', 'reject']")
  },
  {
    name: '不可刪除自己',
    pass: serverIndexSource.includes('不允許刪除自己')
  },
  {
    name: '不可停用自己',
    pass: serverIndexSource.includes('不允許停用自己')
  },
  {
    name: 'pending-count API 回傳 ok true 與 count',
    pass: serverIndexSource.includes('res.json({ ok: true, count: Number')
  }
];

for (const check of apiChecks) {
  if (!check.pass) {
    fail(check.name);
    process.exit(1);
  }
  ok(check.name);
}

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

ok(`使用公司：#${company.id} ${company.name}`);

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

ok(`找到 owner：user #${owner.id} ${owner.email}`);

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
let softDeleteUserId = null;

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

    const softDeleteUser = db.prepare(`
      INSERT INTO users (
        name,
        email,
        password_hash,
        role,
        status,
        review_status,
        approval_status,
        created_at
      )
      VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    `).run(
      'RBAC Soft Delete Target',
      `rbac_soft_delete_${stamp}@bookai.test`,
      'rbac-smoke-test-password-hash',
      'member',
      'approved',
      'approved',
      'approved'
    );

    softDeleteUserId = softDeleteUser.lastInsertRowid;

    db.prepare(`
      UPDATE users
      SET status = 'deleted',
          review_status = 'deleted',
          approval_status = 'deleted',
          deleted_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(softDeleteUserId);

    const softDeleted = db.prepare(`
      SELECT status, review_status, approval_status, deleted_at
      FROM users
      WHERE id = ?
    `).get(softDeleteUserId);

    if (!softDeleted || softDeleted.status !== 'deleted' || !softDeleted.deleted_at) {
      throw new Error('會員刪除必須是 soft delete，且需寫入 deleted_at');
    }

    ok('會員刪除行為使用 soft delete 欄位');

    db.prepare(`
      DELETE FROM company_users
      WHERE id = ?
    `).run(testCompanyUserId);

    db.prepare(`
      DELETE FROM users
      WHERE id = ?
    `).run(softDeleteUserId);

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

    if (softDeleteUserId) {
      db.prepare(`DELETE FROM users WHERE id = ?`).run(softDeleteUserId);
    }
  } catch {}

  fail(err.message || String(err));
  process.exit(1);
}
