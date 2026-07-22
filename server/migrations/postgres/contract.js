import { createRequire } from 'node:module';

export const REQUIRED_SCHEMA_VERSION = '007_schema_parity';
export const ORDERED_MIGRATION_VERSIONS = Object.freeze([
  '001_core_identity',
  '002_engineering_inventory',
  '003_commerce_erp',
  '004_cms',
  '005_accounting',
  '006_tender_audit',
  REQUIRED_SCHEMA_VERSION
]);
export const schemaTables = [
  'users','companies','company_users','platform_accounts','transactions','invoices','products',
  'inventory_movements','job_sites','job_site_payments','job_site_estimate_items','vouchers',
  'accounts','journal_entries','journal_lines','accountant_clients','leads','tenders',
  'tender_sync_runs','tender_keywords','tender_watch_keywords','tender_radar_sync_states',
  'tender_matches','platform_settings','user_login_logs','visitor_logs','traffic_events',
  'company_feature_overrides','commerce_site_settings','commerce_site_products',
  'commerce_site_promotions','website_settings','website_banners','website_home_sections',
  'website_products','website_posts','website_faqs','website_inquiries','website_assets',
  'suppliers','customers','purchases','purchase_items','sales','sale_items','sale_receipts',
  'purchase_payments','feedbacks','audit_logs'
];
const globalTables = new Set(['users','platform_settings','tender_keywords','tenders','tender_sync_runs','user_login_logs','visitor_logs','traffic_events']);
export const tableDisposition = Object.fromEntries(schemaTables.map((name) => [name, {
  status: 'ACTIVE',
  companyScoped: !globalTables.has(name),
  timestampPolicy: 'TIMESTAMPTZ_UTC',
  booleanPolicy: 'BOOLEAN',
  moneyType: 'NUMERIC(18,2)',
  quantityType: 'NUMERIC(18,4)',
  foreignKeys: [],
  unique: [],
  indexes: []
}]));

export const schemaManifest = {
  tables: tableDisposition,
  jsonb: [],
  conflictDecisions: {
    purchase_items: { preserve: ['unit_price','unit_cost','subtotal'], strategy: 'expand_contract' },
    transactions: { preserve: ['profit','note','amount','type','reference'], strategy: 'expand_contract' },
    vouchers: { preserve: ['purpose','tax_amount','status','type','tax','voucher_date','note'], strategy: 'expand_contract' }
  },
  uniquePolicy: {
    users: ['email'], company_users: ['company_id,user_id'], website_settings: ['site_slug'],
    website_products: ['company_id,slug'], website_posts: ['company_id,slug'],
    sku: ['company_id,sku'], documents: ['company_id,document_type,document_number'],
    external_orders: ['company_id,source,external_id']
  }
};

// Read-only evidence loader used by local drift tooling. It never runs in the
// API runtime and never opens a PostgreSQL connection.
export function loadSqliteEvidence(dbPath = 'server/bookai.sqlite') {
  try {
    const requireLocal = createRequire(new URL('../../db.js', import.meta.url));
    const Database = requireLocal('better-sqlite3');
    const db = new Database(dbPath, { readonly: true });
    const evidence = {};
    for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
      const columns = db.prepare(`PRAGMA table_info(${name})`).all().map((column) => ({
        name: column.name,
        type: column.type || 'TEXT',
        nullable: column.notnull !== 1,
        default: column.dflt_value,
        primaryKey: column.pk === 1,
        sourceEvidence: `SQLite PRAGMA table_info(${name})`
      }));
      const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${name})`).all().map((fk) => ({ from: fk.from, table: fk.table, to: fk.to, onDelete: fk.on_delete, onUpdate: fk.on_update }));
      const indexes = db.prepare(`PRAGMA index_list(${name})`).all().map((index) => ({ name: index.name, unique: index.unique === 1, columns: db.prepare(`PRAGMA index_info(${index.name})`).all().map((item) => item.name) }));
      evidence[name] = { table: name, status: 'ACTIVE', columns, foreignKeys, indexes, sourceEvidence: ['SQLite PRAGMA table_info', 'SQLite PRAGMA foreign_key_list', 'SQLite PRAGMA index_list', 'runtime SQL review'] };
    }
    db.close();
    return evidence;
  } catch (error) {
    return { __error: { code: error?.code || 'SQLITE_EVIDENCE_FAILED', message: error?.message || 'SQLite evidence unavailable' } };
  }
}
