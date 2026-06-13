import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import net from 'net';
import tls from 'tls';
import { fileURLToPath } from 'url';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { db, initDb, audit as sqliteAudit, DB_PATH, DB_PROVIDER, DATABASE_URL } from './db.js';
import { PG_ENABLED, initPostgresDb, pgAll, pgOne, pgQuery } from './pg-db.js';
import { plans } from './plans.js';
import { platforms } from './platforms.js';
import { prepareEngineeringDemo } from '../scripts/prepare-engineering-demo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();


// Lightweight health check for Render.
// Do not check database here. This only proves the Express server is alive.
app.get('/api/ping', (req, res) => {
  res.status(200).json({
    ok: true,
    status: 'alive',
    name: 'BookAI Commerce ERPHub',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 5050;
const HOST = '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const DEFAULT_ADMIN_EMAIL = 'lotes.9766001@gmail.com';
const ADMIN_EMAIL_CONFIG = process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;
const ADMIN_EMAILS = new Set(
  ADMIN_EMAIL_CONFIG
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);
const ADMIN_EMAIL = [...ADMIN_EMAILS][0] || DEFAULT_ADMIN_EMAIL;
const FOUNDER_EMAIL = normalizeFounderEmail(process.env.FOUNDER_EMAIL || DEFAULT_ADMIN_EMAIL);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (NODE_ENV === 'production' ? '' : 'demo123456');
const BOOTSTRAP_SECRET = process.env.BOOTSTRAP_SECRET || process.env.BOOKAI_BOOTSTRAP_SECRET || '';
const ADMIN_NAME = 'BookAI Admin';
const ADMIN_COMPANY = 'BookAI 系統管理中心';
let postgresReady = false;
let postgresError = null;
let postgresCheckedAt = null;

function normalizeFounderEmail(email) {
  return String(email || '').trim().toLowerCase();
}

const FEATURE_CATALOG = [
  { key: 'dashboard', label: '經營總覽', group: 'ERP 核心' },
  { key: 'purchases', label: '進貨管理', group: 'ERP 核心' },
  { key: 'sales', label: '銷貨管理', group: 'ERP 核心' },
  { key: 'receivables', label: '應收帳款', group: 'ERP 核心' },
  { key: 'payables', label: '應付帳款', group: 'ERP 核心' },
  { key: 'suppliers', label: '供應商管理', group: 'ERP 核心' },
  { key: 'customers', label: '客戶管理', group: 'ERP 核心' },
  { key: 'inventory', label: '商品 / 材料庫存', group: 'ERP 核心' },
  { key: 'transactions', label: '收支管理', group: 'ERP 核心' },
  { key: 'invoices', label: '發票中心', group: 'ERP 核心' },
  { key: 'vouchers', label: '電子憑證', group: 'ERP 核心' },
  { key: 'reports', label: '經營報表', group: 'ERP 核心' },
  { key: 'leads', label: '接案中心', group: '工程業' },
  { key: 'jobsites', label: '案場中心', group: '工程業' },
  { key: 'integrations', label: '平台串接', group: '商務' },
  { key: 'commerce_site', label: '官網後台', group: '商務' },
  { key: 'accounting_engine', label: '會計中心', group: '進階管理' },
  { key: 'tax_center', label: '稅務中心', group: '進階管理' },
  { key: 'accountant_console', label: '事務所客戶管理', group: '進階管理' },
  { key: 'feedbacks', label: '產品回饋', group: '支援' },
  { key: 'settings', label: '公司設定', group: '系統' }
];

const FEATURE_KEYS = new Set(FEATURE_CATALOG.map((item) => item.key));

function assertProductionSecrets() {
  if (NODE_ENV !== 'production') return;

  const errors = [];
  if (!process.env.JWT_SECRET || JWT_SECRET === 'dev-secret-change-me') {
    errors.push('production 環境必須設定高強度 JWT_SECRET');
  }
  if (!BOOTSTRAP_SECRET) {
    errors.push('production 環境必須設定 BOOTSTRAP_SECRET');
  }
  if (BOOTSTRAP_SECRET === 'test-secret') {
    errors.push('production 環境不可使用 test-secret 作為 BOOTSTRAP_SECRET');
  }
  if (!process.env.ADMIN_PASSWORD) {
    errors.push('production 環境必須設定 ADMIN_PASSWORD');
  }
  if (ADMIN_PASSWORD === 'demo123456') {
    errors.push('production 環境不可使用 demo123456 作為 ADMIN_PASSWORD');
  }
  if (!process.env.FOUNDER_EMAIL) {
    console.warn('WARNING: production 環境建議設定 FOUNDER_EMAIL');
  }

  if (errors.length) {
    console.error(`安全設定錯誤：${errors.join('；')}`);
    process.exit(1);
  }
}

assertProductionSecrets();

function recordPostgresError(error) {
  postgresReady = false;
  postgresCheckedAt = new Date().toISOString();
  postgresError = {
    code: error?.code || '',
    message: error?.message || String(error || 'Unknown PostgreSQL error')
  };
}

async function checkPostgresStartup() {
  if (!PG_ENABLED) return;

  postgresCheckedAt = new Date().toISOString();
  console.log('POSTGRES_STARTUP: initializing');

  try {
    await initPostgresDb();
    postgresReady = true;
    postgresError = null;
    postgresCheckedAt = new Date().toISOString();
    console.log('POSTGRES_STARTUP: ready');
  } catch (error) {
    recordPostgresError(error);
    console.error('POSTGRES_STARTUP_FAILED:', {
      code: postgresError.code,
      message: postgresError.message
    });
  }
}

if (!PG_ENABLED) {
  initDb();
}

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

const corsOrigins = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors(corsOrigins.length ? {
  origin(origin, callback) {
    if (!origin || corsOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('不允許的跨網域請求'));
  }
} : undefined));

app.use(express.json({ limit: '1mb' }));

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Body 必須是合法 JSON' });
  }

  if (err?.message === '不允許的跨網域請求') {
    return res.status(403).json({ error: '不允許的跨網域請求' });
  }

  next(err);
});

const rateLimitBuckets = new Map();

function rateLimit({ windowMs, max }) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const bucket = rateLimitBuckets.get(key) || { count: 0, resetAt: now + windowMs };

    if (bucket.resetAt <= now) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }

    bucket.count += 1;
    rateLimitBuckets.set(key, bucket);

    if (bucket.count > max) {
      return res.status(429).json({ error: '操作太頻繁，請稍後再試' });
    }

    next();
  };
}

function audit(companyId, userId, action, detail = '') {
  if (PG_ENABLED) {
    pgQuery(
      `INSERT INTO audit_logs (company_id, user_id, action, detail) VALUES ($1,$2,$3,$4)`,
      [companyId || null, userId || null, action, detail || '']
    ).catch((error) => console.warn('PostgreSQL audit write failed:', error.message));
    return;
  }

  sqliteAudit(companyId, userId, action, detail);
}

function requestIp(req) {
  return String(req.headers['x-forwarded-for'] || req.ip || '')
    .split(',')[0]
    .trim();
}

function requestUserAgent(req) {
  return String(req.headers['user-agent'] || '').slice(0, 500);
}

function normalizeSource({ utm_source, referrer } = {}) {
  const utm = String(utm_source || '').trim().toLowerCase();
  if (utm) {
    if (utm.includes('line')) return 'line';
    if (utm.includes('facebook') || utm === 'fb') return 'facebook';
    if (utm.includes('instagram') || utm === 'ig') return 'instagram';
    if (utm.includes('google')) return 'google';
    if (utm.includes('official')) return 'official_website';
    if (utm.includes('demo')) return 'demo_link';
    return utm.replace(/[^a-z0-9_-]/g, '_').slice(0, 64) || 'unknown';
  }

  const ref = String(referrer || '').toLowerCase();
  if (!ref) return 'direct';
  if (ref.includes('line.me') || ref.includes('lin.ee')) return 'line';
  if (ref.includes('facebook.com') || ref.includes('fb.com')) return 'facebook';
  if (ref.includes('instagram.com')) return 'instagram';
  if (ref.includes('google.')) return 'google';
  if (ref.includes('bookai-engineering-official.onrender.com')) return 'official_website';
  if (ref.includes('localhost') || ref.includes('127.0.0.1')) return 'direct';
  return 'referral';
}

function sanitizeTrackingBody(body = {}) {
  const safe = (value, max = 500) => String(value || '').slice(0, max);
  const utm_source = safe(body.utm_source || body.utmSource, 120);
  const referrer = safe(body.referrer, 500);
  return {
    visitorId: safe(body.visitorId || body.visitor_id, 120),
    page: safe(body.page || '/', 300),
    referrer,
    utm_source,
    utm_medium: safe(body.utm_medium || body.utmMedium, 120),
    utm_campaign: safe(body.utm_campaign || body.utmCampaign, 160),
    source: normalizeSource({ utm_source, referrer })
  };
}

function recordTrafficEvent(req, eventType, { userId = null, tracking = null } = {}) {
  const t = tracking || sanitizeTrackingBody(req.body || {});
  if (PG_ENABLED) {
    return pgQuery(`
      INSERT INTO traffic_events (
        visitor_id,
        user_id,
        event_type,
        source,
        page,
        referrer,
        utm_source,
        utm_medium,
        utm_campaign,
        ip,
        user_agent
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `, [
      t.visitorId || null,
      userId,
      eventType,
      t.source || 'unknown',
      t.page || '/',
      t.referrer || '',
      t.utm_source || '',
      t.utm_medium || '',
      t.utm_campaign || '',
      requestIp(req),
      requestUserAgent(req)
    ]);
  }

  db.prepare(`
    INSERT INTO traffic_events (
      visitor_id,
      user_id,
      event_type,
      source,
      page,
      referrer,
      utm_source,
      utm_medium,
      utm_campaign,
      ip,
      user_agent
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    t.visitorId || null,
    userId,
    eventType,
    t.source || 'unknown',
    t.page || '/',
    t.referrer || '',
    t.utm_source || '',
    t.utm_medium || '',
    t.utm_campaign || '',
    requestIp(req),
    requestUserAgent(req)
  );
}

function toSqlDateTime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function taipeiDayRange(offsetDays = 0) {
  const now = new Date();
  const taipei = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  taipei.setHours(0, 0, 0, 0);
  taipei.setDate(taipei.getDate() + offsetDays);
  const start = new Date(taipei.getTime() - 8 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: toSqlDateTime(start), end: toSqlDateTime(end) };
}

function daysAgoRange(days) {
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { start: toSqlDateTime(start), end: toSqlDateTime(now) };
}

function countBetween(table, column, range, where = '1=1', params = []) {
  return db.prepare(`
    SELECT COUNT(*) AS count
    FROM ${table}
    WHERE ${where}
      AND datetime(${column}) >= datetime(?)
      AND datetime(${column}) < datetime(?)
  `).get(...params, range.start, range.end).count || 0;
}

async function pgCountBetween(table, column, range, where = 'TRUE', params = []) {
  const row = await pgOne(`
    SELECT COUNT(*)::int AS count
    FROM ${table}
    WHERE ${where}
      AND ${column} >= $${params.length + 1}::timestamptz
      AND ${column} < $${params.length + 2}::timestamptz
  `, [...params, range.start, range.end]);
  return row?.count || 0;
}

function backupDir() {
  if (NODE_ENV === 'production' && fs.existsSync('/data')) {
    return '/data/backups';
  }
  return path.join(process.cwd(), 'backups');
}

function listBackups() {
  const dir = backupDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /^bookai-backup-\d{8}-\d{6}\.db$/.test(name))
    .map((filename) => {
      const full = path.join(dir, filename);
      const stat = fs.statSync(full);
      return {
        filename,
        sizeMB: Math.round((stat.size / 1024 / 1024) * 100) / 100,
        createdAt: toSqlDateTime(stat.mtime)
      };
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function backupTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('') + '-' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

function checkPostgresConnection() {
  if (!DATABASE_URL) {
    return Promise.resolve({
      provider: 'sqlite',
      checked: false,
      ok: false,
      message: 'DATABASE_URL not set'
    });
  }

  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(DATABASE_URL);
    } catch {
      resolve({
        provider: 'postgresql',
        checked: true,
        ok: false,
        message: 'DATABASE_URL format invalid'
      });
      return;
    }

    const port = Number(parsed.port || 5432);
    const host = parsed.hostname;
    const useTls = parsed.searchParams.get('sslmode') !== 'disable';
    const socket = useTls
      ? tls.connect({ host, port, servername: host, rejectUnauthorized: false })
      : net.connect({ host, port });

    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({
        provider: 'postgresql',
        checked: true,
        ...result
      });
    };

    socket.setTimeout(3000);
    socket.once('connect', () => done({ ok: true, message: 'PostgreSQL network connection ok' }));
    socket.once('secureConnect', () => done({ ok: true, message: 'PostgreSQL TLS connection ok' }));
    socket.once('timeout', () => done({ ok: false, message: 'PostgreSQL connection timeout' }));
    socket.once('error', (error) => done({ ok: false, message: error.message }));
  });
}

let postgresStatus = {
  provider: DB_PROVIDER,
  checked: false,
  ok: false,
  message: DATABASE_URL ? 'PostgreSQL check pending' : 'DATABASE_URL not set'
};

checkPostgresConnection().then((status) => {
  postgresStatus = status;
  if (DATABASE_URL) {
    const log = status.ok ? console.log : console.warn;
    log(`POSTGRES_CHECK: ${status.message}`);
  }
});

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

function isAdminEmail(email) {
  return ADMIN_EMAILS.has(String(email || '').toLowerCase());
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isFounderEmail(email) {
  return normalizeEmail(email) === FOUNDER_EMAIL;
}

function privilegedStatusForEmail(email) {
  const normalized = normalizeEmail(email);
  if (isFounderEmail(normalized)) return 'founder';
  if (isAdminEmail(normalized)) return 'admin';
  return null;
}

function isPrivilegedEmail(email) {
  return Boolean(privilegedStatusForEmail(email));
}

function isApprovedStatus(value) {
  return ['approved', 'founder', 'admin', 'demo'].includes(String(value || ''));
}

function bootstrapSecretFromRequest(req) {
  return String(
    req.headers['x-bootstrap-secret'] ||
    req.query?.secret ||
    req.body?.secret ||
    ''
  );
}

async function getAuthUserFromRequest(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (PG_ENABLED) {
      return pgOne(`SELECT id, email FROM users WHERE id = $1`, [payload.id]);
    }
    return db.prepare(`
      SELECT
        id,
        email
      FROM users
      WHERE id = ?
    `).get(payload.id);
  } catch {
    return null;
  }
}

async function hasFounderDebugAccess(req) {
  const secret = bootstrapSecretFromRequest(req);
  if (BOOTSTRAP_SECRET && secret && secret === BOOTSTRAP_SECRET) {
    return true;
  }

  const user = await getAuthUserFromRequest(req);
  return Boolean(user && isFounderEmail(user.email));
}

async function requireAdmin(req, res, next) {
  const user = PG_ENABLED
    ? await pgOne(`SELECT email FROM users WHERE id = $1`, [req.user?.id])
    : db.prepare(`
      SELECT email
      FROM users
      WHERE id = ?
    `).get(req.user?.id);

  if (user && isAdminEmail(user.email)) {
    return next();
  }

  return res.status(403).json({ error: '沒有 BookAI 營運後台權限' });
}

async function requireFounder(req, res, next) {
  const user = PG_ENABLED
    ? await pgOne(`SELECT email FROM users WHERE id = $1`, [req.user?.id])
    : db.prepare(`
      SELECT email
      FROM users
      WHERE id = ?
    `).get(req.user?.id);

  if (user && isFounderEmail(user.email)) {
    return next();
  }

  return res.status(403).json({ error: '沒有 Founder Dashboard 權限' });
}

async function requireApproved(req, res, next) {
  const user = PG_ENABLED
    ? await pgOne(`
      SELECT
        id,
        email,
        COALESCE(status, 'pending_review') AS status,
        COALESCE(review_status, 'pending_review') AS review_status
      FROM users
      WHERE id = $1
    `, [req.user?.id])
    : db.prepare(`
      SELECT
        id,
        email,
        COALESCE(status, 'pending_review') AS status,
        COALESCE(review_status, 'pending_review') AS review_status
      FROM users
      WHERE id = ?
    `).get(req.user?.id);

  if (!user) return res.status(401).json({ error: '未登入' });
  if (isPrivilegedEmail(user.email)) return next();

  const userStatus = user.status || user.review_status || 'pending_review';
  const companyStatus = req.company?.review_status || '';

  if (userStatus === 'rejected' || companyStatus === 'rejected') {
    return res.status(403).json({ error: '帳號申請未通過，請聯繫 BookAI 官方客服', code: 'ACCOUNT_REJECTED' });
  }

  if (userStatus === 'suspended' || companyStatus === 'suspended') {
    return res.status(403).json({ error: '帳號已暫停使用，請聯繫 BookAI 官方客服', code: 'ACCOUNT_SUSPENDED' });
  }

  if (isApprovedStatus(userStatus) || companyStatus === 'approved') return next();

  return res.status(403).json({
    error: '帳號審核中，請聯繫 BookAI 官方客服完成開通',
    code: 'ACCOUNT_PENDING_REVIEW'
  });
}

async function company(req, res, next) {
  const companyId = Number(req.params.companyId || req.query.companyId || req.body.companyId);

  if (!companyId) {
    return res.status(400).json({ error: '缺少 companyId' });
  }

  const row = PG_ENABLED
    ? await pgOne(`
      SELECT
        c.*,
        cu.role
      FROM companies c
      JOIN company_users cu ON cu.company_id = c.id
      WHERE c.id = $1
        AND cu.user_id = $2
    `, [companyId, req.user.id])
    : db.prepare(`
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
  return requireApproved(req, res, next);
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

function getCompanyFeatureOverrides(companyId) {
  if (PG_ENABLED) return [];
  return db.prepare(`
    SELECT
      feature_key,
      enabled,
      note,
      updated_at
    FROM company_feature_overrides
    WHERE company_id = ?
  `).all(companyId);
}

function getEffectiveFeatures(company) {
  const companyId = Number(company?.id || 0);
  const planFeatures = new Set(plans[company?.plan]?.features || []);

  ['dashboard', 'purchases', 'sales', 'receivables', 'payables', 'suppliers', 'customers', 'inventory', 'reports', 'feedbacks', 'settings'].forEach((key) => {
    planFeatures.add(key);
  });

  if (String(company?.industry || '').includes('construction') || [
    'painting',
    'water_electric',
    'masonry',
    'interior',
    'aircon_repair',
    'waterproof',
    'demolition',
    'low_voltage',
    'other_construction',
    'painting_water_electric'
  ].includes(company?.industry)) {
    planFeatures.add('leads');
    planFeatures.add('jobsites');
  }

  if (['ecommerce', 'hosted_commerce', 'marketplace', 'social_commerce', 'food', 'restaurant', 'beverage', 'retail'].includes(company?.industry)) {
    planFeatures.add('commerce_site');
  }

  if (!companyId) {
    return [...planFeatures];
  }

  getCompanyFeatureOverrides(companyId).forEach((row) => {
    if (!FEATURE_KEYS.has(row.feature_key)) return;
    if (Number(row.enabled) === 1) {
      planFeatures.add(row.feature_key);
    } else {
      planFeatures.delete(row.feature_key);
    }
  });

  return [...planFeatures];
}

function hasCompanyFeature(company, feature) {
  if (!feature) return true;
  return getEffectiveFeatures(company).includes(feature);
}

const requireFeature = (feature) => (req, res, next) => {
  if (!hasCompanyFeature(req.company, feature)) {
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

async function ensureAdminBootstrapAccount() {
  const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  if (PG_ENABLED) {
    const existingUser = await pgOne('SELECT * FROM users WHERE email = $1', [ADMIN_EMAIL]);
    let userId;

    if (existingUser) {
      userId = existingUser.id;
      await pgQuery(`
        UPDATE users
        SET name = $1,
            password_hash = $2,
            status = $3,
            review_status = $4,
            approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP::text),
            approved_by = COALESCE(approved_by, id)
        WHERE id = $5
      `, [ADMIN_NAME, hash, 'admin', 'approved', userId]);
    } else {
      const created = await pgOne(`
        INSERT INTO users (name, email, password_hash, created_source, created_utm_source, status, review_status, approved_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP)
        RETURNING id
      `, [ADMIN_NAME, ADMIN_EMAIL, hash, 'bootstrap', 'bootstrap', 'admin', 'approved']);
      userId = created.id;
    }

    const existingCompany = await pgOne(`
      SELECT id
      FROM companies
      WHERE name = $1 AND owner_id = $2
      ORDER BY id ASC
      LIMIT 1
    `, [ADMIN_COMPANY, userId]);

    let companyId;
    if (existingCompany) {
      companyId = existingCompany.id;
      await pgQuery(`
        UPDATE companies
        SET name = $1,
            industry = $2,
            plan = $3,
            owner_id = $4,
            billing_status = $5,
            subscription_plan = $6,
            is_paid_customer = $7,
            billing_note = $8
        WHERE id = $9
      `, [ADMIN_COMPANY, 'admin', 'pro', userId, 'active', 'engineering_premium', 1, 'BookAI 系統管理員帳號', companyId]);
    } else {
      const company = await pgOne(`
        INSERT INTO companies (
          name, tax_id, industry, companyAddress, address, plan, owner_id,
          billing_status, subscription_plan, is_paid_customer, billing_note
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING id
      `, [ADMIN_COMPANY, '', 'admin', '', '', 'pro', userId, 'active', 'engineering_premium', 1, 'BookAI 系統管理員帳號']);
      companyId = company.id;
    }

    await pgQuery(`
      INSERT INTO company_users (company_id, user_id, role)
      VALUES ($1,$2,$3)
      ON CONFLICT (company_id, user_id) DO UPDATE SET role = EXCLUDED.role
    `, [companyId, userId, 'owner']);

    return { userId, companyId };
  }

  const existingUser = db.prepare(`
    SELECT *
    FROM users
    WHERE email = ?
  `).get(ADMIN_EMAIL);

  let userId;

  if (existingUser) {
    userId = existingUser.id;
    db.prepare(`
      UPDATE users
      SET
        name = ?,
        password_hash = ?
      WHERE id = ?
    `).run(ADMIN_NAME, hash, userId);
  } else {
    const user = db.prepare(`
      INSERT INTO users (
        name,
        email,
        password_hash
      )
      VALUES (?,?,?)
    `).run(ADMIN_NAME, ADMIN_EMAIL, hash);
    userId = user.lastInsertRowid;
  }

  const existingCompany = db.prepare(`
    SELECT id
    FROM companies
    WHERE name = ?
      AND owner_id = ?
    ORDER BY id ASC
    LIMIT 1
  `).get(ADMIN_COMPANY, userId);

  let companyId;

  if (existingCompany) {
    companyId = existingCompany.id;
    db.prepare(`
      UPDATE companies
      SET
        name = ?,
        industry = ?,
        plan = ?,
        owner_id = ?,
        billing_status = ?,
        subscription_plan = ?,
        is_paid_customer = ?,
        billing_note = ?
      WHERE id = ?
    `).run(
      ADMIN_COMPANY,
      'admin',
      'pro',
      userId,
      'active',
      'engineering_premium',
      1,
      'BookAI 系統管理員帳號',
      companyId
    );
  } else {
    const companyRow = db.prepare(`
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
        is_paid_customer,
        billing_note
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      ADMIN_COMPANY,
      '',
      'admin',
      '',
      '',
      'pro',
      userId,
      'active',
      'engineering_premium',
      1,
      'BookAI 系統管理員帳號'
    );
    companyId = companyRow.lastInsertRowid;
  }

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

  seedCompanyDefaults(companyId);

  return {
    userId,
    companyId
  };
}

async function ensureFounderBootstrapAccount() {
  const founderEmail = FOUNDER_EMAIL || normalizeEmail(ADMIN_EMAIL);
  const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  if (PG_ENABLED) {
    const existingUser = await pgOne('SELECT * FROM users WHERE email = $1', [founderEmail]);
    let userId;

    if (existingUser) {
      userId = existingUser.id;
      await pgQuery(`
        UPDATE users
        SET name = $1,
            password_hash = $2,
            status = $3,
            review_status = $4,
            approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP::text),
            approved_by = COALESCE(approved_by, id)
        WHERE id = $5
      `, ['BookAI Founder', hash, 'founder', 'approved', userId]);
    } else {
      const user = await pgOne(`
        INSERT INTO users (name, email, password_hash, created_source, created_utm_source, status, review_status, approved_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP)
        RETURNING id
      `, ['BookAI Founder', founderEmail, hash, 'bootstrap', 'bootstrap', 'founder', 'approved']);
      userId = user.id;
    }

    const companyName = 'BookAI 創辦人管理中心';
    const existingCompany = await pgOne(`
      SELECT id
      FROM companies
      WHERE name = $1 AND owner_id = $2
      ORDER BY id ASC
      LIMIT 1
    `, [companyName, userId]);

    let companyId;
    if (existingCompany) {
      companyId = existingCompany.id;
      await pgQuery(`
        UPDATE companies
        SET name = $1,
            industry = $2,
            plan = $3,
            owner_id = $4,
            billing_status = $5,
            subscription_plan = $6,
            is_paid_customer = $7,
            billing_note = $8
        WHERE id = $9
      `, [companyName, 'admin', 'pro', userId, 'active', 'engineering_premium', 1, 'BookAI 創辦人帳號', companyId]);
    } else {
      const company = await pgOne(`
        INSERT INTO companies (
          name, tax_id, industry, companyAddress, address, plan, owner_id,
          billing_status, subscription_plan, is_paid_customer, billing_note
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING id
      `, [companyName, '', 'admin', '', '', 'pro', userId, 'active', 'engineering_premium', 1, 'BookAI 創辦人帳號']);
      companyId = company.id;
    }

    await pgQuery(`
      INSERT INTO company_users (company_id, user_id, role)
      VALUES ($1,$2,$3)
      ON CONFLICT (company_id, user_id) DO UPDATE SET role = EXCLUDED.role
    `, [companyId, userId, 'owner']);

    return { userId, companyId, email: founderEmail };
  }

  const existingUser = db.prepare(`
    SELECT *
    FROM users
    WHERE email = ?
  `).get(founderEmail);

  let userId;

  if (existingUser) {
    userId = existingUser.id;
    db.prepare(`
      UPDATE users
      SET
        name = ?,
        password_hash = ?
      WHERE id = ?
    `).run('BookAI Founder', hash, userId);
  } else {
    const user = db.prepare(`
      INSERT INTO users (
        name,
        email,
        password_hash,
        created_source,
        created_utm_source
      )
      VALUES (?,?,?,?,?)
    `).run('BookAI Founder', founderEmail, hash, 'bootstrap', 'bootstrap');
    userId = user.lastInsertRowid;
  }

  const companyName = 'BookAI 創辦人管理中心';
  const existingCompany = db.prepare(`
    SELECT id
    FROM companies
    WHERE name = ?
      AND owner_id = ?
    ORDER BY id ASC
    LIMIT 1
  `).get(companyName, userId);

  let companyId;

  if (existingCompany) {
    companyId = existingCompany.id;
    db.prepare(`
      UPDATE companies
      SET
        name = ?,
        industry = ?,
        plan = ?,
        owner_id = ?,
        billing_status = ?,
        subscription_plan = ?,
        is_paid_customer = ?,
        billing_note = ?
      WHERE id = ?
    `).run(
      companyName,
      'admin',
      'pro',
      userId,
      'active',
      'engineering_premium',
      1,
      'BookAI 創辦人帳號',
      companyId
    );
  } else {
    const companyRow = db.prepare(`
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
        is_paid_customer,
        billing_note
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      companyName,
      '',
      'admin',
      '',
      '',
      'pro',
      userId,
      'active',
      'engineering_premium',
      1,
      'BookAI 創辦人帳號'
    );
    companyId = companyRow.lastInsertRowid;
  }

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

  seedCompanyDefaults(companyId);

  return {
    userId,
    companyId,
    email: founderEmail
  };
}

app.get('/api/health', async (_, res) => {
  const base = {
    version: 'v5.4',
    name: 'BookAI Commerce ERP Hub',
    environment: NODE_ENV,
    provider: PG_ENABLED ? 'postgresql' : 'sqlite',
    storage: PG_ENABLED ? 'postgresql' : 'sqlite',
    port: String(PORT),
    databaseUrlDetected: Boolean(DATABASE_URL),
    postgresReady,
    postgresCheckedAt,
    postgresErrorCode: postgresError?.code || '',
    postgresErrorMessage: postgresError?.message || ''
  };

  try {
    if (PG_ENABLED) {
      if (!postgresReady) {
        return res.status(NODE_ENV === 'production' ? 500 : 503).json({
          ...base,
          ok: false,
          status: 'database_unhealthy'
        });
      }
      await pgOne('SELECT 1 AS ok');
    } else {
      db.prepare('SELECT 1 AS ok').get();
    }
    res.json({
      ...base,
      ok: true,
      status: 'healthy',
      postgresReady: PG_ENABLED ? true : postgresReady
    });
  } catch (err) {
    if (PG_ENABLED) recordPostgresError(err);
    res.status(500).json({
      ...base,
      ok: false,
      status: 'unhealthy',
      postgresReady,
      postgresErrorCode: postgresError?.code || '',
      postgresErrorMessage: postgresError?.message || '',
      error: '資料庫健康檢查失敗'
    });
  }
});

app.post('/api/track/visit', rateLimit({ windowMs: 60 * 1000, max: 120 }), async (req, res) => {
  try {
    const tracking = sanitizeTrackingBody(req.body || {});

    if (PG_ENABLED) {
      await pgQuery(`
        INSERT INTO visitor_logs (
          visitor_id,
          page,
          referrer,
          utm_source,
          utm_medium,
          utm_campaign,
          source,
          ip,
          user_agent
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, [
        tracking.visitorId || null,
        tracking.page || '/',
        tracking.referrer || '',
        tracking.utm_source || '',
        tracking.utm_medium || '',
        tracking.utm_campaign || '',
        tracking.source || 'unknown',
        requestIp(req),
        requestUserAgent(req)
      ]);
    } else {
      db.prepare(`
      INSERT INTO visitor_logs (
        visitor_id,
        page,
        referrer,
        utm_source,
        utm_medium,
        utm_campaign,
        source,
        ip,
        user_agent
      )
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(
      tracking.visitorId || null,
      tracking.page || '/',
      tracking.referrer || '',
      tracking.utm_source || '',
      tracking.utm_medium || '',
      tracking.utm_campaign || '',
      tracking.source || 'unknown',
      requestIp(req),
      requestUserAgent(req)
    );
    }

    await recordTrafficEvent(req, 'visit', { tracking });
    res.json({ ok: true, source: tracking.source });
  } catch (err) {
    res.status(500).json({ error: '訪客紀錄失敗' });
  }
});

app.post('/api/bootstrap/admin', rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
  const { secret } = req.body || {};

  if (!BOOTSTRAP_SECRET) {
    return res.status(403).json({ error: 'Bootstrap 尚未啟用' });
  }

  if (NODE_ENV === 'production' && BOOTSTRAP_SECRET === 'test-secret') {
    return res.status(403).json({ error: '正式環境不可使用測試 Bootstrap secret' });
  }

  if (NODE_ENV === 'production' && (!ADMIN_PASSWORD || ADMIN_PASSWORD === 'demo123456')) {
    return res.status(403).json({ error: '正式環境尚未設定安全的 ADMIN_PASSWORD' });
  }

  if (!secret || secret !== BOOTSTRAP_SECRET) {
    return res.status(403).json({ error: 'Bootstrap secret 不正確' });
  }

  try {
    await ensureAdminBootstrapAccount();
    res.json({
      ok: true,
      email: ADMIN_EMAIL,
      ...(NODE_ENV === 'production' ? {} : { password: ADMIN_PASSWORD }),
      message: 'Admin 已建立或重設'
    });
  } catch (err) {
    res.status(500).json({
      error: 'Admin 建立或重設失敗',
      detail: err.message
    });
  }
});

app.post('/api/bootstrap/founder', rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
  const secret = bootstrapSecretFromRequest(req);

  if (!BOOTSTRAP_SECRET) {
    return res.status(403).json({ error: 'Bootstrap 尚未啟用' });
  }

  if (!secret || secret !== BOOTSTRAP_SECRET) {
    return res.status(403).json({ error: 'Bootstrap secret 不正確' });
  }

  if (NODE_ENV === 'production' && (!ADMIN_PASSWORD || ADMIN_PASSWORD === 'demo123456')) {
    return res.status(403).json({ error: '正式環境尚未設定安全的 ADMIN_PASSWORD' });
  }

  try {
    const result = await ensureFounderBootstrapAccount();
    res.json({
      ok: true,
      email: result.email,
      userId: result.userId,
      companyId: result.companyId,
      message: 'Founder 已建立或重設'
    });
  } catch (err) {
    res.status(500).json({
      error: 'Founder 建立或重設失敗'
    });
  }
});

app.get('/api/debug/auth-shape', async (req, res) => {
  if (!(await hasFounderDebugAccess(req))) {
    return res.status(403).json({ error: '沒有 Founder Dashboard 權限' });
  }

  res.json({
    ok: true,
    loginRoute: '/api/auth/login',
    method: 'POST',
    contentType: 'application/json',
    requiredFields: ['email', 'password'],
    acceptedTrackingFields: ['visitorId', 'page', 'referrer', 'utm_source', 'utm_medium', 'utm_campaign'],
    founderEmailEnv: process.env.FOUNDER_EMAIL ? 'FOUNDER_EMAIL' : 'ADMIN_EMAIL fallback',
    founderEmail: FOUNDER_EMAIL
  });
});

app.post('/api/auth/register', async (req, res) => {
  const {
    name,
    email,
    password,
    companyName,
    brandName,
    contactName,
    phone,
    taxId,
    industry,
    useCase,
    lineContact,
    companyStage,
    termsAccepted,
    companyAddress,
    address,
    plan = 'business'
  } = req.body;
  const tracking = sanitizeTrackingBody(req.body || {});

  const normalizedEmail = normalizeEmail(email);

  const finalCompanyName = String(companyName || brandName || '').trim();
  const finalContactName = String(contactName || name || '').trim();
  const finalPhone = String(phone || '').trim();
  const finalUseCase = String(useCase || req.body.use_case || '').trim();
  const finalTaxId = String(taxId || req.body.tax_id || '').trim();
  const finalCompanyStage = String(companyStage || req.body.company_stage || '').trim();
  const acceptedTerms = termsAccepted === true || termsAccepted === 'true' || termsAccepted === 1 || termsAccepted === '1';

  if (!normalizedEmail || !password || !finalCompanyName) {
    return res.status(400).json({ error: '請填寫必要欄位' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Email 格式不正確' });
  }

  if (String(password).length < 8) {
    return res.status(400).json({ error: '密碼至少需要 8 碼' });
  }

  if (finalCompanyName.length < 2) {
    return res.status(400).json({ error: '公司 / 品牌名稱至少需要 2 個字' });
  }

  if (!finalContactName) {
    return res.status(400).json({ error: '請填寫聯絡人姓名' });
  }

  if (!finalPhone) {
    return res.status(400).json({ error: '請填寫聯絡電話' });
  }

  if (!industry) {
    return res.status(400).json({ error: '請選擇行業別' });
  }

  if (finalUseCase.length < 10) {
    return res.status(400).json({ error: '請至少用 10 個字說明想使用 BookAI 的情境' });
  }

  if (finalTaxId && !/^\d{8}$/.test(finalTaxId)) {
    return res.status(400).json({ error: '統一編號若有填寫，必須為 8 碼數字' });
  }

  if (!acceptedTerms) {
    return res.status(400).json({ error: '請先閱讀並同意 BookAI 測試會員服務條款' });
  }

  if (isAdminEmail(normalizedEmail)) {
    return res.status(403).json({ error: '此管理者帳號只能由 Bootstrap 建立或重設' });
  }

  if (!plans[plan]) {
    return res.status(400).json({ error: '未知方案' });
  }

  const finalAddress = companyAddress || address || '';
  const hash = bcrypt.hashSync(password, 10);

  try {
    if (PG_ENABLED) {
      const user = await pgOne(`
        INSERT INTO users (
        name,
        email,
        password_hash,
        created_source,
        created_utm_source,
        status,
        review_status,
        terms_accepted_at,
        terms_version,
        line_contact,
        company_stage,
        phone,
        use_case
      )
        VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP,$8,$9,$10,$11,$12)
        RETURNING id, name, email
      `, [
        finalContactName,
        normalizedEmail,
        hash,
        tracking.source || '',
        tracking.utm_source || '',
        'pending_review',
        'pending_review',
        'v1.0',
        lineContact || req.body.line_contact || '',
        finalCompanyStage,
        finalPhone,
        finalUseCase
      ]);

      const companyRow = await pgOne(`
        INSERT INTO companies (
          name,
          tax_id,
          industry,
          companyAddress,
          address,
          plan,
          owner_id,
          review_status,
          is_active,
          contact_name,
          phone,
          use_case,
          company_stage
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING id
      `, [
        finalCompanyName,
        finalTaxId,
        industry || '',
        finalAddress,
        finalAddress,
        plan,
        user.id,
        'pending_review',
        0,
        finalContactName,
        finalPhone,
        finalUseCase,
        finalCompanyStage
      ]);

      await pgQuery(`
        INSERT INTO company_users (company_id, user_id, role)
        VALUES ($1,$2,$3)
      `, [companyRow.id, user.id, 'owner']);

      audit(companyRow.id, user.id, 'register', '建立帳號與公司');
      await recordTrafficEvent(req, 'register', { userId: user.id, tracking });

      const newUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        isAdmin: false,
        isFounder: isFounderEmail(user.email)
      };

      return res.json({
        token: sign(newUser),
        user: newUser,
        companyId: companyRow.id
      });
    }

    const user = db.prepare(`
      INSERT INTO users (
        name,
      email,
      password_hash,
      created_source,
      created_utm_source,
      status,
      review_status,
      terms_accepted_at,
      terms_version,
      line_contact,
      company_stage,
      phone,
      use_case
    )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      finalContactName,
      normalizedEmail,
      hash,
      tracking.source || '',
      tracking.utm_source || '',
      'pending_review',
      'pending_review',
      new Date().toISOString(),
      'v1.0',
      lineContact || req.body.line_contact || '',
      finalCompanyStage,
      finalPhone,
      finalUseCase
    );

    const companyRow = db.prepare(`
      INSERT INTO companies (
        name,
        tax_id,
        industry,
        companyAddress,
        address,
        plan,
      owner_id,
      review_status,
      is_active,
      contact_name,
      phone,
      use_case,
      company_stage
    )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      finalCompanyName,
      finalTaxId,
      industry || '',
      finalAddress,
      finalAddress,
      plan,
      user.lastInsertRowid,
      'pending_review',
      0,
      finalContactName,
      finalPhone,
      finalUseCase,
      finalCompanyStage
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
    await recordTrafficEvent(req, 'register', { userId: user.lastInsertRowid, tracking });

    const newUser = db.prepare(`
      SELECT
        id,
        name,
        email
      FROM users
      WHERE id = ?
    `).get(user.lastInsertRowid);

    newUser.isAdmin = false;
    newUser.isFounder = isFounderEmail(newUser.email);

    res.json({
      token: sign(newUser),
      user: newUser,
      companyId: companyRow.lastInsertRowid
    });
  } catch (e) {
    res.status(400).json({
      error: '帳號可能已存在'
    });
  }
});

app.post('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 30 }), async (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  const tracking = sanitizeTrackingBody(req.body || {});

  if (!normalizedEmail || !password) {
    return res.status(400).json({ error: '缺少 email 或 password' });
  }

  const user = PG_ENABLED
    ? await pgOne(`
      SELECT *
      FROM users
      WHERE email = $1
    `, [normalizedEmail])
    : db.prepare(`
    SELECT *
    FROM users
    WHERE email = ?
  `).get(normalizedEmail);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    if (PG_ENABLED) {
      await pgQuery(`
        INSERT INTO user_login_logs (
          user_id,
          email,
          ip,
          user_agent,
          status,
          fail_reason
        )
        VALUES ($1,$2,$3,$4,$5,$6)
      `, [
        user?.id || null,
        normalizedEmail,
        requestIp(req),
        requestUserAgent(req),
        'failed',
        'invalid_credentials'
      ]);
    } else {
      db.prepare(`
      INSERT INTO user_login_logs (
        user_id,
        email,
        ip,
        user_agent,
        status,
        fail_reason
      )
      VALUES (?,?,?,?,?,?)
    `).run(
      user?.id || null,
      normalizedEmail,
      requestIp(req),
      requestUserAgent(req),
      'failed',
      'invalid_credentials'
    );
    }
    return res.status(401).json({ error: '帳號或密碼錯誤' });
  }

  if (PG_ENABLED) {
    await pgQuery(`
      UPDATE users
      SET
        last_login_at = CURRENT_TIMESTAMP,
        login_count = COALESCE(login_count, 0) + 1
      WHERE id = $1
    `, [user.id]);

    await pgQuery(`
      INSERT INTO user_login_logs (
        user_id,
        email,
        ip,
        user_agent,
        status
      )
      VALUES ($1,$2,$3,$4,$5)
    `, [user.id, user.email, requestIp(req), requestUserAgent(req), 'success']);
  } else {
    db.prepare(`
    UPDATE users
    SET
      last_login_at = CURRENT_TIMESTAMP,
      login_count = COALESCE(login_count, 0) + 1
    WHERE id = ?
  `).run(user.id);

    db.prepare(`
    INSERT INTO user_login_logs (
      user_id,
      email,
      ip,
      user_agent,
      status
    )
    VALUES (?,?,?,?,?)
  `).run(user.id, user.email, requestIp(req), requestUserAgent(req), 'success');
  }

  await recordTrafficEvent(req, 'login', { userId: user.id, tracking });

  const safe = {
    id: user.id,
    name: user.name,
    email: user.email,
    isAdmin: isAdminEmail(user.email),
    isFounder: isFounderEmail(user.email)
  };

  res.json({
    token: sign(safe),
    user: safe
  });
});

app.get('/api/me', auth, async (req, res) => {
  const user = PG_ENABLED
    ? await pgOne(`
      SELECT
        id,
        name,
        email,
        COALESCE(status, 'pending_review') AS status,
        COALESCE(review_status, 'pending_review') AS review_status,
        review_note,
        terms_accepted_at,
        terms_version
      FROM users
      WHERE id = $1
    `, [req.user.id])
    : db.prepare(`
      SELECT
        id,
        name,
        email,
        COALESCE(status, 'pending_review') AS status,
        COALESCE(review_status, 'pending_review') AS review_status,
        review_note,
        terms_accepted_at,
        terms_version
    FROM users
    WHERE id = ?
  `).get(req.user.id);

  if (user) {
    user.isAdmin = isAdminEmail(user.email);
    user.isFounder = isFounderEmail(user.email);
    if (user.isFounder) {
      user.status = 'founder';
      user.review_status = 'approved';
    } else if (user.isAdmin) {
      user.status = 'admin';
      user.review_status = 'approved';
    }
  }

  const rawCompanies = PG_ENABLED
    ? await pgAll(`
      SELECT
        c.*,
        cu.role
      FROM companies c
      JOIN company_users cu ON cu.company_id = c.id
      WHERE cu.user_id = $1
    `, [req.user.id])
    : db.prepare(`
    SELECT
      c.*,
      cu.role
    FROM companies c
    JOIN company_users cu ON cu.company_id = c.id
    WHERE cu.user_id = ?
  `).all(req.user.id);

  const companies = rawCompanies.map((row) => ({
    ...row,
    companyAddress: row.companyAddress ?? row.companyaddress ?? row.address ?? '',
    featureOverrides: getCompanyFeatureOverrides(row.id).reduce((acc, item) => {
      acc[item.feature_key] = Number(item.enabled) === 1;
      return acc;
    }, {}),
    effectiveFeatures: getEffectiveFeatures(row)
  }));

  res.json({
    user,
    companies,
    plans,
    featureCatalog: FEATURE_CATALOG
  });
});

app.get('/api/plans', (_, res) => {
  res.json(plans);
});

function distinctVisitors(range) {
  return db.prepare(`
    SELECT COUNT(DISTINCT COALESCE(visitor_id, ip || ':' || user_agent)) AS count
    FROM visitor_logs
    WHERE datetime(created_at) >= datetime(?)
      AND datetime(created_at) < datetime(?)
  `).get(range.start, range.end).count || 0;
}

async function pgDistinctVisitors(range) {
  const row = await pgOne(`
    SELECT COUNT(DISTINCT COALESCE(visitor_id, ip || ':' || user_agent))::int AS count
    FROM visitor_logs
    WHERE created_at >= $1::timestamptz
      AND created_at < $2::timestamptz
  `, [range.start, range.end]);
  return row?.count || 0;
}

app.get('/api/founder/analytics', auth, requireFounder, async (req, res) => {
  const today = taipeiDayRange(0);
  const yesterday = taipeiDayRange(-1);
  const last7 = daysAgoRange(7);
  const last30 = daysAgoRange(30);
  const last24 = daysAgoRange(1);

  if (PG_ENABLED) {
    const userCount = (range) => pgCountBetween('users', 'created_at', range);
    const loginCount = (range) => pgCountBetween('user_login_logs', 'created_at', range, 'status = $1', ['success']);
    const activeCount = async (range) => {
      const row = await pgOne(`
        SELECT COUNT(*)::int AS count
        FROM users
        WHERE last_login_at IS NOT NULL
          AND last_login_at >= $1::timestamptz
          AND last_login_at < $2::timestamptz
      `, [range.start, range.end]);
      return row?.count || 0;
    };

    const totalUsers = (await pgOne('SELECT COUNT(*)::int AS count FROM users'))?.count || 0;
    const totalVisits = (await pgOne(`
      SELECT COUNT(DISTINCT COALESCE(visitor_id, ip || ':' || user_agent))::int AS count
      FROM visitor_logs
    `))?.count || 0;
    const totalLogins = (await pgOne(`
      SELECT COUNT(*)::int AS count
      FROM user_login_logs
      WHERE status = 'success'
    `))?.count || 0;
    const sourceNames = (await pgAll(`
      SELECT COALESCE(source, 'unknown') AS source
      FROM traffic_events
      GROUP BY COALESCE(source, 'unknown')
      ORDER BY COUNT(*) DESC
    `)).map((row) => row.source || 'unknown');

    const sourceRows = await Promise.all((sourceNames.length ? sourceNames : ['direct']).map(async (source) => {
      const visits = (await pgOne(`
        SELECT COUNT(DISTINCT COALESCE(visitor_id, ip || ':' || user_agent))::int AS count
        FROM traffic_events
        WHERE event_type = 'visit'
          AND COALESCE(source, 'unknown') = $1
      `, [source]))?.count || 0;
      const registers = (await pgOne(`
        SELECT COUNT(*)::int AS count
        FROM traffic_events
        WHERE event_type = 'register'
          AND COALESCE(source, 'unknown') = $1
      `, [source]))?.count || 0;
      const logins = (await pgOne(`
        SELECT COUNT(*)::int AS count
        FROM traffic_events
        WHERE event_type = 'login'
          AND COALESCE(source, 'unknown') = $1
      `, [source]))?.count || 0;
      return {
        source,
        visits,
        registers,
        logins,
        registerConversionRate: visits ? Math.round((registers / visits) * 10000) / 100 : 0,
        loginConversionRate: visits ? Math.round((logins / visits) * 10000) / 100 : 0
      };
    }));

    const testers = await pgAll(`
      SELECT
        c.id,
        c.name AS "companyName",
        c.industry,
        c.created_at AS "createdAt",
        u.email,
        u.last_login_at AS "lastLoginAt",
        COALESCE(u.login_count, 0) AS "loginCount",
        COALESCE(u.created_source, '') AS source
      FROM companies c
      LEFT JOIN users u ON u.id = c.owner_id
      WHERE COALESCE(c.is_tester, 0) = 1
      ORDER BY c.created_at DESC
    `);

    const alerts = [];
    if ((await userCount(last24)) === 0) alerts.push('過去 24 小時無註冊');
    if ((await loginCount(last24)) === 0) alerts.push('過去 24 小時無登入');

    return res.json({
      users: {
        total: totalUsers,
        today: await userCount(today),
        yesterday: await userCount(yesterday),
        last7Days: await userCount(last7),
        last30Days: await userCount(last30)
      },
      visitors: {
        today: await pgDistinctVisitors(today),
        yesterday: await pgDistinctVisitors(yesterday),
        last7Days: await pgDistinctVisitors(last7),
        last30Days: await pgDistinctVisitors(last30),
        total: totalVisits
      },
      logins: {
        today: await loginCount(today),
        yesterday: await loginCount(yesterday),
        last7Days: await loginCount(last7),
        last30Days: await loginCount(last30)
      },
      activeUsers: {
        last7Days: await activeCount(last7),
        last30Days: await activeCount(last30)
      },
      sources: sourceRows,
      funnel: {
        visits: totalVisits,
        registers: totalUsers,
        logins: totalLogins,
        activeUsers: await activeCount(last30)
      },
      testers,
      alerts
    });
  }

  const userCount = (range) => countBetween('users', 'created_at', range);
  const loginCount = (range) => countBetween('user_login_logs', 'created_at', range, "status = 'success'");
  const activeCount = (range) => db.prepare(`
    SELECT COUNT(*) AS count
    FROM users
    WHERE last_login_at IS NOT NULL
      AND datetime(last_login_at) >= datetime(?)
      AND datetime(last_login_at) < datetime(?)
  `).get(range.start, range.end).count || 0;

  const totalUsers = db.prepare('SELECT COUNT(*) AS count FROM users').get().count || 0;
  const totalVisits = db.prepare(`
    SELECT COUNT(DISTINCT COALESCE(visitor_id, ip || ':' || user_agent)) AS count
    FROM visitor_logs
  `).get().count || 0;
  const totalRegisters = totalUsers;
  const totalLogins = db.prepare(`
    SELECT COUNT(*) AS count
    FROM user_login_logs
    WHERE status = 'success'
  `).get().count || 0;

  const sources = db.prepare(`
    SELECT source
    FROM traffic_events
    GROUP BY source
    ORDER BY COUNT(*) DESC
  `).all().map((row) => row.source || 'unknown');

  const sourceRows = (sources.length ? sources : ['direct']).map((source) => {
    const visits = db.prepare(`
      SELECT COUNT(DISTINCT COALESCE(visitor_id, ip || ':' || user_agent)) AS count
      FROM traffic_events
      WHERE event_type = 'visit'
        AND COALESCE(source, 'unknown') = ?
    `).get(source).count || 0;
    const registers = db.prepare(`
      SELECT COUNT(*) AS count
      FROM traffic_events
      WHERE event_type = 'register'
        AND COALESCE(source, 'unknown') = ?
    `).get(source).count || 0;
    const logins = db.prepare(`
      SELECT COUNT(*) AS count
      FROM traffic_events
      WHERE event_type = 'login'
        AND COALESCE(source, 'unknown') = ?
    `).get(source).count || 0;
    return {
      source,
      visits,
      registers,
      logins,
      registerConversionRate: visits ? Math.round((registers / visits) * 10000) / 100 : 0,
      loginConversionRate: visits ? Math.round((logins / visits) * 10000) / 100 : 0
    };
  });

  const testers = db.prepare(`
    SELECT
      c.id,
      c.name AS companyName,
      c.industry,
      c.created_at AS createdAt,
      u.email,
      u.last_login_at AS lastLoginAt,
      COALESCE(u.login_count, 0) AS loginCount,
      COALESCE(u.created_source, '') AS source
    FROM companies c
    LEFT JOIN users u ON u.id = c.owner_id
    WHERE COALESCE(c.is_tester, 0) = 1
    ORDER BY c.created_at DESC
  `).all();

  const backups = listBackups();
  const alerts = [];
  if (userCount(last24) === 0) alerts.push('過去 24 小時無註冊');
  if (loginCount(last24) === 0) alerts.push('過去 24 小時無登入');
  if (NODE_ENV === 'production' && DB_PROVIDER === 'sqlite' && !DB_PATH.startsWith('/data/')) {
    alerts.push('目前使用 Render Free SQLite 暫存儲存，正式商用前建議改用 Persistent Disk 或 PostgreSQL');
  }
  const lastBackup = backups[0]?.createdAt ? new Date(`${backups[0].createdAt.replace(' ', 'T')}Z`) : null;
  if (!lastBackup || Date.now() - lastBackup.getTime() > 7 * 24 * 60 * 60 * 1000) {
    alerts.push('備份超過 7 天未建立');
  }

  res.json({
    users: {
      total: totalUsers,
      today: userCount(today),
      yesterday: userCount(yesterday),
      last7Days: userCount(last7),
      last30Days: userCount(last30)
    },
    visitors: {
      today: distinctVisitors(today),
      yesterday: distinctVisitors(yesterday),
      last7Days: distinctVisitors(last7),
      last30Days: distinctVisitors(last30),
      total: totalVisits
    },
    logins: {
      today: loginCount(today),
      yesterday: loginCount(yesterday),
      last7Days: loginCount(last7),
      last30Days: loginCount(last30)
    },
    activeUsers: {
      last7Days: activeCount(last7),
      last30Days: activeCount(last30)
    },
    sources: sourceRows,
    funnel: {
      visits: totalVisits,
      registers: totalRegisters,
      logins: totalLogins,
      activeUsers: activeCount(last30)
    },
    testers,
    alerts
  });
});

app.get('/api/founder/db-health', auth, requireFounder, async (req, res) => {
  if (PG_ENABLED) {
    const [
      usersCount,
      jobSitesCount,
      paymentsCount,
      lastUserCreatedAt
    ] = await Promise.all([
      pgOne('SELECT COUNT(*)::int AS count FROM users'),
      pgOne('SELECT COUNT(*)::int AS count FROM job_sites'),
      pgOne('SELECT COUNT(*)::int AS count FROM job_site_payments'),
      pgOne('SELECT MAX(created_at) AS value FROM users')
    ]);

    return res.json({
      env: NODE_ENV,
      provider: 'postgresql',
      storage: 'postgresql',
      postgres: postgresStatus,
      dbPath: 'DATABASE_URL',
      isPersistentPath: true,
      dbExists: true,
      dbSizeMB: 0,
      usersCount: usersCount?.count || 0,
      jobSitesCount: jobSitesCount?.count || 0,
      paymentsCount: paymentsCount?.count || 0,
      lastUserCreatedAt: lastUserCreatedAt?.value || '',
      lastBackupAt: '',
      backupCount: 0,
      renderEnvironment: process.env.RENDER ? 'render' : 'local',
      warning: ''
    });
  }

  const backups = listBackups();
  const exists = fs.existsSync(DB_PATH);
  const stat = exists ? fs.statSync(DB_PATH) : null;
  const isPersistentPath = DB_PATH.startsWith('/data/');
  const warning = NODE_ENV === 'production' && DB_PROVIDER === 'sqlite' && !isPersistentPath
    ? '目前使用 SQLite 開發模式。正式環境請設定 DATABASE_URL 以使用 PostgreSQL。'
    : '';

  res.json({
    env: NODE_ENV,
    provider: DB_PROVIDER,
    postgres: postgresStatus,
    dbPath: DB_PATH,
    isPersistentPath,
    dbExists: exists,
    dbSizeMB: stat ? Math.round((stat.size / 1024 / 1024) * 100) / 100 : 0,
    usersCount: db.prepare('SELECT COUNT(*) AS count FROM users').get().count || 0,
    jobSitesCount: db.prepare('SELECT COUNT(*) AS count FROM job_sites').get().count || 0,
    paymentsCount: db.prepare('SELECT COUNT(*) AS count FROM job_site_payments').get().count || 0,
    lastUserCreatedAt: db.prepare('SELECT MAX(created_at) AS value FROM users').get().value || '',
    lastBackupAt: backups[0]?.createdAt || '',
    backupCount: backups.length,
    renderEnvironment: process.env.RENDER ? 'render' : 'local',
    warning
  });
});

app.get('/api/founder/backups', auth, requireFounder, (req, res) => {
  res.json(listBackups());
});

app.post('/api/founder/backup', auth, requireFounder, (req, res) => {
  if (!fs.existsSync(DB_PATH)) {
    return res.status(500).json({ error: '目前資料庫檔案不存在，無法備份' });
  }

  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  db.pragma('wal_checkpoint(FULL)');

  const stamp = backupTimestamp();
  const filename = `bookai-backup-${stamp}.db`;
  const target = path.join(dir, filename);
  fs.copyFileSync(DB_PATH, target);
  const stat = fs.statSync(target);

  res.json({
    filename,
    sizeMB: Math.round((stat.size / 1024 / 1024) * 100) / 100,
    createdAt: toSqlDateTime(stat.mtime)
  });
});

const adminBillingStatuses = new Set(['trial', 'active', 'expired', 'paused']);
const adminWebsiteStatuses = new Set(['none', 'planning', 'building', 'live', 'paused']);
const testerFeedbackStatuses = new Set(['尚未回饋', '已回饋', '需追蹤', '已完成測試']);
const feedbackCategories = new Set(['操作問題', '介面建議', '功能需求', '錯誤回報', '其他']);
const feedbackStatuses = new Set(['new', 'reviewing', 'resolved', 'ignored']);
const reviewStatuses = new Set(['pending_review', 'approved', 'rejected', 'suspended', 'founder', 'admin', 'demo']);
const adminSettingKeys = new Set([
  'official_site_url',
  'official_line_url',
  'default_trial_days',
  'renewal_reminder_days',
  'enable_website_backend',
  'system_announcement'
]);

app.get('/api/admin/review/users', auth, requireAdmin, async (req, res) => {
  try {
    const status = String(req.query.status || '').trim();
    const where = status && reviewStatuses.has(status)
      ? PG_ENABLED
        ? 'WHERE COALESCE(u.status, u.review_status, $1) = $1'
        : 'WHERE COALESCE(u.status, u.review_status, ?) = ?'
      : '';
    const params = status && reviewStatuses.has(status)
      ? PG_ENABLED ? [status] : [status, status]
      : [];
    const sql = `
      SELECT
        u.id,
        u.email,
        u.name,
        u.phone,
        u.use_case,
        u.line_contact,
        u.company_stage,
        u.status,
        u.review_status,
        u.review_note,
        u.terms_accepted_at,
        u.terms_version,
        u.last_login_at,
        COALESCE(u.login_count, 0) AS login_count,
        u.created_at,
        c.id AS company_id,
        c.name AS company_name,
        c.tax_id,
        c.industry,
        c.contact_name,
        c.phone AS company_phone,
        c.use_case AS company_use_case,
        c.company_stage AS company_company_stage,
        c.review_status AS company_review_status
      FROM users u
      LEFT JOIN companies c ON c.owner_id = u.id
      ${where}
      ORDER BY u.created_at DESC, u.id DESC
    `;
    const rows = PG_ENABLED ? await pgAll(sql, params) : db.prepare(sql).all(...params);
    res.json(rows);
  } catch (err) {
    console.error('admin review users failed', { userId: req.user?.id, code: err.code, message: err.message });
    res.status(500).json({ error: '資料讀取失敗', code: 'DATABASE_ERROR' });
  }
});

async function updateMemberReview(userId, adminId, status, note = '') {
  const now = new Date().toISOString();
  const existing = PG_ENABLED
    ? await pgOne('SELECT id, email FROM users WHERE id = $1', [userId])
    : db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId);

  if (!existing) return null;
  if (isPrivilegedEmail(existing.email)) {
    return { protected: true };
  }

  const userPatch = {
    status,
    review_status: status === 'demo' ? 'approved' : status,
    review_note: note
  };

  const actionMap = {
    approved: 'member_approved',
    rejected: 'member_rejected',
    suspended: 'member_suspended',
    demo: 'member_set_demo'
  };

  if (PG_ENABLED) {
    if (status === 'approved' || status === 'demo') {
      await pgQuery(`
        UPDATE users
        SET status = $1,
            review_status = $2,
            approved_at = $3,
            approved_by = $4,
            review_note = $5
        WHERE id = $6
      `, [userPatch.status, userPatch.review_status, now, adminId, note, userId]);
      await pgQuery(`
        UPDATE companies
        SET review_status = 'approved',
            is_active = 1,
            approved_at = $1,
            approved_by = $2,
            review_note = $3
        WHERE owner_id = $4
      `, [now, adminId, note, userId]);
    } else if (status === 'rejected') {
      await pgQuery(`
        UPDATE users
        SET status = 'rejected',
            review_status = 'rejected',
            rejected_at = $1,
            rejected_by = $2,
            review_note = $3
        WHERE id = $4
      `, [now, adminId, note, userId]);
      await pgQuery(`
        UPDATE companies
        SET review_status = 'rejected',
            is_active = 0,
            rejected_at = $1,
            rejected_by = $2,
            review_note = $3
        WHERE owner_id = $4
      `, [now, adminId, note, userId]);
    } else if (status === 'suspended') {
      await pgQuery(`
        UPDATE users
        SET status = 'suspended',
            review_status = 'suspended',
            suspended_at = $1,
            suspended_by = $2,
            review_note = $3
        WHERE id = $4
      `, [now, adminId, note, userId]);
      await pgQuery(`
        UPDATE companies
        SET review_status = 'suspended',
            is_active = 0,
            review_note = $1
        WHERE owner_id = $2
      `, [note, userId]);
    }
  } else {
    if (status === 'approved' || status === 'demo') {
      db.prepare(`
        UPDATE users SET status = ?, review_status = ?, approved_at = ?, approved_by = ?, review_note = ? WHERE id = ?
      `).run(userPatch.status, userPatch.review_status, now, adminId, note, userId);
      db.prepare(`
        UPDATE companies SET review_status = 'approved', is_active = 1, approved_at = ?, approved_by = ?, review_note = ? WHERE owner_id = ?
      `).run(now, adminId, note, userId);
    } else if (status === 'rejected') {
      db.prepare(`
        UPDATE users SET status = 'rejected', review_status = 'rejected', rejected_at = ?, rejected_by = ?, review_note = ? WHERE id = ?
      `).run(now, adminId, note, userId);
      db.prepare(`
        UPDATE companies SET review_status = 'rejected', is_active = 0, rejected_at = ?, rejected_by = ?, review_note = ? WHERE owner_id = ?
      `).run(now, adminId, note, userId);
    } else if (status === 'suspended') {
      db.prepare(`
        UPDATE users SET status = 'suspended', review_status = 'suspended', suspended_at = ?, suspended_by = ?, review_note = ? WHERE id = ?
      `).run(now, adminId, note, userId);
      db.prepare(`UPDATE companies SET review_status = 'suspended', is_active = 0, review_note = ? WHERE owner_id = ?`).run(note, userId);
    }
  }

  audit(null, adminId, actionMap[status] || 'member_review_updated', JSON.stringify({ userId, status }));
  return { ok: true };
}

function reviewAction(status) {
  return async (req, res) => {
    try {
      const result = await updateMemberReview(Number(req.params.id), req.user.id, status, req.body?.reviewNote || req.body?.note || '');
      if (!result) return res.status(404).json({ error: '找不到使用者' });
      if (result.protected) return res.status(400).json({ error: 'Founder / Admin 帳號不可由審核中心變更狀態' });
      res.json({ ok: true });
    } catch (err) {
      console.error('admin review action failed', { route: req.path, userId: req.user?.id, code: err.code, message: err.message });
      res.status(500).json({ error: '資料更新失敗', code: 'DATABASE_ERROR' });
    }
  };
}

app.post('/api/admin/review/users/:id/approve', auth, requireAdmin, reviewAction('approved'));
app.post('/api/admin/review/users/:id/reject', auth, requireAdmin, reviewAction('rejected'));
app.post('/api/admin/review/users/:id/suspend', auth, requireAdmin, reviewAction('suspended'));
app.post('/api/admin/review/users/:id/restore', auth, requireAdmin, reviewAction('approved'));
app.post('/api/admin/review/users/:id/demo', auth, requireAdmin, reviewAction('demo'));
app.put('/api/admin/review/users/:id/note', auth, requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const note = String(req.body?.reviewNote || req.body?.note || '');
    const result = PG_ENABLED
      ? await pgQuery('UPDATE users SET review_note = $1 WHERE id = $2', [note, userId])
      : db.prepare('UPDATE users SET review_note = ? WHERE id = ?').run(note, userId);
    const changed = PG_ENABLED ? result.rowCount : result.changes;
    if (!changed) return res.status(404).json({ error: '找不到使用者' });
    audit(null, req.user.id, 'member_review_note_updated', JSON.stringify({ userId }));
    res.json({ ok: true });
  } catch (err) {
    console.error('admin review note failed', { userId: req.user?.id, code: err.code, message: err.message });
    res.status(500).json({ error: '資料更新失敗', code: 'DATABASE_ERROR' });
  }
});

function toAdminBoolean(value) {
  if (value === true || value === 1) return 1;
  const text = String(value ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', '是', 'on'].includes(text) ? 1 : 0;
}

function normalizeRating(value) {
  const rating = Number(value);
  if (!Number.isFinite(rating)) return 3;
  return Math.max(1, Math.min(5, Math.round(rating)));
}

function feedbackRow(row) {
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: row.company_name || '',
    userId: row.user_id,
    userName: row.user_name || '',
    userEmail: row.user_email || '',
    category: row.category || '其他',
    rating: row.rating || 3,
    message: row.message || '',
    page: row.page || '',
    status: row.status || 'new',
    adminNote: row.admin_note || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
}

app.get('/api/admin/companies', auth, requireAdmin, async (req, res) => {
  if (PG_ENABLED) {
    const companies = await pgAll(`
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
        c.is_tester,
        c.tester_started_at,
        c.tester_note,
        c.tester_feedback_status,
        c.created_at,
        u.name AS owner_name,
        u.email AS owner_email
      FROM companies c
      LEFT JOIN users u ON u.id = c.owner_id
      ORDER BY c.created_at DESC, c.id DESC
    `);
    return res.json(companies);
  }

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
      c.is_tester,
      c.tester_started_at,
      c.tester_note,
      c.tester_feedback_status,
      c.created_at,
      u.name AS owner_name,
      u.email AS owner_email
    FROM companies c
    LEFT JOIN users u ON u.id = c.owner_id
    ORDER BY c.created_at DESC, c.id DESC
  `).all();

  res.json(companies);
});

app.get('/api/admin/features/catalog', auth, requireAdmin, (req, res) => {
  res.json(FEATURE_CATALOG);
});

app.get('/api/admin/companies/:companyId/features', auth, requireAdmin, (req, res) => {
  const companyId = Number(req.params.companyId);

  if (!companyId) {
    return res.status(400).json({ error: '缺少 companyId' });
  }

  const companyRow = db.prepare(`
    SELECT *
    FROM companies
    WHERE id = ?
  `).get(companyId);

  if (!companyRow) {
    return res.status(404).json({ error: '找不到公司' });
  }

  const overrides = getCompanyFeatureOverrides(companyId).reduce((acc, row) => {
    acc[row.feature_key] = {
      enabled: Number(row.enabled) === 1,
      note: row.note || '',
      updatedAt: row.updated_at || ''
    };
    return acc;
  }, {});

  res.json({
    companyId,
    plan: companyRow.plan,
    effectiveFeatures: getEffectiveFeatures(companyRow),
    overrides
  });
});

app.put('/api/admin/companies/:companyId/features', auth, requireAdmin, (req, res) => {
  const companyId = Number(req.params.companyId);
  const { features = {}, note = '' } = req.body || {};

  if (!companyId) {
    return res.status(400).json({ error: '缺少 companyId' });
  }

  const companyRow = db.prepare(`
    SELECT id
    FROM companies
    WHERE id = ?
  `).get(companyId);

  if (!companyRow) {
    return res.status(404).json({ error: '找不到公司' });
  }

  const entries = Object.entries(features).filter(([key]) => FEATURE_KEYS.has(key));

  if (!entries.length) {
    return res.status(400).json({ error: '沒有可更新的功能權限' });
  }

  const stmt = db.prepare(`
    INSERT INTO company_feature_overrides (
      company_id,
      feature_key,
      enabled,
      note,
      updated_at
    )
    VALUES (?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(company_id, feature_key)
    DO UPDATE SET
      enabled = excluded.enabled,
      note = excluded.note,
      updated_at = CURRENT_TIMESTAMP
  `);

  const trx = db.transaction(() => {
    entries.forEach(([key, enabled]) => {
      stmt.run(companyId, key, toAdminBoolean(enabled), String(note || '系統管理員調整'));
    });
  });

  trx();

  audit(companyId, req.user.id, 'admin_feature_access_updated', JSON.stringify(
    Object.fromEntries(entries.map(([key, enabled]) => [key, Boolean(Number(enabled) || enabled === true)]))
  ));

  res.json({
    ok: true,
    companyId,
    overrides: getCompanyFeatureOverrides(companyId).reduce((acc, row) => {
      acc[row.feature_key] = Number(row.enabled) === 1;
      return acc;
    }, {})
  });
});

app.patch('/api/admin/companies/:companyId/billing', auth, requireAdmin, async (req, res) => {
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

  const existing = PG_ENABLED
    ? await pgOne('SELECT id FROM companies WHERE id = $1', [companyId])
    : db.prepare(`
    SELECT id
    FROM companies
    WHERE id = ?
  `).get(companyId);

  if (!existing) {
    return res.status(404).json({ error: '找不到公司' });
  }

  if (PG_ENABLED) {
    await pgQuery(`
      UPDATE companies
      SET billing_status = $1,
          subscription_plan = $2,
          subscription_expires_at = $3,
          is_paid_customer = $4,
          billing_note = $5
      WHERE id = $6
    `, [
      billing_status || 'trial',
      subscription_plan || 'engineering_trial',
      subscription_expires_at || '',
      toAdminBoolean(is_paid_customer),
      billing_note || '',
      companyId
    ]);
  } else {
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
  }

  audit(companyId, req.user.id, 'admin_billing_updated', JSON.stringify({
    billing_status,
    subscription_plan,
    subscription_expires_at
  }));

  res.json({ ok: true });
});

app.patch('/api/admin/companies/:companyId/website', auth, requireAdmin, async (req, res) => {
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

  const existing = PG_ENABLED
    ? await pgOne('SELECT id FROM companies WHERE id = $1', [companyId])
    : db.prepare(`
    SELECT id
    FROM companies
    WHERE id = ?
  `).get(companyId);

  if (!existing) {
    return res.status(404).json({ error: '找不到公司' });
  }

  if (PG_ENABLED) {
    await pgQuery(`
      UPDATE companies
      SET has_official_site = $1,
          official_site_url = $2,
          official_site_status = $3,
          official_site_note = $4
      WHERE id = $5
    `, [
      toAdminBoolean(has_official_site),
      official_site_url || '',
      official_site_status || 'none',
      official_site_note || '',
      companyId
    ]);
  } else {
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
  }

  audit(companyId, req.user.id, 'admin_website_updated', official_site_status || 'none');

  res.json({ ok: true });
});

app.put('/api/admin/companies/:companyId/tester', auth, requireAdmin, async (req, res) => {
  const companyId = Number(req.params.companyId);
  const {
    is_tester,
    tester_started_at,
    tester_note,
    tester_feedback_status
  } = req.body || {};

  if (!companyId) {
    return res.status(400).json({ error: '缺少 companyId' });
  }

  if (tester_feedback_status && !testerFeedbackStatuses.has(tester_feedback_status)) {
    return res.status(400).json({ error: '不支援的使用回饋狀態' });
  }

  const existing = PG_ENABLED
    ? await pgOne('SELECT id FROM companies WHERE id = $1', [companyId])
    : db.prepare(`
    SELECT id
    FROM companies
    WHERE id = ?
  `).get(companyId);

  if (!existing) {
    return res.status(404).json({ error: '找不到公司' });
  }

  const isTester = toAdminBoolean(is_tester);
  if (PG_ENABLED) {
    await pgQuery(`
      UPDATE companies
      SET is_tester = $1,
          tester_started_at = $2,
          tester_note = $3,
          tester_feedback_status = $4
      WHERE id = $5
    `, [
      isTester,
      tester_started_at || (isTester ? new Date().toISOString().slice(0, 10) : ''),
      tester_note || '',
      tester_feedback_status || '尚未回饋',
      companyId
    ]);
  } else {
    db.prepare(`
    UPDATE companies
    SET
      is_tester = ?,
      tester_started_at = ?,
      tester_note = ?,
      tester_feedback_status = ?
    WHERE id = ?
  `).run(
    isTester,
    tester_started_at || (isTester ? new Date().toISOString().slice(0, 10) : ''),
    tester_note || '',
    tester_feedback_status || '尚未回饋',
    companyId
  );
  }

  audit(companyId, req.user.id, 'admin_tester_status_updated', JSON.stringify({
    is_tester: isTester,
    tester_feedback_status: tester_feedback_status || '尚未回饋'
  }));

  res.json({ ok: true });
});

app.get('/api/admin/settings', auth, requireAdmin, async (req, res) => {
  if (PG_ENABLED) {
    const rows = await pgAll(`
      SELECT key, value
      FROM platform_settings
      ORDER BY key
    `);
    return res.json(Object.fromEntries(rows.map((row) => [row.key, row.value || ''])));
  }

  const rows = db.prepare(`
    SELECT key, value
    FROM platform_settings
    ORDER BY key
  `).all();

  res.json(Object.fromEntries(rows.map((row) => [row.key, row.value || ''])));
});

app.patch('/api/admin/settings', auth, requireAdmin, async (req, res) => {
  const body = req.body || {};
  if (PG_ENABLED) {
    for (const [key, value] of Object.entries(body)) {
      if (adminSettingKeys.has(key)) {
        await pgQuery(`
          INSERT INTO platform_settings (key, value, updated_at)
          VALUES ($1,$2,CURRENT_TIMESTAMP)
          ON CONFLICT (key) DO UPDATE SET
            value = EXCLUDED.value,
            updated_at = CURRENT_TIMESTAMP
        `, [key, String(value ?? '')]);
      }
    }

    audit(null, req.user.id, 'admin_settings_updated', Object.keys(body).join(','));

    const rows = await pgAll(`
      SELECT key, value
      FROM platform_settings
      ORDER BY key
    `);
    return res.json(Object.fromEntries(rows.map((row) => [row.key, row.value || ''])));
  }

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

app.post('/api/admin/demo/engineering', auth, requireAdmin, (req, res) => {
  try {
    const demo = prepareEngineeringDemo({ closeDb: false });

    audit(null, req.user.id, 'admin_engineering_demo_prepared', String(demo.companyId || ''));

    res.json({
      ok: true,
      demo
    });
  } catch (err) {
    res.status(500).json({
      error: '工程測試資料建立或更新失敗',
      detail: err.message
    });
  }
});

app.get('/api/feedbacks/my', auth, company, (req, res) => {
  const rows = db.prepare(`
    SELECT
      f.*,
      c.name AS company_name,
      u.name AS user_name,
      u.email AS user_email
    FROM feedbacks f
    LEFT JOIN companies c ON c.id = f.company_id
    LEFT JOIN users u ON u.id = f.user_id
    WHERE f.company_id = ?
    ORDER BY f.created_at DESC, f.id DESC
  `).all(req.company.id);

  res.json(rows.map(feedbackRow));
});

app.post('/api/feedbacks/create', auth, company, (req, res) => {
  const body = req.body || {};
  const message = String(body.message || '').trim();
  if (!message) return res.status(400).json({ error: '請填寫回饋內容' });

  const category = feedbackCategories.has(body.category) ? body.category : '其他';
  const rating = normalizeRating(body.rating);
  const page = String(body.page || '').trim();

  const row = db.prepare(`
    INSERT INTO feedbacks (
      company_id,
      user_id,
      category,
      rating,
      message,
      page,
      status
    )
    VALUES (?,?,?,?,?,?,?)
  `).run(req.company.id, req.user.id, category, rating, message, page, 'new');

  audit(req.company.id, req.user.id, 'feedback_created', String(row.lastInsertRowid));

  const created = db.prepare(`
    SELECT
      f.*,
      c.name AS company_name,
      u.name AS user_name,
      u.email AS user_email
    FROM feedbacks f
    LEFT JOIN companies c ON c.id = f.company_id
    LEFT JOIN users u ON u.id = f.user_id
    WHERE f.id = ?
      AND f.company_id = ?
  `).get(row.lastInsertRowid, req.company.id);

  res.json(feedbackRow(created));
});

app.get('/api/admin/feedbacks', auth, requireAdmin, (req, res) => {
  const status = String(req.query.status || '').trim();
  const category = String(req.query.category || '').trim();
  const where = [];
  const params = [];

  if (status && feedbackStatuses.has(status)) {
    where.push('f.status = ?');
    params.push(status);
  }

  if (category && feedbackCategories.has(category)) {
    where.push('f.category = ?');
    params.push(category);
  }

  const rows = db.prepare(`
    SELECT
      f.*,
      c.name AS company_name,
      u.name AS user_name,
      u.email AS user_email
    FROM feedbacks f
    LEFT JOIN companies c ON c.id = f.company_id
    LEFT JOIN users u ON u.id = f.user_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY f.created_at DESC, f.id DESC
  `).all(...params);

  res.json(rows.map(feedbackRow));
});

app.put('/api/admin/feedbacks/:id', auth, requireAdmin, (req, res) => {
  const feedbackId = Number(req.params.id);
  const body = req.body || {};
  const status = feedbackStatuses.has(body.status) ? body.status : null;

  if (!feedbackId) return res.status(400).json({ error: '缺少 feedback id' });
  if (!status) return res.status(400).json({ error: '不支援的回饋狀態' });

  const existing = db.prepare('SELECT * FROM feedbacks WHERE id = ?').get(feedbackId);
  if (!existing) return res.status(404).json({ error: '找不到回饋' });

  db.prepare(`
    UPDATE feedbacks
    SET
      status = ?,
      admin_note = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, body.admin_note || body.adminNote || '', feedbackId);

  audit(existing.company_id, req.user.id, 'admin_feedback_updated', JSON.stringify({
    feedbackId,
    status
  }));

  const updated = db.prepare(`
    SELECT
      f.*,
      c.name AS company_name,
      u.name AS user_name,
      u.email AS user_email
    FROM feedbacks f
    LEFT JOIN companies c ON c.id = f.company_id
    LEFT JOIN users u ON u.id = f.user_id
    WHERE f.id = ?
  `).get(feedbackId);

  res.json(feedbackRow(updated));
});

const commerceIndustries = new Set([
  'ecommerce',
  'hosted_commerce',
  'marketplace',
  'social_commerce',
  'food',
  'restaurant',
  'beverage',
  'retail'
]);
const commerceSiteStatuses = new Set(['draft', 'live', 'paused']);
const commercePromoTypes = new Set(['banner', 'marquee', 'campaign']);

function requireCommerceCompany(req, res, next) {
  if (commerceIndustries.has(req.company?.industry)) {
    return next();
  }

  return res.status(403).json({ error: '官網後台僅開放 Commerce 類產業使用' });
}

function commerceBool(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 1) return 1;
  const text = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', '是', 'on'].includes(text) ? 1 : 0;
}

function commerceNumber(value, fallback = 0) {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function ensureCommerceSiteSettings(companyRow) {
  const existing = db.prepare(`
    SELECT *
    FROM commerce_site_settings
    WHERE company_id = ?
  `).get(companyRow.id);

  if (existing) return existing;

  const defaults = {
    brandName: companyRow.name || '',
    heroTitle: '歡迎來到我們的官方網站',
    heroSubtitle: '商品、活動與最新資訊都可以在這裡查看。',
    announcementText: '歡迎加入官方 LINE 了解最新活動。',
    siteStatus: 'draft',
    themeName: 'default'
  };

  db.prepare(`
    INSERT INTO commerce_site_settings (
      company_id,
      brand_name,
      hero_title,
      hero_subtitle,
      announcement_text,
      site_status,
      theme_name,
      created_at,
      updated_at
    )
    VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `).run(
    companyRow.id,
    defaults.brandName,
    defaults.heroTitle,
    defaults.heroSubtitle,
    defaults.announcementText,
    defaults.siteStatus,
    defaults.themeName
  );

  return db.prepare(`
    SELECT *
    FROM commerce_site_settings
    WHERE company_id = ?
  `).get(companyRow.id);
}

function commerceSettingsRow(row) {
  return {
    id: row.id,
    companyId: row.company_id,
    brandName: row.brand_name || '',
    heroTitle: row.hero_title || '',
    heroSubtitle: row.hero_subtitle || '',
    announcementText: row.announcement_text || '',
    officialLineUrl: row.official_line_url || '',
    contactPhone: row.contact_phone || '',
    contactEmail: row.contact_email || '',
    siteStatus: row.site_status || 'draft',
    themeName: row.theme_name || 'default',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function commerceProductRow(row) {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    description: row.description || '',
    price: row.price || 0,
    originalPrice: row.original_price || 0,
    imageUrl: row.image_url || '',
    category: row.category || '',
    isFeatured: Boolean(row.is_featured),
    isVisible: Boolean(row.is_visible),
    sortOrder: row.sort_order || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function commercePromotionRow(row) {
  return {
    id: row.id,
    companyId: row.company_id,
    title: row.title,
    description: row.description || '',
    promoType: row.promo_type || 'banner',
    startDate: row.start_date || '',
    endDate: row.end_date || '',
    isActive: Boolean(row.is_active),
    sortOrder: row.sort_order || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

app.get('/api/companies/:companyId/commerce-site/settings', auth, company, requireCommerceCompany, (req, res) => {
  res.json(commerceSettingsRow(ensureCommerceSiteSettings(req.company)));
});

app.patch('/api/companies/:companyId/commerce-site/settings', auth, company, requireCommerceCompany, requireRole('owner', 'admin'), (req, res) => {
  ensureCommerceSiteSettings(req.company);

  const b = req.body || {};
  const siteStatus = b.siteStatus ?? b.site_status ?? 'draft';

  if (!commerceSiteStatuses.has(siteStatus)) {
    return res.status(400).json({ error: '不支援的網站狀態' });
  }

  db.prepare(`
    UPDATE commerce_site_settings
    SET
      brand_name = ?,
      hero_title = ?,
      hero_subtitle = ?,
      announcement_text = ?,
      official_line_url = ?,
      contact_phone = ?,
      contact_email = ?,
      site_status = ?,
      theme_name = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE company_id = ?
  `).run(
    b.brandName ?? b.brand_name ?? '',
    b.heroTitle ?? b.hero_title ?? '',
    b.heroSubtitle ?? b.hero_subtitle ?? '',
    b.announcementText ?? b.announcement_text ?? '',
    b.officialLineUrl ?? b.official_line_url ?? '',
    b.contactPhone ?? b.contact_phone ?? '',
    b.contactEmail ?? b.contact_email ?? '',
    siteStatus,
    b.themeName ?? b.theme_name ?? 'default',
    req.company.id
  );

  audit(req.company.id, req.user.id, 'commerce_site_settings_updated', siteStatus);

  res.json(commerceSettingsRow(ensureCommerceSiteSettings(req.company)));
});

app.get('/api/companies/:companyId/commerce-site/products', auth, company, requireCommerceCompany, (req, res) => {
  const rows = db.prepare(`
    SELECT *
    FROM commerce_site_products
    WHERE company_id = ?
    ORDER BY sort_order ASC, id DESC
  `).all(req.company.id);

  res.json(rows.map(commerceProductRow));
});

app.post('/api/companies/:companyId/commerce-site/products', auth, company, requireCommerceCompany, requireRole('owner', 'admin', 'staff'), (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();

  if (!name) {
    return res.status(400).json({ error: '請輸入商品名稱' });
  }

  const row = db.prepare(`
    INSERT INTO commerce_site_products (
      company_id,
      name,
      description,
      price,
      original_price,
      image_url,
      category,
      is_featured,
      is_visible,
      sort_order,
      created_at,
      updated_at
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `).run(
    req.company.id,
    name,
    b.description || '',
    commerceNumber(b.price),
    commerceNumber(b.originalPrice ?? b.original_price),
    b.imageUrl ?? b.image_url ?? '',
    b.category || '',
    commerceBool(b.isFeatured ?? b.is_featured, 0),
    commerceBool(b.isVisible ?? b.is_visible, 1),
    commerceNumber(b.sortOrder ?? b.sort_order, 0)
  );

  audit(req.company.id, req.user.id, 'commerce_site_product_created', String(row.lastInsertRowid));

  const product = db.prepare(`
    SELECT *
    FROM commerce_site_products
    WHERE id = ?
      AND company_id = ?
  `).get(row.lastInsertRowid, req.company.id);

  res.json(commerceProductRow(product));
});

app.patch('/api/companies/:companyId/commerce-site/products/:productId', auth, company, requireCommerceCompany, requireRole('owner', 'admin', 'staff'), (req, res) => {
  const productId = Number(req.params.productId);
  const existing = db.prepare(`
    SELECT *
    FROM commerce_site_products
    WHERE id = ?
      AND company_id = ?
  `).get(productId, req.company.id);

  if (!existing) {
    return res.status(404).json({ error: '找不到此商品' });
  }

  const b = req.body || {};
  const name = String(b.name ?? existing.name ?? '').trim();

  if (!name) {
    return res.status(400).json({ error: '請輸入商品名稱' });
  }

  db.prepare(`
    UPDATE commerce_site_products
    SET
      name = ?,
      description = ?,
      price = ?,
      original_price = ?,
      image_url = ?,
      category = ?,
      is_featured = ?,
      is_visible = ?,
      sort_order = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND company_id = ?
  `).run(
    name,
    b.description ?? existing.description ?? '',
    commerceNumber(b.price, existing.price || 0),
    commerceNumber(b.originalPrice ?? b.original_price, existing.original_price || 0),
    b.imageUrl ?? b.image_url ?? existing.image_url ?? '',
    b.category ?? existing.category ?? '',
    commerceBool(b.isFeatured ?? b.is_featured, existing.is_featured || 0),
    commerceBool(b.isVisible ?? b.is_visible, existing.is_visible ?? 1),
    commerceNumber(b.sortOrder ?? b.sort_order, existing.sort_order || 0),
    productId,
    req.company.id
  );

  audit(req.company.id, req.user.id, 'commerce_site_product_updated', String(productId));

  const product = db.prepare(`
    SELECT *
    FROM commerce_site_products
    WHERE id = ?
      AND company_id = ?
  `).get(productId, req.company.id);

  res.json(commerceProductRow(product));
});

app.delete('/api/companies/:companyId/commerce-site/products/:productId', auth, company, requireCommerceCompany, requireRole('owner', 'admin', 'staff'), (req, res) => {
  const productId = Number(req.params.productId);
  const result = db.prepare(`
    DELETE FROM commerce_site_products
    WHERE id = ?
      AND company_id = ?
  `).run(productId, req.company.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: '找不到此商品' });
  }

  audit(req.company.id, req.user.id, 'commerce_site_product_deleted', String(productId));

  res.json({ ok: true });
});

app.get('/api/companies/:companyId/commerce-site/promotions', auth, company, requireCommerceCompany, (req, res) => {
  const rows = db.prepare(`
    SELECT *
    FROM commerce_site_promotions
    WHERE company_id = ?
    ORDER BY sort_order ASC, id DESC
  `).all(req.company.id);

  res.json(rows.map(commercePromotionRow));
});

app.post('/api/companies/:companyId/commerce-site/promotions', auth, company, requireCommerceCompany, requireRole('owner', 'admin', 'staff'), (req, res) => {
  const b = req.body || {};
  const title = String(b.title || '').trim();
  const promoType = b.promoType ?? b.promo_type ?? 'banner';

  if (!title) {
    return res.status(400).json({ error: '請輸入活動標題' });
  }

  if (!commercePromoTypes.has(promoType)) {
    return res.status(400).json({ error: '不支援的活動類型' });
  }

  const row = db.prepare(`
    INSERT INTO commerce_site_promotions (
      company_id,
      title,
      description,
      promo_type,
      start_date,
      end_date,
      is_active,
      sort_order,
      created_at,
      updated_at
    )
    VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `).run(
    req.company.id,
    title,
    b.description || '',
    promoType,
    b.startDate ?? b.start_date ?? '',
    b.endDate ?? b.end_date ?? '',
    commerceBool(b.isActive ?? b.is_active, 1),
    commerceNumber(b.sortOrder ?? b.sort_order, 0)
  );

  audit(req.company.id, req.user.id, 'commerce_site_promotion_created', String(row.lastInsertRowid));

  const promotion = db.prepare(`
    SELECT *
    FROM commerce_site_promotions
    WHERE id = ?
      AND company_id = ?
  `).get(row.lastInsertRowid, req.company.id);

  res.json(commercePromotionRow(promotion));
});

app.patch('/api/companies/:companyId/commerce-site/promotions/:promotionId', auth, company, requireCommerceCompany, requireRole('owner', 'admin', 'staff'), (req, res) => {
  const promotionId = Number(req.params.promotionId);
  const existing = db.prepare(`
    SELECT *
    FROM commerce_site_promotions
    WHERE id = ?
      AND company_id = ?
  `).get(promotionId, req.company.id);

  if (!existing) {
    return res.status(404).json({ error: '找不到此活動' });
  }

  const b = req.body || {};
  const title = String(b.title ?? existing.title ?? '').trim();
  const promoType = b.promoType ?? b.promo_type ?? existing.promo_type ?? 'banner';

  if (!title) {
    return res.status(400).json({ error: '請輸入活動標題' });
  }

  if (!commercePromoTypes.has(promoType)) {
    return res.status(400).json({ error: '不支援的活動類型' });
  }

  db.prepare(`
    UPDATE commerce_site_promotions
    SET
      title = ?,
      description = ?,
      promo_type = ?,
      start_date = ?,
      end_date = ?,
      is_active = ?,
      sort_order = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND company_id = ?
  `).run(
    title,
    b.description ?? existing.description ?? '',
    promoType,
    b.startDate ?? b.start_date ?? existing.start_date ?? '',
    b.endDate ?? b.end_date ?? existing.end_date ?? '',
    commerceBool(b.isActive ?? b.is_active, existing.is_active ?? 1),
    commerceNumber(b.sortOrder ?? b.sort_order, existing.sort_order || 0),
    promotionId,
    req.company.id
  );

  audit(req.company.id, req.user.id, 'commerce_site_promotion_updated', String(promotionId));

  const promotion = db.prepare(`
    SELECT *
    FROM commerce_site_promotions
    WHERE id = ?
      AND company_id = ?
  `).get(promotionId, req.company.id);

  res.json(commercePromotionRow(promotion));
});

app.delete('/api/companies/:companyId/commerce-site/promotions/:promotionId', auth, company, requireCommerceCompany, requireRole('owner', 'admin', 'staff'), (req, res) => {
  const promotionId = Number(req.params.promotionId);
  const result = db.prepare(`
    DELETE FROM commerce_site_promotions
    WHERE id = ?
      AND company_id = ?
  `).run(promotionId, req.company.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: '找不到此活動' });
  }

  audit(req.company.id, req.user.id, 'commerce_site_promotion_deleted', String(promotionId));

  res.json({ ok: true });
});

app.patch('/api/companies/:companyId/plan', auth, company, requireRole('owner', 'admin'), (req, res) => {
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

const purchasePaymentStatuses = new Set(['未付款', '部分付款', '已付款']);
const saleCollectionStatuses = new Set(['未收款', '部分收款', '已收款']);

function erpNumber(value, fallback = 0) {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function contactBody(body = {}) {
  return {
    name: String(body.name || '').trim(),
    phone: body.phone || '',
    email: body.email || '',
    taxId: body.taxId ?? body.tax_id ?? '',
    address: body.address || '',
    contactPerson: body.contactPerson ?? body.contact_person ?? '',
    note: body.note || ''
  };
}

function contactRow(row) {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    phone: row.phone || '',
    email: row.email || '',
    taxId: row.tax_id || '',
    address: row.address || '',
    contactPerson: row.contact_person || '',
    note: row.note || '',
    createdAt: row.created_at
  };
}

function databaseError(res, route, req, err) {
  console.error('DATABASE_ERROR', {
    route,
    userId: req.user?.id,
    companyId: req.company?.id,
    code: err?.code,
    message: err?.message
  });
  return res.status(500).json({ error: '資料讀取失敗', code: 'DATABASE_ERROR' });
}

function purchaseRow(row) {
  const total = erpNumber(row.total, 0);
  const paidAmount = erpNumber(row.paid_amount, 0);
  return {
    id: row.id,
    companyId: row.company_id,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name || '',
    purchaseNo: row.purchase_no || '',
    purchaseDate: row.purchase_date || '',
    category: row.category || '',
    subtotal: row.subtotal || 0,
    tax: row.tax || 0,
    total,
    paymentStatus: row.payment_status || '未付款',
    paidAmount,
    remainingAmount: Math.max(Math.round((total - paidAmount) * 100) / 100, 0),
    status: row.status || 'confirmed',
    note: row.note || '',
    createdAt: row.created_at
  };
}

function saleRow(row) {
  const total = erpNumber(row.total, 0);
  const receivedAmount = erpNumber(row.received_amount, 0);
  return {
    id: row.id,
    companyId: row.company_id,
    customerId: row.customer_id,
    customerName: row.customer_name || '',
    saleNo: row.sale_no || '',
    saleDate: row.sale_date || '',
    category: row.category || '',
    subtotal: row.subtotal || 0,
    tax: row.tax || 0,
    total,
    collectionStatus: row.collection_status || '未收款',
    receivedAmount,
    remainingAmount: Math.max(Math.round((total - receivedAmount) * 100) / 100, 0),
    status: row.status || 'confirmed',
    note: row.note || '',
    createdAt: row.created_at
  };
}

function erpItemRow(row, type) {
  return {
    id: row.id,
    companyId: row.company_id,
    productId: row.product_id,
    itemName: row.item_name,
    quantity: row.quantity || 0,
    unit: row.unit || '',
    unitCost: type === 'purchase' ? row.unit_cost || 0 : undefined,
    unitPrice: type === 'sale' ? row.unit_price || 0 : undefined,
    subtotal: row.subtotal || 0,
    note: row.note || '',
    createdAt: row.created_at
  };
}

function normalizeErpItems(items = [], type = 'purchase') {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const quantity = Math.max(0, erpNumber(item.quantity, 0));
      const price = Math.max(0, erpNumber(type === 'purchase' ? item.unitCost ?? item.unit_cost : item.unitPrice ?? item.unit_price, 0));
      return {
        productId: Number(item.productId ?? item.product_id ?? 0) || null,
        itemName: String(item.itemName ?? item.item_name ?? '').trim(),
        quantity,
        unit: item.unit || '',
        price,
        subtotal: Math.round(quantity * price * 100) / 100,
        note: item.note || ''
      };
    })
    .filter((item) => item.itemName && item.quantity > 0);
}

function erpTax(subtotal, bodyTax) {
  const tax = erpNumber(bodyTax, Math.round(subtotal * 0.05 * 100) / 100);
  return Math.max(0, Math.round(tax * 100) / 100);
}

function getProductForUpdate(companyId, productId) {
  return db.prepare(`
    SELECT *
    FROM products
    WHERE id = ?
      AND company_id = ?
  `).get(productId, companyId);
}

function salesCollectionStatus(total, receivedAmount) {
  if (receivedAmount <= 0) return '未收款';
  if (receivedAmount >= total) return '已收款';
  return '部分收款';
}

function purchasePaymentStatus(total, paidAmount) {
  if (paidAmount <= 0) return '未付款';
  if (paidAmount >= total) return '已付款';
  return '部分付款';
}

function saleReceiptRow(row) {
  return {
    id: row.id,
    companyId: row.company_id,
    saleId: row.sale_id,
    amount: row.amount || 0,
    receiptDate: row.receipt_date || '',
    method: row.method || '',
    note: row.note || '',
    createdAt: row.created_at || ''
  };
}

function purchasePaymentRow(row) {
  return {
    id: row.id,
    companyId: row.company_id,
    purchaseId: row.purchase_id,
    amount: row.amount || 0,
    paymentDate: row.payment_date || '',
    method: row.method || '',
    note: row.note || '',
    createdAt: row.created_at || ''
  };
}

app.get('/api/suppliers/list', auth, company, async (req, res) => {
  if (PG_ENABLED) {
    try {
      const rows = await pgAll('SELECT * FROM suppliers WHERE company_id = $1 ORDER BY id DESC', [req.company.id]);
      return res.json(rows.map(contactRow));
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

  const rows = db.prepare(`
    SELECT *
    FROM suppliers
    WHERE company_id = ?
    ORDER BY id DESC
  `).all(req.company.id);

  res.json(rows.map(contactRow));
});

app.post('/api/suppliers/create', auth, company, requireRole('owner', 'admin', 'staff'), async (req, res) => {
  const b = contactBody(req.body);
  if (!b.name) return res.status(400).json({ error: '請填寫供應商名稱' });

  if (PG_ENABLED) {
    try {
      const row = await pgOne(`
        INSERT INTO suppliers (company_id, name, phone, email, tax_id, address, contact_person, note, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP)
        RETURNING *
      `, [req.company.id, b.name, b.phone, b.email, b.taxId, b.address, b.contactPerson, b.note]);
      audit(req.company.id, req.user.id, 'supplier_created', String(row.id));
      return res.json(contactRow(row));
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

  const row = db.prepare(`
    INSERT INTO suppliers (
      company_id, name, phone, email, tax_id, address, contact_person, note
    )
    VALUES (?,?,?,?,?,?,?,?)
  `).run(req.company.id, b.name, b.phone, b.email, b.taxId, b.address, b.contactPerson, b.note);

  audit(req.company.id, req.user.id, 'supplier_created', String(row.lastInsertRowid));
  res.json(contactRow(db.prepare('SELECT * FROM suppliers WHERE id = ? AND company_id = ?').get(row.lastInsertRowid, req.company.id)));
});

app.put('/api/suppliers/:id', auth, company, requireRole('owner', 'admin', 'staff'), async (req, res) => {
  const b = contactBody(req.body);
  if (!b.name) return res.status(400).json({ error: '請填寫供應商名稱' });

  if (PG_ENABLED) {
    try {
      const row = await pgOne(`
        UPDATE suppliers
        SET name = $1, phone = $2, email = $3, tax_id = $4, address = $5, contact_person = $6, note = $7, updated_at = CURRENT_TIMESTAMP
        WHERE id = $8 AND company_id = $9
        RETURNING *
      `, [b.name, b.phone, b.email, b.taxId, b.address, b.contactPerson, b.note, req.params.id, req.company.id]);
      if (!row) return res.status(404).json({ error: '找不到供應商' });
      audit(req.company.id, req.user.id, 'supplier_updated', String(req.params.id));
      return res.json(contactRow(row));
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

  const result = db.prepare(`
    UPDATE suppliers
    SET name = ?, phone = ?, email = ?, tax_id = ?, address = ?, contact_person = ?, note = ?
    WHERE id = ?
      AND company_id = ?
  `).run(b.name, b.phone, b.email, b.taxId, b.address, b.contactPerson, b.note, req.params.id, req.company.id);

  if (!result.changes) return res.status(404).json({ error: '找不到供應商' });
  audit(req.company.id, req.user.id, 'supplier_updated', String(req.params.id));
  res.json(contactRow(db.prepare('SELECT * FROM suppliers WHERE id = ? AND company_id = ?').get(req.params.id, req.company.id)));
});

app.delete('/api/suppliers/:id', auth, company, requireRole('owner', 'admin'), async (req, res) => {
  if (PG_ENABLED) {
    try {
      const result = await pgQuery('DELETE FROM suppliers WHERE id = $1 AND company_id = $2', [req.params.id, req.company.id]);
      if (!result.rowCount) return res.status(404).json({ error: '找不到供應商' });
      audit(req.company.id, req.user.id, 'supplier_deleted', String(req.params.id));
      return res.json({ ok: true });
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }
  const result = db.prepare('DELETE FROM suppliers WHERE id = ? AND company_id = ?').run(req.params.id, req.company.id);
  if (!result.changes) return res.status(404).json({ error: '找不到供應商' });
  audit(req.company.id, req.user.id, 'supplier_deleted', String(req.params.id));
  res.json({ ok: true });
});

app.get('/api/customers/list', auth, company, async (req, res) => {
  if (PG_ENABLED) {
    try {
      const rows = await pgAll('SELECT * FROM customers WHERE company_id = $1 ORDER BY id DESC', [req.company.id]);
      return res.json(rows.map(contactRow));
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }
  const rows = db.prepare(`
    SELECT *
    FROM customers
    WHERE company_id = ?
    ORDER BY id DESC
  `).all(req.company.id);

  res.json(rows.map(contactRow));
});

app.post('/api/customers/create', auth, company, requireRole('owner', 'admin', 'staff'), async (req, res) => {
  const b = contactBody(req.body);
  if (!b.name) return res.status(400).json({ error: '請填寫客戶名稱' });

  if (PG_ENABLED) {
    try {
      const row = await pgOne(`
        INSERT INTO customers (company_id, name, phone, email, tax_id, address, contact_person, note, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP)
        RETURNING *
      `, [req.company.id, b.name, b.phone, b.email, b.taxId, b.address, b.contactPerson, b.note]);
      audit(req.company.id, req.user.id, 'customer_created', String(row.id));
      return res.json(contactRow(row));
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

  const row = db.prepare(`
    INSERT INTO customers (
      company_id, name, phone, email, tax_id, address, contact_person, note
    )
    VALUES (?,?,?,?,?,?,?,?)
  `).run(req.company.id, b.name, b.phone, b.email, b.taxId, b.address, b.contactPerson, b.note);

  audit(req.company.id, req.user.id, 'customer_created', String(row.lastInsertRowid));
  res.json(contactRow(db.prepare('SELECT * FROM customers WHERE id = ? AND company_id = ?').get(row.lastInsertRowid, req.company.id)));
});

app.put('/api/customers/:id', auth, company, requireRole('owner', 'admin', 'staff'), async (req, res) => {
  const b = contactBody(req.body);
  if (!b.name) return res.status(400).json({ error: '請填寫客戶名稱' });

  if (PG_ENABLED) {
    try {
      const row = await pgOne(`
        UPDATE customers
        SET name = $1, phone = $2, email = $3, tax_id = $4, address = $5, contact_person = $6, note = $7, updated_at = CURRENT_TIMESTAMP
        WHERE id = $8 AND company_id = $9
        RETURNING *
      `, [b.name, b.phone, b.email, b.taxId, b.address, b.contactPerson, b.note, req.params.id, req.company.id]);
      if (!row) return res.status(404).json({ error: '找不到客戶' });
      audit(req.company.id, req.user.id, 'customer_updated', String(req.params.id));
      return res.json(contactRow(row));
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

  const result = db.prepare(`
    UPDATE customers
    SET name = ?, phone = ?, email = ?, tax_id = ?, address = ?, contact_person = ?, note = ?
    WHERE id = ?
      AND company_id = ?
  `).run(b.name, b.phone, b.email, b.taxId, b.address, b.contactPerson, b.note, req.params.id, req.company.id);

  if (!result.changes) return res.status(404).json({ error: '找不到客戶' });
  audit(req.company.id, req.user.id, 'customer_updated', String(req.params.id));
  res.json(contactRow(db.prepare('SELECT * FROM customers WHERE id = ? AND company_id = ?').get(req.params.id, req.company.id)));
});

app.delete('/api/customers/:id', auth, company, requireRole('owner', 'admin'), async (req, res) => {
  if (PG_ENABLED) {
    try {
      const result = await pgQuery('DELETE FROM customers WHERE id = $1 AND company_id = $2', [req.params.id, req.company.id]);
      if (!result.rowCount) return res.status(404).json({ error: '找不到客戶' });
      audit(req.company.id, req.user.id, 'customer_deleted', String(req.params.id));
      return res.json({ ok: true });
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }
  const result = db.prepare('DELETE FROM customers WHERE id = ? AND company_id = ?').run(req.params.id, req.company.id);
  if (!result.changes) return res.status(404).json({ error: '找不到客戶' });
  audit(req.company.id, req.user.id, 'customer_deleted', String(req.params.id));
  res.json({ ok: true });
});

app.get('/api/purchases/list', auth, company, async (req, res) => {
  if (PG_ENABLED) {
    try {
      const rows = await pgAll(`
        SELECT *
        FROM purchases
        WHERE company_id = $1
        ORDER BY purchase_date DESC, id DESC
      `, [req.company.id]);
      return res.json(rows.map(purchaseRow));
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

  const rows = db.prepare(`
    SELECT *
    FROM purchases
    WHERE company_id = ?
    ORDER BY purchase_date DESC, id DESC
  `).all(req.company.id);

  res.json(rows.map(purchaseRow));
});

app.get('/api/purchases/:id', auth, company, async (req, res) => {
  if (PG_ENABLED) {
    try {
      const purchase = await pgOne('SELECT * FROM purchases WHERE id = $1 AND company_id = $2', [req.params.id, req.company.id]);
      if (!purchase) return res.status(404).json({ error: '找不到進貨單' });
      const items = await pgAll('SELECT * FROM purchase_items WHERE purchase_id = $1 AND company_id = $2 ORDER BY id', [req.params.id, req.company.id]);
      return res.json({ ...purchaseRow(purchase), items: items.map((row) => erpItemRow(row, 'purchase')) });
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

  const purchase = db.prepare('SELECT * FROM purchases WHERE id = ? AND company_id = ?').get(req.params.id, req.company.id);
  if (!purchase) return res.status(404).json({ error: '找不到進貨單' });
  const items = db.prepare('SELECT * FROM purchase_items WHERE purchase_id = ? AND company_id = ? ORDER BY id').all(req.params.id, req.company.id);
  res.json({ ...purchaseRow(purchase), items: items.map((row) => erpItemRow(row, 'purchase')) });
});

app.post('/api/purchases/create', auth, company, requireRole('owner', 'admin', 'accounting', 'staff'), async (req, res) => {
  const body = req.body || {};
  const items = normalizeErpItems(body.items, 'purchase');
  if (!items.length) return res.status(400).json({ error: '請至少新增一筆進貨明細' });

  if (PG_ENABLED) {
    try {
      const subtotal = Math.round(items.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100;
      const tax = erpTax(subtotal, body.tax);
      const total = Math.round((subtotal + tax) * 100) / 100;
      const status = purchasePaymentStatuses.has(body.paymentStatus) ? body.paymentStatus : '未付款';
      const supplierId = Number(body.supplierId || 0) || null;
      let supplierName = body.supplierName || '';
      if (supplierId) {
        const supplier = await pgOne('SELECT name FROM suppliers WHERE id = $1 AND company_id = $2', [supplierId, req.company.id]);
        if (!supplier) return res.status(400).json({ error: '找不到供應商' });
        supplierName = supplier.name;
      }

      const purchase = await pgOne(`
        INSERT INTO purchases (
          company_id, supplier_id, supplier_name, purchase_no, purchase_date, category,
          subtotal, tax, total, payment_status, paid_amount, status, note, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'confirmed',$12,CURRENT_TIMESTAMP)
        RETURNING *
      `, [
        req.company.id,
        supplierId,
        supplierName,
        body.purchaseNo || `PO-${Date.now()}`,
        body.purchaseDate || new Date().toISOString().slice(0, 10),
        body.category || '',
        subtotal,
        tax,
        total,
        status,
        erpNumber(body.paidAmount, 0),
        body.note || ''
      ]);

      for (const item of items) {
        await pgQuery(`
          INSERT INTO purchase_items (
            company_id, purchase_id, product_id, item_name, quantity, unit, unit_cost, unit_price, subtotal, note
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9)
        `, [req.company.id, purchase.id, item.productId, item.itemName, item.quantity, item.unit, item.price, item.subtotal, item.note]);
        if (item.productId) {
          const product = await pgOne('SELECT * FROM products WHERE id = $1 AND company_id = $2', [item.productId, req.company.id]);
          if (product) {
            const nextStock = Math.round((erpNumber(product.stock, 0) + item.quantity) * 100) / 100;
            await pgQuery('UPDATE products SET stock = $1, cost = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND company_id = $4', [nextStock, item.price, item.productId, req.company.id]);
          }
        }
      }

      audit(req.company.id, req.user.id, 'purchase_created', String(purchase.id));
      return res.json(purchaseRow(purchase));
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

  try {
    const result = db.transaction(() => {
      const subtotal = Math.round(items.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100;
      const tax = erpTax(subtotal, body.tax);
      const total = Math.round((subtotal + tax) * 100) / 100;
      const status = purchasePaymentStatuses.has(body.paymentStatus) ? body.paymentStatus : '未付款';
      const supplierId = Number(body.supplierId || 0) || null;
      let supplierName = body.supplierName || '';
      if (supplierId) {
        const supplier = db.prepare('SELECT name FROM suppliers WHERE id = ? AND company_id = ?').get(supplierId, req.company.id);
        if (!supplier) throw new Error('找不到供應商');
        supplierName = supplier.name;
      }

      const purchase = db.prepare(`
        INSERT INTO purchases (
          company_id, supplier_id, supplier_name, purchase_no, purchase_date, category,
          subtotal, tax, total, payment_status, paid_amount, status, note
        )
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        req.company.id,
        supplierId,
        supplierName,
        body.purchaseNo || `PO-${Date.now()}`,
        body.purchaseDate || new Date().toISOString().slice(0, 10),
        body.category || '',
        subtotal,
        tax,
        total,
        status,
        erpNumber(body.paidAmount, 0),
        'confirmed',
        body.note || ''
      );

      const itemStmt = db.prepare(`
        INSERT INTO purchase_items (
          company_id, purchase_id, product_id, item_name, quantity, unit, unit_cost, subtotal, note
        )
        VALUES (?,?,?,?,?,?,?,?,?)
      `);

      const movementStmt = db.prepare(`
        INSERT INTO inventory_movements (
          company_id, product_id, movement_type, quantity, before_stock, after_stock, unit_cost, note
        )
        VALUES (?,?,?,?,?,?,?,?)
      `);

      items.forEach((item) => {
        itemStmt.run(req.company.id, purchase.lastInsertRowid, item.productId, item.itemName, item.quantity, item.unit, item.price, item.subtotal, item.note);
        if (item.productId) {
          const product = getProductForUpdate(req.company.id, item.productId);
          if (!product) throw new Error(`找不到商品 / 材料：${item.itemName}`);
          const beforeStock = erpNumber(product.stock, 0);
          const afterStock = Math.round((beforeStock + item.quantity) * 100) / 100;
          db.prepare('UPDATE products SET stock = ?, cost = ? WHERE id = ? AND company_id = ?').run(afterStock, item.price, item.productId, req.company.id);
          movementStmt.run(req.company.id, item.productId, 'purchase', item.quantity, beforeStock, afterStock, item.price, `進貨單 ${body.purchaseNo || purchase.lastInsertRowid}`);
        }
      });

      return purchase.lastInsertRowid;
    })();

    audit(req.company.id, req.user.id, 'purchase_created', String(result));
    const purchase = db.prepare('SELECT * FROM purchases WHERE id = ? AND company_id = ?').get(result, req.company.id);
    res.json(purchaseRow(purchase));
  } catch (err) {
    res.status(400).json({ error: err.message || '建立進貨單失敗' });
  }
});

app.delete('/api/purchases/:id', auth, company, requireRole('owner', 'admin'), (req, res) => {
  res.status(400).json({ error: '此版本尚未開放刪除已入庫單據' });
});

app.get('/api/purchases/:id/payments', auth, company, (req, res) => {
  const purchase = db.prepare('SELECT id FROM purchases WHERE id = ? AND company_id = ?').get(req.params.id, req.company.id);
  if (!purchase) return res.status(404).json({ error: '找不到進貨單' });

  const rows = db.prepare(`
    SELECT *
    FROM purchase_payments
    WHERE purchase_id = ?
      AND company_id = ?
    ORDER BY payment_date DESC, id DESC
  `).all(req.params.id, req.company.id);

  res.json(rows.map(purchasePaymentRow));
});

app.post('/api/purchases/:id/payments', auth, company, requireRole('owner', 'admin', 'accounting', 'staff'), (req, res) => {
  const purchase = db.prepare('SELECT * FROM purchases WHERE id = ? AND company_id = ?').get(req.params.id, req.company.id);
  if (!purchase) return res.status(404).json({ error: '找不到進貨單' });
  if ((purchase.status || 'confirmed') === 'void') return res.status(400).json({ error: '作廢進貨單不可新增付款' });

  const amount = Math.round(erpNumber(req.body?.amount, 0) * 100) / 100;
  if (amount <= 0) return res.status(400).json({ error: '付款金額必須大於 0' });

  const total = erpNumber(purchase.total, 0);
  const paidAmount = erpNumber(purchase.paid_amount, 0);
  const nextPaid = Math.round((paidAmount + amount) * 100) / 100;
  if (nextPaid > total) return res.status(400).json({ error: '付款金額不可超過進貨單總額' });

  const result = db.transaction(() => {
    const row = db.prepare(`
      INSERT INTO purchase_payments (
        company_id,
        purchase_id,
        amount,
        payment_date,
        method,
        note
      )
      VALUES (?,?,?,?,?,?)
    `).run(
      req.company.id,
      purchase.id,
      amount,
      req.body?.paymentDate || req.body?.payment_date || new Date().toISOString().slice(0, 10),
      req.body?.method || '',
      req.body?.note || ''
    );

    db.prepare(`
      UPDATE purchases
      SET
        paid_amount = ?,
        payment_status = ?
      WHERE id = ?
        AND company_id = ?
    `).run(nextPaid, purchasePaymentStatus(total, nextPaid), purchase.id, req.company.id);

    return row.lastInsertRowid;
  })();

  audit(req.company.id, req.user.id, 'purchase_payment_created', String(result));
  const updated = db.prepare('SELECT * FROM purchases WHERE id = ? AND company_id = ?').get(purchase.id, req.company.id);
  res.json({ ok: true, paymentId: result, purchase: purchaseRow(updated) });
});

app.post('/api/purchases/:id/void', auth, company, requireRole('owner', 'admin'), (req, res) => {
  const purchase = db.prepare('SELECT * FROM purchases WHERE id = ? AND company_id = ?').get(req.params.id, req.company.id);
  if (!purchase) return res.status(404).json({ error: '找不到進貨單' });
  if ((purchase.status || 'confirmed') === 'void') return res.status(400).json({ error: '此進貨單已作廢' });
  const paymentCount = db.prepare('SELECT COUNT(*) count FROM purchase_payments WHERE purchase_id = ? AND company_id = ?').get(req.params.id, req.company.id).count;
  if (paymentCount > 0) return res.status(400).json({ error: '已有付款紀錄，請先確認帳務處理' });

  const items = db.prepare('SELECT * FROM purchase_items WHERE purchase_id = ? AND company_id = ?').all(req.params.id, req.company.id);

  try {
    db.transaction(() => {
      const movementStmt = db.prepare(`
        INSERT INTO inventory_movements (
          company_id, product_id, movement_type, quantity, before_stock, after_stock, unit_cost, note
        )
        VALUES (?,?,?,?,?,?,?,?)
      `);

      items.forEach((item) => {
        if (!item.product_id) return;
        const product = getProductForUpdate(req.company.id, item.product_id);
        if (!product) throw new Error(`找不到商品 / 材料：${item.item_name}`);
        const quantity = Math.max(0, erpNumber(item.quantity, 0));
        const beforeStock = erpNumber(product.stock, 0);
        const afterStock = Math.round((beforeStock - quantity) * 100) / 100;
        if (afterStock < 0) throw new Error(`作廢後庫存不可小於 0：${product.name}`);
        db.prepare('UPDATE products SET stock = ? WHERE id = ? AND company_id = ?').run(afterStock, item.product_id, req.company.id);
        movementStmt.run(req.company.id, item.product_id, 'purchase_void', quantity, beforeStock, afterStock, erpNumber(item.unit_cost, 0), `作廢進貨單 ${purchase.purchase_no || purchase.id}`);
      });

      db.prepare('UPDATE purchases SET status = ? WHERE id = ? AND company_id = ?').run('void', req.params.id, req.company.id);
      audit(req.company.id, req.user.id, 'purchase_voided', String(req.params.id));
    })();

    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message || '作廢進貨單失敗' });
  }
});

app.get('/api/sales/list', auth, company, async (req, res) => {
  if (PG_ENABLED) {
    try {
      const rows = await pgAll(`
        SELECT *
        FROM sales
        WHERE company_id = $1
        ORDER BY sale_date DESC, id DESC
      `, [req.company.id]);
      return res.json(rows.map(saleRow));
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

  const rows = db.prepare(`
    SELECT *
    FROM sales
    WHERE company_id = ?
    ORDER BY sale_date DESC, id DESC
  `).all(req.company.id);

  res.json(rows.map(saleRow));
});

app.get('/api/sales/:id', auth, company, async (req, res) => {
  if (PG_ENABLED) {
    try {
      const sale = await pgOne('SELECT * FROM sales WHERE id = $1 AND company_id = $2', [req.params.id, req.company.id]);
      if (!sale) return res.status(404).json({ error: '找不到銷貨單' });
      const items = await pgAll('SELECT * FROM sale_items WHERE sale_id = $1 AND company_id = $2 ORDER BY id', [req.params.id, req.company.id]);
      return res.json({ ...saleRow(sale), items: items.map((row) => erpItemRow(row, 'sale')) });
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

  const sale = db.prepare('SELECT * FROM sales WHERE id = ? AND company_id = ?').get(req.params.id, req.company.id);
  if (!sale) return res.status(404).json({ error: '找不到銷貨單' });
  const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ? AND company_id = ? ORDER BY id').all(req.params.id, req.company.id);
  res.json({ ...saleRow(sale), items: items.map((row) => erpItemRow(row, 'sale')) });
});

app.post('/api/sales/create', auth, company, requireRole('owner', 'admin', 'accounting', 'staff'), async (req, res) => {
  const body = req.body || {};
  const items = normalizeErpItems(body.items, 'sale');
  if (!items.length) return res.status(400).json({ error: '請至少新增一筆銷貨明細' });

  if (PG_ENABLED) {
    try {
      for (const item of items) {
        if (item.productId) {
          const product = await pgOne('SELECT * FROM products WHERE id = $1 AND company_id = $2', [item.productId, req.company.id]);
          if (!product) return res.status(400).json({ error: `找不到商品 / 材料：${item.itemName}` });
          if (erpNumber(product.stock, 0) < item.quantity) {
            return res.status(400).json({ error: `${product.name} 庫存不足，目前 ${product.stock || 0}，需要 ${item.quantity}` });
          }
        }
      }

      const subtotal = Math.round(items.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100;
      const tax = erpTax(subtotal, body.tax);
      const total = Math.round((subtotal + tax) * 100) / 100;
      const status = saleCollectionStatuses.has(body.collectionStatus) ? body.collectionStatus : '未收款';
      const customerId = Number(body.customerId || 0) || null;
      let customerName = body.customerName || '';
      if (customerId) {
        const customer = await pgOne('SELECT name FROM customers WHERE id = $1 AND company_id = $2', [customerId, req.company.id]);
        if (!customer) return res.status(400).json({ error: '找不到客戶' });
        customerName = customer.name;
      }

      const sale = await pgOne(`
        INSERT INTO sales (
          company_id, customer_id, customer_name, sale_no, sale_date, category,
          subtotal, tax, total, collection_status, received_amount, status, note, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'confirmed',$12,CURRENT_TIMESTAMP)
        RETURNING *
      `, [
        req.company.id,
        customerId,
        customerName,
        body.saleNo || `SO-${Date.now()}`,
        body.saleDate || new Date().toISOString().slice(0, 10),
        body.category || '',
        subtotal,
        tax,
        total,
        status,
        erpNumber(body.receivedAmount, 0),
        body.note || ''
      ]);

      for (const item of items) {
        await pgQuery(`
          INSERT INTO sale_items (
            company_id, sale_id, product_id, item_name, quantity, unit, unit_price, subtotal, note
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `, [req.company.id, sale.id, item.productId, item.itemName, item.quantity, item.unit, item.price, item.subtotal, item.note]);
        if (item.productId) {
          const product = await pgOne('SELECT * FROM products WHERE id = $1 AND company_id = $2', [item.productId, req.company.id]);
          const nextStock = Math.round((erpNumber(product.stock, 0) - item.quantity) * 100) / 100;
          await pgQuery('UPDATE products SET stock = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND company_id = $3', [nextStock, item.productId, req.company.id]);
        }
      }

      audit(req.company.id, req.user.id, 'sale_created', String(sale.id));
      return res.json(saleRow(sale));
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

  try {
    const result = db.transaction(() => {
      for (const item of items) {
        if (item.productId) {
          const product = getProductForUpdate(req.company.id, item.productId);
          if (!product) throw new Error(`找不到商品 / 材料：${item.itemName}`);
          const beforeStock = erpNumber(product.stock, 0);
          if (beforeStock < item.quantity) {
            throw new Error(`${product.name} 庫存不足，目前 ${beforeStock}，需要 ${item.quantity}`);
          }
        }
      }

      const subtotal = Math.round(items.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100;
      const tax = erpTax(subtotal, body.tax);
      const total = Math.round((subtotal + tax) * 100) / 100;
      const status = saleCollectionStatuses.has(body.collectionStatus) ? body.collectionStatus : '未收款';
      const customerId = Number(body.customerId || 0) || null;
      let customerName = body.customerName || '';
      if (customerId) {
        const customer = db.prepare('SELECT name FROM customers WHERE id = ? AND company_id = ?').get(customerId, req.company.id);
        if (!customer) throw new Error('找不到客戶');
        customerName = customer.name;
      }

      const sale = db.prepare(`
        INSERT INTO sales (
          company_id, customer_id, customer_name, sale_no, sale_date, category,
          subtotal, tax, total, collection_status, received_amount, status, note
        )
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        req.company.id,
        customerId,
        customerName,
        body.saleNo || `SO-${Date.now()}`,
        body.saleDate || new Date().toISOString().slice(0, 10),
        body.category || '',
        subtotal,
        tax,
        total,
        status,
        erpNumber(body.receivedAmount, 0),
        'confirmed',
        body.note || ''
      );

      const itemStmt = db.prepare(`
        INSERT INTO sale_items (
          company_id, sale_id, product_id, item_name, quantity, unit, unit_price, subtotal, note
        )
        VALUES (?,?,?,?,?,?,?,?,?)
      `);

      const movementStmt = db.prepare(`
        INSERT INTO inventory_movements (
          company_id, product_id, movement_type, quantity, before_stock, after_stock, unit_cost, note
        )
        VALUES (?,?,?,?,?,?,?,?)
      `);

      items.forEach((item) => {
        itemStmt.run(req.company.id, sale.lastInsertRowid, item.productId, item.itemName, item.quantity, item.unit, item.price, item.subtotal, item.note);
        if (item.productId) {
          const product = getProductForUpdate(req.company.id, item.productId);
          const beforeStock = erpNumber(product.stock, 0);
          const afterStock = Math.round((beforeStock - item.quantity) * 100) / 100;
          db.prepare('UPDATE products SET stock = ? WHERE id = ? AND company_id = ?').run(afterStock, item.productId, req.company.id);
          movementStmt.run(req.company.id, item.productId, 'sale', item.quantity, beforeStock, afterStock, erpNumber(product.cost, 0), `銷貨單 ${body.saleNo || sale.lastInsertRowid}`);
        }
      });

      return sale.lastInsertRowid;
    })();

    audit(req.company.id, req.user.id, 'sale_created', String(result));
    const sale = db.prepare('SELECT * FROM sales WHERE id = ? AND company_id = ?').get(result, req.company.id);
    res.json(saleRow(sale));
  } catch (err) {
    res.status(400).json({ error: err.message || '建立銷貨單失敗' });
  }
});

app.delete('/api/sales/:id', auth, company, requireRole('owner', 'admin'), (req, res) => {
  res.status(400).json({ error: '此版本尚未開放刪除已出庫單據' });
});

app.get('/api/sales/:id/receipts', auth, company, (req, res) => {
  const sale = db.prepare('SELECT id FROM sales WHERE id = ? AND company_id = ?').get(req.params.id, req.company.id);
  if (!sale) return res.status(404).json({ error: '找不到銷貨單' });

  const rows = db.prepare(`
    SELECT *
    FROM sale_receipts
    WHERE sale_id = ?
      AND company_id = ?
    ORDER BY receipt_date DESC, id DESC
  `).all(req.params.id, req.company.id);

  res.json(rows.map(saleReceiptRow));
});

app.post('/api/sales/:id/receipts', auth, company, requireRole('owner', 'admin', 'accounting', 'staff'), (req, res) => {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ? AND company_id = ?').get(req.params.id, req.company.id);
  if (!sale) return res.status(404).json({ error: '找不到銷貨單' });
  if ((sale.status || 'confirmed') === 'void') return res.status(400).json({ error: '作廢銷貨單不可新增收款' });

  const amount = Math.round(erpNumber(req.body?.amount, 0) * 100) / 100;
  if (amount <= 0) return res.status(400).json({ error: '收款金額必須大於 0' });

  const total = erpNumber(sale.total, 0);
  const receivedAmount = erpNumber(sale.received_amount, 0);
  const nextReceived = Math.round((receivedAmount + amount) * 100) / 100;
  if (nextReceived > total) return res.status(400).json({ error: '收款金額不可超過銷貨單總額' });

  const result = db.transaction(() => {
    const row = db.prepare(`
      INSERT INTO sale_receipts (
        company_id,
        sale_id,
        amount,
        receipt_date,
        method,
        note
      )
      VALUES (?,?,?,?,?,?)
    `).run(
      req.company.id,
      sale.id,
      amount,
      req.body?.receiptDate || req.body?.receipt_date || new Date().toISOString().slice(0, 10),
      req.body?.method || '',
      req.body?.note || ''
    );

    db.prepare(`
      UPDATE sales
      SET
        received_amount = ?,
        collection_status = ?
      WHERE id = ?
        AND company_id = ?
    `).run(nextReceived, salesCollectionStatus(total, nextReceived), sale.id, req.company.id);

    return row.lastInsertRowid;
  })();

  audit(req.company.id, req.user.id, 'sale_receipt_created', String(result));
  const updated = db.prepare('SELECT * FROM sales WHERE id = ? AND company_id = ?').get(sale.id, req.company.id);
  res.json({ ok: true, receiptId: result, sale: saleRow(updated) });
});

app.post('/api/sales/:id/void', auth, company, requireRole('owner', 'admin'), (req, res) => {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ? AND company_id = ?').get(req.params.id, req.company.id);
  if (!sale) return res.status(404).json({ error: '找不到銷貨單' });
  if ((sale.status || 'confirmed') === 'void') return res.status(400).json({ error: '此銷貨單已作廢' });
  const receiptCount = db.prepare('SELECT COUNT(*) count FROM sale_receipts WHERE sale_id = ? AND company_id = ?').get(req.params.id, req.company.id).count;
  if (receiptCount > 0) return res.status(400).json({ error: '已有收款紀錄，請先確認帳務處理' });

  const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ? AND company_id = ?').all(req.params.id, req.company.id);

  try {
    db.transaction(() => {
      const movementStmt = db.prepare(`
        INSERT INTO inventory_movements (
          company_id, product_id, movement_type, quantity, before_stock, after_stock, unit_cost, note
        )
        VALUES (?,?,?,?,?,?,?,?)
      `);

      items.forEach((item) => {
        if (!item.product_id) return;
        const product = getProductForUpdate(req.company.id, item.product_id);
        if (!product) throw new Error(`找不到商品 / 材料：${item.item_name}`);
        const quantity = Math.max(0, erpNumber(item.quantity, 0));
        const beforeStock = erpNumber(product.stock, 0);
        const afterStock = Math.round((beforeStock + quantity) * 100) / 100;
        db.prepare('UPDATE products SET stock = ? WHERE id = ? AND company_id = ?').run(afterStock, item.product_id, req.company.id);
        movementStmt.run(req.company.id, item.product_id, 'sale_void', quantity, beforeStock, afterStock, erpNumber(product.cost, 0), `作廢銷貨單 ${sale.sale_no || sale.id}`);
      });

      db.prepare('UPDATE sales SET status = ? WHERE id = ? AND company_id = ?').run('void', req.params.id, req.company.id);
      audit(req.company.id, req.user.id, 'sale_voided', String(req.params.id));
    })();

    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message || '作廢銷貨單失敗' });
  }
});

app.get('/api/receivables/list', auth, company, (req, res) => {
  const rows = db.prepare(`
    SELECT
      id,
      sale_no,
      customer_name,
      sale_date,
      total,
      received_amount,
      collection_status,
      note
    FROM sales
    WHERE company_id = ?
      AND COALESCE(status, 'confirmed') != 'void'
      AND COALESCE(total, 0) > COALESCE(received_amount, 0)
    ORDER BY sale_date DESC, id DESC
  `).all(req.company.id);

  res.json(rows.map((row) => ({
    id: row.id,
    documentNo: row.sale_no || '',
    customerName: row.customer_name || '',
    date: row.sale_date || '',
    total: row.total || 0,
    receivedAmount: row.received_amount || 0,
    remainingAmount: Math.max(Math.round((erpNumber(row.total, 0) - erpNumber(row.received_amount, 0)) * 100) / 100, 0),
    collectionStatus: row.collection_status || '未收款',
    note: row.note || ''
  })));
});

app.get('/api/payables/list', auth, company, (req, res) => {
  const rows = db.prepare(`
    SELECT
      id,
      purchase_no,
      supplier_name,
      purchase_date,
      total,
      paid_amount,
      payment_status,
      note
    FROM purchases
    WHERE company_id = ?
      AND COALESCE(status, 'confirmed') != 'void'
      AND COALESCE(total, 0) > COALESCE(paid_amount, 0)
    ORDER BY purchase_date DESC, id DESC
  `).all(req.company.id);

  res.json(rows.map((row) => ({
    id: row.id,
    documentNo: row.purchase_no || '',
    supplierName: row.supplier_name || '',
    date: row.purchase_date || '',
    total: row.total || 0,
    paidAmount: row.paid_amount || 0,
    remainingAmount: Math.max(Math.round((erpNumber(row.total, 0) - erpNumber(row.paid_amount, 0)) * 100) / 100, 0),
    paymentStatus: row.payment_status || '未付款',
    note: row.note || ''
  })));
});

app.get('/api/companies/:companyId/summary', auth, company, async (req, res) => {
  const monthStart = new Date();
  monthStart.setDate(1);
  const monthStartText = monthStart.toISOString().slice(0, 10);

  if (PG_ENABLED) {
    try {
      const [
        income,
        fees,
        cogs,
        vouchers,
        txCount,
        revenueByPlatform,
        lowStock,
        monthlySales,
        monthlyPurchases,
        unpaidSales,
        unpaidPurchases,
        collectedSales,
        paidPurchases
      ] = await Promise.all([
        pgOne('SELECT COALESCE(SUM(gross_amount),0) AS total FROM transactions WHERE company_id = $1', [req.company.id]),
        pgOne('SELECT COALESCE(SUM(platform_fee),0) AS total FROM transactions WHERE company_id = $1', [req.company.id]),
        pgOne('SELECT COALESCE(SUM(cost_of_goods_sold),0) AS total FROM transactions WHERE company_id = $1', [req.company.id]),
        pgOne('SELECT COALESCE(SUM(amount),0) AS total FROM vouchers WHERE company_id = $1', [req.company.id]),
        pgOne('SELECT COUNT(*)::int AS count FROM transactions WHERE company_id = $1', [req.company.id]),
        pgAll('SELECT platform_key AS name, SUM(gross_amount) AS value FROM transactions WHERE company_id = $1 GROUP BY platform_key', [req.company.id]),
        pgOne('SELECT COUNT(*)::int AS count FROM products WHERE company_id = $1 AND COALESCE(stock,0) <= COALESCE(safety_stock,0)', [req.company.id]),
        pgOne("SELECT COALESCE(SUM(total),0) AS total FROM sales WHERE company_id = $1 AND sale_date >= $2 AND COALESCE(status, 'confirmed') != 'void'", [req.company.id, monthStartText]),
        pgOne("SELECT COALESCE(SUM(total),0) AS total FROM purchases WHERE company_id = $1 AND purchase_date >= $2 AND COALESCE(status, 'confirmed') != 'void'", [req.company.id, monthStartText]),
        pgOne("SELECT COALESCE(SUM(GREATEST(COALESCE(total,0) - COALESCE(received_amount,0), 0)),0) AS total FROM sales WHERE company_id = $1 AND COALESCE(collection_status,'未收款') != '已收款' AND COALESCE(status, 'confirmed') != 'void'", [req.company.id]),
        pgOne("SELECT COALESCE(SUM(GREATEST(COALESCE(total,0) - COALESCE(paid_amount,0), 0)),0) AS total FROM purchases WHERE company_id = $1 AND COALESCE(payment_status,'未付款') != '已付款' AND COALESCE(status, 'confirmed') != 'void'", [req.company.id]),
        pgOne("SELECT COALESCE(SUM(received_amount),0) AS total FROM sales WHERE company_id = $1 AND COALESCE(status, 'confirmed') != 'void'", [req.company.id]),
        pgOne("SELECT COALESCE(SUM(paid_amount),0) AS total FROM purchases WHERE company_id = $1 AND COALESCE(status, 'confirmed') != 'void'", [req.company.id])
      ]);

      const incomeTotal = erpNumber(income?.total, 0);
      const feesTotal = erpNumber(fees?.total, 0);
      const cogsTotal = erpNumber(cogs?.total, 0);
      const vouchersTotal = erpNumber(vouchers?.total, 0);
      const monthlySalesTotal = erpNumber(monthlySales?.total, 0);
      const monthlyPurchasesTotal = erpNumber(monthlyPurchases?.total, 0);

      return res.json({
        revenue: incomeTotal + monthlySalesTotal,
        expenses: feesTotal + cogsTotal + vouchersTotal,
        netProfit: incomeTotal + monthlySalesTotal - feesTotal - cogsTotal - vouchersTotal - monthlyPurchasesTotal,
        cogs: cogsTotal,
        fees: feesTotal,
        txCount: txCount?.count || 0,
        invoicesPending: 0,
        revenueByPlatform,
        lowStock: lowStock?.count || 0,
        monthlySales: monthlySalesTotal,
        monthlyPurchases: monthlyPurchasesTotal,
        unpaidSales: erpNumber(unpaidSales?.total, 0),
        unpaidPurchases: erpNumber(unpaidPurchases?.total, 0),
        collectedSales: erpNumber(collectedSales?.total, 0),
        paidPurchases: erpNumber(paidPurchases?.total, 0)
      });
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

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

  const monthlySales = db.prepare(`
    SELECT COALESCE(SUM(total),0) total
    FROM sales
    WHERE company_id = ?
      AND date(sale_date) >= date(?)
      AND COALESCE(status, 'confirmed') != 'void'
  `).get(req.company.id, monthStartText).total;

  const monthlyPurchases = db.prepare(`
    SELECT COALESCE(SUM(total),0) total
    FROM purchases
    WHERE company_id = ?
      AND date(purchase_date) >= date(?)
      AND COALESCE(status, 'confirmed') != 'void'
  `).get(req.company.id, monthStartText).total;

  const unpaidSales = db.prepare(`
    SELECT COALESCE(SUM(MAX(total - received_amount, 0)),0) total
    FROM sales
    WHERE company_id = ?
      AND collection_status != '已收款'
      AND COALESCE(status, 'confirmed') != 'void'
  `).get(req.company.id).total;

  const unpaidPurchases = db.prepare(`
    SELECT COALESCE(SUM(MAX(total - paid_amount, 0)),0) total
    FROM purchases
    WHERE company_id = ?
      AND payment_status != '已付款'
      AND COALESCE(status, 'confirmed') != 'void'
  `).get(req.company.id).total;

  const collectedSales = db.prepare(`
    SELECT COALESCE(SUM(received_amount),0) total
    FROM sales
    WHERE company_id = ?
      AND COALESCE(status, 'confirmed') != 'void'
  `).get(req.company.id).total;

  const paidPurchases = db.prepare(`
    SELECT COALESCE(SUM(paid_amount),0) total
    FROM purchases
    WHERE company_id = ?
      AND COALESCE(status, 'confirmed') != 'void'
  `).get(req.company.id).total;

  res.json({
    revenue: income + monthlySales,
    expenses: fees + cogs + vouchers,
    netProfit: income + monthlySales - fees - cogs - vouchers - monthlyPurchases,
    cogs,
    fees,
    txCount,
    invoicesPending,
    revenueByPlatform,
    lowStock,
    monthlySales,
    monthlyPurchases,
    unpaidSales,
    unpaidPurchases,
    collectedSales,
    paidPurchases
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


app.get('/api/companies/:companyId/jobsites', auth, company, async (req, res) => {
  if (PG_ENABLED) {
    const rows = await pgAll(`
      SELECT
        id,
        company_id AS "companyId",
        COALESCE(site_name, name) AS "siteName",
        COALESCE(client_name, '') AS "clientName",
        COALESCE(client_phone, '') AS "clientPhone",
        COALESCE(address, '') AS address,
        COALESCE(project_type, '') AS "projectType",
        COALESCE(area_pings, 0) AS "areaPings",
        COALESCE(price_per_ping, 0) AS "pricePerPing",
        COALESCE(food_cost, 0) AS "foodCost",
        COALESCE(quote_amount, 0) AS "quoteAmount",
        COALESCE(estimate_cost_total, 0) AS "estimateCostTotal",
        COALESCE(tax_mode, 'not_taxed') AS "taxMode",
        COALESCE(tax_rate, 0.05) AS "taxRate",
        COALESCE(subtotal_amount, quote_amount, 0) AS "subtotalAmount",
        COALESCE(tax_amount, 0) AS "taxAmount",
        COALESCE(total_amount, quote_amount, 0) AS "totalAmount",
        COALESCE((
          SELECT SUM(jsp.amount)
          FROM job_site_payments jsp
          WHERE jsp.company_id = job_sites.company_id
            AND jsp.job_site_id = job_sites.id
        ), 0) AS "receivedAmount",
        COALESCE(material_cost, 0) AS "materialCost",
        COALESCE(labor_cost, 0) AS "laborCost",
        COALESCE(outsourced_cost, 0) AS "outsourcedCost",
        COALESCE(misc_cost, 0) AS "miscCost",
        COALESCE(status, '已報價') AS status,
        COALESCE(note, '') AS note,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM job_sites
      WHERE company_id = $1
      ORDER BY id DESC
    `, [req.company.id]);
    return res.json(rows);
  }

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

app.post('/api/companies/:companyId/jobsites', auth, company, requireRole('owner', 'admin'), async (req, res) => {
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

  if (PG_ENABLED) {
    const created = await pgOne(`
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
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      RETURNING id
    `, [
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
    ]);

    audit(req.company.id, req.user.id, 'jobsite_created', String(created.id));

    const row = (await pgAll(`
      SELECT
        id,
        company_id AS "companyId",
        COALESCE(site_name, name) AS "siteName",
        COALESCE(client_name, '') AS "clientName",
        COALESCE(client_phone, '') AS "clientPhone",
        COALESCE(address, '') AS address,
        COALESCE(project_type, '') AS "projectType",
        COALESCE(area_pings, 0) AS "areaPings",
        COALESCE(price_per_ping, 0) AS "pricePerPing",
        COALESCE(food_cost, 0) AS "foodCost",
        COALESCE(quote_amount, 0) AS "quoteAmount",
        COALESCE(tax_mode, 'not_taxed') AS "taxMode",
        COALESCE(tax_rate, 0.05) AS "taxRate",
        COALESCE(subtotal_amount, quote_amount, 0) AS "subtotalAmount",
        COALESCE(tax_amount, 0) AS "taxAmount",
        COALESCE(total_amount, quote_amount, 0) AS "totalAmount",
        COALESCE(received_amount, 0) AS "receivedAmount",
        COALESCE(material_cost, 0) AS "materialCost",
        COALESCE(labor_cost, 0) AS "laborCost",
        COALESCE(outsourced_cost, 0) AS "outsourcedCost",
        COALESCE(misc_cost, 0) AS "miscCost",
        COALESCE(status, '已報價') AS status,
        COALESCE(note, '') AS note,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM job_sites
      WHERE id = $1 AND company_id = $2
    `, [created.id, req.company.id]))[0];

    return res.json(row);
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

app.get('/api/companies/:companyId/jobsites/:jobsiteId/payments', auth, company, async (req, res) => {
  const jobsiteId = Number(req.params.jobsiteId);

  if (!jobsiteId) {
    return res.status(400).json({ error: '缺少 jobsiteId' });
  }

  if (PG_ENABLED) {
    const jobsite = await pgOne(`
      SELECT id
      FROM job_sites
      WHERE id = $1 AND company_id = $2
    `, [jobsiteId, req.company.id]);

    if (!jobsite) {
      return res.status(404).json({ error: '找不到此案場，或你沒有權限查看' });
    }

    const payments = await pgAll(`
      SELECT
        id,
        company_id AS "companyId",
        job_site_id AS "jobSiteId",
        amount,
        payment_date AS "paymentDate",
        method,
        note,
        created_at AS "createdAt"
      FROM job_site_payments
      WHERE company_id = $1
        AND job_site_id = $2
      ORDER BY payment_date DESC, id DESC
    `, [req.company.id, jobsiteId]);

    return res.json(payments);
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

app.post('/api/companies/:companyId/jobsites/:jobsiteId/payments', auth, company, requireRole('owner', 'admin', 'accounting'), async (req, res) => {
  const jobsiteId = Number(req.params.jobsiteId);

  if (!jobsiteId) {
    return res.status(400).json({ error: '缺少 jobsiteId' });
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

  if (PG_ENABLED) {
    const jobsite = await pgOne(`
      SELECT id
      FROM job_sites
      WHERE id = $1 AND company_id = $2
    `, [jobsiteId, req.company.id]);

    if (!jobsite) {
      return res.status(404).json({ error: '找不到此案場，或你沒有權限新增收款' });
    }

    const row = await pgOne(`
      INSERT INTO job_site_payments (
        company_id,
        job_site_id,
        amount,
        payment_date,
        method,
        note,
        created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP)
      RETURNING id
    `, [
      req.company.id,
      jobsiteId,
      finalAmount,
      paymentDate || new Date().toISOString().slice(0, 10),
      method || '現金',
      note || ''
    ]);

    const totalRow = await pgOne(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM job_site_payments
      WHERE company_id = $1
        AND job_site_id = $2
    `, [req.company.id, jobsiteId]);
    const receivedAmount = Number(totalRow?.total || 0);

    await pgQuery(`
      UPDATE job_sites
      SET received_amount = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
        AND company_id = $3
    `, [receivedAmount, jobsiteId, req.company.id]);

    audit(req.company.id, req.user.id, 'jobsite_payment_created', String(row.id));

    const payment = await pgOne(`
      SELECT
        id,
        company_id AS "companyId",
        job_site_id AS "jobSiteId",
        amount,
        payment_date AS "paymentDate",
        method,
        note,
        created_at AS "createdAt"
      FROM job_site_payments
      WHERE id = $1
        AND company_id = $2
    `, [row.id, req.company.id]);

    return res.json({ payment, receivedAmount });
  }

  const jobsite = ensureJobSite(req.company.id, jobsiteId);

  if (!jobsite) {
    return res.status(404).json({ error: '找不到此案場，或你沒有權限新增收款' });
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


app.put('/api/companies/:companyId/jobsites/:jobsiteId/payments/:paymentId', auth, company, requireRole('owner', 'admin', 'accounting'), async (req, res) => {
  const jobsiteId = Number(req.params.jobsiteId);
  const paymentId = Number(req.params.paymentId);
  const { amount, paymentDate, method, note } = req.body || {};

  if (!jobsiteId || !paymentId) {
    return res.status(400).json({ error: '缺少 jobsiteId 或 paymentId' });
  }

  const finalAmount = Number(amount || 0);

  if (finalAmount <= 0) {
    return res.status(400).json({ error: '收款金額必須大於 0' });
  }

  if (PG_ENABLED) {
    const existing = await pgOne(`
      SELECT jsp.id
      FROM job_site_payments jsp
      JOIN job_sites js ON js.id = jsp.job_site_id AND js.company_id = jsp.company_id
      WHERE jsp.id = $1
        AND jsp.job_site_id = $2
        AND jsp.company_id = $3
    `, [paymentId, jobsiteId, req.company.id]);

    if (!existing) {
      return res.status(404).json({ error: '找不到此收款紀錄' });
    }

    await pgQuery(`
      UPDATE job_site_payments
      SET amount = $1,
          payment_date = $2,
          method = $3,
          note = $4
      WHERE id = $5
        AND job_site_id = $6
        AND company_id = $7
    `, [
      finalAmount,
      paymentDate || new Date().toISOString().slice(0, 10),
      method || '現金',
      note || '',
      paymentId,
      jobsiteId,
      req.company.id
    ]);

    const totalRow = await pgOne(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM job_site_payments
      WHERE company_id = $1
        AND job_site_id = $2
    `, [req.company.id, jobsiteId]);
    const receivedAmount = Number(totalRow?.total || 0);

    await pgQuery(`
      UPDATE job_sites
      SET received_amount = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
        AND company_id = $3
    `, [receivedAmount, jobsiteId, req.company.id]);

    audit(req.company.id, req.user.id, 'jobsite_payment_updated', String(paymentId));

    const payment = await pgOne(`
      SELECT
        id,
        company_id AS "companyId",
        job_site_id AS "jobSiteId",
        amount,
        payment_date AS "paymentDate",
        method,
        note,
        created_at AS "createdAt"
      FROM job_site_payments
      WHERE id = $1
        AND company_id = $2
    `, [paymentId, req.company.id]);

    return res.json({ payment, receivedAmount });
  }

  const jobsite = ensureJobSite(req.company.id, jobsiteId);

  if (!jobsite) {
    return res.status(404).json({ error: '找不到此案場，或你沒有權限編輯收款' });
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

app.delete('/api/companies/:companyId/jobsites/:jobsiteId/payments/:paymentId', auth, company, requireRole('owner', 'admin', 'accounting'), async (req, res) => {
  const jobsiteId = Number(req.params.jobsiteId);
  const paymentId = Number(req.params.paymentId);

  if (!jobsiteId || !paymentId) {
    return res.status(400).json({ error: '缺少 jobsiteId 或 paymentId' });
  }

  if (PG_ENABLED) {
    const jobsite = await pgOne(`
      SELECT id
      FROM job_sites
      WHERE id = $1 AND company_id = $2
    `, [jobsiteId, req.company.id]);

    if (!jobsite) {
      return res.status(404).json({ error: '找不到此案場，或你沒有權限刪除收款' });
    }

    const result = await pgQuery(`
      DELETE FROM job_site_payments
      WHERE id = $1
        AND job_site_id = $2
        AND company_id = $3
    `, [paymentId, jobsiteId, req.company.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: '找不到此收款紀錄' });
    }

    const totalRow = await pgOne(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM job_site_payments
      WHERE company_id = $1
        AND job_site_id = $2
    `, [req.company.id, jobsiteId]);
    const receivedAmount = Number(totalRow?.total || 0);

    await pgQuery(`
      UPDATE job_sites
      SET received_amount = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
        AND company_id = $3
    `, [receivedAmount, jobsiteId, req.company.id]);

    audit(req.company.id, req.user.id, 'jobsite_payment_deleted', String(paymentId));

    return res.json({ ok: true, receivedAmount });
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

app.get('/api/companies/:companyId/integrations', auth, company, async (req, res) => {
  if (PG_ENABLED) {
    try {
      const connected = await pgAll('SELECT * FROM platform_accounts WHERE company_id = $1', [req.company.id]);
      return res.json(
        platforms.map((p) => ({
          ...p,
          account: connected.find((c) => c.platform_key === p.platformKey) || null
        }))
      );
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

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

app.post('/api/companies/:companyId/integrations/:platformKey/connect', auth, company, requireRole('owner', 'admin'), async (req, res) => {
  const p = platforms.find((x) => x.platformKey === req.params.platformKey);

  if (!p) {
    return res.status(404).json({ error: '未知平台' });
  }

  if (PG_ENABLED) {
    try {
      await pgQuery(`
        INSERT INTO platform_accounts (company_id, platform_key, status, updated_at)
        VALUES ($1,$2,$3,CURRENT_TIMESTAMP)
        ON CONFLICT (company_id, platform_key) DO UPDATE SET
          status = EXCLUDED.status,
          updated_at = CURRENT_TIMESTAMP
      `, [req.company.id, p.platformKey, p.status === 'planned' ? 'planned' : 'mock']);
      audit(req.company.id, req.user.id, 'integration_connected', p.platformKey);
      return res.json({ ok: true });
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
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

app.post('/api/companies/:companyId/integrations/:platformKey/sync', auth, company, requireRole('owner', 'admin', 'staff'), (req, res) => {
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

app.get('/api/companies/:companyId/transactions', auth, company, async (req, res) => {
  if (PG_ENABLED) {
    try {
      const rows = await pgAll(`
        SELECT *
        FROM transactions
        WHERE company_id = $1
        ORDER BY occurred_at DESC, id DESC
      `, [req.company.id]);
      return res.json(rows);
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

  const rows = db.prepare(`
    SELECT *
    FROM transactions
    WHERE company_id = ?
    ORDER BY occurred_at DESC
  `).all(req.company.id);

  res.json(rows);
});

app.post('/api/companies/:companyId/transactions', auth, company, requireRole('owner', 'admin', 'accounting', 'staff'), async (req, res) => {
  const t = req.body;
  const { net, profit, tax } = calcTransaction(t);

  if (PG_ENABLED) {
    try {
      const row = await pgOne(`
        INSERT INTO transactions (
          company_id, platform_key, channel_type, external_order_id, gross_amount,
          platform_fee, discount_amount, shipping_fee, refund_amount, net_amount,
          tax_amount, cost_of_goods_sold, platform_profit, profit, payment_status,
          order_status, items_json, occurred_at, note
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13,$14,$15,$16,$17,$18)
        RETURNING *
      `, [
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
        JSON.stringify(t.items || []),
        t.occurredAt || t.occurred_at || new Date().toISOString(),
        t.note || ''
      ]);
      audit(req.company.id, req.user.id, 'transaction_created', String(row.id));
      return res.json({ id: row.id, ...t, netAmount: net, taxAmount: tax, platformProfit: profit });
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

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

app.post('/api/companies/:companyId/invoices', auth, company, requireRole('owner', 'admin', 'accounting'), (req, res) => {
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

app.get('/api/companies/:companyId/products', auth, company, async (req, res) => {
  if (PG_ENABLED) {
    try {
      const rows = await pgAll(`
        SELECT *
        FROM products
        WHERE company_id = $1
        ORDER BY id DESC
      `, [req.company.id]);
      return res.json(rows);
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

  const rows = db.prepare(`
    SELECT *
    FROM products
    WHERE company_id = ?
    ORDER BY id DESC
  `).all(req.company.id);

  res.json(rows);
});

app.post('/api/companies/:companyId/products', auth, company, requireRole('owner', 'admin'), async (req, res) => {
  const p = req.body;

  if (PG_ENABLED) {
    try {
      const row = await pgOne(`
        INSERT INTO products (
          company_id, sku, name, category, unit, price, cost, stock,
          safety_stock, supplier, storage_location, note, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CURRENT_TIMESTAMP)
        RETURNING *
      `, [
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
      ]);
      audit(req.company.id, req.user.id, 'product_created', String(row.id));
      return res.json(row);
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

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


app.get('/api/companies/:companyId/vouchers', auth, company, async (req, res) => {
  if (PG_ENABLED) {
    try {
      const rows = await pgAll('SELECT * FROM vouchers WHERE company_id = $1 ORDER BY id DESC', [req.company.id]);
      return res.json(rows);
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

  const rows = db.prepare(`
    SELECT *
    FROM vouchers
    WHERE company_id = ?
    ORDER BY id DESC
  `).all(req.company.id);

  res.json(rows);
});

app.post('/api/companies/:companyId/vouchers', auth, company, requireRole('owner', 'admin', 'accounting', 'staff'), async (req, res) => {
  const v = req.body;

  const blocked = ['交際', '應酬', '娛樂', '個人', '私用', '禮品', '贈品']
    .some((k) => (v.purpose || '').includes(k));

  const amount = Number(v.amount || 0);
  const tax = Math.round(amount / 1.05 * 0.05 * 100) / 100;

  if (PG_ENABLED) {
    try {
      const row = await pgOne(`
        INSERT INTO vouchers (company_id, type, vendor, amount, tax, deductible, voucher_date, note)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING *
      `, [
        req.company.id,
        v.type || v.purpose || '',
        v.vendor || '',
        amount,
        tax,
        blocked ? 0 : 1,
        v.voucherDate || v.voucher_date || new Date().toISOString().slice(0, 10),
        v.note || v.purpose || ''
      ]);
      audit(req.company.id, req.user.id, 'voucher_created', String(row.id));
      return res.json(row);
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

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

app.get('/api/companies/:companyId/tax/vat', auth, company, requireFeature('tax_center'), async (req, res) => {
  if (PG_ENABLED) {
    try {
      const taxable = await pgOne('SELECT COALESCE(SUM(gross_amount / 1.05),0) AS total FROM transactions WHERE company_id = $1', [req.company.id]);
      const deductible = await pgOne('SELECT COALESCE(SUM(amount / 1.05),0) AS total FROM vouchers WHERE company_id = $1 AND COALESCE(deductible,0) = 1', [req.company.id]);
      const taxableSales = erpNumber(taxable?.total, 0);
      const deductiblePurchases = erpNumber(deductible?.total, 0);
      const outputTax = Math.round(taxableSales * 0.05 * 100) / 100;
      const inputTax = Math.round(deductiblePurchases * 0.05 * 100) / 100;
      return res.json({
        taxableSales,
        deductiblePurchases,
        outputTax,
        inputTax,
        payableVAT: Math.max(0, outputTax - inputTax),
        disclaimer: '本系統稅務試算僅供管理參考，正式申報仍應以會計師、記帳士或主管機關規定為準。'
      });
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

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

app.post('/api/companies/:companyId/accountant/clients', auth, company, requireFeature('accountant_console'), requireRole('owner', 'admin'), (req, res) => {
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


app.listen(PORT, HOST, () => {
  console.log(`BookAI API running on http://${HOST}:${PORT}`);
  checkPostgresStartup();
});
