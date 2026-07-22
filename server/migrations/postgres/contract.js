export const REQUIRED_SCHEMA_VERSION = '007_schema_parity';
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
