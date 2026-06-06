export const plans = {
  business: {
    name: 'BookAI Business', price: 799, maxCompanies: 1, maxStores: 1, maxUsers: 3, maxIntegrations: 2, maxClients: 0,
    features: ['dashboard','transactions','invoices','vouchers','inventory','integrations','monthly_reports']
  },
  pro: {
    name: 'BookAI Pro', price: 1999, maxCompanies: 3, maxStores: 5, maxUsers: 15, maxIntegrations: 8, maxClients: 0,
    features: ['dashboard','transactions','invoices','vouchers','inventory','integrations','monthly_reports','ar_ap','accounting_engine','cost_accounting','tax_center','advanced_reports','rbac']
  },
  accountant: {
    name: 'BookAI Accountant', price: 3999, maxCompanies: 1, maxStores: 0, maxUsers: 10, maxIntegrations: 20, maxClients: 30,
    features: ['dashboard','transactions','invoices','vouchers','monthly_reports','tax_center','advanced_reports','accountant_console','client_portal','batch_reports','audit_logs']
  }
};
export const featureLabel = {
  accounting_engine: '會計中心', cost_accounting: '成本會計', tax_center: '稅務中心', accountant_console: '記帳士中台', ar_ap: '應收應付'
};
export function hasFeature(plan, feature){ return Boolean(plans[plan]?.features.includes(feature)); }
