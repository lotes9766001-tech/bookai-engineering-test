import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ENVIRONMENT_STATUS, NODE_ENV } from './env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
export const DATABASE_URL = process.env.DATABASE_URL || '';
const requestedProvider = String(process.env.BOOKAI_DB_PROVIDER || '').trim().toLowerCase();
export const DB_PROVIDER = !ENVIRONMENT_STATUS.environmentValid || NODE_ENV === 'production'
  ? 'postgresql'
  : requestedProvider || (DATABASE_URL ? 'postgresql' : 'sqlite');
export const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'bookai.sqlite');
let sqliteDb = null;

console.log(`[database] environment=${NODE_ENV}`);
console.log(`[database] provider=${DB_PROVIDER}`);

if (NODE_ENV === 'production' && requestedProvider === 'sqlite') {
  console.error('[database] configuration error: production cannot use SQLite; PostgreSQL is enforced');
}
if (NODE_ENV === 'production' && !DATABASE_URL) {
  console.error('[database] configuration error: DATABASE_URL=missing');
}

if (DB_PROVIDER === 'postgresql') {
  console.log('PostgreSQL provider enabled. SQLite storage will not be initialized.');
}

function getSqliteDb() {
  if (DB_PROVIDER !== 'sqlite') {
    throw new Error(`SQLite database requested while BOOKAI_DB_PROVIDER=${DB_PROVIDER}`);
  }

  if (!sqliteDb) {
    try {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    } catch (error) {
      console.warn(`Unable to ensure database directory exists: ${error.message}`);
    }

    const Database = require('better-sqlite3');
    sqliteDb = new Database(DB_PATH);
    sqliteDb.pragma('journal_mode = WAL');
  }

  return sqliteDb;
}

export const db = new Proxy({}, {
  get(_target, prop) {
    const sqlite = getSqliteDb();
    const value = sqlite[prop];
    return typeof value === 'function' ? value.bind(sqlite) : value;
  }
});

function safeAddColumn(tableName, columnName, columnType) {
  try {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    const exists = columns.some((col) => col.name === columnName);

    if (!exists) {
      db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`).run();
      console.log(`Added column ${columnName} to ${tableName}`);
    }
  } catch (error) {
    console.warn(`Skip adding column ${columnName} to ${tableName}:`, error.message);
  }
}

export function initDb() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    tax_id TEXT,
    industry TEXT,
    companyAddress TEXT,
    address TEXT,
    plan TEXT NOT NULL DEFAULT 'business',
    owner_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS company_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'owner',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id,user_id)
  );

  CREATE TABLE IF NOT EXISTS platform_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    platform_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'mock',
    last_sync_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, platform_key)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    platform_key TEXT NOT NULL,
    channel_type TEXT NOT NULL,
    external_order_id TEXT,
    gross_amount REAL NOT NULL DEFAULT 0,
    platform_fee REAL NOT NULL DEFAULT 0,
    discount_amount REAL NOT NULL DEFAULT 0,
    shipping_fee REAL NOT NULL DEFAULT 0,
    refund_amount REAL NOT NULL DEFAULT 0,
    net_amount REAL NOT NULL DEFAULT 0,
    tax_amount REAL NOT NULL DEFAULT 0,
    cost_of_goods_sold REAL NOT NULL DEFAULT 0,
    platform_profit REAL NOT NULL DEFAULT 0,
    payment_status TEXT DEFAULT 'paid',
    order_status TEXT DEFAULT 'completed',
    items_json TEXT DEFAULT '[]',
    occurred_at TEXT DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    invoice_no TEXT NOT NULL,
    invoice_type TEXT NOT NULL DEFAULT 'B2C',
    buyer_name TEXT,
    buyer_tax_id TEXT,
    amount_excl_tax REAL NOT NULL DEFAULT 0,
    tax_amount REAL NOT NULL DEFAULT 0,
    amount_incl_tax REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft',
    issued_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    sku TEXT,
    name TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 0,
    cost REAL NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    safety_stock INTEGER NOT NULL DEFAULT 5,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS inventory_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    job_site_id INTEGER,
    movement_type TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 0,
    before_stock REAL NOT NULL DEFAULT 0,
    after_stock REAL NOT NULL DEFAULT 0,
    unit_cost REAL NOT NULL DEFAULT 0,
    note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id),
    FOREIGN KEY(product_id) REFERENCES products(id),
    FOREIGN KEY(job_site_id) REFERENCES job_sites(id)
  );

  CREATE INDEX IF NOT EXISTS idx_inventory_movements_company_id
  ON inventory_movements(company_id);

  CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_id
  ON inventory_movements(product_id);

  CREATE TABLE IF NOT EXISTS job_sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    client_name TEXT,
    address TEXT,
    contact_name TEXT,
    contact_phone TEXT,
    status TEXT NOT NULL DEFAULT '進行中',
    note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id)
  );

  CREATE INDEX IF NOT EXISTS idx_job_sites_company_id
  ON job_sites(company_id);

  CREATE TABLE IF NOT EXISTS job_site_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    job_site_id INTEGER NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    payment_date TEXT DEFAULT CURRENT_TIMESTAMP,
    method TEXT,
    note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id),
    FOREIGN KEY(job_site_id) REFERENCES job_sites(id)
  );

  CREATE INDEX IF NOT EXISTS idx_job_site_payments_job_site_id
  ON job_site_payments(job_site_id);

  CREATE TABLE IF NOT EXISTS job_site_estimate_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    job_site_id INTEGER NOT NULL,
    work_type TEXT,
    item_category TEXT DEFAULT 'estimate',
    item_name TEXT NOT NULL,
    quantity REAL DEFAULT 0,
    unit TEXT,
    unit_price REAL DEFAULT 0,
    amount REAL DEFAULT 0,
    cost_amount REAL DEFAULT 0,
    note TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id),
    FOREIGN KEY(job_site_id) REFERENCES job_sites(id)
  );

  CREATE INDEX IF NOT EXISTS idx_job_site_estimate_items_company_id
  ON job_site_estimate_items(company_id);

  CREATE INDEX IF NOT EXISTS idx_job_site_estimate_items_job_site_id
  ON job_site_estimate_items(job_site_id);

  CREATE TABLE IF NOT EXISTS vouchers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    vendor TEXT NOT NULL,
    purpose TEXT,
    amount REAL NOT NULL DEFAULT 0,
    tax_amount REAL NOT NULL DEFAULT 0,
    deductible INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, code)
  );

  CREATE TABLE IF NOT EXISTS journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    memo TEXT,
    entry_date TEXT DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS journal_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    journal_entry_id INTEGER NOT NULL,
    account_code TEXT NOT NULL,
    debit REAL NOT NULL DEFAULT 0,
    credit REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS accountant_clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    client_name TEXT NOT NULL,
    client_tax_id TEXT,
    status TEXT NOT NULL DEFAULT 'collecting',
    closing_progress INTEGER NOT NULL DEFAULT 0,
    missing_docs INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    client_name TEXT,
    client_phone TEXT,
    source TEXT,
    region TEXT,
    agency_type TEXT,
    project_type TEXT,
    estimated_amount REAL DEFAULT 0,
    estimated_cost REAL DEFAULT 0,
    expected_margin REAL DEFAULT 0,
    risk_level TEXT DEFAULT 'medium',
    fit_score INTEGER DEFAULT 70,
    status TEXT DEFAULT 'new',
    next_action TEXT,
    note TEXT,
    tender_source TEXT,
    tender_ref TEXT,
    converted_job_site_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id),
    FOREIGN KEY(converted_job_site_id) REFERENCES job_sites(id)
  );

  CREATE INDEX IF NOT EXISTS leads_company_id_idx
  ON leads(company_id);

  CREATE INDEX IF NOT EXISTS leads_company_status_idx
  ON leads(company_id, status);

  CREATE INDEX IF NOT EXISTS leads_company_created_idx
  ON leads(company_id, created_at);

  CREATE TABLE IF NOT EXISTS tenders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    source_tender_id TEXT NOT NULL,
    tender_no TEXT,
    tender_name TEXT NOT NULL,
    agency_name TEXT,
    agency_code TEXT,
    agency_level TEXT,
    region TEXT,
    category TEXT,
    procurement_type TEXT,
    tender_type TEXT,
    announcement_type TEXT,
    budget_amount REAL DEFAULT 0,
    award_amount REAL DEFAULT 0,
    publish_date TEXT,
    deadline_date TEXT,
    opening_date TEXT,
    status TEXT,
    url TEXT,
    raw_payload TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source, source_tender_id)
  );

  CREATE TABLE IF NOT EXISTS tender_sync_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT,
    started_at TEXT DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT,
    status TEXT DEFAULT 'running',
    fetched_count INTEGER DEFAULT 0,
    inserted_count INTEGER DEFAULT 0,
    updated_count INTEGER DEFAULT 0,
    skipped_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    error_message TEXT,
    cursor TEXT,
    date_from TEXT,
    date_to TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tender_keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT NOT NULL UNIQUE,
    category TEXT,
    product_line TEXT,
    enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tender_watch_keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    keyword TEXT NOT NULL,
    region TEXT,
    category TEXT,
    min_budget REAL DEFAULT 0,
    max_budget REAL DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id)
  );

  CREATE TABLE IF NOT EXISTS tender_radar_sync_states (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL UNIQUE,
    status TEXT DEFAULT 'not_started',
    last_synced_at TEXT,
    next_suggested_sync_at TEXT,
    error_message TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id)
  );

  CREATE TABLE IF NOT EXISTS tender_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tender_id INTEGER NOT NULL,
    company_id INTEGER,
    keyword TEXT,
    score INTEGER DEFAULT 0,
    matched_reason TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(tender_id) REFERENCES tenders(id)
  );

  CREATE INDEX IF NOT EXISTS idx_tenders_source
  ON tenders(source);

  CREATE INDEX IF NOT EXISTS idx_tenders_status
  ON tenders(status);

  CREATE INDEX IF NOT EXISTS idx_tenders_publish_date
  ON tenders(publish_date);

  CREATE INDEX IF NOT EXISTS idx_tenders_deadline_date
  ON tenders(deadline_date);

  CREATE INDEX IF NOT EXISTS idx_tenders_region
  ON tenders(region);

  CREATE INDEX IF NOT EXISTS idx_tenders_agency_level
  ON tenders(agency_level);

  CREATE INDEX IF NOT EXISTS idx_tender_sync_runs_created
  ON tender_sync_runs(created_at);

  CREATE INDEX IF NOT EXISTS idx_tender_matches_tender_id
  ON tender_matches(tender_id);

  CREATE INDEX IF NOT EXISTS idx_tender_matches_company_id
  ON tender_matches(company_id);

  CREATE INDEX IF NOT EXISTS idx_tender_watch_keywords_company_id
  ON tender_watch_keywords(company_id);

  CREATE INDEX IF NOT EXISTS idx_tender_radar_sync_states_company_id
  ON tender_radar_sync_states(company_id);

  CREATE TABLE IF NOT EXISTS platform_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_login_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    email TEXT,
    ip TEXT,
    user_agent TEXT,
    status TEXT NOT NULL,
    fail_reason TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS user_login_logs_user_idx
  ON user_login_logs(user_id, created_at);

  CREATE INDEX IF NOT EXISTS user_login_logs_email_idx
  ON user_login_logs(email, created_at);

  CREATE TABLE IF NOT EXISTS visitor_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id TEXT,
    page TEXT,
    referrer TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    source TEXT,
    ip TEXT,
    user_agent TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS visitor_logs_visitor_idx
  ON visitor_logs(visitor_id, created_at);

  CREATE INDEX IF NOT EXISTS visitor_logs_source_idx
  ON visitor_logs(source, created_at);

  CREATE TABLE IF NOT EXISTS traffic_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id TEXT,
    user_id INTEGER,
    event_type TEXT NOT NULL,
    source TEXT,
    page TEXT,
    referrer TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    ip TEXT,
    user_agent TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS traffic_events_type_idx
  ON traffic_events(event_type, created_at);

  CREATE INDEX IF NOT EXISTS traffic_events_source_idx
  ON traffic_events(source, created_at);

  CREATE TABLE IF NOT EXISTS company_feature_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    feature_key TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    note TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, feature_key),
    FOREIGN KEY(company_id) REFERENCES companies(id)
  );

  CREATE INDEX IF NOT EXISTS company_feature_overrides_company_idx
  ON company_feature_overrides(company_id);

  CREATE TABLE IF NOT EXISTS commerce_site_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL UNIQUE,
    brand_name TEXT,
    hero_title TEXT,
    hero_subtitle TEXT,
    announcement_text TEXT,
    official_line_url TEXT,
    contact_phone TEXT,
    contact_email TEXT,
    site_status TEXT DEFAULT 'draft',
    theme_name TEXT DEFAULT 'default',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id)
  );

  CREATE TABLE IF NOT EXISTS commerce_site_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price REAL DEFAULT 0,
    original_price REAL DEFAULT 0,
    image_url TEXT,
    category TEXT,
    is_featured INTEGER DEFAULT 0,
    is_visible INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id)
  );

  CREATE INDEX IF NOT EXISTS commerce_site_products_company_idx
  ON commerce_site_products(company_id);

  CREATE INDEX IF NOT EXISTS commerce_site_products_visible_idx
  ON commerce_site_products(company_id, is_visible);

  CREATE TABLE IF NOT EXISTS commerce_site_promotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    promo_type TEXT DEFAULT 'banner',
    start_date TEXT,
    end_date TEXT,
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id)
  );

  CREATE INDEX IF NOT EXISTS commerce_site_promotions_company_idx
  ON commerce_site_promotions(company_id);

  CREATE INDEX IF NOT EXISTS commerce_site_promotions_active_idx
  ON commerce_site_promotions(company_id, is_active);

  CREATE TABLE IF NOT EXISTS website_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL UNIQUE,
    site_slug TEXT NOT NULL UNIQUE,
    site_name TEXT,
    brand_name TEXT,
    logo_url TEXT,
    favicon_url TEXT,
    primary_color TEXT,
    secondary_color TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    line_url TEXT,
    facebook_url TEXT,
    instagram_url TEXT,
    address TEXT,
    seo_title TEXT,
    seo_description TEXT,
    is_published INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id)
  );

  CREATE INDEX IF NOT EXISTS website_settings_company_idx
  ON website_settings(company_id);

  CREATE INDEX IF NOT EXISTS website_settings_slug_idx
  ON website_settings(site_slug);

  CREATE TABLE IF NOT EXISTS website_banners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    title TEXT,
    subtitle TEXT,
    image_url TEXT,
    button_text TEXT,
    button_url TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id)
  );

  CREATE INDEX IF NOT EXISTS website_banners_company_idx
  ON website_banners(company_id);

  CREATE TABLE IF NOT EXISTS website_home_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    section_type TEXT DEFAULT 'custom',
    title TEXT,
    subtitle TEXT,
    content TEXT,
    image_url TEXT,
    button_text TEXT,
    button_url TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id)
  );

  CREATE INDEX IF NOT EXISTS website_home_sections_company_idx
  ON website_home_sections(company_id);

  CREATE TABLE IF NOT EXISTS website_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    short_description TEXT,
    price REAL DEFAULT 0,
    compare_at_price REAL DEFAULT 0,
    image_url TEXT,
    category TEXT,
    status TEXT DEFAULT 'draft',
    sort_order INTEGER DEFAULT 0,
    is_featured INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id),
    UNIQUE(company_id, slug)
  );

  CREATE INDEX IF NOT EXISTS website_products_company_idx
  ON website_products(company_id);

  CREATE INDEX IF NOT EXISTS website_products_slug_idx
  ON website_products(company_id, slug);

  CREATE TABLE IF NOT EXISTS website_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    summary TEXT,
    content TEXT,
    cover_image_url TEXT,
    category TEXT,
    status TEXT DEFAULT 'draft',
    published_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id),
    UNIQUE(company_id, slug)
  );

  CREATE INDEX IF NOT EXISTS website_posts_company_idx
  ON website_posts(company_id);

  CREATE INDEX IF NOT EXISTS website_posts_slug_idx
  ON website_posts(company_id, slug);

  CREATE TABLE IF NOT EXISTS website_faqs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    question TEXT NOT NULL,
    answer TEXT,
    category TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id)
  );

  CREATE INDEX IF NOT EXISTS website_faqs_company_idx
  ON website_faqs(company_id);

  CREATE TABLE IF NOT EXISTS website_inquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    name TEXT,
    email TEXT,
    phone TEXT,
    message TEXT NOT NULL,
    source_page TEXT,
    status TEXT DEFAULT 'new',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id)
  );

  CREATE INDEX IF NOT EXISTS website_inquiries_company_idx
  ON website_inquiries(company_id);

  CREATE TABLE IF NOT EXISTS website_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    file_url TEXT NOT NULL,
    file_name TEXT,
    file_type TEXT,
    file_size INTEGER DEFAULT 0,
    module TEXT,
    created_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id)
  );

  CREATE INDEX IF NOT EXISTS website_assets_company_idx
  ON website_assets(company_id);

  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    tax_id TEXT,
    address TEXT,
    contact_person TEXT,
    note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id)
  );

  CREATE INDEX IF NOT EXISTS suppliers_company_idx
  ON suppliers(company_id);

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    tax_id TEXT,
    address TEXT,
    contact_person TEXT,
    note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id)
  );

  CREATE INDEX IF NOT EXISTS customers_company_idx
  ON customers(company_id);

  CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    supplier_id INTEGER,
    supplier_name TEXT,
    purchase_no TEXT,
    purchase_date TEXT DEFAULT CURRENT_TIMESTAMP,
    category TEXT,
    subtotal REAL DEFAULT 0,
    tax REAL DEFAULT 0,
    total REAL DEFAULT 0,
    payment_status TEXT DEFAULT '未付款',
    paid_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'confirmed',
    note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id),
    FOREIGN KEY(supplier_id) REFERENCES suppliers(id)
  );

  CREATE INDEX IF NOT EXISTS purchases_company_idx
  ON purchases(company_id);

  CREATE TABLE IF NOT EXISTS purchase_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    purchase_id INTEGER NOT NULL,
    product_id INTEGER,
    item_name TEXT NOT NULL,
    quantity REAL DEFAULT 0,
    unit TEXT,
    unit_cost REAL DEFAULT 0,
    subtotal REAL DEFAULT 0,
    note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id),
    FOREIGN KEY(purchase_id) REFERENCES purchases(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
  );

  CREATE INDEX IF NOT EXISTS purchase_items_purchase_idx
  ON purchase_items(company_id, purchase_id);

  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    customer_id INTEGER,
    customer_name TEXT,
    sale_no TEXT,
    sale_date TEXT DEFAULT CURRENT_TIMESTAMP,
    category TEXT,
    subtotal REAL DEFAULT 0,
    tax REAL DEFAULT 0,
    total REAL DEFAULT 0,
    collection_status TEXT DEFAULT '未收款',
    received_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'confirmed',
    note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id),
    FOREIGN KEY(customer_id) REFERENCES customers(id)
  );

  CREATE INDEX IF NOT EXISTS sales_company_idx
  ON sales(company_id);

  CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    sale_id INTEGER NOT NULL,
    product_id INTEGER,
    item_name TEXT NOT NULL,
    quantity REAL DEFAULT 0,
    unit TEXT,
    unit_price REAL DEFAULT 0,
    subtotal REAL DEFAULT 0,
    unit_cost_snapshot REAL DEFAULT 0,
    cost_subtotal REAL DEFAULT 0,
    note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id),
    FOREIGN KEY(sale_id) REFERENCES sales(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
  );

  CREATE INDEX IF NOT EXISTS sale_items_sale_idx
  ON sale_items(company_id, sale_id);

  CREATE TABLE IF NOT EXISTS sale_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    sale_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    receipt_date TEXT DEFAULT CURRENT_TIMESTAMP,
    method TEXT,
    note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id),
    FOREIGN KEY(sale_id) REFERENCES sales(id)
  );

  CREATE INDEX IF NOT EXISTS sale_receipts_sale_idx
  ON sale_receipts(company_id, sale_id);

  CREATE TABLE IF NOT EXISTS purchase_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    purchase_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_date TEXT DEFAULT CURRENT_TIMESTAMP,
    method TEXT,
    note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(company_id) REFERENCES companies(id),
    FOREIGN KEY(purchase_id) REFERENCES purchases(id)
  );

  CREATE INDEX IF NOT EXISTS purchase_payments_purchase_idx
  ON purchase_payments(company_id, purchase_id);

  CREATE TABLE IF NOT EXISTS feedbacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    user_id INTEGER,
    category TEXT,
    rating INTEGER,
    message TEXT NOT NULL,
    page TEXT,
    status TEXT DEFAULT 'new',
    admin_note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT,
    FOREIGN KEY(company_id) REFERENCES companies(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS feedbacks_company_idx
  ON feedbacks(company_id);

  CREATE INDEX IF NOT EXISTS feedbacks_status_idx
  ON feedbacks(status);

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER,
    user_id INTEGER,
    action TEXT NOT NULL,
    detail TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  `);


  // v3.8a 工種估價明細 + 稅務連動核心欄位
  safeAddColumn('job_sites', 'tax_mode', "TEXT DEFAULT 'not_taxed'");
  safeAddColumn('job_sites', 'tax_rate', 'REAL DEFAULT 0.05');
  safeAddColumn('job_sites', 'subtotal_amount', 'REAL DEFAULT 0');
  safeAddColumn('job_sites', 'tax_amount', 'REAL DEFAULT 0');
  safeAddColumn('job_sites', 'total_amount', 'REAL DEFAULT 0');

  try {
    db.exec(`
      UPDATE job_sites
      SET
        tax_mode = COALESCE(tax_mode, 'not_taxed'),
        tax_rate = COALESCE(tax_rate, 0.05),
        subtotal_amount = CASE
          WHEN COALESCE(subtotal_amount, 0) = 0 THEN COALESCE(quote_amount, 0)
          ELSE subtotal_amount
        END,
        tax_amount = COALESCE(tax_amount, 0),
        total_amount = CASE
          WHEN COALESCE(total_amount, 0) = 0 THEN COALESCE(quote_amount, 0)
          ELSE total_amount
        END
      WHERE id IS NOT NULL;
    `);
  } catch (error) {
    console.warn('Skip v3.8a job_sites tax field initialization:', error.message);
  }

  safeAddColumn('companies', 'companyAddress', 'TEXT');
  safeAddColumn('companies', 'address', 'TEXT');
  safeAddColumn('companies', 'billing_status', "TEXT DEFAULT 'trial'");
  safeAddColumn('companies', 'subscription_plan', "TEXT DEFAULT 'engineering_trial'");
  safeAddColumn('companies', 'subscription_started_at', 'TEXT');
  safeAddColumn('companies', 'subscription_expires_at', 'TEXT');
  safeAddColumn('companies', 'is_paid_customer', 'INTEGER DEFAULT 0');
  safeAddColumn('companies', 'billing_note', 'TEXT');
  safeAddColumn('companies', 'has_official_site', 'INTEGER DEFAULT 0');
  safeAddColumn('companies', 'official_site_url', 'TEXT');
  safeAddColumn('companies', 'official_site_status', "TEXT DEFAULT 'none'");
  safeAddColumn('companies', 'official_site_note', 'TEXT');
  safeAddColumn('companies', 'is_tester', 'INTEGER DEFAULT 0');
  safeAddColumn('companies', 'tester_started_at', 'TEXT');
  safeAddColumn('companies', 'tester_note', 'TEXT');
  safeAddColumn('companies', 'tester_feedback_status', "TEXT DEFAULT '尚未回饋'");
  safeAddColumn('companies', 'review_status', "TEXT DEFAULT 'pending_review'");
  safeAddColumn('companies', 'approval_status', "TEXT DEFAULT 'pending_review'");
  safeAddColumn('companies', 'is_active', 'INTEGER DEFAULT 0');
  safeAddColumn('companies', 'approved_at', 'TEXT');
  safeAddColumn('companies', 'approved_by', 'INTEGER');
  safeAddColumn('companies', 'rejected_at', 'TEXT');
  safeAddColumn('companies', 'rejected_by', 'INTEGER');
  safeAddColumn('companies', 'suspended_at', 'TEXT');
  safeAddColumn('companies', 'suspended_by', 'INTEGER');
  safeAddColumn('companies', 'review_note', 'TEXT');
  safeAddColumn('companies', 'contact_name', 'TEXT');
  safeAddColumn('companies', 'phone', 'TEXT');
  safeAddColumn('companies', 'line_contact', 'TEXT');
  safeAddColumn('companies', 'use_case', 'TEXT');
  safeAddColumn('companies', 'company_stage', 'TEXT');
  safeAddColumn('companies', 'beta_status', "TEXT DEFAULT 'not_started'");
  safeAddColumn('companies', 'is_free_beta', 'INTEGER DEFAULT 0');
  safeAddColumn('companies', 'beta_group', 'TEXT');
  safeAddColumn('companies', 'beta_limit_group', 'TEXT');
  safeAddColumn('companies', 'product_line', "TEXT DEFAULT 'general'");
  safeAddColumn('companies', 'industry_type', 'TEXT');
  safeAddColumn('companies', 'beta_approved_at', 'TEXT');
  safeAddColumn('companies', 'updated_at', 'TEXT');
  safeAddColumn('company_users', 'updated_at', 'TEXT');
  safeAddColumn('users', 'last_login_at', 'TEXT');
  safeAddColumn('users', 'created_source', 'TEXT');
  safeAddColumn('users', 'created_utm_source', 'TEXT');
  safeAddColumn('users', 'login_count', 'INTEGER DEFAULT 0');
  safeAddColumn('users', 'status', "TEXT DEFAULT 'pending_review'");
  safeAddColumn('users', 'review_status', "TEXT DEFAULT 'pending_review'");
  safeAddColumn('users', 'approval_status', "TEXT DEFAULT 'pending_review'");
  safeAddColumn('users', 'approved_at', 'TEXT');
  safeAddColumn('users', 'approved_by', 'INTEGER');
  safeAddColumn('users', 'rejected_at', 'TEXT');
  safeAddColumn('users', 'rejected_by', 'INTEGER');
  safeAddColumn('users', 'suspended_at', 'TEXT');
  safeAddColumn('users', 'suspended_by', 'INTEGER');
  safeAddColumn('users', 'review_note', 'TEXT');
  safeAddColumn('users', 'terms_accepted_at', 'TEXT');
  safeAddColumn('users', 'terms_version', 'TEXT');
  safeAddColumn('users', 'line_contact', 'TEXT');
  safeAddColumn('users', 'company_stage', 'TEXT');
  safeAddColumn('users', 'phone', 'TEXT');
  safeAddColumn('users', 'contact_name', 'TEXT');
  safeAddColumn('users', 'tax_id', 'TEXT');
  safeAddColumn('users', 'use_case', 'TEXT');
  safeAddColumn('users', 'test_edition', "TEXT DEFAULT 'commerce'");
  safeAddColumn('users', 'updated_at', 'TEXT');

  const defaultSettings = {
    official_site_url: 'https://bookai-engineering-official.onrender.com',
    official_line_url: 'https://lin.ee/pU6X4oP',
    default_trial_days: '30',
    renewal_reminder_days: '7',
    enable_website_backend: 'true',
    system_announcement: 'BookAI 系統管理中心已啟用。'
  };

  const settingStmt = db.prepare(`
    INSERT OR IGNORE INTO platform_settings (
      key,
      value
    )
    VALUES (?,?)
  `);

  Object.entries(defaultSettings).forEach(([key, value]) => {
    settingStmt.run(key, value);
  });

  safeAddColumn('products', 'category', 'TEXT');
  safeAddColumn('products', 'unit', 'TEXT');
  safeAddColumn('products', 'supplier', 'TEXT');
  safeAddColumn('products', 'storage_location', 'TEXT');
  safeAddColumn('products', 'note', 'TEXT');
  safeAddColumn('products', 'updated_at', 'TEXT');
  safeAddColumn('purchases', 'status', "TEXT DEFAULT 'confirmed'");
  safeAddColumn('purchases', 'updated_at', 'TEXT');
  safeAddColumn('sales', 'status', "TEXT DEFAULT 'confirmed'");
  safeAddColumn('sales', 'updated_at', 'TEXT');
  safeAddColumn('sale_items', 'unit_cost_snapshot', 'REAL DEFAULT 0');
  safeAddColumn('sale_items', 'cost_subtotal', 'REAL DEFAULT 0');
  safeAddColumn('suppliers', 'updated_at', 'TEXT');
  safeAddColumn('customers', 'updated_at', 'TEXT');
  safeAddColumn('platform_accounts', 'updated_at', 'TEXT');
  safeAddColumn('website_assets', 'updated_at', 'TEXT');
  safeAddColumn('tender_watch_keywords', 'region', 'TEXT');
  safeAddColumn('tender_watch_keywords', 'category', 'TEXT');
  safeAddColumn('tender_watch_keywords', 'min_budget', 'REAL DEFAULT 0');
  safeAddColumn('tender_watch_keywords', 'max_budget', 'REAL DEFAULT 0');
  safeAddColumn('tender_watch_keywords', 'is_active', 'INTEGER DEFAULT 1');
  safeAddColumn('tender_watch_keywords', 'updated_at', 'TEXT');
  safeAddColumn('tender_radar_sync_states', 'next_suggested_sync_at', 'TEXT');
  safeAddColumn('tender_radar_sync_states', 'error_message', 'TEXT');
  safeAddColumn('tender_radar_sync_states', 'updated_at', 'TEXT');

  safeAddColumn('job_sites', 'site_name', 'TEXT');
  safeAddColumn('job_sites', 'project_type', 'TEXT');
  safeAddColumn('job_sites', 'client_phone', 'TEXT');
  safeAddColumn('job_sites', 'quote_amount', 'REAL NOT NULL DEFAULT 0');
  safeAddColumn('job_sites', 'received_amount', 'REAL NOT NULL DEFAULT 0');
  safeAddColumn('job_sites', 'material_cost', 'REAL NOT NULL DEFAULT 0');
  safeAddColumn('job_sites', 'labor_cost', 'REAL NOT NULL DEFAULT 0');
  safeAddColumn('job_sites', 'outsourced_cost', 'REAL NOT NULL DEFAULT 0');
  safeAddColumn('job_sites', 'misc_cost', 'REAL NOT NULL DEFAULT 0');
  safeAddColumn('job_sites', 'area_pings', 'REAL NOT NULL DEFAULT 0');
  safeAddColumn('job_sites', 'price_per_ping', 'REAL NOT NULL DEFAULT 0');
  safeAddColumn('job_sites', 'food_cost', 'REAL NOT NULL DEFAULT 0');
}

export function audit(companyId, userId, action, detail = '') {
  db.prepare(`
    INSERT INTO audit_logs (
      company_id,
      user_id,
      action,
      detail
    )
    VALUES (?,?,?,?)
  `).run(companyId, userId, action, detail);
}
