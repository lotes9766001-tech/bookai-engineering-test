const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const root = process.cwd();
const dbPath = path.join(root, 'server', 'bookai.sqlite');
const serverPath = path.join(root, 'server', 'index.js');
const clientPath = path.join(root, 'client', 'src', 'main.jsx');
const healthPath = path.join(root, 'scripts', 'health-check.js');
const reportPath = path.join(root, 'v3_10_market_ready_audit_report.txt');

const lines = [];

function log(text = '') {
  console.log(text);
  lines.push(String(text));
}

function title(text) {
  log('');
  log('==============================');
  log(text);
  log('==============================');
}

function ok(text) {
  log(`✅ ${text}`);
}

function warn(text) {
  log(`⚠️ ${text}`);
}

function bad(text) {
  log(`❌ ${text}`);
}

function money(value) {
  return `NT$ ${Number(value || 0).toLocaleString('zh-TW')}`;
}

function has(text, pattern) {
  if (!text) return false;
  return pattern.test(text);
}

if (!fs.existsSync(dbPath)) {
  bad(`找不到資料庫：${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath);
const server = fs.existsSync(serverPath) ? fs.readFileSync(serverPath, 'utf8') : '';
const client = fs.existsSync(clientPath) ? fs.readFileSync(clientPath, 'utf8') : '';
const health = fs.existsSync(healthPath) ? fs.readFileSync(healthPath, 'utf8') : '';

let issueCount = 0;
let warningCount = 0;

function addBad(text) {
  issueCount++;
  bad(text);
}

function addWarn(text) {
  warningCount++;
  warn(text);
}

title('BookAI v3.10 市場測試前一次性總檢查');

title('1. 基礎檔案檢查');

if (fs.existsSync(dbPath)) ok(`SQLite 存在：${dbPath}`);
else addBad('SQLite 不存在');

if (fs.existsSync(serverPath)) ok('server/index.js 存在');
else addBad('server/index.js 不存在');

if (fs.existsSync(clientPath)) ok('client/src/main.jsx 存在');
else addBad('client/src/main.jsx 不存在');

if (fs.existsSync(healthPath)) ok('scripts/health-check.js 存在');
else addWarn('scripts/health-check.js 不存在');

title('2. 資料表檢查');

const tables = db.prepare(`
  SELECT name
  FROM sqlite_master
  WHERE type = 'table'
  ORDER BY name
`).all().map(r => r.name);

const requiredTables = [
  'users',
  'companies',
  'company_users',
  'products',
  'job_sites',
  'job_site_payments',
  'inventory_movements',
  'audit_logs',
  'job_site_estimate_items'
];

for (const table of requiredTables) {
  if (tables.includes(table)) ok(`資料表存在：${table}`);
  else addBad(`資料表缺少：${table}`);
}

title('3. job_sites 欄位檢查');

const jobSiteCols = db.prepare(`PRAGMA table_info(job_sites)`).all();
const jobSiteColNames = jobSiteCols.map(c => c.name);

const requiredJobSiteCols = [
  'id',
  'company_id',
  'name',
  'site_name',
  'client_name',
  'client_phone',
  'address',
  'project_type',
  'quote_amount',
  'subtotal_amount',
  'tax_amount',
  'total_amount',
  'estimate_cost_total',
  'received_amount',
  'material_cost',
  'labor_cost',
  'outsourced_cost',
  'misc_cost',
  'food_cost',
  'status',
  'note'
];

for (const col of requiredJobSiteCols) {
  if (jobSiteColNames.includes(col)) ok(`job_sites.${col}`);
  else addBad(`job_sites 缺少欄位：${col}`);
}

title('4. job_site_estimate_items 欄位檢查');

let itemColNames = [];

if (tables.includes('job_site_estimate_items')) {
  const itemCols = db.prepare(`PRAGMA table_info(job_site_estimate_items)`).all();
  itemColNames = itemCols.map(c => c.name);

  const requiredItemCols = [
    'id',
    'company_id',
    'job_site_id',
    'work_type',
    'item_name',
    'quantity',
    'unit_price',
    'amount',
    'cost_amount'
  ];

  for (const col of requiredItemCols) {
    if (itemColNames.includes(col)) ok(`job_site_estimate_items.${col}`);
    else addBad(`job_site_estimate_items 缺少欄位：${col}`);
  }

  if (!itemColNames.includes('unit_cost')) {
    addWarn('job_site_estimate_items 沒有 unit_cost，之後所有計算應以 cost_amount 為主');
  }
} else {
  addBad('無法檢查 job_site_estimate_items，資料表不存在');
}

title('5. 案場主表成本 vs 明細成本一致性');

const hasEstimateCostTotal = jobSiteColNames.includes('estimate_cost_total');
const hasEstimateItems = tables.includes('job_site_estimate_items');

if (hasEstimateItems) {
  const siteRows = db.prepare(`
    SELECT
      js.id,
      js.site_name,
      js.name,
      js.project_type,
      js.quote_amount,
      ${hasEstimateCostTotal ? 'js.estimate_cost_total' : '0'} AS estimate_cost_total,
      js.material_cost,
      js.labor_cost,
      js.outsourced_cost,
      js.misc_cost,
      js.food_cost,
      COUNT(i.id) AS item_count,
      COALESCE(SUM(i.amount), 0) AS item_quote_total,
      COALESCE(SUM(i.cost_amount), 0) AS item_cost_total
    FROM job_sites js
    LEFT JOIN job_site_estimate_items i
      ON i.company_id = js.company_id
     AND i.job_site_id = js.id
    GROUP BY js.id
    ORDER BY js.id DESC
  `).all();

  let mismatchSites = [];
  let noItemSites = [];
  let itemZeroCostSites = [];
  let quoteMismatchSites = [];

  for (const row of siteRows) {
    const siteName = row.site_name || row.name || '(未命名)';
    const quote = Number(row.quote_amount || 0);
    const masterCost = Number(row.estimate_cost_total || 0);
    const itemCost = Number(row.item_cost_total || 0);
    const itemQuote = Number(row.item_quote_total || 0);
    const itemCount = Number(row.item_count || 0);

    if (itemCount === 0) {
      noItemSites.push(row);
      continue;
    }

    if (itemCount > 0 && itemQuote > 0 && itemCost === 0) {
      itemZeroCostSites.push(row);
    }

    if (itemCost > 0 && masterCost !== itemCost) {
      mismatchSites.push(row);
    }

    if (itemQuote > 0 && quote !== itemQuote) {
      quoteMismatchSites.push(row);
    }

    log(`#${row.id}｜${siteName}｜${row.project_type || '-'}｜報價 ${money(quote)}｜明細報價 ${money(itemQuote)}｜主表明細成本 ${money(masterCost)}｜明細成本 ${money(itemCost)}`);
  }

  if (mismatchSites.length === 0) ok('有明細成本的案場，主表 estimate_cost_total 與明細 cost_amount 合計一致');
  else {
    addBad(`${mismatchSites.length} 個案場：主表 estimate_cost_total 與明細 cost_amount 合計不一致`);
    mismatchSites.slice(0, 10).forEach(row => {
      log(`  - #${row.id} ${row.site_name || row.name}｜主表 ${money(row.estimate_cost_total)}｜明細 ${money(row.item_cost_total)}`);
    });
  }

  if (itemZeroCostSites.length === 0) ok('沒有發現「有明細報價但明細成本為 0」的案場');
  else {
    addWarn(`${itemZeroCostSites.length} 個案場有明細報價但明細成本為 0`);
    itemZeroCostSites.slice(0, 10).forEach(row => {
      log(`  - #${row.id} ${row.site_name || row.name}｜明細報價 ${money(row.item_quote_total)}｜明細成本 ${money(row.item_cost_total)}`);
    });
  }

  if (quoteMismatchSites.length === 0) ok('案場報價與明細報價一致，或該案場沒有明細');
  else {
    addWarn(`${quoteMismatchSites.length} 個案場：案場 quote_amount 與明細 amount 合計不一致`);
    quoteMismatchSites.slice(0, 10).forEach(row => {
      log(`  - #${row.id} ${row.site_name || row.name}｜案場報價 ${money(row.quote_amount)}｜明細報價 ${money(row.item_quote_total)}`);
    });
  }

  addWarn(`${noItemSites.length} 個案場目前沒有估價明細，可能是舊測試案場或手動報價案場`);
}

title('6. 工種統計');

if (hasEstimateItems) {
  const typeRows = db.prepare(`
    SELECT
      COALESCE(js.project_type, '(未分類)') AS project_type,
      COUNT(DISTINCT js.id) AS site_count,
      COUNT(i.id) AS item_count,
      COALESCE(SUM(i.amount), 0) AS total_quote_items,
      COALESCE(SUM(i.cost_amount), 0) AS total_cost_items
    FROM job_sites js
    LEFT JOIN job_site_estimate_items i
      ON i.company_id = js.company_id
     AND i.job_site_id = js.id
    GROUP BY js.project_type
    ORDER BY site_count DESC
  `).all();

  for (const row of typeRows) {
    const status =
      row.item_count > 0 && row.total_cost_items > 0
        ? '✅ 有明細成本'
        : row.item_count > 0 && row.total_cost_items === 0
          ? '❌ 有明細但成本 0'
          : '⚪ 無明細';

    log(`${row.project_type}｜案場 ${row.site_count}｜明細 ${row.item_count}｜明細報價 ${money(row.total_quote_items)}｜明細成本 ${money(row.total_cost_items)}｜${status}`);
  }
}

title('7. 指定測試案場：v3.10 / 計算測試');

if (hasEstimateItems) {
  const testRows = db.prepare(`
    SELECT
      js.id,
      js.site_name,
      js.name,
      js.project_type,
      js.quote_amount,
      ${hasEstimateCostTotal ? 'js.estimate_cost_total' : '0'} AS estimate_cost_total,
      js.material_cost,
      js.labor_cost,
      js.outsourced_cost,
      js.misc_cost,
      js.food_cost,
      COUNT(i.id) AS item_count,
      COALESCE(SUM(i.amount), 0) AS item_quote_total,
      COALESCE(SUM(i.cost_amount), 0) AS item_cost_total
    FROM job_sites js
    LEFT JOIN job_site_estimate_items i
      ON i.company_id = js.company_id
     AND i.job_site_id = js.id
    WHERE js.site_name LIKE '%v3.10%'
       OR js.name LIKE '%v3.10%'
       OR js.site_name LIKE '%計算測試%'
       OR js.name LIKE '%計算測試%'
    GROUP BY js.id
    ORDER BY js.id DESC
  `).all();

  if (testRows.length === 0) {
    addWarn('找不到 v3.10 或 計算測試案場');
  }

  for (const row of testRows) {
    const extraCost =
      Number(row.material_cost || 0) +
      Number(row.labor_cost || 0) +
      Number(row.outsourced_cost || 0) +
      Number(row.misc_cost || 0);

    const correctCoreCost = Number(row.item_cost_total || 0) + extraCost;
    const profit = Number(row.quote_amount || 0) - correctCoreCost;
    const marginRate = Number(row.quote_amount || 0)
      ? Math.round((profit / Number(row.quote_amount || 0)) * 1000) / 10
      : 0;

    log('');
    log(`#${row.id}｜${row.site_name || row.name}`);
    log(`工程類型：${row.project_type || '-'}`);
    log(`報價：${money(row.quote_amount)}`);
    log(`主表 estimate_cost_total：${money(row.estimate_cost_total)}`);
    log(`明細報價合計：${money(row.item_quote_total)}`);
    log(`明細成本合計：${money(row.item_cost_total)}`);
    log(`額外成本：${money(extraCost)}，材料/工資/外包/雜支，不含伙食`);
    log(`正確核心成本：${money(correctCoreCost)}`);
    log(`正確毛利：${money(profit)}`);
    log(`正確毛利率：${marginRate}%`);

    if (Number(row.item_cost_total || 0) > 0 && Number(row.estimate_cost_total || 0) === Number(row.item_cost_total || 0)) {
      ok(`#${row.id} 明細成本同步 OK`);
    } else if (Number(row.item_count || 0) > 0 && Number(row.item_cost_total || 0) === 0) {
      addBad(`#${row.id} 有估價明細，但 cost_amount 合計為 0`);
    } else if (Number(row.item_cost_total || 0) !== Number(row.estimate_cost_total || 0)) {
      addBad(`#${row.id} 主表 estimate_cost_total 與明細成本不一致`);
    }
  }
}

title('8. 最新 40 筆估價明細');

if (hasEstimateItems && itemColNames.length > 0) {
  const selectCols = [
    'id',
    'company_id',
    'job_site_id',
    itemColNames.includes('work_type') ? 'work_type' : null,
    itemColNames.includes('item_name') ? 'item_name' : null,
    itemColNames.includes('name') ? 'name' : null,
    itemColNames.includes('quantity') ? 'quantity' : null,
    itemColNames.includes('unit_price') ? 'unit_price' : null,
    itemColNames.includes('amount') ? 'amount' : null,
    itemColNames.includes('cost_amount') ? 'cost_amount' : null,
    itemColNames.includes('unit_cost') ? 'unit_cost' : null,
    itemColNames.includes('internal_cost') ? 'internal_cost' : null,
    itemColNames.includes('internal_unit_cost') ? 'internal_unit_cost' : null,
    itemColNames.includes('note') ? 'note' : null,
  ].filter(Boolean);

  const itemRows = db.prepare(`
    SELECT ${selectCols.join(', ')}
    FROM job_site_estimate_items
    ORDER BY id DESC
    LIMIT 40
  `).all();

  for (const row of itemRows) {
    log(JSON.stringify(row));
  }

  const zeroCostCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM job_site_estimate_items
    WHERE COALESCE(amount, 0) > 0
      AND COALESCE(cost_amount, 0) = 0
  `).get().count;

  if (zeroCostCount === 0) ok('估價明細沒有「有報價但成本 0」的資料列');
  else addWarn(`${zeroCostCount} 筆估價明細有報價但成本 0`);
}

title('9. 後端 estimate-items 程式檢查');

const serverChecks = [
  ['refreshJobSiteEstimateTotals 存在', /function\s+refreshJobSiteEstimateTotals/.test(server)],
  ['refresh 有 SUM(amount)', /SUM\(amount\)/.test(server)],
  ['refresh 有 SUM(cost_amount)', /SUM\(cost_amount\)/.test(server)],
  ['refresh 有寫回 estimate_cost_total', /estimate_cost_total\s*=\s*\?/.test(server)],
  ['POST estimate-items 存在', /app\.post\('\/api\/companies\/:companyId\/jobsites\/:jobsiteId\/estimate-items'/.test(server)],
  ['PUT estimate-items 存在', /app\.put\('\/api\/companies\/:companyId\/jobsites\/:jobsiteId\/estimate-items\/:itemId'/.test(server)],
  ['DELETE estimate-items 存在', /app\.delete\('\/api\/companies\/:companyId\/jobsites\/:jobsiteId\/estimate-items\/:itemId'/.test(server)],
  ['後端有 cost_amount 字樣', /cost_amount/.test(server)],
  ['刪除案場會處理 estimate items', /DELETE FROM job_site_estimate_items/.test(server)],
];

for (const [label, pass] of serverChecks) {
  pass ? ok(label) : addBad(label);
}

title('10. 前端 main.jsx 程式檢查');

const clientChecks = [
  ['沒有 async async', !/async\s+async\s+function/.test(client)],
  ['normalizePayload 支援 estimate_cost_total', /estimateCostTotal:\s*numberValue\(data\.estimateCostTotal\s*\?\?\s*data\.estimate_cost_total/.test(client)],
  ['calc(site) 支援 estimate_cost_total', /site\.estimateCostTotal\s*\?\?\s*site\.estimate_cost_total/.test(client)],
  ['複製文字支援 cost_amount', /item\.cost_amount/.test(client)],
  ['copyJobSiteText 是 async', /async\s+function\s+copyJobSiteText/.test(client)],
  ['報價複製存在', /報價複製/.test(client)],
  ['請款複製存在', /請款複製/.test(client)],
  ['結案複製存在', /結案複製/.test(client)],
];

for (const [label, pass] of clientChecks) {
  pass ? ok(label) : addBad(label);
}

title('11. health-check.js 是否漏檢新核心欄位');

if (health) {
  if (/estimate_cost_total/.test(health)) {
    ok('health-check.js 已檢查 estimate_cost_total');
  } else {
    addWarn('health-check.js 尚未檢查 job_sites.estimate_cost_total，建議 v3.10-5 補上');
  }

  if (/job_site_estimate_items/.test(health)) {
    ok('health-check.js 已檢查 job_site_estimate_items');
  } else {
    addWarn('health-check.js 尚未檢查 job_site_estimate_items，建議 v3.10-5 補上');
  }
}

title('12. 一次性診斷總結');

if (issueCount === 0 && warningCount === 0) {
  ok('目前沒有發現阻擋市場測試的技術問題');
} else {
  log(`❌ 嚴重問題數：${issueCount}`);
  log(`⚠️ 警告問題數：${warningCount}`);
}

if (issueCount > 0) {
  addBad('尚不建議封版。請先修嚴重問題。');
} else if (warningCount > 0) {
  warn('可進行功能測試，但建議修完警告後再封市場測試版。');
} else {
  ok('可進入市場測試前封版檢查。');
}

fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
log('');
log(`📄 已輸出報告：${reportPath}`);
