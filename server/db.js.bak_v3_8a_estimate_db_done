import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const db = new Database(
  process.env.DB_PATH || path.join(__dirname, 'bookai.sqlite')
);

db.pragma('journal_mode = WAL');

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
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
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

  safeAddColumn('products', 'category', 'TEXT');
  safeAddColumn('products', 'unit', 'TEXT');
  safeAddColumn('products', 'supplier', 'TEXT');
  safeAddColumn('products', 'storage_location', 'TEXT');
  safeAddColumn('products', 'note', 'TEXT');

  safeAddColumn('job_sites', 'site_name', 'TEXT');
  safeAddColumn('job_sites', 'project_type', 'TEXT');
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
