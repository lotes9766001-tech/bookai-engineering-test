import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { db, initDb, audit } from './db.js';
import { plans, hasFeature } from './plans.js';
import { platforms } from './platforms.js';

initDb();


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = process.env.PORT || 5050;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

app.use(cors());
app.use(express.json());

function sign(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email
    },
    JWT_SECRET,
    {
      expiresIn: '7d'
    }
  );
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: '未登入' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: '登入已過期' });
  }
}

const ADMIN_EMAILS = new Set(['lotes.9766001@gmail.com']);

function requireAdmin(req, res, next) {
  const email = String(req.user?.email || '').toLowerCase();

  if (ADMIN_EMAILS.has(email)) {
    return next();
  }

  return res.status(403).json({ error: '沒有 BookAI 後台權限' });
}

function company(req, res, next) {
  const companyId = Number(req.params.companyId || req.query.companyId || req.body.companyId);

  if (!companyId) {
    return res.status(400).json({ error: '缺少 companyId' });
  }

  const row = db.prepare(`
    SELECT
      c.*,
      cu.role
    FROM companies c
    JOIN company_users cu ON cu.company_id = c.id
    WHERE c.id = ?
      AND cu.user_id = ?
  `).get(companyId, req.user.id);

  if (!row) {
    return res.status(403).json({ error: '沒有公司權限' });
  }

  req.company = row;
  next();
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const role = req.company?.role || 'viewer';

    if (allowedRoles.includes(role)) {
      return next();
    }

    return res.status(403).json({
      error: '你的角色沒有權限執行此操作',
      role,
      requiredRoles: allowedRoles
    });
  };
}

const requireFeature = (feature) => (req, res, next) => {
  if (!hasFeature(req.company.plan, feature)) {
    return res.status(403).json({
      error: '此功能需要升級方案',
      feature
    });
  }

  next();
};

function calcTransaction(t) {
  const gross = Number(t.grossAmount || 0);
  const fee = Number(t.platformFee || 0);
  const discount = Number(t.discountAmount || 0);
  const shipping = Number(t.shippingFee || 0);
  const refund = Number(t.refundAmount || 0);
  const cogs = Number(t.costOfGoodsSold || 0);

  const net = gross - fee - discount - refund + shipping;
  const profit = gross - fee - discount - refund - cogs;
  const tax = Number(
    t.taxAmount ?? Math.round((gross / 1.05 * 0.05) * 100) / 100
  );

  return {
    net,
    profit,
    tax
  };
}

function seedCompanyDefaults(companyId) {
  const accounts = [
    ['1101', '現金', 'asset'],
    ['1102', '銀行存款', 'asset'],
    ['1201', '應收帳款', 'asset'],
    ['1301', '商品存貨', 'asset'],
    ['2101', '應付帳款', 'liability'],
    ['3101', '業主資本', 'equity'],
    ['4101', '銷貨收入', 'revenue'],
    ['5101', '商品成本', 'expense'],
    ['5201', '平台手續費', 'expense'],
    ['5901', '雜項費用', 'expense']
  ];

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO accounts (
      company_id,
      code,
      name,
      type
    )
    VALUES (?,?,?,?)
  `);

  accounts.forEach((a) => stmt.run(companyId, ...a));
}

app.get('/api/health', (_, res) => {
  res.json({
    ok: true,
    name: 'BookAI Commerce ERP Hub'
  });
});

app.post('/api/auth/register', (req, res) => {
  const {
    name,
    email,
    password,
    companyName,
    taxId,
    industry,
    companyAddress,
    address,
    plan = 'business'
  } = req.body;

  if (!email || !password || !companyName) {
    return res.status(400).json({ error: '請填寫必要欄位' });
  }

  const finalAddress = companyAddress || address || '';
  const hash = bcrypt.hashSync(password, 10);

  try {
    const user = db.prepare(`
      INSERT INTO users (
        name,
        email,
        password_hash
      )
      VALUES (?,?,?)
    `).run(name || '使用者', email, hash);

    const companyRow = db.prepare(`
      INSERT INTO companies (
        name,
        tax_id,
        industry,
        companyAddress,
        address,
        plan,
        owner_id
      )
      VALUES (?,?,?,?,?,?,?)
    `).run(
      companyName,
      taxId || '',
      industry || '',
      finalAddress,
      finalAddress,
      plan,
      user.lastInsertRowid
    );

    db.prepare(`
      INSERT INTO company_users (
        company_id,
        user_id,
        role
      )
      VALUES (?,?,?)
    `).run(companyRow.lastInsertRowid, user.lastInsertRowid, 'owner');

    seedCompanyDefaults(companyRow.lastInsertRowid);

    audit(companyRow.lastInsertRowid, user.lastInsertRowid, 'register', '建立帳號與公司');

    const newUser = db.prepare(`
      SELECT
        id,
        name,
        email
      FROM users
      WHERE id = ?
    `).get(user.lastInsertRowid);

    res.json({
      token: sign(newUser),
      user: newUser,
      companyId: companyRow.lastInsertRowid
    });
  } catch (e) {
    res.status(400).json({
      error: '帳號可能已存在',
      detail: e.message
    });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  const user = db.prepare(`
    SELECT *
    FROM users
    WHERE email = ?
  `).get(email);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: '帳號或密碼錯誤' });
  }

  const safe = {
    id: user.id,
    name: user.name,
    email: user.email
  };

  res.json({
    token: sign(safe),
    user: safe
  });
});

app.get('/api/me', auth, (req, res) => {
  const user = db.prepare(`
    SELECT
      id,
      name,
      email
    FROM users
    WHERE id = ?
  `).get(req.user.id);

  const companies = db.prepare(`
    SELECT
      c.*,
      cu.role
    FROM companies c
    JOIN company_users cu ON cu.company_id = c.id
    WHERE cu.user_id = ?
  `).all(req.user.id);

  res.json({
    user,
    companies,
    plans
  });
});

app.get('/api/plans', (_, res) => {
  res.json(plans);
});

const adminBillingStatuses = new Set(['trial', 'active', 'expired', 'paused']);
const adminWebsiteStatuses = new Set(['none', 'planning', 'building', 'live', 'paused']);
const adminSettingKeys = new Set([
  'official_site_url',
  'official_line_url',
  'default_trial_days',
  'renewal_reminder_days',
  'enable_website_backend',
  'system_announcement'
]);

function toAdminBoolean(value) {
  if (value === true || value === 1) return 1;
  const text = String(value ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', '是', 'on'].includes(text) ? 1 : 0;
}

app.get('/api/admin/companies', auth, requireAdmin, (req, res) => {
  const companies = db.prepare(`
    SELECT
      c.id,
      c.name,
      c.tax_id,
      c.industry,
      c.plan,
      c.billing_status,
      c.subscription_plan,
      c.subscription_started_at,
      c.subscription_expires_at,
      c.is_paid_customer,
      c.billing_note,
      c.has_official_site,
      c.official_site_url,
      c.official_site_status,
      c.official_site_note,
      c.created_at,
      u.name AS owner_name,
      u.email AS owner_email
    FROM companies c
    LEFT JOIN users u ON u.id = c.owner_id
    ORDER BY c.created_at DESC, c.id DESC
  `).all();

  res.json(companies);
});

app.patch('/api/admin/companies/:companyId/billing', auth, requireAdmin, (req, res) => {
  const companyId = Number(req.params.companyId);
  const {
    billing_status,
    subscription_plan,
    subscription_expires_at,
    is_paid_customer,
    billing_note
  } = req.body || {};

  if (!companyId) {
    return res.status(400).json({ error: '缺少 companyId' });
  }

  if (billing_status && !adminBillingStatuses.has(billing_status)) {
    return res.status(400).json({ error: '不支援的使用狀態' });
  }

  const existing = db.prepare(`
    SELECT id
    FROM companies
    WHERE id = ?
  `).get(companyId);

  if (!existing) {
    return res.status(404).json({ error: '找不到公司' });
  }

  db.prepare(`
    UPDATE companies
    SET
      billing_status = ?,
      subscription_plan = ?,
      subscription_expires_at = ?,
      is_paid_customer = ?,
      billing_note = ?
    WHERE id = ?
  `).run(
    billing_status || 'trial',
    subscription_plan || 'engineering_trial',
    subscription_expires_at || '',
    toAdminBoolean(is_paid_customer),
    billing_note || '',
    companyId
  );

  audit(companyId, req.user.id, 'admin_billing_updated', JSON.stringify({
    billing_status,
    subscription_plan,
    subscription_expires_at
  }));

  res.json({ ok: true });
});

app.patch('/api/admin/companies/:companyId/website', auth, requireAdmin, (req, res) => {
  const companyId = Number(req.params.companyId);
  const {
    has_official_site,
    official_site_url,
    official_site_status,
    official_site_note
  } = req.body || {};

  if (!companyId) {
    return res.status(400).json({ error: '缺少 companyId' });
  }

  if (official_site_status && !adminWebsiteStatuses.has(official_site_status)) {
    return res.status(400).json({ error: '不支援的網站狀態' });
  }

  const existing = db.prepare(`
    SELECT id
    FROM companies
    WHERE id = ?
  `).get(companyId);

  if (!existing) {
    return res.status(404).json({ error: '找不到公司' });
  }

  db.prepare(`
    UPDATE companies
    SET
      has_official_site = ?,
      official_site_url = ?,
      official_site_status = ?,
      official_site_note = ?
    WHERE id = ?
  `).run(
    toAdminBoolean(has_official_site),
    official_site_url || '',
    official_site_status || 'none',
    official_site_note || '',
    companyId
  );

  audit(companyId, req.user.id, 'admin_website_updated', official_site_status || 'none');

  res.json({ ok: true });
});

app.get('/api/admin/settings', auth, requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT key, value
    FROM platform_settings
    ORDER BY key
  `).all();

  res.json(Object.fromEntries(rows.map((row) => [row.key, row.value || ''])));
});

app.patch('/api/admin/settings', auth, requireAdmin, (req, res) => {
  const body = req.body || {};
  const stmt = db.prepare(`
    INSERT INTO platform_settings (
      key,
      value,
      updated_at
    )
    VALUES (?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP
  `);

  Object.entries(body).forEach(([key, value]) => {
    if (adminSettingKeys.has(key)) {
      stmt.run(key, String(value ?? ''));
    }
  });

  audit(null, req.user.id, 'admin_settings_updated', Object.keys(body).join(','));

  const rows = db.prepare(`
    SELECT key, value
    FROM platform_settings
    ORDER BY key
  `).all();

  res.json(Object.fromEntries(rows.map((row) => [row.key, row.value || ''])));
});

app.patch('/api/companies/:companyId/plan', auth, company, (req, res) => {
  const { plan } = req.body;

  if (!plans[plan]) {
    return res.status(400).json({ error: '未知方案' });
  }

  db.prepare(`
    UPDATE companies
    SET plan = ?
    WHERE id = ?
  `).run(plan, req.company.id);

  audit(req.company.id, req.user.id, 'plan_changed', plan);

  res.json({
    ok: true,
    plan
  });
});

app.get('/api/companies/:companyId/summary', auth, company, (req, res) => {
  const income = db.prepare(`
    SELECT COALESCE(SUM(gross_amount),0) total
    FROM transactions
    WHERE company_id = ?
  `).get(req.company.id).total;

  const fees = db.prepare(`
    SELECT COALESCE(SUM(platform_fee),0) total
    FROM transactions
    WHERE company_id = ?
  `).get(req.company.id).total;

  const cogs = db.prepare(`
    SELECT COALESCE(SUM(cost_of_goods_sold),0) total
    FROM transactions
    WHERE company_id = ?
  `).get(req.company.id).total;

  const vouchers = db.prepare(`
    SELECT COALESCE(SUM(amount),0) total
    FROM vouchers
    WHERE company_id = ?
  `).get(req.company.id).total;

  const invoicesPending = db.prepare(`
    SELECT COUNT(*) count
    FROM invoices
    WHERE company_id = ?
      AND status != 'issued'
  `).get(req.company.id).count;

  const txCount = db.prepare(`
    SELECT COUNT(*) count
    FROM transactions
    WHERE company_id = ?
  `).get(req.company.id).count;

  const revenueByPlatform = db.prepare(`
    SELECT
      platform_key name,
      SUM(gross_amount) value
    FROM transactions
    WHERE company_id = ?
    GROUP BY platform_key
  `).all(req.company.id);

  const lowStock = db.prepare(`
    SELECT COUNT(*) count
    FROM products
    WHERE company_id = ?
      AND stock <= safety_stock
  `).get(req.company.id).count;

  res.json({
    revenue: income,
    expenses: fees + cogs + vouchers,
    netProfit: income - fees - cogs - vouchers,
    cogs,
    fees,
    txCount,
    invoicesPending,
    revenueByPlatform,
    lowStock
  });
});

const leadStatuses = new Set(['new', 'contacted', 'site_visit', 'quoted', 'won', 'lost', 'converted']);
const leadRiskLevels = new Set(['low', 'medium', 'high']);

function clampScore(value) {
  const n = Number(value ?? 70);
  if (!Number.isFinite(n)) return 70;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function leadValue(body, snake, camel, fallback = '') {
  return body[snake] ?? body[camel] ?? fallback;
}

function normalizeLeadInput(body = {}, existing = {}) {
  const title = leadValue(body, 'title', 'title', existing.title || '');
  const riskLevel = leadValue(body, 'risk_level', 'riskLevel', existing.risk_level || 'medium');
  const status = leadValue(body, 'status', 'status', existing.status || 'new');

  return {
    title: String(title || '').trim(),
    clientName: leadValue(body, 'client_name', 'clientName', existing.client_name || ''),
    clientPhone: leadValue(body, 'client_phone', 'phone', existing.client_phone || ''),
    source: leadValue(body, 'source', 'sourceType', existing.source || '手動新增'),
    region: leadValue(body, 'region', 'location', existing.region || ''),
    agencyType: leadValue(body, 'agency_type', 'agencyType', existing.agency_type || '私人客戶'),
    projectType: leadValue(body, 'project_type', 'projectType', existing.project_type || ''),
    estimatedAmount: Number(leadValue(body, 'estimated_amount', 'estimatedAmount', existing.estimated_amount || 0) || 0),
    estimatedCost: Number(leadValue(body, 'estimated_cost', 'estimatedCost', existing.estimated_cost || 0) || 0),
    expectedMargin: Number(leadValue(body, 'expected_margin', 'expectedMargin', existing.expected_margin || 0) || 0),
    riskLevel: leadRiskLevels.has(riskLevel) ? riskLevel : 'medium',
    fitScore: clampScore(leadValue(body, 'fit_score', 'fitScore', existing.fit_score ?? 70)),
    status: leadStatuses.has(status) ? status : 'new',
    nextAction: leadValue(body, 'next_action', 'nextAction', existing.next_action || ''),
    note: leadValue(body, 'note', 'rawContent', existing.note || ''),
    tenderSource: leadValue(body, 'tender_source', 'tenderSource', existing.tender_source || ''),
    tenderRef: leadValue(body, 'tender_ref', 'tenderRef', existing.tender_ref || '')
  };
}

function leadRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    companyId: row.company_id,
    title: row.title,
    clientName: row.client_name || '',
    phone: row.client_phone || '',
    sourceType: row.source || '',
    location: row.region || '',
    agencyType: row.agency_type || '',
    projectType: row.project_type || '',
    estimatedAmount: row.estimated_amount || 0,
    estimatedCost: row.estimated_cost || 0,
    expectedMargin: row.expected_margin || 0,
    riskLevel: row.risk_level || 'medium',
    fitScore: row.fit_score || 70,
    aiScore: row.fit_score || 70,
    status: row.status || 'new',
    nextAction: row.next_action || '',
    rawContent: row.note || '',
    note: row.note || '',
    tenderSource: row.tender_source || '',
    tenderRef: row.tender_ref || '',
    tenderId: row.tender_ref || '',
    convertedJobSiteId: row.converted_job_site_id || null,
    converted: row.status === 'converted' || Boolean(row.converted_job_site_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function getLead(companyId, leadId) {
  return db.prepare(`
    SELECT *
    FROM leads
    WHERE id = ?
      AND company_id = ?
  `).get(leadId, companyId);
}

app.get('/api/companies/:companyId/leads', auth, company, (req, res) => {
  const where = ['company_id = ?'];
  const params = [req.company.id];

  if (req.query.status) {
    where.push('status = ?');
    params.push(req.query.status);
  }

  if (req.query.source) {
    where.push('source = ?');
    params.push(req.query.source);
  }

  if (req.query.project_type) {
    where.push('project_type = ?');
    params.push(req.query.project_type);
  }

  if (req.query.risk_level) {
    where.push('risk_level = ?');
    params.push(req.query.risk_level);
  }

  if (req.query.search) {
    where.push(`(
      title LIKE ?
      OR client_name LIKE ?
      OR client_phone LIKE ?
      OR source LIKE ?
      OR region LIKE ?
      OR project_type LIKE ?
      OR note LIKE ?
    )`);
    const q = `%${req.query.search}%`;
    params.push(q, q, q, q, q, q, q);
  }

  const rows = db.prepare(`
    SELECT *
    FROM leads
    WHERE ${where.join(' AND ')}
    ORDER BY created_at DESC, id DESC
  `).all(...params);

  res.json(rows.map(leadRow));
});

app.post('/api/companies/:companyId/leads', auth, company, requireRole('owner', 'admin', 'staff'), (req, res) => {
  const input = normalizeLeadInput(req.body);

  if (!input.title) {
    return res.status(400).json({ error: '請輸入案源名稱' });
  }

  const row = db.prepare(`
    INSERT INTO leads (
      company_id,
      title,
      client_name,
      client_phone,
      source,
      region,
      agency_type,
      project_type,
      estimated_amount,
      estimated_cost,
      expected_margin,
      risk_level,
      fit_score,
      status,
      next_action,
      note,
      tender_source,
      tender_ref,
      created_at,
      updated_at
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `).run(
    req.company.id,
    input.title,
    input.clientName,
    input.clientPhone,
    input.source,
    input.region,
    input.agencyType,
    input.projectType,
    input.estimatedAmount,
    input.estimatedCost,
    input.expectedMargin,
    input.riskLevel,
    input.fitScore,
    input.status,
    input.nextAction,
    input.note,
    input.tenderSource,
    input.tenderRef
  );

  audit(req.company.id, req.user.id, 'lead_created', String(row.lastInsertRowid));

  res.json(leadRow(getLead(req.company.id, row.lastInsertRowid)));
});

app.patch('/api/companies/:companyId/leads/:leadId', auth, company, requireRole('owner', 'admin', 'staff'), (req, res) => {
  const leadId = Number(req.params.leadId);
  const existing = getLead(req.company.id, leadId);

  if (!existing) {
    return res.status(404).json({ error: '找不到此案源，或你沒有權限修改' });
  }

  const input = normalizeLeadInput(req.body, existing);

  if (!input.title) {
    return res.status(400).json({ error: '請輸入案源名稱' });
  }

  db.prepare(`
    UPDATE leads
    SET
      title = ?,
      client_name = ?,
      client_phone = ?,
      source = ?,
      region = ?,
      agency_type = ?,
      project_type = ?,
      estimated_amount = ?,
      estimated_cost = ?,
      expected_margin = ?,
      risk_level = ?,
      fit_score = ?,
      status = ?,
      next_action = ?,
      note = ?,
      tender_source = ?,
      tender_ref = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND company_id = ?
  `).run(
    input.title,
    input.clientName,
    input.clientPhone,
    input.source,
    input.region,
    input.agencyType,
    input.projectType,
    input.estimatedAmount,
    input.estimatedCost,
    input.expectedMargin,
    input.riskLevel,
    input.fitScore,
    input.status,
    input.nextAction,
    input.note,
    input.tenderSource,
    input.tenderRef,
    leadId,
    req.company.id
  );

  audit(req.company.id, req.user.id, 'lead_updated', String(leadId));

  res.json(leadRow(getLead(req.company.id, leadId)));
});

app.delete('/api/companies/:companyId/leads/:leadId', auth, company, requireRole('owner', 'admin', 'staff'), (req, res) => {
  const leadId = Number(req.params.leadId);
  const existing = getLead(req.company.id, leadId);

  if (!existing) {
    return res.status(404).json({ error: '找不到此案源，或你沒有權限刪除' });
  }

  db.prepare(`
    DELETE FROM leads
    WHERE id = ?
      AND company_id = ?
  `).run(leadId, req.company.id);

  audit(req.company.id, req.user.id, 'lead_deleted', String(leadId));

  res.json({ ok: true });
});

app.post('/api/companies/:companyId/leads/:leadId/convert-to-jobsite', auth, company, requireRole('owner', 'admin'), (req, res) => {
  const leadId = Number(req.params.leadId);
  const lead = getLead(req.company.id, leadId);

  if (!lead) {
    return res.status(404).json({ error: '找不到此案源，或你沒有權限轉成案場' });
  }

  if (lead.converted_job_site_id) {
    return res.status(400).json({ error: '此案源已轉成案場' });
  }

  const tx = db.transaction(() => {
    const row = db.prepare(`
      INSERT INTO job_sites (
        company_id,
        name,
        site_name,
        client_name,
        client_phone,
        address,
        project_type,
        quote_amount,
        subtotal_amount,
        total_amount,
        status,
        note,
        created_at,
        updated_at
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?, ?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `).run(
      req.company.id,
      lead.title,
      lead.title,
      lead.client_name || '',
      lead.client_phone || '',
      lead.region || '',
      lead.project_type || '',
      Number(lead.estimated_amount || 0),
      Number(lead.estimated_amount || 0),
      Number(lead.estimated_amount || 0),
      '已簽約',
      lead.note || '由接案中心轉成案場'
    );

    db.prepare(`
      UPDATE leads
      SET
        status = 'converted',
        converted_job_site_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND company_id = ?
    `).run(row.lastInsertRowid, leadId, req.company.id);

    return row.lastInsertRowid;
  });

  const jobSiteId = tx();

  audit(req.company.id, req.user.id, 'lead_converted_to_jobsite', `${leadId} -> ${jobSiteId}`);

  const jobSite = db.prepare(`
    SELECT
      id,
      company_id AS companyId,
      COALESCE(site_name, name) AS siteName,
      COALESCE(client_name, '') AS clientName,
      COALESCE(client_phone, '') AS clientPhone,
      COALESCE(address, '') AS address,
      COALESCE(project_type, '') AS projectType,
      COALESCE(quote_amount, 0) AS quoteAmount,
      COALESCE(status, '已簽約') AS status,
      COALESCE(note, '') AS note,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM job_sites
    WHERE id = ?
      AND company_id = ?
  `).get(jobSiteId, req.company.id);

  res.json({
    lead: leadRow(getLead(req.company.id, leadId)),
    jobSite
  });
});

// ===============================
// 工程業案場中心 API
// ===============================

try {
  db.prepare("ALTER TABLE job_sites ADD COLUMN client_phone TEXT").run();
  console.log("✅ job_sites 已新增 client_phone 欄位");
} catch (err) {
  if (!String(err.message || "").includes("duplicate column name")) {
    console.error("新增 client_phone 欄位失敗：", err.message);
  }
}


app.get('/api/companies/:companyId/jobsites', auth, company, (req, res) => {
  const rows = db.prepare(`
    SELECT
      id,
      company_id AS companyId,
      COALESCE(site_name, name) AS siteName,
      COALESCE(client_name, '') AS clientName,
      COALESCE(client_phone, '') AS clientPhone,
      COALESCE(address, '') AS address,
      COALESCE(project_type, '') AS projectType,
      COALESCE(area_pings, 0) AS areaPings,
      COALESCE(price_per_ping, 0) AS pricePerPing,
      COALESCE(food_cost, 0) AS foodCost,
      COALESCE(quote_amount, 0) AS quoteAmount,
      COALESCE(estimate_cost_total, 0) AS estimateCostTotal,
      COALESCE(tax_mode, 'not_taxed') AS taxMode,
      COALESCE(tax_rate, 0.05) AS taxRate,
      COALESCE(subtotal_amount, quote_amount, 0) AS subtotalAmount,
      COALESCE(tax_amount, 0) AS taxAmount,
      COALESCE(total_amount, quote_amount, 0) AS totalAmount,
      COALESCE((
        SELECT SUM(jsp.amount)
        FROM job_site_payments jsp
        WHERE jsp.company_id = job_sites.company_id
          AND jsp.job_site_id = job_sites.id
      ), 0) AS receivedAmount,
      COALESCE(material_cost, 0) AS materialCost,
      COALESCE(labor_cost, 0) AS laborCost,
      COALESCE(outsourced_cost, 0) AS outsourcedCost,
      COALESCE(misc_cost, 0) AS miscCost,
      COALESCE(status, '已報價') AS status,
      COALESCE(note, '') AS note,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM job_sites
    WHERE company_id = ?
    ORDER BY id DESC
  `).all(req.company.id);

  res.json(rows);
});

app.post('/api/companies/:companyId/jobsites', auth, company, requireRole('owner', 'admin'), (req, res) => {
  const {
    siteName,
    name,
    clientName,
    clientPhone,
    address,
    projectType,
    areaPings,
    areaPing,
    paintAreaPing,
    pricePerPing,
    paintPricePerPing,
    foodCost,
    quoteAmount,
    receivedAmount,
    materialCost,
    laborCost,
    outsourcedCost,
    miscCost,
    taxMode,
    taxRate,
    subtotalAmount,
    taxAmount,
    totalAmount,
    status,
    note
  } = req.body;

  const finalSiteName = siteName || name || '';

  if (!finalSiteName.trim()) {
    return res.status(400).json({ error: '請輸入案場名稱' });
  }

  const row = db.prepare(`
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
      food_cost,
      quote_amount,
      tax_mode,
      tax_rate,
      subtotal_amount,
      tax_amount,
      total_amount,
      received_amount,
      material_cost,
      labor_cost,
      outsourced_cost,
      misc_cost,
      status,
      note,
      created_at,
      updated_at
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `).run(
    req.company.id,
    finalSiteName.trim(),
    finalSiteName.trim(),
    clientName || '',
    clientPhone || '',
    address || '',
    projectType || '',
    Number(areaPings ?? areaPing ?? paintAreaPing ?? 0),
    Number(pricePerPing ?? paintPricePerPing ?? 0),
    Number(foodCost || 0),
    Number(quoteAmount || totalAmount || 0),
    taxMode || 'not_taxed',
    Number(taxRate ?? 0.05),
    Number(subtotalAmount ?? quoteAmount ?? totalAmount ?? 0),
    Number(taxAmount || 0),
    Number(totalAmount ?? quoteAmount ?? 0),
    Number(receivedAmount || 0),
    Number(materialCost || 0),
    Number(laborCost || 0),
    Number(outsourcedCost || 0),
    Number(miscCost || 0),
    status || '已報價',
    note || ''
  );

  audit(req.company.id, req.user.id, 'jobsite_created', String(row.lastInsertRowid));

  const created = db.prepare(`
    SELECT
      id,
      company_id AS companyId,
      COALESCE(site_name, name) AS siteName,
      COALESCE(client_name, '') AS clientName,
      COALESCE(client_phone, '') AS clientPhone,
      COALESCE(address, '') AS address,
      COALESCE(project_type, '') AS projectType,
      COALESCE(area_pings, 0) AS areaPings,
      COALESCE(price_per_ping, 0) AS pricePerPing,
      COALESCE(food_cost, 0) AS foodCost,
      COALESCE(quote_amount, 0) AS quoteAmount,
      COALESCE(tax_mode, 'not_taxed') AS taxMode,
      COALESCE(tax_rate, 0.05) AS taxRate,
      COALESCE(subtotal_amount, quote_amount, 0) AS subtotalAmount,
      COALESCE(tax_amount, 0) AS taxAmount,
      COALESCE(total_amount, quote_amount, 0) AS totalAmount,
      COALESCE((
        SELECT SUM(jsp.amount)
        FROM job_site_payments jsp
        WHERE jsp.company_id = job_sites.company_id
          AND jsp.job_site_id = job_sites.id
      ), 0) AS receivedAmount,
      COALESCE(material_cost, 0) AS materialCost,
      COALESCE(labor_cost, 0) AS laborCost,
      COALESCE(outsourced_cost, 0) AS outsourcedCost,
      COALESCE(misc_cost, 0) AS miscCost,
      COALESCE(status, '已報價') AS status,
      COALESCE(note, '') AS note,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM job_sites
    WHERE id = ?
      AND company_id = ?
  `).get(row.lastInsertRowid, req.company.id);

  res.json(created);
});


app.patch('/api/companies/:companyId/jobsites/:jobsiteId', auth, company, requireRole('owner', 'admin'), (req, res) => {
  const jobsiteId = Number(req.params.jobsiteId);

  if (!jobsiteId) {
    return res.status(400).json({ error: '缺少 jobsiteId' });
  }

  const {
    siteName,
    name,
    clientName,
    clientPhone,
    address,
    projectType,
    areaPings,
    areaPing,
    paintAreaPing,
    pricePerPing,
    paintPricePerPing,
    foodCost,
    quoteAmount,
    receivedAmount,
    materialCost,
    laborCost,
    outsourcedCost,
    miscCost,
    taxMode,
    taxRate,
    subtotalAmount,
    taxAmount,
    totalAmount,
    status,
    note
  } = req.body;

  const finalSiteName = siteName || name || '';

  if (!finalSiteName.trim()) {
    return res.status(400).json({ error: '請輸入案場名稱' });
  }

  const result = db.prepare(`
    UPDATE job_sites
    SET
      name = ?,
      site_name = ?,
      client_name = ?,
      client_phone = ?,
      address = ?,
      project_type = ?,
      area_pings = ?,
      price_per_ping = ?,
      food_cost = ?,
      quote_amount = ?,
      tax_mode = ?,
      tax_rate = ?,
      subtotal_amount = ?,
      tax_amount = ?,
      total_amount = ?,
      received_amount = ?,
      material_cost = ?,
      labor_cost = ?,
      outsourced_cost = ?,
      misc_cost = ?,
      status = ?,
      note = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND company_id = ?
  `).run(
    finalSiteName.trim(),
    finalSiteName.trim(),
    clientName || '',
    clientPhone || '',
    address || '',
    projectType || '',
    Number(areaPings ?? areaPing ?? paintAreaPing ?? 0),
    Number(pricePerPing ?? paintPricePerPing ?? 0),
    Number(foodCost || 0),
    Number(quoteAmount || totalAmount || 0),
    taxMode || 'not_taxed',
    Number(taxRate ?? 0.05),
    Number(subtotalAmount ?? quoteAmount ?? totalAmount ?? 0),
    Number(taxAmount || 0),
    Number(totalAmount ?? quoteAmount ?? 0),
    Number(receivedAmount || 0),
    Number(materialCost || 0),
    Number(laborCost || 0),
    Number(outsourcedCost || 0),
    Number(miscCost || 0),
    status || '已報價',
    note || '',
    jobsiteId,
    req.company.id
  );

  if (result.changes === 0) {
    return res.status(404).json({
      error: '找不到此案場，或你沒有權限修改'
    });
  }

  audit(req.company.id, req.user.id, 'jobsite_updated', String(jobsiteId));

  const updated = db.prepare(`
    SELECT
      id,
      company_id AS companyId,
      COALESCE(site_name, name) AS siteName,
      COALESCE(client_name, '') AS clientName,
      COALESCE(client_phone, '') AS clientPhone,
      COALESCE(address, '') AS address,
      COALESCE(project_type, '') AS projectType,
      COALESCE(area_pings, 0) AS areaPings,
      COALESCE(price_per_ping, 0) AS pricePerPing,
      COALESCE(food_cost, 0) AS foodCost,
      COALESCE(quote_amount, 0) AS quoteAmount,
      COALESCE(tax_mode, 'not_taxed') AS taxMode,
      COALESCE(tax_rate, 0.05) AS taxRate,
      COALESCE(subtotal_amount, quote_amount, 0) AS subtotalAmount,
      COALESCE(tax_amount, 0) AS taxAmount,
      COALESCE(total_amount, quote_amount, 0) AS totalAmount,
      COALESCE((
        SELECT SUM(jsp.amount)
        FROM job_site_payments jsp
        WHERE jsp.company_id = job_sites.company_id
          AND jsp.job_site_id = job_sites.id
      ), 0) AS receivedAmount,
      COALESCE(material_cost, 0) AS materialCost,
      COALESCE(labor_cost, 0) AS laborCost,
      COALESCE(outsourced_cost, 0) AS outsourcedCost,
      COALESCE(misc_cost, 0) AS miscCost,
      COALESCE(status, '已報價') AS status,
      COALESCE(note, '') AS note,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM job_sites
    WHERE id = ?
      AND company_id = ?
  `).get(jobsiteId, req.company.id);

  res.json(updated);
});

app.delete('/api/companies/:companyId/jobsites/:jobsiteId', auth, company, requireRole('owner', 'admin'), (req, res) => {
  const jobsiteId = Number(req.params.jobsiteId);

  if (!jobsiteId) {
    return res.status(400).json({ error: '缺少案場 ID' });
  }

  const jobsite = ensureJobSite(req.company.id, jobsiteId);

  if (!jobsite) {
    return res.status(404).json({ error: '找不到此案場，或你沒有權限刪除' });
  }

  try {
    const tx = db.transaction(() => {
      // 估價明細屬於案場資料，刪案場時一併清除
      const deletedEstimateItems = db.prepare(`
        DELETE FROM job_site_estimate_items
        WHERE company_id = ?
          AND job_site_id = ?
      `).run(req.company.id, jobsiteId).changes;

      // 收款紀錄屬於案場資料，刪案場時一併清除
      const deletedPayments = db.prepare(`
        DELETE FROM job_site_payments
        WHERE company_id = ?
          AND job_site_id = ?
      `).run(req.company.id, jobsiteId).changes;

      // 庫存異動是歷史紀錄，不刪除，只解除案場關聯，避免 FK 卡住
      const detachedInventoryMovements = db.prepare(`
        UPDATE inventory_movements
        SET job_site_id = NULL
        WHERE company_id = ?
          AND job_site_id = ?
      `).run(req.company.id, jobsiteId).changes;

      const deletedJobSite = db.prepare(`
        DELETE FROM job_sites
        WHERE id = ?
          AND company_id = ?
      `).run(jobsiteId, req.company.id).changes;

      if (deletedJobSite === 0) {
        throw new Error('案場刪除失敗，找不到資料');
      }

      audit(
        req.company.id,
        req.user.id,
        'jobsite_deleted',
        JSON.stringify({
          jobsiteId,
          deletedEstimateItems,
          deletedPayments,
          detachedInventoryMovements
        })
      );

      return {
        deletedJobSite,
        deletedEstimateItems,
        deletedPayments,
        detachedInventoryMovements
      };
    });

    const result = tx();

    res.json({
      ok: true,
      ...result
    });
  } catch (err) {
    console.error('刪除案場失敗：', err);
    res.status(500).json({
      error: err.message || '刪除案場失敗'
    });
  }
});



function calculateEstimateAmount(quantity, unitPrice) {
  const q = Number(quantity || 0);
  const p = Number(unitPrice || 0);
  return Math.round(q * p);
}

function refreshJobSiteEstimateTotals(companyId, jobsiteId) {
  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(amount), 0) AS estimateTotal,
      COALESCE(SUM(cost_amount), 0) AS estimateCostTotal
    FROM job_site_estimate_items
    WHERE company_id = ?
      AND job_site_id = ?
  `).get(companyId, jobsiteId);

  const site = db.prepare(`
    SELECT
      COALESCE(tax_mode, 'not_taxed') AS taxMode,
      COALESCE(tax_rate, 0.05) AS taxRate
    FROM job_sites
    WHERE company_id = ?
      AND id = ?
  `).get(companyId, jobsiteId);

  const estimateTotal = Number(totals?.estimateTotal || 0);
  const estimateCostTotal = Number(totals?.estimateCostTotal || 0);
  const taxMode = site?.taxMode || 'not_taxed';
  const taxRate = Number(site?.taxRate ?? 0.05);

  let subtotalAmount = estimateTotal;
  let taxAmount = 0;
  let totalAmount = estimateTotal;

  if (taxMode === 'tax_excluded') {
    subtotalAmount = estimateTotal;
    taxAmount = Math.round(subtotalAmount * taxRate);
    totalAmount = subtotalAmount + taxAmount;
  } else if (taxMode === 'tax_included') {
    totalAmount = estimateTotal;
    subtotalAmount = taxRate > 0 ? Math.round(totalAmount / (1 + taxRate)) : totalAmount;
    taxAmount = totalAmount - subtotalAmount;
  }

  db.prepare(`
    UPDATE job_sites
    SET
      quote_amount = ?,
      subtotal_amount = ?,
      tax_amount = ?,
      total_amount = ?,
      estimate_cost_total = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE company_id = ?
      AND id = ?
  `).run(
    totalAmount,
    subtotalAmount,
    taxAmount,
    totalAmount,
    estimateCostTotal,
    companyId,
    jobsiteId
  );

  return {
    estimateTotal,
    estimateCostTotal,
    subtotalAmount,
    taxAmount,
    totalAmount,
    taxMode,
    taxRate
  };
}


app.get('/api/companies/:companyId/jobsites/:jobsiteId/estimate-items', auth, company, (req, res) => {
  const jobsiteId = Number(req.params.jobsiteId);

  if (!jobsiteId) {
    return res.status(400).json({ error: '缺少 jobsiteId' });
  }

  const jobsite = ensureJobSite(req.company.id, jobsiteId);

  if (!jobsite) {
    return res.status(404).json({ error: '找不到此案場，或你沒有權限查看估價明細' });
  }

  const items = db.prepare(`
    SELECT
      id,
      company_id AS companyId,
      job_site_id AS jobSiteId,
      work_type AS workType,
      item_category AS itemCategory,
      item_name AS itemName,
      quantity,
      unit,
      unit_price AS unitPrice,
      amount,
      cost_amount AS costAmount,
      note,
      sort_order AS sortOrder,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM job_site_estimate_items
    WHERE company_id = ?
      AND job_site_id = ?
    ORDER BY sort_order ASC, id ASC
  `).all(req.company.id, jobsiteId);

  const totals = refreshJobSiteEstimateTotals(req.company.id, jobsiteId);

  res.json({
    items,
    totals
  });
});

app.post('/api/companies/:companyId/jobsites/:jobsiteId/estimate-items', auth, company, requireRole('owner', 'admin'), (req, res) => {
  const jobsiteId = Number(req.params.jobsiteId);

  if (!jobsiteId) {
    return res.status(400).json({ error: '缺少 jobsiteId' });
  }

  const jobsite = ensureJobSite(req.company.id, jobsiteId);

  if (!jobsite) {
    return res.status(404).json({ error: '找不到此案場，或你沒有權限新增估價明細' });
  }

  const {
    workType,
    itemCategory,
    itemName,
    quantity,
    unit,
    unitPrice,
    amount,
    costAmount,
    note,
    sortOrder
  } = req.body || {};

  const finalItemName = String(itemName || '').trim();

  if (!finalItemName) {
    return res.status(400).json({ error: '請輸入估價項目名稱' });
  }

  const finalQuantity = Number(quantity || 0);
  const finalUnitPrice = Number(unitPrice || 0);
  const finalAmount = amount === undefined || amount === null
    ? calculateEstimateAmount(finalQuantity, finalUnitPrice)
    : Number(amount || 0);

  const row = db.prepare(`
    INSERT INTO job_site_estimate_items (
      company_id,
      job_site_id,
      work_type,
      item_category,
      item_name,
      quantity,
      unit,
      unit_price,
      amount,
      cost_amount,
      note,
      sort_order,
      created_at,
      updated_at
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `).run(
    req.company.id,
    jobsiteId,
    workType || jobsite.project_type || '',
    itemCategory || 'estimate',
    finalItemName,
    finalQuantity,
    unit || '',
    finalUnitPrice,
    finalAmount,
    Number(costAmount || 0),
    note || '',
    Number(sortOrder || 0)
  );

  const totals = refreshJobSiteEstimateTotals(req.company.id, jobsiteId);

  audit(req.company.id, req.user.id, 'jobsite_estimate_item_created', String(row.lastInsertRowid));

  const item = db.prepare(`
    SELECT
      id,
      company_id AS companyId,
      job_site_id AS jobSiteId,
      work_type AS workType,
      item_category AS itemCategory,
      item_name AS itemName,
      quantity,
      unit,
      unit_price AS unitPrice,
      amount,
      cost_amount AS costAmount,
      note,
      sort_order AS sortOrder,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM job_site_estimate_items
    WHERE id = ?
      AND company_id = ?
  `).get(row.lastInsertRowid, req.company.id);

  res.json({
    item,
    totals
  });
});

app.put('/api/companies/:companyId/jobsites/:jobsiteId/estimate-items/:itemId', auth, company, requireRole('owner', 'admin'), (req, res) => {
  const jobsiteId = Number(req.params.jobsiteId);
  const itemId = Number(req.params.itemId);

  if (!jobsiteId || !itemId) {
    return res.status(400).json({ error: '缺少 jobsiteId 或 itemId' });
  }

  const jobsite = ensureJobSite(req.company.id, jobsiteId);

  if (!jobsite) {
    return res.status(404).json({ error: '找不到此案場，或你沒有權限編輯估價明細' });
  }

  const existing = db.prepare(`
    SELECT id
    FROM job_site_estimate_items
    WHERE id = ?
      AND job_site_id = ?
      AND company_id = ?
  `).get(itemId, jobsiteId, req.company.id);

  if (!existing) {
    return res.status(404).json({ error: '找不到此估價明細' });
  }

  const {
    workType,
    itemCategory,
    itemName,
    quantity,
    unit,
    unitPrice,
    amount,
    costAmount,
    note,
    sortOrder
  } = req.body || {};

  const finalItemName = String(itemName || '').trim();

  if (!finalItemName) {
    return res.status(400).json({ error: '請輸入估價項目名稱' });
  }

  const finalQuantity = Number(quantity || 0);
  const finalUnitPrice = Number(unitPrice || 0);
  const finalAmount = amount === undefined || amount === null
    ? calculateEstimateAmount(finalQuantity, finalUnitPrice)
    : Number(amount || 0);

  db.prepare(`
    UPDATE job_site_estimate_items
    SET
      work_type = ?,
      item_category = ?,
      item_name = ?,
      quantity = ?,
      unit = ?,
      unit_price = ?,
      amount = ?,
      cost_amount = ?,
      note = ?,
      sort_order = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND job_site_id = ?
      AND company_id = ?
  `).run(
    workType || jobsite.project_type || '',
    itemCategory || 'estimate',
    finalItemName,
    finalQuantity,
    unit || '',
    finalUnitPrice,
    finalAmount,
    Number(costAmount || 0),
    note || '',
    Number(sortOrder || 0),
    itemId,
    jobsiteId,
    req.company.id
  );

  const totals = refreshJobSiteEstimateTotals(req.company.id, jobsiteId);

  audit(req.company.id, req.user.id, 'jobsite_estimate_item_updated', String(itemId));

  const item = db.prepare(`
    SELECT
      id,
      company_id AS companyId,
      job_site_id AS jobSiteId,
      work_type AS workType,
      item_category AS itemCategory,
      item_name AS itemName,
      quantity,
      unit,
      unit_price AS unitPrice,
      amount,
      cost_amount AS costAmount,
      note,
      sort_order AS sortOrder,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM job_site_estimate_items
    WHERE id = ?
      AND company_id = ?
  `).get(itemId, req.company.id);

  res.json({
    item,
    totals
  });
});

app.delete('/api/companies/:companyId/jobsites/:jobsiteId/estimate-items/:itemId', auth, company, requireRole('owner', 'admin'), (req, res) => {
  const jobsiteId = Number(req.params.jobsiteId);
  const itemId = Number(req.params.itemId);

  if (!jobsiteId || !itemId) {
    return res.status(400).json({ error: '缺少 jobsiteId 或 itemId' });
  }

  const jobsite = ensureJobSite(req.company.id, jobsiteId);

  if (!jobsite) {
    return res.status(404).json({ error: '找不到此案場，或你沒有權限刪除估價明細' });
  }

  const result = db.prepare(`
    DELETE FROM job_site_estimate_items
    WHERE id = ?
      AND job_site_id = ?
      AND company_id = ?
  `).run(itemId, jobsiteId, req.company.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: '找不到此估價明細' });
  }

  const totals = refreshJobSiteEstimateTotals(req.company.id, jobsiteId);

  audit(req.company.id, req.user.id, 'jobsite_estimate_item_deleted', String(itemId));

  res.json({
    ok: true,
    totals
  });
});


// ===============================
// 案場收款紀錄 API
// ===============================

function ensureJobSite(companyId, jobsiteId) {
  return db.prepare(`
    SELECT *
    FROM job_sites
    WHERE id = ?
      AND company_id = ?
  `).get(jobsiteId, companyId);
}

function refreshJobSiteReceivedAmount(companyId, jobsiteId) {
  const total = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM job_site_payments
    WHERE company_id = ?
      AND job_site_id = ?
  `).get(companyId, jobsiteId).total;

  db.prepare(`
    UPDATE job_sites
    SET
      received_amount = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND company_id = ?
  `).run(total, jobsiteId, companyId);

  return total;
}

app.get('/api/companies/:companyId/jobsites/:jobsiteId/payments', auth, company, (req, res) => {
  const jobsiteId = Number(req.params.jobsiteId);

  if (!jobsiteId) {
    return res.status(400).json({ error: '缺少 jobsiteId' });
  }

  const jobsite = ensureJobSite(req.company.id, jobsiteId);

  if (!jobsite) {
    return res.status(404).json({ error: '找不到此案場，或你沒有權限查看' });
  }

  const payments = db.prepare(`
    SELECT
      id,
      company_id AS companyId,
      job_site_id AS jobSiteId,
      amount,
      payment_date AS paymentDate,
      method,
      note,
      created_at AS createdAt
    FROM job_site_payments
    WHERE company_id = ?
      AND job_site_id = ?
    ORDER BY payment_date DESC, id DESC
  `).all(req.company.id, jobsiteId);

  res.json(payments);
});

app.post('/api/companies/:companyId/jobsites/:jobsiteId/payments', auth, company, requireRole('owner', 'admin', 'accounting'), (req, res) => {
  const jobsiteId = Number(req.params.jobsiteId);

  if (!jobsiteId) {
    return res.status(400).json({ error: '缺少 jobsiteId' });
  }

  const jobsite = ensureJobSite(req.company.id, jobsiteId);

  if (!jobsite) {
    return res.status(404).json({ error: '找不到此案場，或你沒有權限新增收款' });
  }

  const {
    amount,
    paymentDate,
    method,
    note
  } = req.body;

  const finalAmount = Number(amount || 0);

  if (finalAmount <= 0) {
    return res.status(400).json({ error: '收款金額必須大於 0' });
  }

  const row = db.prepare(`
    INSERT INTO job_site_payments (
      company_id,
      job_site_id,
      amount,
      payment_date,
      method,
      note,
      created_at
    )
    VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)
  `).run(
    req.company.id,
    jobsiteId,
    finalAmount,
    paymentDate || new Date().toISOString().slice(0, 10),
    method || '現金',
    note || ''
  );

  const receivedAmount = refreshJobSiteReceivedAmount(req.company.id, jobsiteId);

  audit(req.company.id, req.user.id, 'jobsite_payment_created', String(row.lastInsertRowid));

  const payment = db.prepare(`
    SELECT
      id,
      company_id AS companyId,
      job_site_id AS jobSiteId,
      amount,
      payment_date AS paymentDate,
      method,
      note,
      created_at AS createdAt
    FROM job_site_payments
    WHERE id = ?
      AND company_id = ?
  `).get(row.lastInsertRowid, req.company.id);

  res.json({
    payment,
    receivedAmount
  });
});


app.put('/api/companies/:companyId/jobsites/:jobsiteId/payments/:paymentId', auth, company, requireRole('owner', 'admin', 'accounting'), (req, res) => {
  const jobsiteId = Number(req.params.jobsiteId);
  const paymentId = Number(req.params.paymentId);
  const { amount, paymentDate, method, note } = req.body || {};

  if (!jobsiteId || !paymentId) {
    return res.status(400).json({ error: '缺少 jobsiteId 或 paymentId' });
  }

  const jobsite = ensureJobSite(req.company.id, jobsiteId);

  if (!jobsite) {
    return res.status(404).json({ error: '找不到此案場，或你沒有權限編輯收款' });
  }

  const finalAmount = Number(amount || 0);

  if (finalAmount <= 0) {
    return res.status(400).json({ error: '收款金額必須大於 0' });
  }

  const existing = db.prepare(`
    SELECT id
    FROM job_site_payments
    WHERE id = ?
      AND job_site_id = ?
      AND company_id = ?
  `).get(paymentId, jobsiteId, req.company.id);

  if (!existing) {
    return res.status(404).json({ error: '找不到此收款紀錄' });
  }

  db.prepare(`
    UPDATE job_site_payments
    SET
      amount = ?,
      payment_date = ?,
      method = ?,
      note = ?
    WHERE id = ?
      AND job_site_id = ?
      AND company_id = ?
  `).run(
    finalAmount,
    paymentDate || new Date().toISOString().slice(0, 10),
    method || '現金',
    note || '',
    paymentId,
    jobsiteId,
    req.company.id
  );

  const receivedAmount = refreshJobSiteReceivedAmount(req.company.id, jobsiteId);

  audit(req.company.id, req.user.id, 'jobsite_payment_updated', String(paymentId));

  const payment = db.prepare(`
    SELECT
      id,
      company_id AS companyId,
      job_site_id AS jobSiteId,
      amount,
      payment_date AS paymentDate,
      method,
      note,
      created_at AS createdAt
    FROM job_site_payments
    WHERE id = ?
      AND company_id = ?
  `).get(paymentId, req.company.id);

  res.json({
    payment,
    receivedAmount
  });
});

app.delete('/api/companies/:companyId/jobsites/:jobsiteId/payments/:paymentId', auth, company, requireRole('owner', 'admin', 'accounting'), (req, res) => {
  const jobsiteId = Number(req.params.jobsiteId);
  const paymentId = Number(req.params.paymentId);

  if (!jobsiteId || !paymentId) {
    return res.status(400).json({ error: '缺少 jobsiteId 或 paymentId' });
  }

  const jobsite = ensureJobSite(req.company.id, jobsiteId);

  if (!jobsite) {
    return res.status(404).json({ error: '找不到此案場，或你沒有權限刪除收款' });
  }

  const result = db.prepare(`
    DELETE FROM job_site_payments
    WHERE id = ?
      AND job_site_id = ?
      AND company_id = ?
  `).run(paymentId, jobsiteId, req.company.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: '找不到此收款紀錄' });
  }

  const receivedAmount = refreshJobSiteReceivedAmount(req.company.id, jobsiteId);

  audit(req.company.id, req.user.id, 'jobsite_payment_deleted', String(paymentId));

  res.json({
    ok: true,
    receivedAmount
  });
});

app.get('/api/platforms', (_, res) => {
  res.json(platforms);
});

app.get('/api/companies/:companyId/integrations', auth, company, (req, res) => {
  const connected = db.prepare(`
    SELECT *
    FROM platform_accounts
    WHERE company_id = ?
  `).all(req.company.id);

  res.json(
    platforms.map((p) => ({
      ...p,
      account: connected.find((c) => c.platform_key === p.platformKey) || null
    }))
  );
});

app.post('/api/companies/:companyId/integrations/:platformKey/connect', auth, company, (req, res) => {
  const p = platforms.find((x) => x.platformKey === req.params.platformKey);

  if (!p) {
    return res.status(404).json({ error: '未知平台' });
  }

  db.prepare(`
    INSERT OR IGNORE INTO platform_accounts (
      company_id,
      platform_key,
      status
    )
    VALUES (?,?,?)
  `).run(
    req.company.id,
    p.platformKey,
    p.status === 'planned' ? 'planned' : 'mock'
  );

  audit(req.company.id, req.user.id, 'integration_connected', p.platformKey);

  res.json({ ok: true });
});

app.post('/api/companies/:companyId/integrations/:platformKey/sync', auth, company, (req, res) => {
  const p = platforms.find((x) => x.platformKey === req.params.platformKey);

  if (!p) {
    return res.status(404).json({ error: '未知平台' });
  }

  const count = 2 + Math.floor(Math.random() * 4);
  const inserted = [];

  for (let i = 0; i < count; i++) {
    const gross = 300 + Math.floor(Math.random() * 2600);
    const fee = Math.round(
      gross * (
        p.category === 'food_delivery'
          ? 0.28
          : p.category === 'marketplace'
            ? 0.08
            : 0.03
      )
    );

    const discount = Math.random() > 0.6 ? 50 : 0;
    const shipping = p.category === 'marketplace' ? 60 : 0;
    const refund = 0;
    const cogs = Math.round(gross * (p.category === 'food_delivery' ? 0.35 : 0.48));

    const { net, profit, tax } = calcTransaction({
      grossAmount: gross,
      platformFee: fee,
      discountAmount: discount,
      shippingFee: shipping,
      refundAmount: refund,
      costOfGoodsSold: cogs
    });

    const orderId = `${p.platformKey.toUpperCase()}-${nanoid(8)}`;

    const row = db.prepare(`
      INSERT INTO transactions (
        company_id,
        platform_key,
        channel_type,
        external_order_id,
        gross_amount,
        platform_fee,
        discount_amount,
        shipping_fee,
        refund_amount,
        net_amount,
        tax_amount,
        cost_of_goods_sold,
        platform_profit,
        items_json
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      req.company.id,
      p.platformKey,
      p.category,
      orderId,
      gross,
      fee,
      discount,
      shipping,
      refund,
      net,
      tax,
      cogs,
      profit,
      JSON.stringify([
        {
          name: '示範商品',
          qty: 1,
          price: gross,
          cost: cogs
        }
      ])
    );

    inserted.push({
      id: row.lastInsertRowid,
      orderId,
      gross,
      net,
      profit
    });
  }

  db.prepare(`
    INSERT OR REPLACE INTO platform_accounts (
      company_id,
      platform_key,
      status,
      last_sync_at
    )
    VALUES (?,?,?,CURRENT_TIMESTAMP)
  `).run(req.company.id, p.platformKey, 'mock');

  audit(req.company.id, req.user.id, 'integration_sync', `${p.platformKey} ${count}筆`);

  res.json({
    ok: true,
    inserted
  });
});

app.get('/api/companies/:companyId/transactions', auth, company, (req, res) => {
  const rows = db.prepare(`
    SELECT *
    FROM transactions
    WHERE company_id = ?
    ORDER BY occurred_at DESC
  `).all(req.company.id);

  res.json(rows);
});

app.post('/api/companies/:companyId/transactions', auth, company, (req, res) => {
  const t = req.body;
  const { net, profit, tax } = calcTransaction(t);

  const row = db.prepare(`
    INSERT INTO transactions (
      company_id,
      platform_key,
      channel_type,
      external_order_id,
      gross_amount,
      platform_fee,
      discount_amount,
      shipping_fee,
      refund_amount,
      net_amount,
      tax_amount,
      cost_of_goods_sold,
      platform_profit,
      payment_status,
      order_status,
      items_json
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    req.company.id,
    t.platformKey || 'manual',
    t.channelType || 'manual',
    t.externalOrderId || nanoid(8),
    t.grossAmount || 0,
    t.platformFee || 0,
    t.discountAmount || 0,
    t.shippingFee || 0,
    t.refundAmount || 0,
    net,
    tax,
    t.costOfGoodsSold || 0,
    profit,
    t.paymentStatus || 'paid',
    t.orderStatus || 'completed',
    JSON.stringify(t.items || [])
  );

  audit(req.company.id, req.user.id, 'transaction_created', String(row.lastInsertRowid));

  res.json({
    id: row.lastInsertRowid,
    ...t,
    netAmount: net,
    taxAmount: tax,
    platformProfit: profit
  });
});

app.get('/api/companies/:companyId/invoices', auth, company, (req, res) => {
  const rows = db.prepare(`
    SELECT *
    FROM invoices
    WHERE company_id = ?
    ORDER BY created_at DESC
  `).all(req.company.id);

  res.json(rows);
});

app.post('/api/companies/:companyId/invoices', auth, company, (req, res) => {
  const b = req.body;
  const amount = Number(b.amountExclTax || 0);
  const tax = Math.round(amount * 0.05 * 100) / 100;
  const incl = amount + tax;
  const invoiceNo = b.invoiceNo || `BK-${Date.now()}`;

  const row = db.prepare(`
    INSERT INTO invoices (
      company_id,
      invoice_no,
      invoice_type,
      buyer_name,
      buyer_tax_id,
      amount_excl_tax,
      tax_amount,
      amount_incl_tax,
      status,
      issued_at
    )
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    req.company.id,
    invoiceNo,
    b.invoiceType || 'B2C',
    b.buyerName || '',
    b.buyerTaxId || '',
    amount,
    tax,
    incl,
    b.status || 'draft',
    b.status === 'issued' ? new Date().toISOString() : null
  );

  audit(req.company.id, req.user.id, 'invoice_created', invoiceNo);

  res.json({
    id: row.lastInsertRowid,
    invoiceNo,
    taxAmount: tax,
    amountInclTax: incl
  });
});

app.get('/api/companies/:companyId/products', auth, company, (req, res) => {
  const rows = db.prepare(`
    SELECT *
    FROM products
    WHERE company_id = ?
    ORDER BY id DESC
  `).all(req.company.id);

  res.json(rows);
});

app.post('/api/companies/:companyId/products', auth, company, requireRole('owner', 'admin'), (req, res) => {
  const p = req.body;

  const row = db.prepare(`
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
      note
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    req.company.id,
    p.sku || '',
    p.name || '',
    p.category || '',
    p.unit || '',
    Number(p.price || 0),
    Number(p.cost || 0),
    Number(p.stock || 0),
    Number(p.safetyStock ?? p.safety_stock ?? 5),
    p.supplier || '',
    p.storageLocation || p.storage_location || '',
    p.note || ''
  );

  res.json({
    id: row.lastInsertRowid,
    ...p
  });
});


app.get('/api/companies/:companyId/inventory-movements', auth, company, (req, res) => {
  const rows = db.prepare(`
    SELECT
      im.id,
      im.company_id AS companyId,
      im.product_id AS productId,
      im.job_site_id AS jobSiteId,
      im.movement_type AS movementType,
      im.quantity,
      im.before_stock AS beforeStock,
      im.after_stock AS afterStock,
      im.unit_cost AS unitCost,
      im.note,
      im.created_at AS createdAt,
      p.name AS productName,
      p.sku AS productSku,
      p.unit AS unit,
      js.site_name AS jobSiteName
    FROM inventory_movements im
    LEFT JOIN products p ON p.id = im.product_id
    LEFT JOIN job_sites js ON js.id = im.job_site_id
    WHERE im.company_id = ?
    ORDER BY im.id DESC
    LIMIT 100
  `).all(req.company.id);

  res.json(rows);
});

app.post('/api/companies/:companyId/inventory-movements', auth, company, requireRole('owner', 'admin', 'staff'), (req, res) => {
  const {
    productId,
    jobSiteId,
    movementType,
    quantity,
    note
  } = req.body;

  const finalProductId = Number(productId || 0);
  const finalQuantity = Number(quantity || 0);

  if (!finalProductId) {
    return res.status(400).json({ error: '請選擇材料 / 工具' });
  }

  if (finalQuantity <= 0) {
    return res.status(400).json({ error: '數量必須大於 0' });
  }

  const product = db.prepare(`
    SELECT *
    FROM products
    WHERE id = ?
      AND company_id = ?
  `).get(finalProductId, req.company.id);

  if (!product) {
    return res.status(404).json({ error: '找不到此材料 / 工具' });
  }

  const type = movementType || '進貨入庫';
  const beforeStock = Number(product.stock || 0);
  let afterStock = beforeStock;

  if (type === '進貨入庫') {
    afterStock = beforeStock + finalQuantity;
  } else if (type === '案場用料') {
    afterStock = beforeStock - finalQuantity;
  } else if (type === '退料回庫') {
    afterStock = beforeStock + finalQuantity;
  } else if (type === '報廢損耗') {
    afterStock = beforeStock - finalQuantity;
  } else if (type === '盤點調整') {
    afterStock = finalQuantity;
  } else {
    return res.status(400).json({ error: '不支援的庫存異動類型' });
  }

  if (afterStock < 0) {
    return res.status(400).json({ error: '庫存不足，無法扣到負數' });
  }

  const finalJobSiteId = jobSiteId ? Number(jobSiteId) : null;

  if ((type === '案場用料' || type === '退料回庫') && !finalJobSiteId) {
    return res.status(400).json({
      error: type === '案場用料'
        ? '案場用料必須選擇關聯案場，才能正確同步案場材料費'
        : '退料回庫必須選擇關聯案場，才能正確扣回案場材料費'
    });
  }

  if (type === '盤點調整' && finalQuantity < 0) {
    return res.status(400).json({ error: '盤點調整後庫存不可小於 0' });
  }

  if (finalJobSiteId) {
    const jobsite = db.prepare(`
      SELECT id
      FROM job_sites
      WHERE id = ?
        AND company_id = ?
    `).get(finalJobSiteId, req.company.id);

    if (!jobsite) {
      return res.status(404).json({ error: '找不到此案場編號，或此案場不屬於目前公司' });
    }
  }

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE products
      SET stock = ?
      WHERE id = ?
        AND company_id = ?
    `).run(afterStock, finalProductId, req.company.id);

    const unitCost = Number(product.cost || 0);
    const movementCost = finalQuantity * unitCost;

    if (finalJobSiteId && type === '案場用料') {
      db.prepare(`
        UPDATE job_sites
        SET
          material_cost = COALESCE(material_cost, 0) + ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND company_id = ?
      `).run(movementCost, finalJobSiteId, req.company.id);
    }

    if (finalJobSiteId && type === '退料回庫') {
      db.prepare(`
        UPDATE job_sites
        SET
          material_cost = MAX(COALESCE(material_cost, 0) - ?, 0),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND company_id = ?
      `).run(movementCost, finalJobSiteId, req.company.id);
    }

    const row = db.prepare(`
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
      req.company.id,
      finalProductId,
      finalJobSiteId,
      type,
      finalQuantity,
      beforeStock,
      afterStock,
      unitCost,
      note || ''
    );

    return row.lastInsertRowid;
  });

  const movementId = tx();

  audit(req.company.id, req.user.id, 'inventory_movement_created', String(movementId));

  const movement = db.prepare(`
    SELECT
      im.id,
      im.company_id AS companyId,
      im.product_id AS productId,
      im.job_site_id AS jobSiteId,
      im.movement_type AS movementType,
      im.quantity,
      im.before_stock AS beforeStock,
      im.after_stock AS afterStock,
      im.unit_cost AS unitCost,
      im.note,
      im.created_at AS createdAt,
      p.name AS productName,
      p.sku AS productSku,
      p.unit AS unit,
      js.site_name AS jobSiteName
    FROM inventory_movements im
    LEFT JOIN products p ON p.id = im.product_id
    LEFT JOIN job_sites js ON js.id = im.job_site_id
    WHERE im.id = ?
      AND im.company_id = ?
  `).get(movementId, req.company.id);

  res.json(movement);
});


app.get('/api/companies/:companyId/vouchers', auth, company, (req, res) => {
  const rows = db.prepare(`
    SELECT *
    FROM vouchers
    WHERE company_id = ?
    ORDER BY id DESC
  `).all(req.company.id);

  res.json(rows);
});

app.post('/api/companies/:companyId/vouchers', auth, company, (req, res) => {
  const v = req.body;

  const blocked = ['交際', '應酬', '娛樂', '個人', '私用', '禮品', '贈品']
    .some((k) => (v.purpose || '').includes(k));

  const amount = Number(v.amount || 0);
  const tax = Math.round(amount / 1.05 * 0.05 * 100) / 100;

  const row = db.prepare(`
    INSERT INTO vouchers (
      company_id,
      vendor,
      purpose,
      amount,
      tax_amount,
      deductible,
      status
    )
    VALUES (?,?,?,?,?,?,?)
  `).run(
    req.company.id,
    v.vendor,
    v.purpose || '',
    amount,
    tax,
    blocked ? 0 : 1,
    'pending'
  );

  res.json({
    id: row.lastInsertRowid,
    deductible: !blocked,
    taxAmount: tax
  });
});

app.get('/api/companies/:companyId/accounting/accounts', auth, company, requireFeature('accounting_engine'), (req, res) => {
  const rows = db.prepare(`
    SELECT *
    FROM accounts
    WHERE company_id = ?
    ORDER BY code
  `).all(req.company.id);

  res.json(rows);
});

app.get('/api/companies/:companyId/accounting/reports', auth, company, requireFeature('accounting_engine'), (req, res) => {
  const revenue = db.prepare(`
    SELECT COALESCE(SUM(gross_amount),0) total
    FROM transactions
    WHERE company_id = ?
  `).get(req.company.id).total;

  const cogs = db.prepare(`
    SELECT COALESCE(SUM(cost_of_goods_sold),0) total
    FROM transactions
    WHERE company_id = ?
  `).get(req.company.id).total;

  const fees = db.prepare(`
    SELECT COALESCE(SUM(platform_fee),0) total
    FROM transactions
    WHERE company_id = ?
  `).get(req.company.id).total;

  const grossMargin = revenue - cogs;
  const netProfit = revenue - cogs - fees;

  res.json({
    incomeStatement: {
      revenue,
      cogs,
      grossMargin,
      fees,
      netProfit
    },
    costAccounting: {
      grossMarginRate: revenue ? grossMargin / revenue : 0,
      platformFeeRate: revenue ? fees / revenue : 0
    }
  });
});

app.get('/api/companies/:companyId/tax/vat', auth, company, requireFeature('tax_center'), (req, res) => {
  const taxableSales = db.prepare(`
    SELECT COALESCE(SUM(gross_amount / 1.05),0) total
    FROM transactions
    WHERE company_id = ?
  `).get(req.company.id).total;

  const deductiblePurchases = db.prepare(`
    SELECT COALESCE(SUM(amount / 1.05),0) total
    FROM vouchers
    WHERE company_id = ?
      AND deductible = 1
  `).get(req.company.id).total;

  const outputTax = Math.round(taxableSales * 0.05 * 100) / 100;
  const inputTax = Math.round(deductiblePurchases * 0.05 * 100) / 100;

  res.json({
    taxableSales,
    deductiblePurchases,
    outputTax,
    inputTax,
    payableVAT: Math.max(0, outputTax - inputTax),
    disclaimer: '本系統稅務試算僅供管理參考，正式申報仍應以會計師、記帳士或主管機關規定為準。'
  });
});

app.get('/api/companies/:companyId/accountant/clients', auth, company, requireFeature('accountant_console'), (req, res) => {
  const rows = db.prepare(`
    SELECT *
    FROM accountant_clients
    WHERE company_id = ?
    ORDER BY id DESC
  `).all(req.company.id);

  res.json(rows);
});

app.post('/api/companies/:companyId/accountant/clients', auth, company, requireFeature('accountant_console'), (req, res) => {
  const c = req.body;

  const row = db.prepare(`
    INSERT INTO accountant_clients (
      company_id,
      client_name,
      client_tax_id,
      status,
      closing_progress,
      missing_docs
    )
    VALUES (?,?,?,?,?,?)
  `).run(
    req.company.id,
    c.clientName,
    c.clientTaxId || '',
    c.status || 'collecting',
    c.closingProgress || 0,
    c.missingDocs || 0
  );

  res.json({
    id: row.lastInsertRowid,
    ...c
  });
});

app.get('/api/companies/:companyId/audit-logs', auth, company, (req, res) => {
  const rows = db.prepare(`
    SELECT *
    FROM audit_logs
    WHERE company_id = ?
    ORDER BY id DESC
    LIMIT 100
  `).all(req.company.id);

  res.json(rows);
});


// ==============================
// Production frontend static files
// ==============================
const clientDistPath = path.join(__dirname, "../client/dist");
app.use(express.static(clientDistPath));

app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(clientDistPath, "index.html"));
});


// ==============================
// Cloud migration: estimate_cost_total
// ==============================
try {
  const jobSiteColumns = db.prepare("PRAGMA table_info(job_sites)").all().map((c) => c.name);

  if (!jobSiteColumns.includes("estimate_cost_total")) {
    db.prepare("ALTER TABLE job_sites ADD COLUMN estimate_cost_total REAL DEFAULT 0").run();
    console.log("Added column estimate_cost_total to job_sites");
  }

  const hasEstimateItemsTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'job_site_estimate_items'")
    .get();

  if (hasEstimateItemsTable) {
    db.prepare(`
      UPDATE job_sites
      SET estimate_cost_total = COALESCE((
        SELECT SUM(COALESCE(cost_amount, 0))
        FROM job_site_estimate_items
        WHERE job_site_estimate_items.job_site_id = job_sites.id
      ), 0)
    `).run();

    db.prepare("DROP TRIGGER IF EXISTS trg_estimate_items_insert_sync_cost").run();
    db.prepare("DROP TRIGGER IF EXISTS trg_estimate_items_update_sync_cost").run();
    db.prepare("DROP TRIGGER IF EXISTS trg_estimate_items_delete_sync_cost").run();

    db.prepare(`
      CREATE TRIGGER IF NOT EXISTS trg_estimate_items_insert_sync_cost
      AFTER INSERT ON job_site_estimate_items
      BEGIN
        UPDATE job_sites
        SET estimate_cost_total = COALESCE((
          SELECT SUM(COALESCE(cost_amount, 0))
          FROM job_site_estimate_items
          WHERE job_site_id = NEW.job_site_id
        ), 0)
        WHERE id = NEW.job_site_id;
      END;
    `).run();

    db.prepare(`
      CREATE TRIGGER IF NOT EXISTS trg_estimate_items_update_sync_cost
      AFTER UPDATE ON job_site_estimate_items
      BEGIN
        UPDATE job_sites
        SET estimate_cost_total = COALESCE((
          SELECT SUM(COALESCE(cost_amount, 0))
          FROM job_site_estimate_items
          WHERE job_site_id = NEW.job_site_id
        ), 0)
        WHERE id = NEW.job_site_id;
      END;
    `).run();

    db.prepare(`
      CREATE TRIGGER IF NOT EXISTS trg_estimate_items_delete_sync_cost
      AFTER DELETE ON job_site_estimate_items
      BEGIN
        UPDATE job_sites
        SET estimate_cost_total = COALESCE((
          SELECT SUM(COALESCE(cost_amount, 0))
          FROM job_site_estimate_items
          WHERE job_site_id = OLD.job_site_id
        ), 0)
        WHERE id = OLD.job_site_id;
      END;
    `).run();

    console.log("✅ estimate_cost_total cloud migration ready");
  }
} catch (err) {
  console.warn("Skip estimate_cost_total cloud migration:", err.message);
}


app.listen(PORT, () => {
  console.log(`BookAI API running on http://localhost:${PORT}`);
});
