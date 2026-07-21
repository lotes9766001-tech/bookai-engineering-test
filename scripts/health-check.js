import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const requireFromServer = createRequire(path.join(rootDir, 'server', 'package.json'));
const Database = requireFromServer('better-sqlite3');

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

section('Render 啟動設定檢查');

const serverIndexPath = path.join(rootDir, 'server', 'index.js');
const serverPgDbPath = path.join(rootDir, 'server', 'pg-db.js');
const serverPackageLockPath = path.join(rootDir, 'server', 'package-lock.json');
const serverIndexSource = fs.readFileSync(serverIndexPath, 'utf8');
const serverPgDbSource = fs.readFileSync(serverPgDbPath, 'utf8');

if (
  serverIndexSource.includes("app.listen(PORT, '0.0.0.0'") ||
  serverIndexSource.includes('app.listen(PORT, "0.0.0.0"') ||
  (serverIndexSource.includes("const HOST = '0.0.0.0'") && serverIndexSource.includes('app.listen(PORT, HOST'))
) {
  ok('server/index.js 明確監聽 0.0.0.0');
} else {
  hasError = true;
  fail('server/index.js 未明確使用 app.listen(PORT, 0.0.0.0)');
}

if (serverIndexSource.includes("app.get('/api/health'") && serverIndexSource.includes('database: {') && serverIndexSource.includes('requiredEnv')) {
  ok('/api/health 包含資料庫與必要環境狀態欄位');
} else {
  hasError = true;
  fail('/api/health 缺少 PostgreSQL 診斷欄位');
}

if (serverPgDbSource.includes('process.env.DATABASE_URL') && serverPgDbSource.includes('rejectUnauthorized: false')) {
  ok('server/pg-db.js 使用 DATABASE_URL 並支援 Render/Supabase SSL');
} else {
  hasError = true;
  fail('server/pg-db.js PostgreSQL 連線設定不完整');
}

if (fs.existsSync(serverPackageLockPath)) {
  const serverPackageLock = fs.readFileSync(serverPackageLockPath, 'utf8');
  if (serverPackageLock.includes('"node_modules/pg"') || serverPackageLock.includes('"pg":')) {
    ok('server/package-lock.json 已包含 pg dependency');
  } else {
    hasError = true;
    fail('server/package-lock.json 未包含 pg dependency');
  }
} else {
  hasError = true;
  fail('缺少 server/package-lock.json');
}

const pgCoreTables = [
  'users',
  'companies',
  'company_users',
  'job_sites',
  'job_site_payments',
  'visitor_logs',
  'traffic_events',
  'audit_logs',
  'user_login_logs',
  'products',
  'suppliers',
  'customers',
  'purchases',
  'purchase_items',
  'purchase_payments',
  'sales',
  'sale_items',
  'sale_receipts',
  'transactions',
  'vouchers',
  'invoices',
  'platform_accounts',
  'inventory_movements',
  'leads',
  'job_site_estimate_items',
  'tenders',
  'tender_sync_runs',
  'tender_keywords',
  'tender_watch_keywords',
  'tender_radar_sync_states',
  'tender_matches',
  'website_settings',
  'website_banners',
  'website_home_sections',
  'website_products',
  'website_posts',
  'website_faqs',
  'website_inquiries',
  'website_assets'
];

const pgCoreColumns = {
  users: ['id', 'name', 'email', 'password_hash', 'status', 'review_status', 'approval_status', 'terms_accepted_at', 'terms_version', 'last_login_at', 'created_source', 'created_utm_source', 'login_count', 'phone', 'line_contact', 'contact_name', 'company_stage', 'tax_id', 'created_at', 'updated_at'],
  companies: ['id', 'name', 'tax_id', 'industry', 'plan', 'owner_id', 'review_status', 'approval_status', 'is_active', 'billing_status', 'subscription_plan', 'is_paid_customer', 'contact_name', 'phone', 'line_contact', 'company_stage', 'is_tester', 'tester_feedback_status', 'beta_status', 'is_free_beta', 'beta_group', 'beta_limit_group', 'product_line', 'industry_type', 'beta_approved_at', 'created_at', 'updated_at'],
  company_users: ['id', 'company_id', 'user_id', 'role', 'created_at', 'updated_at'],
  job_sites: ['id', 'company_id', 'name', 'site_name', 'client_name', 'quote_amount', 'received_amount', 'status', 'created_at', 'updated_at'],
  job_site_payments: ['id', 'company_id', 'job_site_id', 'amount', 'payment_date', 'method', 'note', 'created_at'],
  job_site_estimate_items: ['id', 'company_id', 'job_site_id', 'work_type', 'item_category', 'item_name', 'quantity', 'unit', 'unit_price', 'amount', 'cost_amount', 'sort_order', 'created_at', 'updated_at'],
  visitor_logs: ['id', 'visitor_id', 'page', 'referrer', 'utm_source', 'utm_medium', 'utm_campaign', 'source', 'ip', 'user_agent', 'created_at'],
  traffic_events: ['id', 'visitor_id', 'user_id', 'event_type', 'source', 'page', 'referrer', 'utm_source', 'utm_medium', 'utm_campaign', 'ip', 'user_agent', 'created_at'],
  audit_logs: ['id', 'company_id', 'user_id', 'action', 'detail', 'created_at'],
  user_login_logs: ['id', 'user_id', 'email', 'ip', 'user_agent', 'status', 'fail_reason', 'created_at'],
  products: ['id', 'company_id', 'sku', 'name', 'category', 'unit', 'price', 'cost', 'stock', 'supplier', 'storage_location', 'note', 'created_at', 'updated_at'],
  suppliers: ['id', 'company_id', 'name', 'phone', 'email', 'tax_id', 'address', 'contact_person', 'note', 'created_at', 'updated_at'],
  customers: ['id', 'company_id', 'name', 'phone', 'email', 'tax_id', 'address', 'contact_person', 'note', 'created_at', 'updated_at'],
  purchases: ['id', 'company_id', 'purchase_no', 'supplier_id', 'supplier_name', 'purchase_date', 'subtotal', 'tax', 'total', 'paid_amount', 'payment_status', 'status', 'note', 'created_at', 'updated_at'],
  purchase_items: ['id', 'company_id', 'purchase_id', 'product_id', 'item_name', 'quantity', 'unit', 'unit_cost', 'subtotal', 'note', 'created_at'],
  purchase_payments: ['id', 'company_id', 'purchase_id', 'amount', 'payment_date', 'method', 'note', 'created_at'],
  sales: ['id', 'company_id', 'customer_id', 'customer_name', 'sale_no', 'sale_date', 'subtotal', 'tax', 'total', 'collection_status', 'received_amount', 'status', 'note', 'created_at', 'updated_at'],
  sale_items: ['id', 'company_id', 'sale_id', 'product_id', 'item_name', 'quantity', 'unit', 'unit_price', 'subtotal', 'note', 'created_at'],
  sale_receipts: ['id', 'company_id', 'sale_id', 'amount', 'receipt_date', 'method', 'note', 'created_at'],
  transactions: ['id', 'company_id', 'platform_key', 'channel_type', 'external_order_id', 'gross_amount', 'platform_fee', 'cost_of_goods_sold', 'tax_amount', 'net_amount', 'profit', 'occurred_at', 'note', 'created_at'],
  vouchers: ['id', 'company_id', 'type', 'vendor', 'amount', 'tax', 'deductible', 'voucher_date', 'note', 'created_at'],
  invoices: ['id', 'company_id', 'invoice_no', 'invoice_type', 'buyer_name', 'buyer_tax_id', 'amount_excl_tax', 'tax_amount', 'amount_incl_tax', 'status', 'issued_at', 'created_at'],
  platform_accounts: ['id', 'company_id', 'platform_key', 'status', 'last_sync_at', 'created_at', 'updated_at'],
  inventory_movements: ['id', 'company_id', 'product_id', 'job_site_id', 'movement_type', 'quantity', 'before_stock', 'after_stock', 'unit_cost', 'note', 'created_at'],
  leads: ['id', 'company_id', 'title', 'client_name', 'client_phone', 'source', 'region', 'agency_type', 'project_type', 'estimated_amount', 'estimated_cost', 'expected_margin', 'risk_level', 'fit_score', 'status', 'next_action', 'note', 'tender_source', 'tender_ref', 'converted_job_site_id', 'created_at', 'updated_at'],
  tenders: ['id', 'source', 'source_tender_id', 'tender_no', 'tender_name', 'agency_name', 'agency_level', 'region', 'category', 'budget_amount', 'publish_date', 'deadline_date', 'status', 'url', 'created_at', 'updated_at', 'last_seen_at'],
  tender_sync_runs: ['id', 'source', 'started_at', 'finished_at', 'status', 'fetched_count', 'inserted_count', 'updated_count', 'error_count', 'error_message', 'created_at'],
  tender_keywords: ['id', 'keyword', 'category', 'product_line', 'enabled', 'created_at'],
  tender_watch_keywords: ['id', 'company_id', 'keyword', 'region', 'category', 'min_budget', 'max_budget', 'is_active', 'created_at', 'updated_at'],
  tender_radar_sync_states: ['id', 'company_id', 'status', 'last_synced_at', 'next_suggested_sync_at', 'error_message', 'created_at', 'updated_at'],
  tender_matches: ['id', 'tender_id', 'company_id', 'keyword', 'score', 'matched_reason', 'created_at'],
  website_settings: ['id', 'company_id', 'site_slug', 'site_name', 'brand_name', 'is_published', 'created_at', 'updated_at'],
  website_banners: ['id', 'company_id', 'title', 'image_url', 'sort_order', 'is_active', 'created_at', 'updated_at'],
  website_home_sections: ['id', 'company_id', 'section_type', 'title', 'sort_order', 'is_active', 'created_at', 'updated_at'],
  website_products: ['id', 'company_id', 'name', 'slug', 'status', 'is_featured', 'created_at', 'updated_at'],
  website_posts: ['id', 'company_id', 'title', 'slug', 'status', 'published_at', 'created_at', 'updated_at'],
  website_faqs: ['id', 'company_id', 'question', 'answer', 'is_active', 'created_at', 'updated_at'],
  website_inquiries: ['id', 'company_id', 'name', 'email', 'message', 'status', 'created_at', 'updated_at'],
  website_assets: ['id', 'company_id', 'file_url', 'file_name', 'file_type', 'module', 'created_by', 'created_at', 'updated_at']
};

if (databaseUrl) {
  const { Pool } = await import('pg');
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('sslmode=disable') ? false : { rejectUnauthorized: false }
  });

  try {
    await pool.query('SELECT 1');
    ok('PostgreSQL 連線成功');
    ok('DB Provider：postgresql');
    ok('Storage：postgresql');

    section('PostgreSQL 核心資料表檢查');

    for (const table of pgCoreTables) {
      const exists = await pool.query(`
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
      `, [table]);

      if (exists.rowCount) {
        ok(`資料表存在：${table}`);
      } else {
        hasError = true;
        fail(`缺少 PostgreSQL 資料表：${table}`);
      }
    }

    section('PostgreSQL 欄位檢查');

    for (const [table, columns] of Object.entries(pgCoreColumns)) {
      const rows = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
      `, [table]);
      const actual = new Set(rows.rows.map((row) => row.column_name));

      for (const column of columns) {
        if (actual.has(column.toLowerCase())) {
          ok(`${table}.${column}`);
        } else {
          hasError = true;
          fail(`缺少欄位：${table}.${column}`);
        }
      }
    }

    section('PostgreSQL 資料品質檢查');
    const negativePayment = await pool.query('SELECT COUNT(*)::int AS count FROM job_site_payments WHERE amount < 0');
    if ((negativePayment.rows[0]?.count || 0) === 0) {
      ok('案場收款金額沒有負數');
    } else {
      hasError = true;
      fail('發現案場收款金額為負數');
    }

    if (hasError) {
      fail('健康檢查未通過');
      process.exit(1);
    }

    ok('健康檢查通過');
    process.exit(0);
  } catch (err) {
    fail(`PostgreSQL 健康檢查失敗：${err.message}`);
    process.exit(1);
  } finally {
    await pool.end().catch(() => {});
  }
}

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
  warn('Production 目前使用 SQLite 開發模式；正式環境請設定 DATABASE_URL 以使用 PostgreSQL。');
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
  'job_site_estimate_items',
  'job_site_payments',
  'inventory_movements',
  'feedbacks',
  'transactions',
  'vouchers',
  'invoices',
  'platform_accounts',
  'leads',
  'tenders',
  'tender_sync_runs',
  'tender_keywords',
  'tender_watch_keywords',
  'tender_radar_sync_states',
  'tender_matches',
  'website_settings',
  'website_banners',
  'website_home_sections',
  'website_products',
  'website_posts',
  'website_faqs',
  'website_inquiries',
  'website_assets',
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
    'status',
    'review_status',
    'approval_status',
    'last_login_at',
    'created_source',
    'created_utm_source',
    'login_count',
    'phone',
    'line_contact',
    'contact_name',
    'company_stage',
    'tax_id',
    'created_at',
    'updated_at'
  ],
  companies: [
    'id',
    'name',
    'tax_id',
    'industry',
    'plan',
    'owner_id',
    'review_status',
    'approval_status',
    'is_active',
    'contact_name',
    'phone',
    'line_contact',
    'company_stage',
    'is_tester',
    'tester_started_at',
    'tester_note',
    'tester_feedback_status',
    'beta_status',
    'is_free_beta',
    'beta_group',
    'beta_limit_group',
    'product_line',
    'industry_type',
    'beta_approved_at',
    'created_at',
    'updated_at'
  ],
  company_users: [
    'id',
    'company_id',
    'user_id',
    'role',
    'created_at',
    'updated_at'
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
  transactions: [
    'id',
    'company_id',
    'platform_key',
    'channel_type',
    'external_order_id',
    'gross_amount',
    'platform_fee',
    'cost_of_goods_sold',
    'tax_amount',
    'net_amount',
    'created_at'
  ],
  vouchers: [
    'id',
    'company_id',
    'vendor',
    'amount',
    'deductible'
  ],
  invoices: [
    'id',
    'company_id',
    'invoice_no',
    'invoice_type',
    'buyer_name',
    'buyer_tax_id',
    'amount_excl_tax',
    'tax_amount',
    'amount_incl_tax',
    'status',
    'created_at'
  ],
  platform_accounts: [
    'id',
    'company_id',
    'platform_key',
    'status',
    'last_sync_at'
  ],
  leads: [
    'id',
    'company_id',
    'title',
    'client_name',
    'client_phone',
    'source',
    'region',
    'agency_type',
    'project_type',
    'estimated_amount',
    'estimated_cost',
    'expected_margin',
    'risk_level',
    'fit_score',
    'status',
    'next_action',
    'note',
    'tender_source',
    'tender_ref',
    'converted_job_site_id',
    'created_at',
    'updated_at'
  ],
  tenders: [
    'id',
    'source',
    'source_tender_id',
    'tender_no',
    'tender_name',
    'agency_name',
    'agency_level',
    'region',
    'category',
    'budget_amount',
    'publish_date',
    'deadline_date',
    'status',
    'url',
    'created_at',
    'updated_at',
    'last_seen_at'
  ],
  tender_sync_runs: [
    'id',
    'source',
    'started_at',
    'finished_at',
    'status',
    'fetched_count',
    'inserted_count',
    'updated_count',
    'error_count',
    'error_message',
    'created_at'
  ],
  tender_keywords: [
    'id',
    'keyword',
    'category',
    'product_line',
    'enabled',
    'created_at'
  ],
  tender_watch_keywords: [
    'id',
    'company_id',
    'keyword',
    'region',
    'category',
    'min_budget',
    'max_budget',
    'is_active',
    'created_at',
    'updated_at'
  ],
  tender_radar_sync_states: [
    'id',
    'company_id',
    'status',
    'last_synced_at',
    'next_suggested_sync_at',
    'error_message',
    'created_at',
    'updated_at'
  ],
  tender_matches: [
    'id',
    'tender_id',
    'company_id',
    'keyword',
    'score',
    'matched_reason',
    'created_at'
  ],
  website_settings: [
    'id',
    'company_id',
    'site_slug',
    'site_name',
    'brand_name',
    'is_published',
    'created_at',
    'updated_at'
  ],
  website_banners: [
    'id',
    'company_id',
    'title',
    'image_url',
    'sort_order',
    'is_active',
    'created_at',
    'updated_at'
  ],
  website_home_sections: [
    'id',
    'company_id',
    'section_type',
    'title',
    'sort_order',
    'is_active',
    'created_at',
    'updated_at'
  ],
  website_products: [
    'id',
    'company_id',
    'name',
    'slug',
    'status',
    'is_featured',
    'created_at',
    'updated_at'
  ],
  website_posts: [
    'id',
    'company_id',
    'title',
    'slug',
    'status',
    'published_at',
    'created_at',
    'updated_at'
  ],
  website_faqs: [
    'id',
    'company_id',
    'question',
    'answer',
    'is_active',
    'created_at',
    'updated_at'
  ],
  website_inquiries: [
    'id',
    'company_id',
    'name',
    'email',
    'message',
    'status',
    'created_at',
    'updated_at'
  ],
  website_assets: [
    'id',
    'company_id',
    'file_url',
    'file_name',
    'file_type',
    'module',
    'created_by',
    'created_at',
    'updated_at'
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
  job_site_estimate_items: [
    'id',
    'company_id',
    'job_site_id',
    'work_type',
    'item_category',
    'item_name',
    'quantity',
    'unit',
    'unit_price',
    'amount',
    'cost_amount',
    'note',
    'sort_order',
    'created_at',
    'updated_at'
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
