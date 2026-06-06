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
  console.log('==============================');
  console.log(title);
  console.log('==============================');
}

if (!fs.existsSync(dbPath)) {
  fail(`找不到資料庫：${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath);

section('BookAI v3.4 Smoke Test 清理工具');

const smokeProducts = db.prepare(`
  SELECT id, name
  FROM products
  WHERE name LIKE 'SMOKE_TEST_%'
     OR sku LIKE 'SMOKE-%'
`).all();

const smokeJobSites = db.prepare(`
  SELECT id, COALESCE(site_name, name) AS name
  FROM job_sites
  WHERE name LIKE 'SMOKE_TEST_%'
     OR site_name LIKE 'SMOKE_TEST_%'
     OR note LIKE '%Smoke test%'
`).all();

const smokeProductIds = smokeProducts.map((p) => p.id);
const smokeJobSiteIds = smokeJobSites.map((s) => s.id);

console.log(`找到測試材料：${smokeProducts.length} 筆`);
console.log(`找到測試案場：${smokeJobSites.length} 筆`);

if (!smokeProducts.length && !smokeJobSites.length) {
  warn('目前沒有找到 SMOKE_TEST 測試資料，不需要清理。');
  process.exit(0);
}

const tx = db.transaction(() => {
  let movementDeleted = 0;
  let paymentDeleted = 0;
  let productDeleted = 0;
  let jobSiteDeleted = 0;
  let auditDeleted = 0;

  if (smokeProductIds.length || smokeJobSiteIds.length) {
    const productPlaceholders = smokeProductIds.length ? smokeProductIds.map(() => '?').join(',') : 'NULL';
    const jobSitePlaceholders = smokeJobSiteIds.length ? smokeJobSiteIds.map(() => '?').join(',') : 'NULL';

    const params = [
      ...smokeProductIds,
      ...smokeJobSiteIds
    ];

    const result = db.prepare(`
      DELETE FROM inventory_movements
      WHERE product_id IN (${productPlaceholders})
         OR job_site_id IN (${jobSitePlaceholders})
         OR note LIKE '%Smoke test%'
    `).run(...params);

    movementDeleted = result.changes;
  }

  if (smokeJobSiteIds.length) {
    const placeholders = smokeJobSiteIds.map(() => '?').join(',');

    const paymentResult = db.prepare(`
      DELETE FROM job_site_payments
      WHERE job_site_id IN (${placeholders})
    `).run(...smokeJobSiteIds);

    paymentDeleted = paymentResult.changes;

    const jobResult = db.prepare(`
      DELETE FROM job_sites
      WHERE id IN (${placeholders})
    `).run(...smokeJobSiteIds);

    jobSiteDeleted = jobResult.changes;
  }

  if (smokeProductIds.length) {
    const placeholders = smokeProductIds.map(() => '?').join(',');

    const productResult = db.prepare(`
      DELETE FROM products
      WHERE id IN (${placeholders})
    `).run(...smokeProductIds);

    productDeleted = productResult.changes;
  }

  const auditResult = db.prepare(`
    DELETE FROM audit_logs
    WHERE action = 'smoke_test_completed'
       OR detail LIKE '%Smoke test%'
  `).run();

  auditDeleted = auditResult.changes;

  return {
    movementDeleted,
    paymentDeleted,
    productDeleted,
    jobSiteDeleted,
    auditDeleted
  };
});

const result = tx();

section('清理結果');

ok(`已刪除庫存異動：${result.movementDeleted} 筆`);
ok(`已刪除測試收款：${result.paymentDeleted} 筆`);
ok(`已刪除測試材料：${result.productDeleted} 筆`);
ok(`已刪除測試案場：${result.jobSiteDeleted} 筆`);
ok(`已刪除 smoke audit log：${result.auditDeleted} 筆`);

section('完成');

ok('Smoke Test 測試資料已清理完成。');
console.log('建議接著執行：npm run health');
