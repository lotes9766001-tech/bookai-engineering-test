import bcrypt from 'bcryptjs';
import { db, initDb } from '../server/db.js';

const DEMO_EMAIL = 'engineering.demo@bookai.test';
const DEMO_PASSWORD = 'demo123456';
const DEMO_NAME = '工程 Demo 老闆';
const DEMO_COMPANY = 'BookAI 工程 Demo 企業社';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function getOrCreateUser() {
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(DEMO_EMAIL);

  if (existing) {
    db.prepare(`
      UPDATE users
      SET
        name = ?,
        password_hash = ?
      WHERE id = ?
    `).run(DEMO_NAME, hash, existing.id);

    return {
      ...existing,
      name: DEMO_NAME,
      action: 'updated'
    };
  }

  const row = db.prepare(`
    INSERT INTO users (
      name,
      email,
      password_hash
    )
    VALUES (?,?,?)
  `).run(DEMO_NAME, DEMO_EMAIL, hash);

  return {
    id: row.lastInsertRowid,
    name: DEMO_NAME,
    email: DEMO_EMAIL,
    action: 'created'
  };
}

function getOrCreateCompany(userId) {
  const existing = db.prepare(`
    SELECT *
    FROM companies
    WHERE name = ?
       OR owner_id = ?
  `).get(DEMO_COMPANY, userId);

  if (existing) {
    db.prepare(`
      UPDATE companies
      SET
        name = ?,
        tax_id = ?,
        industry = ?,
        companyAddress = ?,
        address = ?,
        plan = ?,
        owner_id = ?,
        billing_status = ?,
        subscription_plan = ?,
        subscription_started_at = ?,
        subscription_expires_at = ?,
        is_paid_customer = ?,
        billing_note = ?
      WHERE id = ?
    `).run(
      DEMO_COMPANY,
      'DEMO0001',
      'construction',
      '台中市西屯區 BookAI 路 100 號',
      '台中市西屯區 BookAI 路 100 號',
      'pro',
      userId,
      'active',
      'engineering_pro',
      todayIso(),
      addDays(90),
      1,
      '工程業 Demo 測試帳號',
      existing.id
    );

    return {
      ...existing,
      name: DEMO_COMPANY,
      action: 'updated'
    };
  }

  const row = db.prepare(`
    INSERT INTO companies (
      name,
      tax_id,
      industry,
      companyAddress,
      address,
      plan,
      owner_id,
      billing_status,
      subscription_plan,
      subscription_started_at,
      subscription_expires_at,
      is_paid_customer,
      billing_note
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    DEMO_COMPANY,
    'DEMO0001',
    'construction',
    '台中市西屯區 BookAI 路 100 號',
    '台中市西屯區 BookAI 路 100 號',
    'pro',
    userId,
    'active',
    'engineering_pro',
    todayIso(),
    addDays(90),
    1,
    '工程業 Demo 測試帳號'
  );

  return {
    id: row.lastInsertRowid,
    name: DEMO_COMPANY,
    action: 'created'
  };
}

function ensureCompanyUser(companyId, userId) {
  db.prepare(`
    INSERT OR IGNORE INTO company_users (
      company_id,
      user_id,
      role
    )
    VALUES (?,?,?)
  `).run(companyId, userId, 'owner');

  db.prepare(`
    UPDATE company_users
    SET role = 'owner'
    WHERE company_id = ?
      AND user_id = ?
  `).run(companyId, userId);
}

function ensureAccounts(companyId) {
  const accounts = [
    ['1101', '現金', 'asset'],
    ['1102', '銀行存款', 'asset'],
    ['1201', '應收帳款', 'asset'],
    ['1301', '材料存貨', 'asset'],
    ['2101', '應付帳款', 'liability'],
    ['3101', '業主資本', 'equity'],
    ['4101', '工程收入', 'revenue'],
    ['5101', '材料成本', 'expense'],
    ['5201', '工資成本', 'expense'],
    ['5301', '外包費', 'expense']
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

  accounts.forEach((account) => stmt.run(companyId, ...account));
}

function upsertJobSite(companyId, site) {
  const existing = db.prepare(`
    SELECT id
    FROM job_sites
    WHERE company_id = ?
      AND name = ?
  `).get(companyId, site.name);

  const values = [
    site.name,
    site.name,
    site.clientName,
    site.address,
    site.projectType,
    site.areaPings,
    site.pricePerPing,
    site.quoteAmount,
    site.receivedAmount,
    site.materialCost,
    site.laborCost,
    site.outsourcedCost,
    site.miscCost,
    site.status,
    site.note
  ];

  if (existing) {
    db.prepare(`
      UPDATE job_sites
      SET
        name = ?,
        site_name = ?,
        client_name = ?,
        address = ?,
        project_type = ?,
        area_pings = ?,
        price_per_ping = ?,
        quote_amount = ?,
        received_amount = ?,
        material_cost = ?,
        labor_cost = ?,
        outsourced_cost = ?,
        misc_cost = ?,
        status = ?,
        note = ?,
        subtotal_amount = ?,
        total_amount = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND company_id = ?
    `).run(...values, site.quoteAmount, site.quoteAmount, existing.id, companyId);

    return {
      id: existing.id,
      action: 'updated'
    };
  }

  const row = db.prepare(`
    INSERT INTO job_sites (
      company_id,
      name,
      site_name,
      client_name,
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
      status,
      note,
      subtotal_amount,
      total_amount,
      created_at,
      updated_at
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `).run(companyId, ...values, site.quoteAmount, site.quoteAmount);

  return {
    id: row.lastInsertRowid,
    action: 'created'
  };
}

function ensurePayment(companyId, jobSiteId, payment) {
  const existing = db.prepare(`
    SELECT id
    FROM job_site_payments
    WHERE company_id = ?
      AND job_site_id = ?
      AND amount = ?
      AND note = ?
  `).get(companyId, jobSiteId, payment.amount, payment.note);

  if (existing) {
    return 'kept';
  }

  db.prepare(`
    INSERT INTO job_site_payments (
      company_id,
      job_site_id,
      amount,
      payment_date,
      method,
      note
    )
    VALUES (?,?,?,?,?,?)
  `).run(companyId, jobSiteId, payment.amount, payment.paymentDate, payment.method, payment.note);

  return 'created';
}

function upsertLead(companyId, lead) {
  const existing = db.prepare(`
    SELECT id
    FROM leads
    WHERE company_id = ?
      AND title = ?
  `).get(companyId, lead.title);

  const values = [
    lead.title,
    lead.clientName,
    lead.clientPhone,
    lead.source,
    lead.region,
    lead.agencyType,
    lead.projectType,
    lead.estimatedAmount,
    lead.estimatedCost,
    lead.estimatedAmount - lead.estimatedCost,
    lead.riskLevel,
    lead.fitScore,
    lead.status,
    lead.nextAction,
    lead.note,
    lead.tenderSource,
    lead.tenderRef
  ];

  if (existing) {
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
    `).run(...values, existing.id, companyId);

    return 'updated';
  }

  db.prepare(`
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
  `).run(companyId, ...values);

  return 'created';
}

export function prepareEngineeringDemo(options = {}) {
  const { closeDb = false } = options;

  initDb();

  const summary = db.transaction(() => {
    const user = getOrCreateUser();
    const company = getOrCreateCompany(user.id);
    ensureCompanyUser(company.id, user.id);
    ensureAccounts(company.id);

    const jobSites = [
      {
        name: '西屯住宅油漆翻新工程',
        clientName: '林先生',
        address: '台中市西屯區',
        projectType: '油漆工程',
        areaPings: 28,
        pricePerPing: 4200,
        quoteAmount: 117600,
        receivedAmount: 60000,
        materialCost: 28000,
        laborCost: 32000,
        outsourcedCost: 0,
        miscCost: 4500,
        status: '施工中',
        note: 'Demo：牆面翻新、局部批土與防霉漆。'
      },
      {
        name: '南屯店面水電改善工程',
        clientName: '陳小姐',
        address: '台中市南屯區',
        projectType: '水電工程',
        areaPings: 18,
        pricePerPing: 5800,
        quoteAmount: 104400,
        receivedAmount: 30000,
        materialCost: 36000,
        laborCost: 26000,
        outsourcedCost: 8000,
        miscCost: 3500,
        status: '已請款',
        note: 'Demo：插座迴路、配電箱整理與燈具線路。'
      },
      {
        name: '北區辦公室冷氣汰換',
        clientName: '王經理',
        address: '台中市北區',
        projectType: '冷氣工程',
        areaPings: 12,
        pricePerPing: 0,
        quoteAmount: 168000,
        receivedAmount: 168000,
        materialCost: 98000,
        laborCost: 18000,
        outsourcedCost: 12000,
        miscCost: 6000,
        status: '已結案',
        note: 'Demo：室內機、室外機與銅管更新。'
      }
    ].map((site) => ({
      site,
      result: upsertJobSite(company.id, site)
    }));

    const paymentResults = [
      ensurePayment(company.id, jobSites[0].result.id, {
        amount: 60000,
        paymentDate: todayIso(),
        method: '匯款',
        note: 'Demo 首期款'
      }),
      ensurePayment(company.id, jobSites[1].result.id, {
        amount: 30000,
        paymentDate: todayIso(),
        method: '現金',
        note: 'Demo 訂金'
      })
    ];

    const leadResults = [
      upsertLead(company.id, {
        title: 'LINE 詢價｜北屯公寓防水補漏',
        clientName: '張小姐',
        clientPhone: '0912-000-111',
        source: 'LINE 詢價',
        region: '台中市北屯區',
        agencyType: '私人客戶',
        projectType: '防水工程',
        estimatedAmount: 86000,
        estimatedCost: 56000,
        riskLevel: 'medium',
        fitScore: 76,
        status: 'contacted',
        nextAction: '安排場勘',
        note: '頂樓局部滲水，需確認裂縫與排水狀況。',
        tenderSource: '',
        tenderRef: ''
      }),
      upsertLead(company.id, {
        title: '舊客戶介紹｜西區套房水電修繕',
        clientName: '黃先生',
        clientPhone: '0933-222-555',
        source: '舊客戶介紹',
        region: '台中市西區',
        agencyType: '私人客戶',
        projectType: '水電工程',
        estimatedAmount: 52000,
        estimatedCost: 33000,
        riskLevel: 'low',
        fitScore: 84,
        status: 'new',
        nextAction: '補施工範圍',
        note: '舊客戶介紹，信任度高，需確認點位與工期。',
        tenderSource: '',
        tenderRef: ''
      }),
      upsertLead(company.id, {
        title: '地方標案｜校舍油漆整修工程',
        clientName: '台中市某國小',
        clientPhone: '',
        source: '政府 / 地方標案',
        region: '台中市',
        agencyType: '學校機關',
        projectType: '油漆工程',
        estimatedAmount: 420000,
        estimatedCost: 310000,
        riskLevel: 'medium',
        fitScore: 79,
        status: 'new',
        nextAction: '檢查投標資格與履約期限',
        note: 'Demo 標案：教室與走廊油漆整修，需評估工期與保固。',
        tenderSource: '政府電子採購網公開標案資料',
        tenderRef: 'DEMO-TENDER-PAINT-001'
      })
    ];

    return {
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      companyId: company.id,
      companyName: DEMO_COMPANY,
      userStatus: user.action,
      companyStatus: company.action,
      jobSites: jobSites.map((item) => ({
        id: item.result.id,
        name: item.site.name,
        status: item.result.action
      })),
      payments: paymentResults,
      leads: leadResults
    };
  })();

  if (closeDb) {
    db.close();
  }

  return summary;
}

function printSummary(summary) {
  console.log('BookAI 工程業 Demo 已準備完成');
  console.log(`demo email: ${summary.email}`);
  console.log(`demo password: ${summary.password}`);
  console.log(`company id: ${summary.companyId}`);
  console.log(`company name: ${summary.companyName}`);
  console.log(`user: ${summary.userStatus}`);
  console.log(`company: ${summary.companyStatus}`);
  console.log(`job sites: ${summary.jobSites.map((item) => `${item.name} ${item.status}`).join(' / ')}`);
  console.log(`payments: ${summary.payments.join(' / ')}`);
  console.log(`leads: ${summary.leads.join(' / ')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const summary = prepareEngineeringDemo({ closeDb: true });
  printSummary(summary);
}
