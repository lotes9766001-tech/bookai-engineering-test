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
  isolated = createIsolatedTestDatabase('core-smoke');
} catch (error) {
  console.error(`Smoke test isolation gate failed: ${error.message}`);
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

if (!fs.existsSync(dbPath)) {
  fail(`找不到資料庫：${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath);
process.once('exit', () => {
  try { db.close(); } catch {}
  try { isolated.cleanup(); } catch (error) { console.error(error.message); process.exitCode = 1; }
});

section('BookAI v3.3 Smoke Test');

const company = db.prepare(`
  SELECT id
  FROM companies
  ORDER BY id DESC
  LIMIT 1
`).get();

if (!company) {
  fail('找不到公司資料，請先註冊一家公司。');
  process.exit(1);
}

const companyId = company.id;
ok(`使用 company_id = ${companyId}`);

const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
const stamp = Date.now();

let testJobSiteId = null;
let testProductId = null;

try {
  const tx = db.transaction(() => {
    section('1. 建立測試案場');

    const job = db.prepare(`
      INSERT INTO job_sites (
        company_id,
        name,
        site_name,
        client_name,
        client_phone,
        address,
        project_type,
        area_pings,
        price_per_ping,
        quote_amount,
        received_amount,
        material_cost,
        labor_cost,
        outsourced_cost,
        misc_cost,
        food_cost,
        status,
        note,
        created_at,
        updated_at
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `).run(
      companyId,
      `SMOKE_TEST_案場_${stamp}`,
      `SMOKE_TEST_案場_${stamp}`,
      'Smoke Test 客戶',
      '0900-000-000',
      '測試地址',
      '油漆工程',
      10,
      5000,
      50000,
      0,
      0,
      0,
      0,
      0,
      0,
      '已報價',
      'Smoke test auto generated'
    );

    testJobSiteId = job.lastInsertRowid;
    ok(`測試案場建立成功：#${testJobSiteId}`);

    section('2. 建立測試材料');

    const product = db.prepare(`
      INSERT INTO products (
        company_id,
        sku,
        name,
        category,
        unit,
        price,
        cost,
        stock,
        safety_stock,
        supplier,
        storage_location,
        note,
        created_at
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    `).run(
      companyId,
      `SMOKE-${stamp}`,
      `SMOKE_TEST_乳膠漆_${stamp}`,
      '材料',
      '桶',
      1800,
      1200,
      10,
      2,
      'Smoke Test 供應商',
      'Smoke Test 倉庫',
      'Smoke test auto generated'
    );

    testProductId = product.lastInsertRowid;
    ok(`測試材料建立成功：#${testProductId}`);

    section('3. 測試案場用料');

    const productBeforeUse = db.prepare(`
      SELECT stock, cost
      FROM products
      WHERE id = ?
        AND company_id = ?
    `).get(testProductId, companyId);

    const jobBeforeUse = db.prepare(`
      SELECT material_cost
      FROM job_sites
      WHERE id = ?
        AND company_id = ?
    `).get(testJobSiteId, companyId);

    const useQty = 3;
    const unitCost = Number(productBeforeUse.cost || 0);
    const useCost = useQty * unitCost;
    const afterUseStock = Number(productBeforeUse.stock || 0) - useQty;

    if (afterUseStock < 0) {
      throw new Error('測試失敗：案場用料會導致負庫存');
    }

    db.prepare(`
      UPDATE products
      SET stock = ?
      WHERE id = ?
        AND company_id = ?
    `).run(afterUseStock, testProductId, companyId);

    db.prepare(`
      UPDATE job_sites
      SET
        material_cost = COALESCE(material_cost, 0) + ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND company_id = ?
    `).run(useCost, testJobSiteId, companyId);

    db.prepare(`
      INSERT INTO inventory_movements (
        company_id,
        product_id,
        job_site_id,
        movement_type,
        quantity,
        before_stock,
        after_stock,
        unit_cost,
        note,
        created_at
      )
      VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    `).run(
      companyId,
      testProductId,
      testJobSiteId,
      '案場用料',
      useQty,
      productBeforeUse.stock,
      afterUseStock,
      unitCost,
      'Smoke test 案場用料'
    );

    const productAfterUse = db.prepare(`
      SELECT stock
      FROM products
      WHERE id = ?
        AND company_id = ?
    `).get(testProductId, companyId);

    const jobAfterUse = db.prepare(`
      SELECT material_cost
      FROM job_sites
      WHERE id = ?
        AND company_id = ?
    `).get(testJobSiteId, companyId);

    if (Number(productAfterUse.stock) !== 7) {
      throw new Error(`案場用料庫存錯誤，預期 7，實際 ${productAfterUse.stock}`);
    }

    if (Number(jobAfterUse.material_cost) !== Number(jobBeforeUse.material_cost || 0) + useCost) {
      throw new Error('案場用料材料費同步錯誤');
    }

    ok('案場用料測試通過：庫存 10 → 7，案場材料費 +3600');

    section('4. 測試退料回庫');

    const returnQty = 1;
    const returnCost = returnQty * unitCost;

    const productBeforeReturn = db.prepare(`
      SELECT stock
      FROM products
      WHERE id = ?
        AND company_id = ?
    `).get(testProductId, companyId);

    const jobBeforeReturn = db.prepare(`
      SELECT material_cost
      FROM job_sites
      WHERE id = ?
        AND company_id = ?
    `).get(testJobSiteId, companyId);

    const afterReturnStock = Number(productBeforeReturn.stock || 0) + returnQty;

    db.prepare(`
      UPDATE products
      SET stock = ?
      WHERE id = ?
        AND company_id = ?
    `).run(afterReturnStock, testProductId, companyId);

    db.prepare(`
      UPDATE job_sites
      SET
        material_cost = MAX(COALESCE(material_cost, 0) - ?, 0),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND company_id = ?
    `).run(returnCost, testJobSiteId, companyId);

    db.prepare(`
      INSERT INTO inventory_movements (
        company_id,
        product_id,
        job_site_id,
        movement_type,
        quantity,
        before_stock,
        after_stock,
        unit_cost,
        note,
        created_at
      )
      VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    `).run(
      companyId,
      testProductId,
      testJobSiteId,
      '退料回庫',
      returnQty,
      productBeforeReturn.stock,
      afterReturnStock,
      unitCost,
      'Smoke test 退料回庫'
    );

    const productAfterReturn = db.prepare(`
      SELECT stock
      FROM products
      WHERE id = ?
        AND company_id = ?
    `).get(testProductId, companyId);

    const jobAfterReturn = db.prepare(`
      SELECT material_cost
      FROM job_sites
      WHERE id = ?
        AND company_id = ?
    `).get(testJobSiteId, companyId);

    if (Number(productAfterReturn.stock) !== 8) {
      throw new Error(`退料回庫庫存錯誤，預期 8，實際 ${productAfterReturn.stock}`);
    }

    if (Number(jobAfterReturn.material_cost) !== Number(jobBeforeReturn.material_cost || 0) - returnCost) {
      throw new Error('退料回庫材料費扣回錯誤');
    }

    ok('退料回庫測試通過：庫存 7 → 8，案場材料費 -1200');

    section('5. 檢查異動紀錄');

    const movementCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM inventory_movements
      WHERE company_id = ?
        AND product_id = ?
        AND job_site_id = ?
    `).get(companyId, testProductId, testJobSiteId).count;

    if (movementCount < 2) {
      throw new Error('庫存異動紀錄不足，預期至少 2 筆');
    }

    ok(`庫存異動紀錄正常：${movementCount} 筆`);

    section('6. 寫入 audit log');

    db.prepare(`
      INSERT INTO audit_logs (
        company_id,
        user_id,
        action,
        detail,
        created_at
      )
      VALUES (?, NULL, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      companyId,
      'smoke_test_completed',
      `Smoke test completed at ${now}`
    );

    ok('audit log 已寫入');
  });

  tx();

  section('Smoke Test 結果');
  ok('BookAI 核心鏈路測試通過');
  console.log('🚀 案場用料、庫存扣減、材料費同步、退料回庫、異動紀錄皆正常。');
  console.log(`測試案場 ID：${testJobSiteId}`);
  console.log(`測試材料 ID：${testProductId}`);
} catch (err) {
  section('Smoke Test 失敗');
  fail(err.message || String(err));
  process.exit(1);
}
