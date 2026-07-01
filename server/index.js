import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import net from 'net';
import tls from 'tls';
import { fileURLToPath } from 'url';
import cors from 'cors';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { db, initDb, audit as sqliteAudit, DB_PATH, DB_PROVIDER, DATABASE_URL } from './db.js';
import { PG_ENABLED, initPostgresDb, getPool, pgAll, pgOne, pgQuery } from './pg-db.js';
import { plans } from './plans.js';
import { platforms } from './platforms.js';
import { AI_USE_CASES, generateAiDraft } from './ai-provider.js';
import { buildJobSitePatch } from './services/job-sites.js';
import { buildPatchSet } from './utils/patch.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_ROOT = path.join(__dirname, 'uploads');
const WEBSITE_ASSET_UPLOAD_DIR = path.join(UPLOADS_ROOT, 'website-assets');
const WEBSITE_ASSET_MAX_SIZE = 5 * 1024 * 1024;
const WEBSITE_ASSET_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const WEBSITE_ASSET_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

fs.mkdirSync(WEBSITE_ASSET_UPLOAD_DIR, { recursive: true });

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
const FOUNDER_TEST_EDITIONS = new Set(['commerce', 'engineering', 'all']);
const DEFAULT_FOUNDER_TEST_EDITION = 'commerce';
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
    console.warn('Production secret warnings are non-fatal for public preview deployment.');
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

if (DB_PROVIDER === 'sqlite') {
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
app.use('/uploads', express.static(UPLOADS_ROOT, {
  fallthrough: false,
  maxAge: NODE_ENV === 'production' ? '7d' : 0
}));

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Body 必須是合法 JSON' });
  }

  if (err?.message === '不允許的跨網域請求') {
    return res.status(403).json({ error: '不允許的跨網域請求' });
  }

  next(err);
});

function websiteAssetUploadError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getWebsiteAssetExtension(file) {
  const originalExt = path.extname(file.originalname || '').slice(1).toLowerCase();
  if (WEBSITE_ASSET_EXTENSIONS.has(originalExt)) return originalExt;
  if (file.mimetype === 'image/jpeg') return 'jpg';
  if (file.mimetype === 'image/png') return 'png';
  if (file.mimetype === 'image/webp') return 'webp';
  return '';
}

const websiteAssetStorage = multer.diskStorage({
  destination(req, file, callback) {
    fs.mkdir(WEBSITE_ASSET_UPLOAD_DIR, { recursive: true }, (err) => callback(err, WEBSITE_ASSET_UPLOAD_DIR));
  },
  filename(req, file, callback) {
    const ext = getWebsiteAssetExtension(file);
    const random = nanoid(10);
    callback(null, `website-asset-${Date.now()}-${random}.${ext}`);
  }
});

const uploadWebsiteAssetFile = multer({
  storage: websiteAssetStorage,
  limits: { fileSize: WEBSITE_ASSET_MAX_SIZE, files: 1 },
  fileFilter(req, file, callback) {
    const ext = getWebsiteAssetExtension(file);
    if (!ext || !WEBSITE_ASSET_MIME_TYPES.has(file.mimetype)) {
      return callback(websiteAssetUploadError('僅允許上傳 JPG、JPEG、PNG 或 WEBP 圖片。'));
    }
    return callback(null, true);
  }
}).single('file');

function handleWebsiteAssetUpload(req, res, next) {
  uploadWebsiteAssetFile(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return jsonError(res, 413, '圖片檔案不可超過 5MB。');
    }
    if (err instanceof multer.MulterError) {
      return jsonError(res, 400, '圖片上傳失敗，請確認檔案格式與大小。');
    }
    return jsonError(res, err.status || 500, err.message || '圖片上傳失敗，請稍後再試。');
  });
}

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

function normalizeFounderTestEdition(value) {
  const edition = String(value || '').trim().toLowerCase();
  return FOUNDER_TEST_EDITIONS.has(edition) ? edition : '';
}

async function ensureFounderTestEditionStorage() {
  if (PG_ENABLED) {
    await pgQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS test_edition TEXT DEFAULT 'commerce'`);
    return;
  }

  const columns = db.prepare(`PRAGMA table_info(users)`).all();
  const exists = columns.some((column) => column.name === 'test_edition');
  if (!exists) {
    db.prepare(`ALTER TABLE users ADD COLUMN test_edition TEXT DEFAULT 'commerce'`).run();
  }
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
        COALESCE(review_status, 'pending_review') AS review_status,
        COALESCE(approval_status, review_status, status, 'pending_review') AS approval_status
      FROM users
      WHERE id = $1
    `, [req.user?.id])
    : db.prepare(`
      SELECT
        id,
        email,
        COALESCE(status, 'pending_review') AS status,
        COALESCE(review_status, 'pending_review') AS review_status,
        COALESCE(approval_status, review_status, status, 'pending_review') AS approval_status
      FROM users
      WHERE id = ?
    `).get(req.user?.id);

  if (!user) return res.status(401).json({ error: '未登入' });
  if (isPrivilegedEmail(user.email)) return next();

  const userStatus = user.approval_status || user.status || user.review_status || 'pending_review';
  const companyStatus = req.company?.approval_status || req.company?.review_status || '';

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
      error: '此功能尚未開放，請聯繫 BookAI 官方客服確認開通狀態',
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
            approval_status = $5,
            approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP::text),
            approved_by = COALESCE(approved_by, id)
        WHERE id = $6
      `, [ADMIN_NAME, hash, 'admin', 'approved', 'approved', userId]);
    } else {
      const created = await pgOne(`
        INSERT INTO users (name, email, password_hash, created_source, created_utm_source, status, review_status, approval_status, approved_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP)
        RETURNING id
      `, [ADMIN_NAME, ADMIN_EMAIL, hash, 'bootstrap', 'bootstrap', 'admin', 'approved', 'approved']);
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
            billing_note = $8,
            review_status = 'approved',
            approval_status = 'approved',
            is_active = 1
        WHERE id = $9
      `, [ADMIN_COMPANY, 'admin', 'pro', userId, 'active', 'engineering_premium', 1, 'BookAI 系統管理員帳號', companyId]);
    } else {
      const company = await pgOne(`
        INSERT INTO companies (
          name, tax_id, industry, companyAddress, address, plan, owner_id,
          billing_status, subscription_plan, is_paid_customer, billing_note, review_status, approval_status, is_active
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        RETURNING id
      `, [ADMIN_COMPANY, '', 'admin', '', '', 'pro', userId, 'active', 'engineering_premium', 1, 'BookAI 系統管理員帳號', 'approved', 'approved', 1]);
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
            approval_status = $5,
            approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP::text),
            approved_by = COALESCE(approved_by, id)
        WHERE id = $6
      `, ['BookAI Founder', hash, 'founder', 'approved', 'approved', userId]);
    } else {
      const user = await pgOne(`
        INSERT INTO users (name, email, password_hash, created_source, created_utm_source, status, review_status, approval_status, approved_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP)
        RETURNING id
      `, ['BookAI Founder', founderEmail, hash, 'bootstrap', 'bootstrap', 'founder', 'approved', 'approved']);
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
            billing_note = $8,
            review_status = 'approved',
            approval_status = 'approved',
            is_active = 1
        WHERE id = $9
      `, [companyName, 'admin', 'pro', userId, 'active', 'engineering_premium', 1, 'BookAI 創辦人帳號', companyId]);
    } else {
      const company = await pgOne(`
        INSERT INTO companies (
          name, tax_id, industry, companyAddress, address, plan, owner_id,
          billing_status, subscription_plan, is_paid_customer, billing_note, review_status, approval_status, is_active
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        RETURNING id
      `, [companyName, '', 'admin', '', '', 'pro', userId, 'active', 'engineering_premium', 1, 'BookAI 創辦人帳號', 'approved', 'approved', 1]);
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
    address
  } = req.body;
  const tracking = sanitizeTrackingBody(req.body || {});

  const normalizedEmail = normalizeEmail(email);

  const finalCompanyName = String(companyName || brandName || '').trim();
  const finalContactName = String(contactName || name || '').trim();
  const finalPhone = String(phone || '').trim();
  const finalUseCase = String(useCase || req.body.use_case || '').trim();
  const finalTaxId = String(taxId || req.body.tax_id || '').trim();
  const finalCompanyStage = String(companyStage || req.body.company_stage || '').trim();
  const finalLineContact = String(lineContact || req.body.line_contact || '').trim();
  const finalPlan = 'trial';
  const finalProductLine = inferProductLine(industry || '');
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

  if (finalTaxId && !/^\d{8}$/.test(finalTaxId)) {
    return res.status(400).json({ error: '統一編號若有填寫，必須為 8 碼數字' });
  }

  if (!acceptedTerms) {
    return res.status(400).json({ error: '請先閱讀並同意 BookAI 測試會員服務條款' });
  }

  if (isAdminEmail(normalizedEmail)) {
    return res.status(403).json({ error: '此管理者帳號只能由 Bootstrap 建立或重設' });
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
        approval_status,
        terms_accepted_at,
        terms_version,
        line_contact,
        company_stage,
        phone,
        contact_name,
        tax_id,
        use_case
      )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP,$9,$10,$11,$12,$13,$14,$15)
        RETURNING id, name, email
      `, [
        finalContactName,
        normalizedEmail,
        hash,
        tracking.source || '',
        tracking.utm_source || '',
        'pending_review',
        'pending_review',
        'pending_review',
        'v1.0',
        finalLineContact,
        finalCompanyStage,
        finalPhone,
        finalContactName,
        finalTaxId,
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
          approval_status,
          is_active,
          contact_name,
          phone,
          line_contact,
          use_case,
          company_stage,
          beta_status,
          is_free_beta,
          beta_group,
          beta_limit_group,
          product_line,
          industry_type
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
        RETURNING id
      `, [
        finalCompanyName,
        finalTaxId,
        industry || '',
        finalAddress,
        finalAddress,
        finalPlan,
        user.id,
        'pending_review',
        'pending_review',
        0,
        finalContactName,
        finalPhone,
        finalLineContact,
        finalUseCase,
        finalCompanyStage,
        'pending_review',
        0,
        'closed_beta',
        '',
        finalProductLine,
        industry || ''
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
      approval_status,
      terms_accepted_at,
      terms_version,
      line_contact,
      company_stage,
      phone,
      contact_name,
      tax_id,
      use_case
    )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      finalContactName,
      normalizedEmail,
      hash,
      tracking.source || '',
      tracking.utm_source || '',
      'pending_review',
      'pending_review',
      'pending_review',
      new Date().toISOString(),
      'v1.0',
      finalLineContact,
      finalCompanyStage,
      finalPhone,
      finalContactName,
      finalTaxId,
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
      approval_status,
      is_active,
      contact_name,
      phone,
      line_contact,
      use_case,
      company_stage,
      beta_status,
      is_free_beta,
      beta_group,
      beta_limit_group,
      product_line,
      industry_type
    )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      finalCompanyName,
      finalTaxId,
      industry || '',
      finalAddress,
      finalAddress,
      finalPlan,
      user.lastInsertRowid,
      'pending_review',
      'pending_review',
      0,
      finalContactName,
      finalPhone,
      finalLineContact,
      finalUseCase,
      finalCompanyStage,
      'pending_review',
      0,
      'closed_beta',
      '',
      finalProductLine,
      industry || ''
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
        COALESCE(approval_status, review_status, status, 'pending_review') AS approval_status,
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
        COALESCE(approval_status, review_status, status, 'pending_review') AS approval_status,
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
      user.approval_status = 'approved';
    } else if (user.isAdmin) {
      user.status = 'admin';
      user.review_status = 'approved';
      user.approval_status = 'approved';
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

app.get('/api/founder/test-edition', auth, requireFounder, async (req, res) => {
  try {
    await ensureFounderTestEditionStorage();
    const user = PG_ENABLED
      ? await pgOne(`SELECT test_edition FROM users WHERE id = $1`, [req.user.id])
      : db.prepare(`SELECT test_edition FROM users WHERE id = ?`).get(req.user.id);

    const edition = normalizeFounderTestEdition(user?.test_edition) || DEFAULT_FOUNDER_TEST_EDITION;
    return res.json({ ok: true, edition });
  } catch (error) {
    console.error('[founder test edition get] failed', { userId: req.user?.id, code: error.code, message: error.message });
    return res.status(500).json({ error: '測試版本讀取失敗', code: 'DATABASE_ERROR' });
  }
});

app.put('/api/founder/test-edition', auth, requireFounder, async (req, res) => {
  const edition = normalizeFounderTestEdition(req.body?.edition);
  if (!edition) {
    return res.status(400).json({ error: 'edition 只允許 commerce、engineering、all', code: 'VALIDATION_ERROR' });
  }

  try {
    await ensureFounderTestEditionStorage();
    if (PG_ENABLED) {
      await pgQuery(`UPDATE users SET test_edition = $1 WHERE id = $2`, [edition, req.user.id]);
    } else {
      db.prepare(`UPDATE users SET test_edition = ? WHERE id = ?`).run(edition, req.user.id);
    }

    return res.json({ ok: true, edition });
  } catch (error) {
    console.error('[founder test edition update] failed', { userId: req.user?.id, code: error.code, message: error.message });
    return res.status(500).json({ error: '測試版本更新失敗', code: 'DATABASE_ERROR' });
  }
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
const feedbackCategories = new Set([
  '操作卡住',
  '按鈕無反應',
  '金額 / 報表異常',
  '畫面顯示問題',
  '資料沒有儲存',
  '建議新增功能',
  '操作問題',
  '介面建議',
  '功能需求',
  '錯誤回報',
  '其他'
]);
const feedbackStatuses = new Set(['new', 'reviewing', 'resolved', 'ignored']);
const reviewStatuses = new Set(['pending_review', 'approved', 'rejected', 'suspended', 'founder', 'admin', 'demo']);
const memberPlans = new Set(['trial', 'starter', 'pro', 'enterprise', 'custom']);
const productLines = new Set(['engineering', 'commerce', 'restaurant', 'beverage', 'retail', 'studio', 'accountant', 'general']);
const betaStatuses = new Set(['not_started', 'pending_review', 'approved', 'rejected', 'suspended', 'demo']);
const freeBetaSoftTarget = 20;
const freeBetaHardLimitEnabled = false;
const adminSettingKeys = new Set([
  'official_site_url',
  'official_line_url',
  'default_trial_days',
  'renewal_reminder_days',
  'enable_website_backend',
  'system_announcement'
]);

async function listAdminMembers(status = 'all') {
  const normalizedStatus = String(status || 'all').trim();
  const hasStatusFilter = normalizedStatus !== 'all' && reviewStatuses.has(normalizedStatus);
  const where = hasStatusFilter
    ? PG_ENABLED
      ? 'WHERE COALESCE(u.approval_status, u.status, u.review_status, $1) = $1'
      : 'WHERE COALESCE(u.approval_status, u.status, u.review_status, ?) = ?'
    : '';
  const params = hasStatusFilter
    ? PG_ENABLED ? [normalizedStatus] : [normalizedStatus, normalizedStatus]
    : [];

  const sql = `
    SELECT
      u.id,
      u.email,
      u.name,
      u.phone,
      u.contact_name,
      u.tax_id AS user_tax_id,
      u.use_case,
      u.line_contact,
      u.company_stage,
      u.status,
      u.review_status,
      COALESCE(u.approval_status, u.status, u.review_status, 'pending_review') AS approval_status,
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
      c.plan,
      c.contact_name AS company_contact_name,
      c.phone AS company_phone,
      c.line_contact AS company_line_contact,
      c.use_case AS company_use_case,
      c.company_stage AS company_company_stage,
      c.review_status AS company_review_status,
      COALESCE(c.approval_status, c.review_status, 'pending_review') AS company_approval_status,
      COALESCE(c.beta_status, 'not_started') AS beta_status,
      COALESCE(c.is_free_beta, 0) AS is_free_beta,
      COALESCE(c.beta_group, '') AS beta_group,
      COALESCE(c.beta_limit_group, '') AS beta_limit_group,
      COALESCE(c.product_line, 'general') AS product_line,
      COALESCE(c.industry_type, c.industry, '') AS industry_type,
      c.beta_approved_at,
      c.approved_at,
      c.approved_by,
      c.rejected_at,
      c.suspended_at
    FROM users u
    LEFT JOIN companies c ON c.owner_id = u.id
    ${where}
    ORDER BY u.created_at DESC, u.id DESC
  `;

  return PG_ENABLED ? pgAll(sql, params) : db.prepare(sql).all(...params);
}

app.get('/api/admin/review/users', auth, requireAdmin, async (req, res) => {
  try {
    res.json(await listAdminMembers(req.query.status || 'all'));
  } catch (err) {
    console.error('[admin review users] failed', {
      route: req.path,
      userId: req.user?.id,
      code: err.code,
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: '資料讀取失敗', code: 'DATABASE_ERROR' });
  }
});

app.get('/api/admin/members', auth, requireAdmin, async (req, res) => {
  try {
    res.json(await listAdminMembers(req.query.status || 'all'));
  } catch (err) {
    console.error('[admin members] failed', {
      route: req.path,
      userId: req.user?.id,
      code: err.code,
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: '會員審核資料讀取失敗，請稍後再試或聯繫系統管理員。', code: 'DATABASE_ERROR' });
  }
});

async function updateMemberReview(userId, adminId, status, note = '', plan = 'trial', productLine = '') {
  const now = new Date().toISOString();
  const nextPlan = memberPlans.has(String(plan || '').trim()) ? String(plan).trim() : 'trial';
  const nextProductLine = productLines.has(String(productLine || '').trim()) ? String(productLine).trim() : '';
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
    approval_status: status === 'demo' ? 'approved' : status,
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
            approval_status = $3,
            approved_at = $4,
            approved_by = $5,
            review_note = $6
        WHERE id = $7
      `, [userPatch.status, userPatch.review_status, userPatch.approval_status, now, adminId, note, userId]);
      await pgQuery(`
        UPDATE companies
        SET review_status = 'approved',
            approval_status = 'approved',
            is_active = 1,
            approved_at = $1,
            approved_by = $2,
            review_note = $3,
            plan = $4,
            beta_status = $5,
            is_free_beta = 1,
            beta_group = COALESCE(NULLIF(beta_group, ''), 'closed_beta'),
            beta_limit_group = COALESCE(beta_limit_group, ''),
            product_line = COALESCE(NULLIF($6, ''), product_line, 'general'),
            industry_type = COALESCE(industry_type, industry, ''),
            beta_approved_at = COALESCE(beta_approved_at, $1)
        WHERE owner_id = $7
      `, [now, adminId, note, nextPlan, status === 'demo' ? 'demo' : 'approved', nextProductLine, userId]);
    } else if (status === 'rejected') {
      await pgQuery(`
        UPDATE users
        SET status = 'rejected',
            review_status = 'rejected',
            approval_status = 'rejected',
            rejected_at = $1,
            rejected_by = $2,
            review_note = $3
        WHERE id = $4
      `, [now, adminId, note, userId]);
      await pgQuery(`
        UPDATE companies
        SET review_status = 'rejected',
            approval_status = 'rejected',
            beta_status = 'rejected',
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
            approval_status = 'suspended',
            suspended_at = $1,
            suspended_by = $2,
            review_note = $3
        WHERE id = $4
      `, [now, adminId, note, userId]);
      await pgQuery(`
        UPDATE companies
        SET review_status = 'suspended',
            approval_status = 'suspended',
            beta_status = 'suspended',
            is_active = 0,
            suspended_at = $1,
            suspended_by = $2,
            review_note = $3
        WHERE owner_id = $4
      `, [now, adminId, note, userId]);
    }
  } else {
    if (status === 'approved' || status === 'demo') {
      db.prepare(`
        UPDATE users SET status = ?, review_status = ?, approval_status = ?, approved_at = ?, approved_by = ?, review_note = ? WHERE id = ?
      `).run(userPatch.status, userPatch.review_status, userPatch.approval_status, now, adminId, note, userId);
      db.prepare(`
        UPDATE companies SET review_status = 'approved', approval_status = 'approved', is_active = 1, approved_at = ?, approved_by = ?, review_note = ?, plan = ?, beta_status = ?, is_free_beta = 1, beta_group = COALESCE(NULLIF(beta_group, ''), 'closed_beta'), beta_limit_group = COALESCE(beta_limit_group, ''), product_line = COALESCE(NULLIF(?, ''), product_line, 'general'), industry_type = COALESCE(industry_type, industry, ''), beta_approved_at = COALESCE(beta_approved_at, ?) WHERE owner_id = ?
      `).run(now, adminId, note, nextPlan, status === 'demo' ? 'demo' : 'approved', nextProductLine, now, userId);
    } else if (status === 'rejected') {
      db.prepare(`
        UPDATE users SET status = 'rejected', review_status = 'rejected', approval_status = 'rejected', rejected_at = ?, rejected_by = ?, review_note = ? WHERE id = ?
      `).run(now, adminId, note, userId);
      db.prepare(`
        UPDATE companies SET review_status = 'rejected', approval_status = 'rejected', beta_status = 'rejected', is_active = 0, rejected_at = ?, rejected_by = ?, review_note = ? WHERE owner_id = ?
      `).run(now, adminId, note, userId);
    } else if (status === 'suspended') {
      db.prepare(`
        UPDATE users SET status = 'suspended', review_status = 'suspended', approval_status = 'suspended', suspended_at = ?, suspended_by = ?, review_note = ? WHERE id = ?
      `).run(now, adminId, note, userId);
      db.prepare(`UPDATE companies SET review_status = 'suspended', approval_status = 'suspended', beta_status = 'suspended', is_active = 0, suspended_at = ?, suspended_by = ?, review_note = ? WHERE owner_id = ?`).run(now, adminId, note, userId);
    }
  }

  audit(null, adminId, actionMap[status] || 'member_review_updated', JSON.stringify({ userId, status }));
  return { ok: true };
}

function reviewAction(status) {
  return async (req, res) => {
    try {
      const result = await updateMemberReview(
        Number(req.params.id),
        req.user.id,
        status,
        req.body?.reviewNote || req.body?.note || '',
        req.body?.plan || 'trial',
        req.body?.product_line || req.body?.productLine || ''
      );
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

app.patch('/api/admin/members/:id', auth, requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const status = String(req.body?.approval_status || req.body?.status || '').trim();
    const plan = String(req.body?.plan || 'trial').trim();
    const productLine = String(req.body?.product_line || req.body?.productLine || '').trim();
    const note = String(req.body?.reviewNote || req.body?.review_note || req.body?.note || '');

    if (!reviewStatuses.has(status) || status === 'founder' || status === 'admin') {
      return res.status(400).json({ error: '會員狀態不正確' });
    }

    if (plan && !memberPlans.has(plan)) {
      return res.status(400).json({ error: '方案不正確' });
    }

    if (productLine && !productLines.has(productLine)) {
      return res.status(400).json({ error: '產品線不正確' });
    }

    const result = await updateMemberReview(userId, req.user.id, status, note, plan || 'trial', productLine);
    if (!result) return res.status(404).json({ error: '找不到使用者' });
    if (result.protected) return res.status(400).json({ error: 'Founder / Admin 帳號不可由審核中心變更狀態' });
    res.json({ ok: true });
  } catch (err) {
    console.error('admin member patch failed', { route: req.path, userId: req.user?.id, code: err.code, message: err.message });
    res.status(500).json({ error: '會員審核資料更新失敗，請稍後再試或聯繫系統管理員。', code: 'DATABASE_ERROR' });
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

function jsonOk(res, data = null, extra = {}) {
  return res.json({ ok: true, data, ...extra });
}

function jsonError(res, status, error) {
  return res.status(status).json({ ok: false, error });
}

function cmsBool(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 1) return 1;
  const text = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', '是', 'on'].includes(text) ? 1 : 0;
}

function cmsNumber(value, fallback = 0) {
  const n = Number(value ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function cmsText(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function slugify(value, fallback = 'site') {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || fallback;
}

async function getUserCmsCompany(userId, requestedCompanyId = 0) {
  const candidateId = Number(requestedCompanyId || 0);

  if (PG_ENABLED) {
    if (candidateId) {
      return pgOne(`
        SELECT c.*, cu.role
        FROM companies c
        JOIN company_users cu ON cu.company_id = c.id
        WHERE c.id = $1
          AND cu.user_id = $2
      `, [candidateId, userId]);
    }
    return pgOne(`
      SELECT c.*, cu.role
      FROM companies c
      JOIN company_users cu ON cu.company_id = c.id
      WHERE cu.user_id = $1
      ORDER BY
        CASE cu.role
          WHEN 'owner' THEN 1
          WHEN 'admin' THEN 2
          WHEN 'staff' THEN 3
          ELSE 4
        END,
        cu.id ASC
      LIMIT 1
    `, [userId]);
  }

  if (candidateId) {
    return db.prepare(`
      SELECT c.*, cu.role
      FROM companies c
      JOIN company_users cu ON cu.company_id = c.id
      WHERE c.id = ?
        AND cu.user_id = ?
    `).get(candidateId, userId);
  }

  return db.prepare(`
    SELECT c.*, cu.role
    FROM companies c
    JOIN company_users cu ON cu.company_id = c.id
    WHERE cu.user_id = ?
    ORDER BY
      CASE cu.role
        WHEN 'owner' THEN 1
        WHEN 'admin' THEN 2
        WHEN 'staff' THEN 3
        ELSE 4
      END,
      cu.id ASC
    LIMIT 1
  `).get(userId);
}

async function cmsCompany(req, res, next) {
  const requestedCompanyId = req.user?.company_id || req.user?.companyId || 0;
  const row = await getUserCmsCompany(req.user?.id, requestedCompanyId);

  if (!row) {
    return jsonError(res, 403, '找不到可管理的公司');
  }

  req.company = row;
  req.cmsCompany = row;
  return requireApproved(req, res, next);
}

function requireCmsRole(...allowedRoles) {
  return (req, res, next) => {
    const role = req.cmsCompany?.role || req.company?.role || 'viewer';
    if (allowedRoles.includes(role)) return next();
    return jsonError(res, 403, '你的角色沒有權限管理網站內容');
  };
}

function cmsSettingsRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.company_id,
    siteSlug: row.site_slug,
    siteName: row.site_name || '',
    brandName: row.brand_name || '',
    logoUrl: row.logo_url || '',
    faviconUrl: row.favicon_url || '',
    primaryColor: row.primary_color || '#2563eb',
    secondaryColor: row.secondary_color || '#0f172a',
    contactEmail: row.contact_email || '',
    contactPhone: row.contact_phone || '',
    lineUrl: row.line_url || '',
    facebookUrl: row.facebook_url || '',
    instagramUrl: row.instagram_url || '',
    address: row.address || '',
    seoTitle: row.seo_title || '',
    seoDescription: row.seo_description || '',
    isPublished: Boolean(row.is_published),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function cmsGenericRow(row) {
  if (!row) return null;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
    ['is_active', 'is_featured', 'is_published'].includes(key) ? Boolean(value) : value
  ]));
}

function publicSettingsRow(row) {
  const settings = cmsSettingsRow(row);
  if (!settings) return null;
  const { id, companyId, ...publicSettings } = settings;
  return publicSettings;
}

function publicCmsRow(row) {
  const item = cmsGenericRow(row);
  if (!item) return null;
  const { companyId, ...publicItem } = item;
  return publicItem;
}

async function ensureWebsiteSettings(companyRow) {
  const existing = PG_ENABLED
    ? await pgOne('SELECT * FROM website_settings WHERE company_id = $1', [companyRow.id])
    : db.prepare('SELECT * FROM website_settings WHERE company_id = ?').get(companyRow.id);

  if (existing) return existing;

  const slug = slugify(companyRow.name, `company-${companyRow.id}`);
  const defaultSlug = `${slug}-${companyRow.id}`;
  const siteName = companyRow.name || `BookAI Site ${companyRow.id}`;

  if (PG_ENABLED) {
    return pgOne(`
      INSERT INTO website_settings (
        company_id, site_slug, site_name, brand_name, primary_color, secondary_color,
        is_published, created_at, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT (company_id) DO UPDATE SET company_id = EXCLUDED.company_id
      RETURNING *
    `, [companyRow.id, defaultSlug, siteName, siteName, '#2563eb', '#0f172a']);
  }

  db.prepare(`
    INSERT OR IGNORE INTO website_settings (
      company_id, site_slug, site_name, brand_name, primary_color, secondary_color,
      is_published, created_at, updated_at
    )
    VALUES (?,?,?,?,?,?,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `).run(companyRow.id, defaultSlug, siteName, siteName, '#2563eb', '#0f172a');

  return db.prepare('SELECT * FROM website_settings WHERE company_id = ?').get(companyRow.id);
}

async function assertSiteSlugAvailable(companyId, siteSlug) {
  const row = PG_ENABLED
    ? await pgOne('SELECT id FROM website_settings WHERE site_slug = $1 AND company_id <> $2', [siteSlug, companyId])
    : db.prepare('SELECT id FROM website_settings WHERE site_slug = ? AND company_id <> ?').get(siteSlug, companyId);
  if (row) {
    const error = new Error('site_slug 已被使用');
    error.status = 400;
    throw error;
  }
}

async function getPublicSite(slug) {
  const siteSlug = slugify(slug, '');
  if (!siteSlug) return null;
  const sql = `
    SELECT *
    FROM website_settings
    WHERE site_slug = ${PG_ENABLED ? '$1' : '?'}
      AND is_published = 1
  `;
  return PG_ENABLED ? pgOne(sql, [siteSlug]) : db.prepare(sql).get(siteSlug);
}

async function getPublicSiteCandidate(slug) {
  const siteSlug = slugify(slug, '');
  if (!siteSlug) return null;
  const sql = `
    SELECT *
    FROM website_settings
    WHERE site_slug = ${PG_ENABLED ? '$1' : '?'}
  `;
  return PG_ENABLED ? pgOne(sql, [siteSlug]) : db.prepare(sql).get(siteSlug);
}

const cmsSectionTypes = new Set(['hero', 'brand_story', 'feature', 'promotion', 'product_highlight', 'custom']);
const cmsContentStatuses = new Set(['draft', 'published', 'hidden']);
const cmsInquiryStatuses = new Set(['new', 'read', 'replied', 'archived']);
const cmsAssetModules = new Set(['logo', 'favicon', 'banner', 'home_section', 'product', 'post', 'general']);

const cmsResources = {
  banners: {
    table: 'website_banners',
    listOrder: 'sort_order ASC, id DESC',
    writable: ['title', 'subtitle', 'image_url', 'button_text', 'button_url', 'sort_order', 'is_active'],
    body(body = {}, existing = {}) {
      return {
        title: cmsText(body.title, existing.title || ''),
        subtitle: cmsText(body.subtitle, existing.subtitle || ''),
        image_url: cmsText(body.imageUrl ?? body.image_url, existing.image_url || ''),
        button_text: cmsText(body.buttonText ?? body.button_text, existing.button_text || ''),
        button_url: cmsText(body.buttonUrl ?? body.button_url, existing.button_url || ''),
        sort_order: cmsNumber(body.sortOrder ?? body.sort_order, existing.sort_order || 0),
        is_active: cmsBool(body.isActive ?? body.is_active, existing.is_active ?? 1)
      };
    }
  },
  'home-sections': {
    table: 'website_home_sections',
    listOrder: 'sort_order ASC, id DESC',
    writable: ['section_type', 'title', 'subtitle', 'content', 'image_url', 'button_text', 'button_url', 'sort_order', 'is_active'],
    body(body = {}, existing = {}) {
      const sectionType = cmsText(body.sectionType ?? body.section_type, existing.section_type || 'custom');
      return {
        section_type: cmsSectionTypes.has(sectionType) ? sectionType : 'custom',
        title: cmsText(body.title, existing.title || ''),
        subtitle: cmsText(body.subtitle, existing.subtitle || ''),
        content: cmsText(body.content, existing.content || ''),
        image_url: cmsText(body.imageUrl ?? body.image_url, existing.image_url || ''),
        button_text: cmsText(body.buttonText ?? body.button_text, existing.button_text || ''),
        button_url: cmsText(body.buttonUrl ?? body.button_url, existing.button_url || ''),
        sort_order: cmsNumber(body.sortOrder ?? body.sort_order, existing.sort_order || 0),
        is_active: cmsBool(body.isActive ?? body.is_active, existing.is_active ?? 1)
      };
    }
  },
  products: {
    table: 'website_products',
    listOrder: 'sort_order ASC, id DESC',
    required: 'name',
    writable: ['name', 'slug', 'description', 'short_description', 'price', 'compare_at_price', 'image_url', 'category', 'status', 'sort_order', 'is_featured'],
    body(body = {}, existing = {}) {
      const name = cmsText(body.name, existing.name || '');
      const status = cmsText(body.status, existing.status || 'draft');
      return {
        name,
        slug: slugify(body.slug || name || existing.slug, `product-${Date.now()}`),
        description: cmsText(body.description, existing.description || ''),
        short_description: cmsText(body.shortDescription ?? body.short_description, existing.short_description || ''),
        price: cmsNumber(body.price, existing.price || 0),
        compare_at_price: cmsNumber(body.compareAtPrice ?? body.compare_at_price, existing.compare_at_price || 0),
        image_url: cmsText(body.imageUrl ?? body.image_url, existing.image_url || ''),
        category: cmsText(body.category, existing.category || ''),
        status: cmsContentStatuses.has(status) ? status : 'draft',
        sort_order: cmsNumber(body.sortOrder ?? body.sort_order, existing.sort_order || 0),
        is_featured: cmsBool(body.isFeatured ?? body.is_featured, existing.is_featured || 0)
      };
    }
  },
  posts: {
    table: 'website_posts',
    listOrder: 'created_at DESC, id DESC',
    required: 'title',
    writable: ['title', 'slug', 'summary', 'content', 'cover_image_url', 'category', 'status', 'published_at'],
    body(body = {}, existing = {}) {
      const title = cmsText(body.title, existing.title || '');
      const status = cmsText(body.status, existing.status || 'draft');
      return {
        title,
        slug: slugify(body.slug || title || existing.slug, `post-${Date.now()}`),
        summary: cmsText(body.summary, existing.summary || ''),
        content: cmsText(body.content, existing.content || ''),
        cover_image_url: cmsText(body.coverImageUrl ?? body.cover_image_url, existing.cover_image_url || ''),
        category: cmsText(body.category, existing.category || ''),
        status: cmsContentStatuses.has(status) ? status : 'draft',
        published_at: cmsText(body.publishedAt ?? body.published_at, existing.published_at || '')
      };
    }
  },
  faqs: {
    table: 'website_faqs',
    listOrder: 'sort_order ASC, id DESC',
    required: 'question',
    writable: ['question', 'answer', 'category', 'sort_order', 'is_active'],
    body(body = {}, existing = {}) {
      return {
        question: cmsText(body.question, existing.question || ''),
        answer: cmsText(body.answer, existing.answer || ''),
        category: cmsText(body.category, existing.category || ''),
        sort_order: cmsNumber(body.sortOrder ?? body.sort_order, existing.sort_order || 0),
        is_active: cmsBool(body.isActive ?? body.is_active, existing.is_active ?? 1)
      };
    }
  }
};

async function cmsList(resource, companyId) {
  const config = cmsResources[resource];
  const sql = `
    SELECT *
    FROM ${config.table}
    WHERE company_id = ${PG_ENABLED ? '$1' : '?'}
    ORDER BY ${config.listOrder}
  `;
  return PG_ENABLED ? pgAll(sql, [companyId]) : db.prepare(sql).all(companyId);
}

async function cmsGet(resource, companyId, id) {
  const config = cmsResources[resource];
  const sql = `
    SELECT *
    FROM ${config.table}
    WHERE id = ${PG_ENABLED ? '$1' : '?'}
      AND company_id = ${PG_ENABLED ? '$2' : '?'}
  `;
  return PG_ENABLED ? pgOne(sql, [id, companyId]) : db.prepare(sql).get(id, companyId);
}

async function cmsCreate(resource, companyId, body) {
  const config = cmsResources[resource];
  const data = config.body(body);
  if (config.required && !data[config.required]) {
    const error = new Error('缺少必要欄位');
    error.status = 400;
    throw error;
  }
  const columns = ['company_id', ...config.writable];
  const values = columns.map((column) => column === 'company_id' ? companyId : data[column]);

  if (PG_ENABLED) {
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(',');
    return pgOne(`
      INSERT INTO ${config.table} (${columns.join(',')}, created_at, updated_at)
      VALUES (${placeholders}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
    `, values);
  }

  const placeholders = columns.map(() => '?').join(',');
  const result = db.prepare(`
    INSERT INTO ${config.table} (${columns.join(',')}, created_at, updated_at)
    VALUES (${placeholders}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(...values);
  return cmsGet(resource, companyId, result.lastInsertRowid);
}

async function cmsUpdate(resource, companyId, id, body) {
  const config = cmsResources[resource];
  const existing = await cmsGet(resource, companyId, id);
  if (!existing) return null;
  const data = config.body(body, existing);
  if (config.required && !data[config.required]) {
    const error = new Error('缺少必要欄位');
    error.status = 400;
    throw error;
  }
  const assignments = config.writable.map((column, i) => `${column} = ${PG_ENABLED ? `$${i + 1}` : '?'}`);
  const values = config.writable.map((column) => data[column]);

  if (PG_ENABLED) {
    await pgQuery(`
      UPDATE ${config.table}
      SET ${assignments.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${values.length + 1}
        AND company_id = $${values.length + 2}
    `, [...values, id, companyId]);
    return cmsGet(resource, companyId, id);
  }

  db.prepare(`
    UPDATE ${config.table}
    SET ${assignments.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND company_id = ?
  `).run(...values, id, companyId);
  return cmsGet(resource, companyId, id);
}

async function cmsDelete(resource, companyId, id) {
  const config = cmsResources[resource];
  const result = PG_ENABLED
    ? await pgQuery(`DELETE FROM ${config.table} WHERE id = $1 AND company_id = $2`, [id, companyId])
    : db.prepare(`DELETE FROM ${config.table} WHERE id = ? AND company_id = ?`).run(id, companyId);
  return PG_ENABLED ? result.rowCount : result.changes;
}

async function handleCmsCreate(req, res, resource) {
  try {
    const row = await cmsCreate(resource, req.cmsCompany.id, req.body || {});
    audit(req.cmsCompany.id, req.user.id, `website_${resource}_created`, String(row.id));
    return jsonOk(res, cmsGenericRow(row));
  } catch (err) {
    console.error(`[website ${resource} create] failed`, { userId: req.user?.id, code: err.code, message: err.message });
    return jsonError(res, err.status || 500, err.status ? err.message : '網站內容新增失敗');
  }
}

async function handleCmsUpdate(req, res, resource) {
  try {
    const row = await cmsUpdate(resource, req.cmsCompany.id, Number(req.params.id), req.body || {});
    if (!row) return jsonError(res, 404, '找不到資料');
    audit(req.cmsCompany.id, req.user.id, `website_${resource}_updated`, String(row.id));
    return jsonOk(res, cmsGenericRow(row));
  } catch (err) {
    console.error(`[website ${resource} update] failed`, { userId: req.user?.id, code: err.code, message: err.message });
    return jsonError(res, err.status || 500, err.status ? err.message : '網站內容更新失敗');
  }
}

async function handleCmsDelete(req, res, resource) {
  try {
    const changes = await cmsDelete(resource, req.cmsCompany.id, Number(req.params.id));
    if (!changes) return jsonError(res, 404, '找不到資料');
    audit(req.cmsCompany.id, req.user.id, `website_${resource}_deleted`, String(req.params.id));
    return jsonOk(res, { deleted: true });
  } catch (err) {
    console.error(`[website ${resource} delete] failed`, { userId: req.user?.id, code: err.code, message: err.message });
    return jsonError(res, 500, '網站內容刪除失敗');
  }
}

app.get('/api/website/settings', auth, cmsCompany, async (req, res) => {
  try {
    const row = await ensureWebsiteSettings(req.cmsCompany);
    return jsonOk(res, cmsSettingsRow(row));
  } catch (err) {
    console.error('[website settings] failed', { userId: req.user?.id, code: err.code, message: err.message });
    return jsonError(res, 500, '網站設定讀取失敗');
  }
});

app.put('/api/website/settings', auth, cmsCompany, requireCmsRole('owner', 'admin'), async (req, res) => {
  try {
    await ensureWebsiteSettings(req.cmsCompany);
    const b = req.body || {};
    const siteSlug = slugify(b.siteSlug ?? b.site_slug ?? req.cmsCompany.name, `company-${req.cmsCompany.id}`);
    await assertSiteSlugAvailable(req.cmsCompany.id, siteSlug);
    const values = [
      siteSlug,
      cmsText(b.siteName ?? b.site_name, req.cmsCompany.name || ''),
      cmsText(b.brandName ?? b.brand_name, req.cmsCompany.name || ''),
      cmsText(b.logoUrl ?? b.logo_url),
      cmsText(b.faviconUrl ?? b.favicon_url),
      cmsText(b.primaryColor ?? b.primary_color, '#2563eb'),
      cmsText(b.secondaryColor ?? b.secondary_color, '#0f172a'),
      cmsText(b.contactEmail ?? b.contact_email),
      cmsText(b.contactPhone ?? b.contact_phone),
      cmsText(b.lineUrl ?? b.line_url),
      cmsText(b.facebookUrl ?? b.facebook_url),
      cmsText(b.instagramUrl ?? b.instagram_url),
      cmsText(b.address),
      cmsText(b.seoTitle ?? b.seo_title),
      cmsText(b.seoDescription ?? b.seo_description),
      cmsBool(b.isPublished ?? b.is_published, 0)
    ];

    if (PG_ENABLED) {
      await pgQuery(`
        UPDATE website_settings
        SET site_slug = $1, site_name = $2, brand_name = $3, logo_url = $4,
            favicon_url = $5, primary_color = $6, secondary_color = $7,
            contact_email = $8, contact_phone = $9, line_url = $10,
            facebook_url = $11, instagram_url = $12, address = $13,
            seo_title = $14, seo_description = $15, is_published = $16,
            updated_at = CURRENT_TIMESTAMP
        WHERE company_id = $17
      `, [...values, req.cmsCompany.id]);
    } else {
      db.prepare(`
        UPDATE website_settings
        SET site_slug = ?, site_name = ?, brand_name = ?, logo_url = ?,
            favicon_url = ?, primary_color = ?, secondary_color = ?,
            contact_email = ?, contact_phone = ?, line_url = ?,
            facebook_url = ?, instagram_url = ?, address = ?,
            seo_title = ?, seo_description = ?, is_published = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE company_id = ?
      `).run(...values, req.cmsCompany.id);
    }

    const row = await ensureWebsiteSettings(req.cmsCompany);
    audit(req.cmsCompany.id, req.user.id, 'website_settings_updated', siteSlug);
    return jsonOk(res, cmsSettingsRow(row));
  } catch (err) {
    console.error('[website settings update] failed', { userId: req.user?.id, code: err.code, message: err.message });
    return jsonError(res, err.status || 500, err.status ? err.message : '網站設定更新失敗');
  }
});

for (const resource of ['banners', 'home-sections', 'products', 'posts', 'faqs']) {
  app.get(`/api/website/${resource}`, auth, cmsCompany, async (req, res) => {
    try {
      const rows = await cmsList(resource, req.cmsCompany.id);
      return jsonOk(res, rows.map(cmsGenericRow));
    } catch (err) {
      console.error(`[website ${resource} list] failed`, { userId: req.user?.id, code: err.code, message: err.message });
      return jsonError(res, 500, '網站內容讀取失敗');
    }
  });
  app.post(`/api/website/${resource}`, auth, cmsCompany, requireCmsRole('owner', 'admin', 'staff'), (req, res) => handleCmsCreate(req, res, resource));
  app.put(`/api/website/${resource}/:id`, auth, cmsCompany, requireCmsRole('owner', 'admin', 'staff'), (req, res) => handleCmsUpdate(req, res, resource));
  app.delete(`/api/website/${resource}/:id`, auth, cmsCompany, requireCmsRole('owner', 'admin'), (req, res) => handleCmsDelete(req, res, resource));
}

app.get('/api/website/inquiries', auth, cmsCompany, async (req, res) => {
  try {
    const sql = `
      SELECT *
      FROM website_inquiries
      WHERE company_id = ${PG_ENABLED ? '$1' : '?'}
      ORDER BY id DESC
    `;
    const rows = PG_ENABLED ? await pgAll(sql, [req.cmsCompany.id]) : db.prepare(sql).all(req.cmsCompany.id);
    return jsonOk(res, rows.map(cmsGenericRow));
  } catch (err) {
    console.error('[website inquiries list] failed', { userId: req.user?.id, code: err.code, message: err.message });
    return jsonError(res, 500, '詢問資料讀取失敗');
  }
});

app.put('/api/website/inquiries/:id/status', auth, cmsCompany, requireCmsRole('owner', 'admin', 'staff'), async (req, res) => {
  try {
    const status = cmsText(req.body?.status, 'read');
    if (!cmsInquiryStatuses.has(status)) return jsonError(res, 400, '詢問狀態不正確');
    const id = Number(req.params.id);
    const result = PG_ENABLED
      ? await pgQuery(`
        UPDATE website_inquiries
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND company_id = $3
      `, [status, id, req.cmsCompany.id])
      : db.prepare(`
        UPDATE website_inquiries
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND company_id = ?
      `).run(status, id, req.cmsCompany.id);
    const changes = PG_ENABLED ? result.rowCount : result.changes;
    if (!changes) return jsonError(res, 404, '找不到資料');
    const row = PG_ENABLED
      ? await pgOne('SELECT * FROM website_inquiries WHERE id = $1 AND company_id = $2', [id, req.cmsCompany.id])
      : db.prepare('SELECT * FROM website_inquiries WHERE id = ? AND company_id = ?').get(id, req.cmsCompany.id);
    return jsonOk(res, cmsGenericRow(row));
  } catch (err) {
    console.error('[website inquiry status] failed', { userId: req.user?.id, code: err.code, message: err.message });
    return jsonError(res, 500, '詢問狀態更新失敗');
  }
});

app.get('/api/website/assets', auth, cmsCompany, async (req, res) => {
  try {
    const sql = `
      SELECT *
      FROM website_assets
      WHERE company_id = ${PG_ENABLED ? '$1' : '?'}
      ORDER BY id DESC
    `;
    const rows = PG_ENABLED ? await pgAll(sql, [req.cmsCompany.id]) : db.prepare(sql).all(req.cmsCompany.id);
    return jsonOk(res, rows.map(cmsGenericRow));
  } catch (err) {
    console.error('[website assets list] failed', { userId: req.user?.id, code: err.code, message: err.message });
    return jsonError(res, 500, '素材資料讀取失敗');
  }
});

app.post('/api/website-assets/upload', auth, cmsCompany, requireCmsRole('owner', 'admin', 'staff'), handleWebsiteAssetUpload, (req, res) => {
  if (!req.file) return jsonError(res, 400, '請選擇要上傳的圖片。');
  const url = `/uploads/website-assets/${req.file.filename}`;
  audit(req.cmsCompany.id, req.user.id, 'website_asset_file_uploaded', req.file.filename);
  return res.json({ url });
});

app.post('/api/website/assets', auth, cmsCompany, requireCmsRole('owner', 'admin', 'staff'), async (req, res) => {
  try {
    const b = req.body || {};
    const fileUrl = cmsText(b.fileUrl ?? b.file_url);
    if (!fileUrl) return jsonError(res, 400, '請輸入圖片 URL');
    const module = cmsText(b.module, 'general');
    const data = {
      file_url: fileUrl,
      file_name: cmsText(b.fileName ?? b.file_name),
      file_type: cmsText(b.fileType ?? b.file_type, 'image'),
      file_size: cmsNumber(b.fileSize ?? b.file_size, 0),
      module: cmsAssetModules.has(module) ? module : 'general'
    };

    const row = PG_ENABLED
      ? await pgOne(`
        INSERT INTO website_assets (
          company_id, file_url, file_name, file_type, file_size, module, created_by, created_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP)
        RETURNING *
      `, [req.cmsCompany.id, data.file_url, data.file_name, data.file_type, data.file_size, data.module, req.user.id])
      : (() => {
        const result = db.prepare(`
          INSERT INTO website_assets (
            company_id, file_url, file_name, file_type, file_size, module, created_by, created_at
          )
          VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
        `).run(req.cmsCompany.id, data.file_url, data.file_name, data.file_type, data.file_size, data.module, req.user.id);
        return db.prepare('SELECT * FROM website_assets WHERE id = ? AND company_id = ?').get(result.lastInsertRowid, req.cmsCompany.id);
      })();

    audit(req.cmsCompany.id, req.user.id, 'website_asset_created', String(row.id));
    return jsonOk(res, cmsGenericRow(row));
  } catch (err) {
    console.error('[website assets create] failed', { userId: req.user?.id, code: err.code, message: err.message });
    return jsonError(res, 500, '素材新增失敗');
  }
});

app.delete('/api/website/assets/:id', auth, cmsCompany, requireCmsRole('owner', 'admin', 'staff'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = PG_ENABLED
      ? await pgQuery('DELETE FROM website_assets WHERE id = $1 AND company_id = $2', [id, req.cmsCompany.id])
      : db.prepare('DELETE FROM website_assets WHERE id = ? AND company_id = ?').run(id, req.cmsCompany.id);
    const changes = PG_ENABLED ? result.rowCount : result.changes;
    if (!changes) return jsonError(res, 404, '找不到素材');
    audit(req.cmsCompany.id, req.user.id, 'website_asset_deleted', String(id));
    return jsonOk(res, { deleted: true });
  } catch (err) {
    console.error('[website assets delete] failed', { userId: req.user?.id, code: err.code, message: err.message });
    return jsonError(res, 500, '素材刪除失敗');
  }
});

app.get('/api/public/sites/:slug', async (req, res) => {
  try {
    const candidate = await getPublicSiteCandidate(req.params.slug);
    if (!candidate) return jsonError(res, 404, '找不到網站');
    if (Number(candidate.is_published || 0) !== 1) return jsonError(res, 403, '網站尚未開放');
    const site = candidate;
    const [banners, sections, faqs] = await Promise.all([
      PG_ENABLED
        ? pgAll('SELECT * FROM website_banners WHERE company_id = $1 AND is_active = 1 ORDER BY sort_order ASC, id DESC', [site.company_id])
        : db.prepare('SELECT * FROM website_banners WHERE company_id = ? AND is_active = 1 ORDER BY sort_order ASC, id DESC').all(site.company_id),
      PG_ENABLED
        ? pgAll('SELECT * FROM website_home_sections WHERE company_id = $1 AND is_active = 1 ORDER BY sort_order ASC, id DESC', [site.company_id])
        : db.prepare('SELECT * FROM website_home_sections WHERE company_id = ? AND is_active = 1 ORDER BY sort_order ASC, id DESC').all(site.company_id),
      PG_ENABLED
        ? pgAll('SELECT * FROM website_faqs WHERE company_id = $1 AND is_active = 1 ORDER BY sort_order ASC, id DESC', [site.company_id])
        : db.prepare('SELECT * FROM website_faqs WHERE company_id = ? AND is_active = 1 ORDER BY sort_order ASC, id DESC').all(site.company_id)
    ]);
    return jsonOk(res, {
      settings: publicSettingsRow(site),
      banners: banners.map(publicCmsRow),
      homeSections: sections.map(publicCmsRow),
      faqs: faqs.map(publicCmsRow)
    });
  } catch (err) {
    console.error('[public site] failed', { slug: req.params.slug, code: err.code, message: err.message });
    return jsonError(res, 500, '網站資料讀取失敗');
  }
});

app.get('/api/public/sites/:slug/products', async (req, res) => {
  try {
    const site = await getPublicSite(req.params.slug);
    if (!site) return jsonError(res, 404, '找不到網站');
    const rows = PG_ENABLED
      ? await pgAll("SELECT * FROM website_products WHERE company_id = $1 AND status = 'published' ORDER BY sort_order ASC, id DESC", [site.company_id])
      : db.prepare("SELECT * FROM website_products WHERE company_id = ? AND status = 'published' ORDER BY sort_order ASC, id DESC").all(site.company_id);
    return jsonOk(res, rows.map(publicCmsRow));
  } catch (err) {
    console.error('[public products] failed', { slug: req.params.slug, code: err.code, message: err.message });
    return jsonError(res, 500, '商品資料讀取失敗');
  }
});

app.get('/api/public/sites/:slug/products/:productSlug', async (req, res) => {
  try {
    const site = await getPublicSite(req.params.slug);
    if (!site) return jsonError(res, 404, '找不到網站');
    const productSlug = slugify(req.params.productSlug, '');
    const row = PG_ENABLED
      ? await pgOne("SELECT * FROM website_products WHERE company_id = $1 AND slug = $2 AND status = 'published'", [site.company_id, productSlug])
      : db.prepare("SELECT * FROM website_products WHERE company_id = ? AND slug = ? AND status = 'published'").get(site.company_id, productSlug);
    if (!row) return jsonError(res, 404, '找不到商品');
    return jsonOk(res, publicCmsRow(row));
  } catch (err) {
    console.error('[public product detail] failed', { slug: req.params.slug, code: err.code, message: err.message });
    return jsonError(res, 500, '商品資料讀取失敗');
  }
});

app.get('/api/public/sites/:slug/posts', async (req, res) => {
  try {
    const site = await getPublicSite(req.params.slug);
    if (!site) return jsonError(res, 404, '找不到網站');
    const rows = PG_ENABLED
      ? await pgAll("SELECT * FROM website_posts WHERE company_id = $1 AND status = 'published' ORDER BY COALESCE(published_at, created_at) DESC, id DESC", [site.company_id])
      : db.prepare("SELECT * FROM website_posts WHERE company_id = ? AND status = 'published' ORDER BY COALESCE(published_at, created_at) DESC, id DESC").all(site.company_id);
    return jsonOk(res, rows.map(publicCmsRow));
  } catch (err) {
    console.error('[public posts] failed', { slug: req.params.slug, code: err.code, message: err.message });
    return jsonError(res, 500, '文章資料讀取失敗');
  }
});

app.get('/api/public/sites/:slug/posts/:postSlug', async (req, res) => {
  try {
    const site = await getPublicSite(req.params.slug);
    if (!site) return jsonError(res, 404, '找不到網站');
    const postSlug = slugify(req.params.postSlug, '');
    const row = PG_ENABLED
      ? await pgOne("SELECT * FROM website_posts WHERE company_id = $1 AND slug = $2 AND status = 'published'", [site.company_id, postSlug])
      : db.prepare("SELECT * FROM website_posts WHERE company_id = ? AND slug = ? AND status = 'published'").get(site.company_id, postSlug);
    if (!row) return jsonError(res, 404, '找不到文章');
    return jsonOk(res, publicCmsRow(row));
  } catch (err) {
    console.error('[public post detail] failed', { slug: req.params.slug, code: err.code, message: err.message });
    return jsonError(res, 500, '文章資料讀取失敗');
  }
});

app.get('/api/public/sites/:slug/faqs', async (req, res) => {
  try {
    const site = await getPublicSite(req.params.slug);
    if (!site) return jsonError(res, 404, '找不到網站');
    const rows = PG_ENABLED
      ? await pgAll('SELECT * FROM website_faqs WHERE company_id = $1 AND is_active = 1 ORDER BY sort_order ASC, id DESC', [site.company_id])
      : db.prepare('SELECT * FROM website_faqs WHERE company_id = ? AND is_active = 1 ORDER BY sort_order ASC, id DESC').all(site.company_id);
    return jsonOk(res, rows.map(publicCmsRow));
  } catch (err) {
    console.error('[public faqs] failed', { slug: req.params.slug, code: err.code, message: err.message });
    return jsonError(res, 500, 'FAQ 資料讀取失敗');
  }
});

app.post('/api/public/sites/:slug/inquiries', rateLimit({ windowMs: 60 * 1000, max: 20 }), async (req, res) => {
  try {
    const site = await getPublicSite(req.params.slug);
    if (!site) return jsonError(res, 404, '找不到網站');
    const b = req.body || {};
    const message = cmsText(b.message);
    if (!message) return jsonError(res, 400, '請輸入詢問內容');
    if (PG_ENABLED) {
      await pgQuery(`
        INSERT INTO website_inquiries (company_id, name, email, phone, message, source_page, status, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,'new',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      `, [site.company_id, cmsText(b.name), cmsText(b.email), cmsText(b.phone), message, cmsText(b.sourcePage ?? b.source_page)]);
    } else {
      db.prepare(`
        INSERT INTO website_inquiries (company_id, name, email, phone, message, source_page, status, created_at, updated_at)
        VALUES (?,?,?,?,?,?,'new',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      `).run(site.company_id, cmsText(b.name), cmsText(b.email), cmsText(b.phone), message, cmsText(b.sourcePage ?? b.source_page));
    }
    return jsonOk(res, { received: true });
  } catch (err) {
    console.error('[public inquiry] failed', { slug: req.params.slug, code: err.code, message: err.message });
    return jsonError(res, 500, '詢問送出失敗');
  }
});

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
        c.beta_status,
        c.is_free_beta,
        c.beta_group,
        c.beta_limit_group,
        c.product_line,
        c.industry_type,
        c.beta_approved_at,
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
      c.beta_status,
      c.is_free_beta,
      c.beta_group,
      c.beta_limit_group,
      c.product_line,
      c.industry_type,
      c.beta_approved_at,
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

app.get('/api/admin/companies/:companyId/features', auth, requireAdmin, async (req, res) => {
  const companyId = Number(req.params.companyId);

  if (!companyId) {
    return res.status(400).json({ error: '缺少 companyId' });
  }

  try {
    const companyRow = PG_ENABLED
      ? await pgOne('SELECT * FROM companies WHERE id = $1', [companyId])
      : db.prepare(`
        SELECT *
        FROM companies
        WHERE id = ?
      `).get(companyId);

    if (!companyRow) {
      return res.status(404).json({ error: '找不到公司' });
    }

    const overrideRows = PG_ENABLED
      ? await pgAll(`
        SELECT feature_key, enabled, note, updated_at
        FROM company_feature_overrides
        WHERE company_id = $1
      `, [companyId])
      : getCompanyFeatureOverrides(companyId);

    const overrides = overrideRows.reduce((acc, row) => {
      acc[row.feature_key] = {
        enabled: Number(row.enabled) === 1,
        note: row.note || '',
        updatedAt: row.updated_at || ''
      };
      return acc;
    }, {});

    const effectiveFeatures = getEffectiveFeatures(companyRow);
    if (PG_ENABLED) {
      overrideRows.forEach((row) => {
        if (!FEATURE_KEYS.has(row.feature_key)) return;
        const hasFeature = effectiveFeatures.includes(row.feature_key);
        if (Number(row.enabled) === 1 && !hasFeature) effectiveFeatures.push(row.feature_key);
        if (Number(row.enabled) !== 1 && hasFeature) {
          effectiveFeatures.splice(effectiveFeatures.indexOf(row.feature_key), 1);
        }
      });
    }

    res.json({
      companyId,
      plan: companyRow.plan,
      effectiveFeatures,
      overrides
    });
  } catch (err) {
    console.error('[admin company features] failed', {
      route: req.path,
      userId: req.user?.id,
      companyId,
      code: err.code,
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: '功能授權資料讀取失敗', code: 'DATABASE_ERROR' });
  }
});

app.put('/api/admin/companies/:companyId/features', auth, requireAdmin, async (req, res) => {
  const companyId = Number(req.params.companyId);
  const { features = {}, note = '' } = req.body || {};

  if (!companyId) {
    return res.status(400).json({ error: '缺少 companyId' });
  }

  try {
    const companyRow = PG_ENABLED
      ? await pgOne('SELECT id FROM companies WHERE id = $1', [companyId])
      : db.prepare(`
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

    if (PG_ENABLED) {
      for (const [key, enabled] of entries) {
        await pgQuery(`
          INSERT INTO company_feature_overrides (
            company_id,
            feature_key,
            enabled,
            note,
            updated_at
          )
          VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP)
          ON CONFLICT(company_id, feature_key)
          DO UPDATE SET
            enabled = EXCLUDED.enabled,
            note = EXCLUDED.note,
            updated_at = CURRENT_TIMESTAMP
        `, [companyId, key, toAdminBoolean(enabled), String(note || '系統管理員調整')]);
      }
    } else {
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
    }

    audit(companyId, req.user.id, 'admin_feature_access_updated', JSON.stringify(
      Object.fromEntries(entries.map(([key, enabled]) => [key, Boolean(Number(enabled) || enabled === true)]))
    ));

    const overrideRows = PG_ENABLED
      ? await pgAll('SELECT feature_key, enabled FROM company_feature_overrides WHERE company_id = $1', [companyId])
      : getCompanyFeatureOverrides(companyId);

    res.json({
      ok: true,
      companyId,
      overrides: overrideRows.reduce((acc, row) => {
        acc[row.feature_key] = Number(row.enabled) === 1;
        return acc;
      }, {})
    });
  } catch (err) {
    console.error('[admin company features update] failed', {
      route: req.path,
      userId: req.user?.id,
      companyId,
      code: err.code,
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: '功能授權資料更新失敗', code: 'DATABASE_ERROR' });
  }
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

app.get('/api/beta/support', auth, async (req, res) => {
  try {
    const key = 'official_line_url';
    const row = PG_ENABLED
      ? await pgOne('SELECT value FROM platform_settings WHERE key = $1', [key])
      : db.prepare('SELECT value FROM platform_settings WHERE key = ?').get(key);

    res.json({
      officialLineUrl: String(row?.value || '').trim()
    });
  } catch (err) {
    console.error('[beta support] failed', { userId: req.user?.id, code: err.code, message: err.message });
    res.status(500).json({ error: '封測支援資訊讀取失敗', code: 'DATABASE_ERROR' });
  }
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

app.post('/api/admin/demo/engineering', auth, requireAdmin, async (req, res) => {
  try {
    const { prepareEngineeringDemo } = await import('../scripts/prepare-engineering-demo.js');
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

app.get('/api/feedbacks/my', auth, company, async (req, res) => {
  try {
    const rows = PG_ENABLED
      ? await pgAll(`
        SELECT
          f.*,
          c.name AS company_name,
          u.name AS user_name,
          u.email AS user_email
        FROM feedbacks f
        LEFT JOIN companies c ON c.id = f.company_id
        LEFT JOIN users u ON u.id = f.user_id
        WHERE f.company_id = $1
        ORDER BY f.created_at DESC, f.id DESC
      `, [req.company.id])
      : db.prepare(`
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
  } catch (err) {
    console.error('[feedbacks] failed', {
      route: req.path,
      userId: req.user?.id,
      companyId: req.company?.id,
      code: err.code,
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: '回饋資料讀取失敗，請稍後再試。', code: 'DATABASE_ERROR' });
  }
});

app.post('/api/feedbacks/create', auth, company, async (req, res) => {
  const body = req.body || {};
  const description = String(body.description || body.message || '').trim();
  const expectedResult = String(body.expectedResult || body.expected_result || '').trim();
  const actualResult = String(body.actualResult || body.actual_result || '').trim();
  const contact = String(body.contact || '').trim();
  const page = String(body.page || '').trim();

  if (!description) return res.status(400).json({ error: '請填寫問題描述' });
  if (!page) return res.status(400).json({ error: '請填寫所在頁面' });
  if ((body.expectedResult !== undefined || body.expected_result !== undefined) && !expectedResult) {
    return res.status(400).json({ error: '請填寫預期結果' });
  }
  if ((body.actualResult !== undefined || body.actual_result !== undefined) && !actualResult) {
    return res.status(400).json({ error: '請填寫實際結果' });
  }

  const message = expectedResult || actualResult || contact
    ? [
        `問題描述：${description}`,
        `預期結果：${expectedResult || '未提供'}`,
        `實際結果：${actualResult || '未提供'}`,
        `聯絡方式：${contact || '未提供'}`
      ].join('\n')
    : description;

  const category = feedbackCategories.has(body.category) ? body.category : '其他';
  const rating = normalizeRating(body.rating);

  try {
    let created;

    if (PG_ENABLED) {
      const row = await pgOne(`
        INSERT INTO feedbacks (
          company_id,
          user_id,
          category,
          rating,
          message,
          page,
          status
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING id
      `, [req.company.id, req.user.id, category, rating, message, page, 'new']);

      audit(req.company.id, req.user.id, 'feedback_created', String(row.id));

      created = await pgOne(`
        SELECT
          f.*,
          c.name AS company_name,
          u.name AS user_name,
          u.email AS user_email
        FROM feedbacks f
        LEFT JOIN companies c ON c.id = f.company_id
        LEFT JOIN users u ON u.id = f.user_id
        WHERE f.id = $1
          AND f.company_id = $2
      `, [row.id, req.company.id]);
    } else {
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

      created = db.prepare(`
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
    }

    res.json(feedbackRow(created));
  } catch (err) {
    console.error('[feedback create] failed', {
      route: req.path,
      userId: req.user?.id,
      companyId: req.company?.id,
      code: err.code,
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: '回饋送出失敗，請稍後再試。', code: 'DATABASE_ERROR' });
  }
});

app.get('/api/admin/feedbacks', auth, requireAdmin, async (req, res) => {
  try {
    const status = String(req.query.status || '').trim();
    const category = String(req.query.category || '').trim();

    if (PG_ENABLED) {
      const where = [];
      const params = [];

      if (status && feedbackStatuses.has(status)) {
        params.push(status);
        where.push(`f.status = $${params.length}`);
      }

      if (category && feedbackCategories.has(category)) {
        params.push(category);
        where.push(`f.category = $${params.length}`);
      }

      const rows = await pgAll(`
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
      `, params);

      return res.json(rows.map(feedbackRow));
    }

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
  } catch (err) {
    console.error('[admin feedbacks] failed', {
      route: req.path,
      userId: req.user?.id,
      code: err.code,
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: '產品回饋資料讀取失敗', code: 'DATABASE_ERROR' });
  }
});

app.put('/api/admin/feedbacks/:id', auth, requireAdmin, async (req, res) => {
  const feedbackId = Number(req.params.id);
  const body = req.body || {};
  const status = feedbackStatuses.has(body.status) ? body.status : null;

  if (!feedbackId) return res.status(400).json({ error: '缺少 feedback id' });
  if (!status) return res.status(400).json({ error: '不支援的回饋狀態' });

  try {
    const existing = PG_ENABLED
      ? await pgOne('SELECT * FROM feedbacks WHERE id = $1', [feedbackId])
      : db.prepare('SELECT * FROM feedbacks WHERE id = ?').get(feedbackId);
    if (!existing) return res.status(404).json({ error: '找不到回饋' });

    if (PG_ENABLED) {
      await pgQuery(`
        UPDATE feedbacks
        SET
          status = $1,
          admin_note = $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [status, body.admin_note || body.adminNote || '', feedbackId]);
    } else {
      db.prepare(`
        UPDATE feedbacks
        SET
          status = ?,
          admin_note = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(status, body.admin_note || body.adminNote || '', feedbackId);
    }

    audit(existing.company_id, req.user.id, 'admin_feedback_updated', JSON.stringify({
      feedbackId,
      status
    }));

    const updated = PG_ENABLED
      ? await pgOne(`
        SELECT
          f.*,
          c.name AS company_name,
          u.name AS user_name,
          u.email AS user_email
        FROM feedbacks f
        LEFT JOIN companies c ON c.id = f.company_id
        LEFT JOIN users u ON u.id = f.user_id
        WHERE f.id = $1
      `, [feedbackId])
      : db.prepare(`
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
  } catch (err) {
    console.error('[admin feedback update] failed', {
      route: req.path,
      userId: req.user?.id,
      feedbackId,
      code: err.code,
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: '產品回饋資料更新失敗', code: 'DATABASE_ERROR' });
  }
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
    method: req.method,
    route,
    userId: req.user?.id,
    companyId: req.company?.id,
    code: err?.code,
    message: err?.message
  });
  return res.status(500).json({ error: '資料暫時無法載入，請稍後再試或聯繫 BookAI 官方客服', code: 'DATABASE_ERROR' });
}

function inferProductLine(industry = '') {
  const value = String(industry || '').trim();
  if ([
    'construction',
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
  ].includes(value)) return 'engineering';
  if (['ecommerce', 'hosted_commerce', 'marketplace', 'social_commerce'].includes(value)) return 'commerce';
  if (value === 'restaurant' || value === 'food') return 'restaurant';
  if (value === 'beverage') return 'beverage';
  if (value === 'retail') return 'retail';
  if (value === 'studio' || value === 'service') return 'studio';
  if (value === 'accounting_firm') return 'accountant';
  return 'general';
}

async function getFounderTestEditionForRequest(req) {
  if (!isFounderEmail(req.user?.email)) return '';
  try {
    await ensureFounderTestEditionStorage();
    const row = PG_ENABLED
      ? await pgOne(`SELECT test_edition FROM users WHERE id = $1`, [req.user.id])
      : db.prepare(`SELECT test_edition FROM users WHERE id = ?`).get(req.user.id);
    return normalizeFounderTestEdition(row?.test_edition) || DEFAULT_FOUNDER_TEST_EDITION;
  } catch {
    return DEFAULT_FOUNDER_TEST_EDITION;
  }
}

async function getAiEditionForRequest(req) {
  const founderEdition = await getFounderTestEditionForRequest(req);
  if (founderEdition) return founderEdition;

  const productLine = String(req.company?.product_line || req.company?.productLine || '').trim().toLowerCase();
  if (['engineering', 'commerce', 'restaurant', 'food', 'dining', 'beverage', 'all'].includes(productLine)) {
    if (['food', 'dining', 'beverage'].includes(productLine)) return 'restaurant';
    return productLine;
  }

  const industry = String(req.company?.industry_type || req.company?.industry || '').trim().toLowerCase();
  const inferred = inferProductLine(industry);
  if (inferred === 'engineering') return 'engineering';
  if (['restaurant', 'food', 'beverage'].includes(inferred) || ['restaurant', 'food', 'dining', 'beverage'].includes(industry)) return 'restaurant';
  if (inferred === 'commerce' || ['ecommerce', 'hosted_commerce', 'marketplace', 'social_commerce', 'retail'].includes(industry)) return 'commerce';
  return 'commerce';
}

function allowedAiUseCasesForEdition(edition) {
  if (edition === 'all') {
    return new Set([
      'engineering_estimate_draft',
      'tender_summary',
      'cms_copy_draft',
      'commerce_product_copy',
      'business_summary'
    ]);
  }
  if (edition === 'engineering') {
    return new Set(['engineering_estimate_draft', 'tender_summary', 'business_summary']);
  }
  if (edition === 'restaurant') {
    return new Set(['commerce_product_copy', 'cms_copy_draft', 'business_summary']);
  }
  return new Set(['commerce_product_copy', 'cms_copy_draft', 'business_summary']);
}

async function requireAiUseCaseAllowed(req, res, next) {
  const useCase = String(req.body?.useCase || '').trim();
  const edition = await getAiEditionForRequest(req);
  const allowed = allowedAiUseCasesForEdition(edition);

  if (!allowed.has(useCase)) {
    audit(
      req.company.id,
      req.user.id,
      'ai_draft_forbidden',
      JSON.stringify({ useCase, edition })
    );
    return res.status(403).json({
      ok: false,
      code: 'AI_USE_CASE_FORBIDDEN',
      error: '此 AI 功能不適用於目前版本'
    });
  }

  req.aiEdition = edition;
  next();
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

const tenderDefaultKeywords = [
  ['工程', '工程', 'engineering'],
  ['修繕', '修繕', 'engineering'],
  ['裝修', '裝修', 'engineering'],
  ['裝潢', '裝修', 'engineering'],
  ['水電', '水電', 'engineering'],
  ['冷氣', '空調', 'engineering'],
  ['空調', '空調', 'engineering'],
  ['機電', '機電', 'engineering'],
  ['消防', '消防', 'engineering'],
  ['防水', '防水', 'engineering'],
  ['油漆', '油漆', 'engineering'],
  ['木作', '裝修', 'engineering'],
  ['室內裝修', '裝修', 'engineering'],
  ['土木', '土木', 'engineering'],
  ['營造', '營造', 'engineering'],
  ['維修', '維修', 'engineering'],
  ['保養', '維修', 'engineering'],
  ['設備', '設備', 'engineering'],
  ['管線', '水電', 'engineering'],
  ['弱電', '弱電', 'engineering'],
  ['監視器', '弱電', 'engineering'],
  ['照明', '水電', 'engineering'],
  ['屋頂', '防水', 'engineering'],
  ['外牆', '修繕', 'engineering'],
  ['地坪', '土木', 'engineering'],
  ['門窗', '裝修', 'engineering']
];

const tenderRegions = ['全國', '台北', '新北', '桃園', '台中', '台南', '高雄', '宜蘭', '新竹', '苗栗', '彰化', '南投', '雲林', '嘉義', '屏東', '花蓮', '台東', '澎湖', '金門', '連江', '其他'];
let tenderSyncRunning = false;
let lastTenderSyncState = {
  status: 'idle',
  finishedAt: null,
  insertedCount: 0,
  updatedCount: 0,
  errorMessage: ''
};
const TENDER_DAILY_SYNC_MS = 24 * 60 * 60 * 1000;

function tenderRow(row = {}) {
  return {
    id: row.id,
    source: row.source || '',
    sourceTenderId: row.source_tender_id || '',
    tenderNo: row.tender_no || '',
    tenderName: row.tender_name || '',
    title: row.tender_name || '',
    agencyName: row.agency_name || '',
    agency: row.agency_name || '',
    agencyCode: row.agency_code || '',
    agencyLevel: row.agency_level || 'other',
    agencyType: tenderAgencyLevelLabel(row.agency_level),
    region: row.region || '其他',
    category: row.category || '工程',
    projectType: row.category || '工程',
    procurementType: row.procurement_type || '',
    tenderType: row.tender_type || '',
    announcementType: row.announcement_type || '',
    budgetAmount: Number(row.budget_amount || 0),
    budget: Number(row.budget_amount || 0),
    awardAmount: Number(row.award_amount || 0),
    publishDate: row.publish_date || '',
    deadlineDate: row.deadline_date || '',
    deadline: row.deadline_date || '',
    openingDate: row.opening_date || '',
    status: row.status || '',
    url: row.url || '',
    sourceUrl: row.url || '',
    summary: row.raw_payload ? safeTenderSummary(row.raw_payload, row.tender_name) : `${row.agency_name || '公開機關'}：${row.tender_name || '標案資料'}`,
    reason: row.keyword ? `命中關鍵字：${row.keyword}` : '依公開標案欄位整理，請進一步評估預算、地區與履約條件。',
    fitScore: Number(row.score || 70),
    estimatedCost: Math.round(Number(row.budget_amount || 0) * 0.72),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at
  };
}

function safeTenderSummary(rawPayload, fallback) {
  try {
    const data = JSON.parse(rawPayload);
    return data.summary || data.description || fallback || '公開標案資料';
  } catch {
    return String(rawPayload || fallback || '公開標案資料').slice(0, 180);
  }
}

function tenderAgencyLevelLabel(level) {
  const labels = {
    central: '中央部會',
    local: '地方政府',
    public_school: '學校機關',
    public_enterprise: '公營事業',
    other: '其他機關'
  };
  return labels[level] || labels.other;
}

function inferTenderRegion(text = '') {
  const value = String(text || '');
  return tenderRegions.find((region) => region !== '全國' && region !== '其他' && value.includes(region)) || (value.includes('全國') ? '全國' : '其他');
}

function inferTenderAgencyLevel(text = '') {
  const value = String(text || '');
  if (/教育部|經濟部|交通部|內政部|行政院|農業部|國防部|財政部/.test(value)) return 'central';
  if (/市政府|縣政府|區公所|鄉公所|鎮公所|工務局|交通局|水利局|環保局/.test(value)) return 'local';
  if (/學校|國小|國中|高中|大學|學院/.test(value)) return 'public_school';
  if (/台電|中油|台水|自來水|港務|郵政|鐵路/.test(value)) return 'public_enterprise';
  return 'other';
}

function normalizeTenderSourceValue(value = '') {
  const text = String(value || '').toLowerCase();
  if (text.includes('local')) return 'local_government';
  if (text.includes('procurement') || text.includes('pcc')) return 'government_procurement';
  if (text.includes('manual')) return 'manual_import';
  if (text.includes('fallback')) return 'fallback_snapshot';
  return text || 'official_open_data';
}

function normalizeTenderItem(raw = {}, source = 'official_open_data') {
  const tenderName = raw.tender_name || raw.tenderName || raw.title || raw.name || raw.subject || '';
  const agencyName = raw.agency_name || raw.agencyName || raw.agency || raw.unit || raw.org_name || '';
  const sourceTenderId = String(raw.source_tender_id || raw.sourceTenderId || raw.id || raw.tender_no || raw.tenderNo || `${source}-${tenderName}-${agencyName}`).slice(0, 220);
  const region = raw.region || inferTenderRegion(`${agencyName} ${tenderName}`);
  const category = raw.category || tenderDefaultKeywords.find(([keyword]) => tenderName.includes(keyword))?.[1] || '工程';
  const agencyLevel = raw.agency_level || raw.agencyLevel || inferTenderAgencyLevel(agencyName);
  return {
    source: normalizeTenderSourceValue(source),
    sourceTenderId,
    tenderNo: raw.tender_no || raw.tenderNo || '',
    tenderName: tenderName || '未命名標案',
    agencyName,
    agencyCode: raw.agency_code || raw.agencyCode || '',
    agencyLevel,
    region,
    category,
    procurementType: raw.procurement_type || raw.procurementType || '工程類採購',
    tenderType: raw.tender_type || raw.tenderType || '',
    announcementType: raw.announcement_type || raw.announcementType || '招標公告',
    budgetAmount: Math.max(0, Number(raw.budget_amount ?? raw.budgetAmount ?? raw.budget ?? 0) || 0),
    awardAmount: Math.max(0, Number(raw.award_amount ?? raw.awardAmount ?? 0) || 0),
    publishDate: raw.publish_date || raw.publishDate || new Date().toISOString().slice(0, 10),
    deadlineDate: raw.deadline_date || raw.deadlineDate || '',
    openingDate: raw.opening_date || raw.openingDate || '',
    status: raw.status || '公開中',
    url: raw.url || raw.link || '',
    rawPayload: JSON.stringify(raw)
  };
}

function fallbackTenderRows() {
  const agencies = [
    ['台北市政府工務局', 'local', '台北'],
    ['新北市政府採購處', 'local', '新北'],
    ['桃園市政府水務局', 'local', '桃園'],
    ['台中市政府建設局', 'local', '台中'],
    ['台南市政府工務局', 'local', '台南'],
    ['高雄市政府工務局', 'local', '高雄'],
    ['宜蘭縣政府', 'local', '宜蘭'],
    ['交通部公路局', 'central', '全國'],
    ['經濟部水利署', 'central', '全國'],
    ['台灣電力股份有限公司', 'public_enterprise', '全國'],
    ['國立台灣大學', 'public_school', '台北'],
    ['彰化縣政府', 'local', '彰化']
  ];
  const topics = [
    ['校舍教室油漆與修繕工程', '油漆', 980000],
    ['辦公區水電照明設備汰換', '水電', 1350000],
    ['抽水站機電設備保養維修', '機電', 2680000],
    ['屋頂防水層與外牆修繕', '防水', 1860000],
    ['冷氣空調設備汰換與保養', '空調', 2250000],
    ['弱電監視器與網路管線改善', '弱電', 1180000],
    ['道路照明與交通安全改善', '照明', 3200000],
    ['公共空間室內裝修改善', '裝修', 2100000],
    ['排水溝渠清淤與護岸修繕', '土木', 3600000],
    ['消防設備改善工程', '消防', 1750000]
  ];
  const today = new Date();
  return agencies.flatMap(([agency, level, region], agencyIndex) => topics.slice(0, 4).map(([name, category, base], topicIndex) => {
    const publish = new Date(today);
    publish.setDate(today.getDate() - ((agencyIndex + topicIndex) % 14));
    const deadline = new Date(today);
    deadline.setDate(today.getDate() + 7 + ((agencyIndex * 3 + topicIndex) % 24));
    return normalizeTenderItem({
      id: `${agencyIndex + 1}-${topicIndex + 1}`,
      tender_no: `BKAI-${String(agencyIndex + 1).padStart(2, '0')}${String(topicIndex + 1).padStart(2, '0')}`,
      tender_name: `${region}${name}`,
      agency_name: agency,
      agency_level: level,
      region,
      category,
      budget_amount: base + agencyIndex * 130000 + topicIndex * 65000,
      publish_date: publish.toISOString().slice(0, 10),
      deadline_date: deadline.toISOString().slice(0, 10),
      announcement_type: topicIndex % 3 === 0 ? '更正公告' : '招標公告',
      status: '公開中',
      summary: '系統內建公開標案格式快照；正式環境可設定官方開放資料來源 URL 進行同步。',
      url: 'https://web.pcc.gov.tw/'
    }, 'fallback_snapshot');
  }));
}

async function fetchTenderAdapter(url, source) {
  if (!url) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const rows = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : Array.isArray(data.records) ? data.records : [];
    return rows.map((item) => normalizeTenderItem(item, source));
  } finally {
    clearTimeout(timer);
  }
}

async function ensureTenderKeywords(client = null) {
  if (PG_ENABLED) {
    const executor = client || await getPool();
    for (const [keyword, category, productLine] of tenderDefaultKeywords) {
      await executor.query(`
        INSERT INTO tender_keywords (keyword, category, product_line, enabled)
        VALUES ($1,$2,$3,1)
        ON CONFLICT (keyword) DO NOTHING
      `, [keyword, category, productLine]);
    }
    const result = await executor.query('SELECT keyword, category, product_line FROM tender_keywords WHERE enabled = 1 ORDER BY id');
    return result.rows;
  }

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO tender_keywords (keyword, category, product_line, enabled)
    VALUES (?,?,?,1)
  `);
  tenderDefaultKeywords.forEach((row) => stmt.run(...row));
  return db.prepare('SELECT keyword, category, product_line FROM tender_keywords WHERE enabled = 1 ORDER BY id').all();
}

function computeTenderMatch(tender, keywords) {
  const text = `${tender.tenderName} ${tender.agencyName} ${tender.category} ${tender.region}`.toLowerCase();
  const matched = keywords.filter((row) => text.includes(String(row.keyword || '').toLowerCase()));
  if (!matched.length) return { keyword: '', score: 62, reason: '未命中工程關鍵字，仍保留供人工判斷' };
  const first = matched[0];
  const score = Math.min(96, 68 + matched.length * 7 + (tender.budgetAmount > 1500000 ? 8 : 0));
  return {
    keyword: first.keyword,
    score,
    reason: `命中 ${matched.map((row) => row.keyword).slice(0, 4).join('、')}`
  };
}

function nextTenderSyncTime(value = new Date()) {
  const base = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(base.getTime())) {
    return new Date(Date.now() + TENDER_DAILY_SYNC_MS).toISOString();
  }
  return new Date(base.getTime() + TENDER_DAILY_SYNC_MS).toISOString();
}

async function latestTenderSyncRun() {
  if (PG_ENABLED) {
    return pgOne('SELECT * FROM tender_sync_runs ORDER BY finished_at DESC NULLS LAST, started_at DESC, id DESC LIMIT 1');
  }
  return db.prepare('SELECT * FROM tender_sync_runs ORDER BY COALESCE(finished_at, started_at) DESC, id DESC LIMIT 1').get() || null;
}

async function shouldRunDailyTenderSync() {
  const latest = await latestTenderSyncRun();
  const finishedAt = latest?.finished_at || latest?.finishedAt || latest?.started_at || latest?.startedAt;
  if (!finishedAt) return true;
  const time = new Date(finishedAt).getTime();
  if (Number.isNaN(time)) return true;
  return Date.now() - time >= TENDER_DAILY_SYNC_MS;
}

function tenderSyncStateRow(row = null, latestRun = null) {
  const lastSyncedAt = row?.last_synced_at || latestRun?.finished_at || latestRun?.finishedAt || '';
  const nextSuggestedSyncAt = row?.next_suggested_sync_at || (lastSyncedAt ? nextTenderSyncTime(lastSyncedAt) : '');
  const status = row?.status || (lastSyncedAt ? (latestRun?.status || 'success') : 'not_started');
  const lastTime = lastSyncedAt ? new Date(lastSyncedAt).getTime() : 0;
  const todayUpdated = lastTime > 0 && new Date(lastTime).toDateString() === new Date().toDateString();
  const updateRecommended = !lastTime || Date.now() - lastTime >= TENDER_DAILY_SYNC_MS;

  return {
    status,
    lastSyncedAt,
    nextSuggestedSyncAt,
    todayUpdated,
    updateRecommended,
    running: tenderSyncRunning,
    errorMessage: row?.error_message || latestRun?.error_message || '',
    latestRun: latestRun || null
  };
}

async function getTenderRadarSyncState(companyId) {
  const [state, latestRun] = PG_ENABLED
    ? await Promise.all([
        pgOne('SELECT * FROM tender_radar_sync_states WHERE company_id = $1', [companyId]),
        latestTenderSyncRun()
      ])
    : [
        db.prepare('SELECT * FROM tender_radar_sync_states WHERE company_id = ?').get(companyId) || null,
        await latestTenderSyncRun()
      ];

  return tenderSyncStateRow(state, latestRun);
}

async function setTenderRadarSyncState(companyId, status, result = {}) {
  const now = new Date();
  const success = status === 'success';
  const lastSyncedAt = success ? now.toISOString() : result.lastSyncedAt || null;
  const nextSuggestedSyncAt = success ? nextTenderSyncTime(now) : result.nextSuggestedSyncAt || null;
  const errorMessage = result.errorMessage || result.error || '';

  if (PG_ENABLED) {
    await pgQuery(`
      INSERT INTO tender_radar_sync_states (
        company_id, status, last_synced_at, next_suggested_sync_at, error_message, created_at, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT (company_id) DO UPDATE SET
        status = EXCLUDED.status,
        last_synced_at = COALESCE(EXCLUDED.last_synced_at, tender_radar_sync_states.last_synced_at),
        next_suggested_sync_at = COALESCE(EXCLUDED.next_suggested_sync_at, tender_radar_sync_states.next_suggested_sync_at),
        error_message = EXCLUDED.error_message,
        updated_at = CURRENT_TIMESTAMP
    `, [companyId, status, lastSyncedAt, nextSuggestedSyncAt, errorMessage]);
    return getTenderRadarSyncState(companyId);
  }

  db.prepare(`
    INSERT INTO tender_radar_sync_states (
      company_id, status, last_synced_at, next_suggested_sync_at, error_message, created_at, updated_at
    )
    VALUES (?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(company_id) DO UPDATE SET
      status = excluded.status,
      last_synced_at = COALESCE(excluded.last_synced_at, tender_radar_sync_states.last_synced_at),
      next_suggested_sync_at = COALESCE(excluded.next_suggested_sync_at, tender_radar_sync_states.next_suggested_sync_at),
      error_message = excluded.error_message,
      updated_at = CURRENT_TIMESTAMP
  `).run(companyId, status, lastSyncedAt, nextSuggestedSyncAt, errorMessage);

  return getTenderRadarSyncState(companyId);
}

async function runTenderSync({ source = 'all', triggeredBy = 'system' } = {}) {
  if (tenderSyncRunning) return { ok: false, code: 'TENDER_SYNC_RUNNING', message: '標案同步已在執行中' };
  tenderSyncRunning = true;

  const startedAt = new Date().toISOString();
  const dateFrom = new Date(Date.now() - 1000 * 60 * 60 * 24 * 45).toISOString().slice(0, 10);
  const dateTo = new Date(Date.now() + 1000 * 60 * 60 * 24 * 45).toISOString().slice(0, 10);
  let runId = null;
  let client = null;
  const state = { fetchedCount: 0, insertedCount: 0, updatedCount: 0, skippedCount: 0, errorCount: 0, errorMessage: '' };

  try {
    if (PG_ENABLED) {
      const pool = await getPool();
      client = await pool.connect();
      const createdRun = await client.query(`
        INSERT INTO tender_sync_runs (source, started_at, status, date_from, date_to)
        VALUES ($1,CURRENT_TIMESTAMP,'running',$2,$3)
        RETURNING id
      `, [source, dateFrom, dateTo]);
      runId = createdRun.rows[0].id;
    } else {
      const createdRun = db.prepare(`
        INSERT INTO tender_sync_runs (source, started_at, status, date_from, date_to)
        VALUES (?,CURRENT_TIMESTAMP,'running',?,?)
      `).run(source, dateFrom, dateTo);
      runId = createdRun.lastInsertRowid;
    }

    const adapters = [
      ['official_open_data', () => fetchTenderAdapter(process.env.TENDER_OFFICIAL_SOURCE_URL, 'official_open_data')],
      ['government_procurement', () => fetchTenderAdapter(process.env.TENDER_GOV_PROCUREMENT_URL, 'government_procurement')],
      ['local_government', () => fetchTenderAdapter(process.env.TENDER_LOCAL_SOURCE_URL, 'local_government')],
      ['fallback_snapshot', async () => fallbackTenderRows()]
    ];

    const rows = [];
    for (const [adapterSource, load] of adapters) {
      if (source !== 'all' && source !== adapterSource) continue;
      try {
        rows.push(...await load());
      } catch (err) {
        state.errorCount += 1;
        state.errorMessage = [state.errorMessage, `${adapterSource}: ${err.message || err}`].filter(Boolean).join(' | ');
      }
    }

    const unique = new Map();
    rows.map((row) => normalizeTenderItem(row, row.source)).forEach((row) => {
      unique.set(`${row.source}:${row.sourceTenderId}`, row);
    });
    const tenders = [...unique.values()];
    state.fetchedCount = tenders.length;

    if (PG_ENABLED) {
      await client.query('BEGIN');
      const keywords = await ensureTenderKeywords(client);
      for (const item of tenders) {
        const existing = await client.query('SELECT id FROM tenders WHERE source = $1 AND source_tender_id = $2', [item.source, item.sourceTenderId]);
        const upsert = await client.query(`
          INSERT INTO tenders (
            source, source_tender_id, tender_no, tender_name, agency_name, agency_code, agency_level,
            region, category, procurement_type, tender_type, announcement_type, budget_amount, award_amount,
            publish_date, deadline_date, opening_date, status, url, raw_payload, updated_at, last_seen_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
          ON CONFLICT (source, source_tender_id) DO UPDATE SET
            tender_no = EXCLUDED.tender_no,
            tender_name = EXCLUDED.tender_name,
            agency_name = EXCLUDED.agency_name,
            agency_code = EXCLUDED.agency_code,
            agency_level = EXCLUDED.agency_level,
            region = EXCLUDED.region,
            category = EXCLUDED.category,
            procurement_type = EXCLUDED.procurement_type,
            tender_type = EXCLUDED.tender_type,
            announcement_type = EXCLUDED.announcement_type,
            budget_amount = EXCLUDED.budget_amount,
            award_amount = EXCLUDED.award_amount,
            publish_date = EXCLUDED.publish_date,
            deadline_date = EXCLUDED.deadline_date,
            opening_date = EXCLUDED.opening_date,
            status = EXCLUDED.status,
            url = EXCLUDED.url,
            raw_payload = EXCLUDED.raw_payload,
            updated_at = CURRENT_TIMESTAMP,
            last_seen_at = CURRENT_TIMESTAMP
          RETURNING id
        `, [
          item.source, item.sourceTenderId, item.tenderNo, item.tenderName, item.agencyName, item.agencyCode, item.agencyLevel,
          item.region, item.category, item.procurementType, item.tenderType, item.announcementType, item.budgetAmount, item.awardAmount,
          item.publishDate, item.deadlineDate, item.openingDate, item.status, item.url, item.rawPayload
        ]);
        if (existing.rowCount) state.updatedCount += 1;
        else state.insertedCount += 1;
        const tenderId = upsert.rows[0].id;
        const match = computeTenderMatch(item, keywords);
        await client.query('DELETE FROM tender_matches WHERE tender_id = $1 AND company_id IS NULL', [tenderId]);
        if (match.keyword) {
          await client.query(`
            INSERT INTO tender_matches (tender_id, company_id, keyword, score, matched_reason)
            VALUES ($1,NULL,$2,$3,$4)
          `, [tenderId, match.keyword, match.score, match.reason]);
        }
      }
      await client.query(`
        UPDATE tender_sync_runs
        SET finished_at = CURRENT_TIMESTAMP,
            status = $1,
            fetched_count = $2,
            inserted_count = $3,
            updated_count = $4,
            skipped_count = $5,
            error_count = $6,
            error_message = $7
        WHERE id = $8
      `, [state.errorCount ? 'partial' : 'success', state.fetchedCount, state.insertedCount, state.updatedCount, state.skippedCount, state.errorCount, state.errorMessage, runId]);
      await client.query('COMMIT');
    } else {
      const keywords = await ensureTenderKeywords();
      const tx = db.transaction(() => {
        const upsertStmt = db.prepare(`
          INSERT INTO tenders (
            source, source_tender_id, tender_no, tender_name, agency_name, agency_code, agency_level,
            region, category, procurement_type, tender_type, announcement_type, budget_amount, award_amount,
            publish_date, deadline_date, opening_date, status, url, raw_payload, updated_at, last_seen_at
          )
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
          ON CONFLICT(source, source_tender_id) DO UPDATE SET
            tender_no = excluded.tender_no,
            tender_name = excluded.tender_name,
            agency_name = excluded.agency_name,
            agency_code = excluded.agency_code,
            agency_level = excluded.agency_level,
            region = excluded.region,
            category = excluded.category,
            procurement_type = excluded.procurement_type,
            tender_type = excluded.tender_type,
            announcement_type = excluded.announcement_type,
            budget_amount = excluded.budget_amount,
            award_amount = excluded.award_amount,
            publish_date = excluded.publish_date,
            deadline_date = excluded.deadline_date,
            opening_date = excluded.opening_date,
            status = excluded.status,
            url = excluded.url,
            raw_payload = excluded.raw_payload,
            updated_at = CURRENT_TIMESTAMP,
            last_seen_at = CURRENT_TIMESTAMP
        `);
        for (const item of tenders) {
          const existing = db.prepare('SELECT id FROM tenders WHERE source = ? AND source_tender_id = ?').get(item.source, item.sourceTenderId);
          upsertStmt.run(item.source, item.sourceTenderId, item.tenderNo, item.tenderName, item.agencyName, item.agencyCode, item.agencyLevel, item.region, item.category, item.procurementType, item.tenderType, item.announcementType, item.budgetAmount, item.awardAmount, item.publishDate, item.deadlineDate, item.openingDate, item.status, item.url, item.rawPayload);
          if (existing) state.updatedCount += 1;
          else state.insertedCount += 1;
          const tender = db.prepare('SELECT id FROM tenders WHERE source = ? AND source_tender_id = ?').get(item.source, item.sourceTenderId);
          const match = computeTenderMatch(item, keywords);
          db.prepare('DELETE FROM tender_matches WHERE tender_id = ? AND company_id IS NULL').run(tender.id);
          if (match.keyword) {
            db.prepare('INSERT INTO tender_matches (tender_id, company_id, keyword, score, matched_reason) VALUES (?,NULL,?,?,?)').run(tender.id, match.keyword, match.score, match.reason);
          }
        }
        db.prepare(`
          UPDATE tender_sync_runs
          SET finished_at = CURRENT_TIMESTAMP,
              status = ?,
              fetched_count = ?,
              inserted_count = ?,
              updated_count = ?,
              skipped_count = ?,
              error_count = ?,
              error_message = ?
          WHERE id = ?
        `).run(state.errorCount ? 'partial' : 'success', state.fetchedCount, state.insertedCount, state.updatedCount, state.skippedCount, state.errorCount, state.errorMessage, runId);
      });
      tx();
    }

    lastTenderSyncState = {
      status: state.errorCount ? 'partial' : 'success',
      finishedAt: new Date().toISOString(),
      insertedCount: state.insertedCount,
      updatedCount: state.updatedCount,
      errorMessage: state.errorMessage
    };
    return { ok: !state.errorCount, ...state, runId, triggeredBy, startedAt };
  } catch (err) {
    try {
      if (PG_ENABLED && client) {
        try { await client.query('ROLLBACK'); } catch {}
        if (runId) {
          await client.query(`
            UPDATE tender_sync_runs
            SET finished_at = CURRENT_TIMESTAMP,
                status = 'failed',
                error_count = $1,
                error_message = $2
            WHERE id = $3
          `, [state.errorCount + 1, err.message || String(err), runId]);
        }
      } else if (runId) {
        db.prepare(`
          UPDATE tender_sync_runs
          SET finished_at = CURRENT_TIMESTAMP,
              status = 'failed',
              error_count = ?,
              error_message = ?
          WHERE id = ?
        `).run(state.errorCount + 1, err.message || String(err), runId);
      }
    } catch {}
    lastTenderSyncState = {
      status: 'failed',
      finishedAt: new Date().toISOString(),
      insertedCount: state.insertedCount,
      updatedCount: state.updatedCount,
      errorMessage: err.message || String(err)
    };
    console.error('[tender sync] failed', { code: err.code || null, message: err.message || String(err) });
    return { ok: false, code: 'TENDER_SYNC_FAILED', error: '標案資料同步暫時失敗，系統已保留既有資料。', ...state, errorMessage: err.message || String(err) };
  } finally {
    if (client) client.release();
    tenderSyncRunning = false;
  }
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
    let client;
    try {
      const pool = await getPool();
      client = await pool.connect();
      await client.query('BEGIN');
      const subtotal = Math.round(items.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100;
      const tax = erpTax(subtotal, body.tax);
      const total = Math.round((subtotal + tax) * 100) / 100;
      const status = purchasePaymentStatuses.has(body.paymentStatus) ? body.paymentStatus : '未付款';
      const supplierId = Number(body.supplierId || 0) || null;
      let supplierName = body.supplierName || '';
      if (supplierId) {
        const supplier = await client.query('SELECT name FROM suppliers WHERE id = $1 AND company_id = $2', [supplierId, req.company.id]);
        if (!supplier.rowCount) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: '找不到供應商' });
        }
        supplierName = supplier.rows[0].name;
      }

      const created = await client.query(`
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
      const purchase = created.rows[0];

      for (const item of items) {
        await client.query(`
          INSERT INTO purchase_items (
            company_id, purchase_id, product_id, item_name, quantity, unit, unit_cost, unit_price, subtotal, note
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9)
        `, [req.company.id, purchase.id, item.productId, item.itemName, item.quantity, item.unit, item.price, item.subtotal, item.note]);
        if (item.productId) {
          const productResult = await client.query('SELECT * FROM products WHERE id = $1 AND company_id = $2 FOR UPDATE', [item.productId, req.company.id]);
          if (!productResult.rowCount) throw new Error(`找不到商品 / 材料：${item.itemName}`);
          const product = productResult.rows[0];
          const beforeStock = erpNumber(product.stock, 0);
          const nextStock = Math.round((beforeStock + item.quantity) * 100) / 100;
          await client.query('UPDATE products SET stock = $1, cost = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND company_id = $4', [nextStock, item.price, item.productId, req.company.id]);
          await client.query(`
            INSERT INTO inventory_movements (
              company_id, product_id, movement_type, quantity, before_stock, after_stock, unit_cost, note
            )
            VALUES ($1,$2,'purchase',$3,$4,$5,$6,$7)
          `, [req.company.id, item.productId, item.quantity, beforeStock, nextStock, item.price, `進貨單 ${body.purchaseNo || purchase.id}`]);
        }
      }

      await client.query('COMMIT');
      audit(req.company.id, req.user.id, 'purchase_created', String(purchase.id));
      return res.json(purchaseRow(purchase));
    } catch (err) {
      try {
        if (client) await client.query('ROLLBACK');
      } catch {}
      return databaseError(res, req.path, req, err);
    } finally {
      if (client) client.release();
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

app.get('/api/purchases/:id/payments', auth, company, async (req, res) => {
  if (PG_ENABLED) {
    try {
      const purchase = await pgOne('SELECT id FROM purchases WHERE id = $1 AND company_id = $2', [req.params.id, req.company.id]);
      if (!purchase) return res.status(404).json({ error: '找不到進貨單' });
      const rows = await pgAll(`
        SELECT *
        FROM purchase_payments
        WHERE purchase_id = $1
          AND company_id = $2
        ORDER BY payment_date DESC, id DESC
      `, [req.params.id, req.company.id]);
      return res.json(rows.map(purchasePaymentRow));
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

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

app.post('/api/purchases/:id/payments', auth, company, requireRole('owner', 'admin', 'accounting', 'staff'), async (req, res) => {
  const purchase = PG_ENABLED
    ? await pgOne('SELECT * FROM purchases WHERE id = $1 AND company_id = $2', [req.params.id, req.company.id])
    : db.prepare('SELECT * FROM purchases WHERE id = ? AND company_id = ?').get(req.params.id, req.company.id);
  if (!purchase) return res.status(404).json({ error: '找不到進貨單' });
  if ((purchase.status || 'confirmed') === 'void') return res.status(400).json({ error: '作廢進貨單不可新增付款' });

  const amount = Math.round(erpNumber(req.body?.amount, 0) * 100) / 100;
  if (amount <= 0) return res.status(400).json({ error: '付款金額必須大於 0' });

  const total = erpNumber(purchase.total, 0);
  const paidAmount = erpNumber(purchase.paid_amount, 0);
  const nextPaid = Math.round((paidAmount + amount) * 100) / 100;
  if (nextPaid > total) return res.status(400).json({ error: '付款金額不可超過進貨單總額' });

  if (PG_ENABLED) {
    try {
      const row = await pgOne(`
        INSERT INTO purchase_payments (
          company_id, purchase_id, amount, payment_date, method, note
        )
        VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING id
      `, [
        req.company.id,
        purchase.id,
        amount,
        req.body?.paymentDate || req.body?.payment_date || new Date().toISOString().slice(0, 10),
        req.body?.method || '',
        req.body?.note || ''
      ]);

      await pgQuery(`
        UPDATE purchases
        SET paid_amount = $1,
            payment_status = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
          AND company_id = $4
      `, [nextPaid, purchasePaymentStatus(total, nextPaid), purchase.id, req.company.id]);

      audit(req.company.id, req.user.id, 'purchase_payment_created', String(row.id));
      const updated = await pgOne('SELECT * FROM purchases WHERE id = $1 AND company_id = $2', [purchase.id, req.company.id]);
      return res.json({ ok: true, paymentId: row.id, purchase: purchaseRow(updated) });
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

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

app.post('/api/purchases/:id/void', auth, company, requireRole('owner', 'admin'), async (req, res) => {
  if (PG_ENABLED) {
    let client;
    try {
      const pool = await getPool();
      client = await pool.connect();
      await client.query('BEGIN');
      const purchaseResult = await client.query('SELECT * FROM purchases WHERE id = $1 AND company_id = $2 FOR UPDATE', [req.params.id, req.company.id]);
      const purchase = purchaseResult.rows[0];
      if (!purchase) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: '找不到進貨單' });
      }
      if ((purchase.status || 'confirmed') === 'void') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: '此進貨單已作廢' });
      }
      const paymentCount = await client.query('SELECT COUNT(*)::int AS count FROM purchase_payments WHERE purchase_id = $1 AND company_id = $2', [req.params.id, req.company.id]);
      if ((paymentCount.rows[0]?.count || 0) > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: '已有付款紀錄，請先確認帳務處理' });
      }
      const items = await client.query('SELECT * FROM purchase_items WHERE purchase_id = $1 AND company_id = $2', [req.params.id, req.company.id]);
      for (const item of items.rows) {
        if (!item.product_id) continue;
        const productResult = await client.query('SELECT * FROM products WHERE id = $1 AND company_id = $2 FOR UPDATE', [item.product_id, req.company.id]);
        const product = productResult.rows[0];
        if (!product) throw new Error(`找不到商品 / 材料：${item.item_name}`);
        const quantity = Math.max(0, erpNumber(item.quantity, 0));
        const beforeStock = erpNumber(product.stock, 0);
        const afterStock = Math.round((beforeStock - quantity) * 100) / 100;
        if (afterStock < 0) throw new Error(`作廢後庫存不可小於 0：${product.name}`);
        await client.query('UPDATE products SET stock = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND company_id = $3', [afterStock, item.product_id, req.company.id]);
        await client.query(`
          INSERT INTO inventory_movements (
            company_id, product_id, movement_type, quantity, before_stock, after_stock, unit_cost, note
          )
          VALUES ($1,$2,'purchase_void',$3,$4,$5,$6,$7)
        `, [req.company.id, item.product_id, quantity, beforeStock, afterStock, erpNumber(item.unit_cost, 0), `作廢進貨單 ${purchase.purchase_no || purchase.id}`]);
      }
      await client.query('UPDATE purchases SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND company_id = $3', ['void', req.params.id, req.company.id]);
      await client.query('COMMIT');
      audit(req.company.id, req.user.id, 'purchase_voided', String(req.params.id));
      return res.json({ ok: true });
    } catch (err) {
      try {
        if (client) await client.query('ROLLBACK');
      } catch {}
      return databaseError(res, req.path, req, err);
    } finally {
      if (client) client.release();
    }
  }

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
    let client;
    try {
      const pool = await getPool();
      client = await pool.connect();
      await client.query('BEGIN');
      for (const item of items) {
        if (item.productId) {
          const productResult = await client.query('SELECT * FROM products WHERE id = $1 AND company_id = $2 FOR UPDATE', [item.productId, req.company.id]);
          if (!productResult.rowCount) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `找不到商品 / 材料：${item.itemName}` });
          }
          const product = productResult.rows[0];
          if (erpNumber(product.stock, 0) < item.quantity) {
            await client.query('ROLLBACK');
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
        const customer = await client.query('SELECT name FROM customers WHERE id = $1 AND company_id = $2', [customerId, req.company.id]);
        if (!customer.rowCount) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: '找不到客戶' });
        }
        customerName = customer.rows[0].name;
      }

      const created = await client.query(`
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
      const sale = created.rows[0];

      for (const item of items) {
        let product = null;
        let unitCostSnapshot = 0;
        if (item.productId) {
          product = (await client.query('SELECT * FROM products WHERE id = $1 AND company_id = $2 FOR UPDATE', [item.productId, req.company.id])).rows[0];
          unitCostSnapshot = erpNumber(product?.cost, 0);
        }
        const costSubtotal = Math.round(item.quantity * unitCostSnapshot * 100) / 100;
        await client.query(`
          INSERT INTO sale_items (
            company_id, sale_id, product_id, item_name, quantity, unit, unit_price, subtotal, unit_cost_snapshot, cost_subtotal, note
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        `, [
          req.company.id,
          sale.id,
          item.productId,
          item.itemName,
          item.quantity,
          item.unit,
          item.price,
          item.subtotal,
          unitCostSnapshot,
          costSubtotal,
          item.note
        ]);
        if (item.productId) {
          const beforeStock = erpNumber(product.stock, 0);
          const nextStock = Math.round((erpNumber(product.stock, 0) - item.quantity) * 100) / 100;
          await client.query('UPDATE products SET stock = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND company_id = $3', [nextStock, item.productId, req.company.id]);
          await client.query(`
            INSERT INTO inventory_movements (
              company_id, product_id, movement_type, quantity, before_stock, after_stock, unit_cost, note
            )
            VALUES ($1,$2,'sale',$3,$4,$5,$6,$7)
          `, [req.company.id, item.productId, item.quantity, beforeStock, nextStock, erpNumber(product.cost, 0), `銷貨單 ${body.saleNo || sale.id}`]);
        }
      }

      await client.query('COMMIT');
      audit(req.company.id, req.user.id, 'sale_created', String(sale.id));
      return res.json(saleRow(sale));
    } catch (err) {
      try {
        if (client) await client.query('ROLLBACK');
      } catch {}
      return databaseError(res, req.path, req, err);
    } finally {
      if (client) client.release();
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
          company_id, sale_id, product_id, item_name, quantity, unit, unit_price, subtotal, unit_cost_snapshot, cost_subtotal, note
        )
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `);

      const movementStmt = db.prepare(`
        INSERT INTO inventory_movements (
          company_id, product_id, movement_type, quantity, before_stock, after_stock, unit_cost, note
        )
        VALUES (?,?,?,?,?,?,?,?)
      `);

      items.forEach((item) => {
        const product = item.productId ? getProductForUpdate(req.company.id, item.productId) : null;
        const unitCostSnapshot = erpNumber(product?.cost, 0);
        const costSubtotal = Math.round(item.quantity * unitCostSnapshot * 100) / 100;
        itemStmt.run(
          req.company.id,
          sale.lastInsertRowid,
          item.productId,
          item.itemName,
          item.quantity,
          item.unit,
          item.price,
          item.subtotal,
          unitCostSnapshot,
          costSubtotal,
          item.note
        );
        if (item.productId) {
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

app.get('/api/sales/:id/receipts', auth, company, async (req, res) => {
  if (PG_ENABLED) {
    try {
      const sale = await pgOne('SELECT id FROM sales WHERE id = $1 AND company_id = $2', [req.params.id, req.company.id]);
      if (!sale) return res.status(404).json({ error: '找不到銷貨單' });
      const rows = await pgAll(`
        SELECT *
        FROM sale_receipts
        WHERE sale_id = $1
          AND company_id = $2
        ORDER BY receipt_date DESC, id DESC
      `, [req.params.id, req.company.id]);
      return res.json(rows.map(saleReceiptRow));
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

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

app.post('/api/sales/:id/receipts', auth, company, requireRole('owner', 'admin', 'accounting', 'staff'), async (req, res) => {
  const sale = PG_ENABLED
    ? await pgOne('SELECT * FROM sales WHERE id = $1 AND company_id = $2', [req.params.id, req.company.id])
    : db.prepare('SELECT * FROM sales WHERE id = ? AND company_id = ?').get(req.params.id, req.company.id);
  if (!sale) return res.status(404).json({ error: '找不到銷貨單' });
  if ((sale.status || 'confirmed') === 'void') return res.status(400).json({ error: '作廢銷貨單不可新增收款' });

  const amount = Math.round(erpNumber(req.body?.amount, 0) * 100) / 100;
  if (amount <= 0) return res.status(400).json({ error: '收款金額必須大於 0' });

  const total = erpNumber(sale.total, 0);
  const receivedAmount = erpNumber(sale.received_amount, 0);
  const nextReceived = Math.round((receivedAmount + amount) * 100) / 100;
  if (nextReceived > total) return res.status(400).json({ error: '收款金額不可超過銷貨單總額' });

  if (PG_ENABLED) {
    try {
      const row = await pgOne(`
        INSERT INTO sale_receipts (
          company_id, sale_id, amount, receipt_date, method, note
        )
        VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING id
      `, [
        req.company.id,
        sale.id,
        amount,
        req.body?.receiptDate || req.body?.receipt_date || new Date().toISOString().slice(0, 10),
        req.body?.method || '',
        req.body?.note || ''
      ]);

      await pgQuery(`
        UPDATE sales
        SET received_amount = $1,
            collection_status = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
          AND company_id = $4
      `, [nextReceived, salesCollectionStatus(total, nextReceived), sale.id, req.company.id]);

      audit(req.company.id, req.user.id, 'sale_receipt_created', String(row.id));
      const updated = await pgOne('SELECT * FROM sales WHERE id = $1 AND company_id = $2', [sale.id, req.company.id]);
      return res.json({ ok: true, receiptId: row.id, sale: saleRow(updated) });
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

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

app.post('/api/sales/:id/void', auth, company, requireRole('owner', 'admin'), async (req, res) => {
  if (PG_ENABLED) {
    let client;
    try {
      const pool = await getPool();
      client = await pool.connect();
      await client.query('BEGIN');
      const saleResult = await client.query('SELECT * FROM sales WHERE id = $1 AND company_id = $2 FOR UPDATE', [req.params.id, req.company.id]);
      const sale = saleResult.rows[0];
      if (!sale) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: '找不到銷貨單' });
      }
      if ((sale.status || 'confirmed') === 'void') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: '此銷貨單已作廢' });
      }
      const receiptCount = await client.query('SELECT COUNT(*)::int AS count FROM sale_receipts WHERE sale_id = $1 AND company_id = $2', [req.params.id, req.company.id]);
      if ((receiptCount.rows[0]?.count || 0) > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: '已有收款紀錄，請先確認帳務處理' });
      }
      const items = await client.query('SELECT * FROM sale_items WHERE sale_id = $1 AND company_id = $2', [req.params.id, req.company.id]);
      for (const item of items.rows) {
        if (!item.product_id) continue;
        const productResult = await client.query('SELECT * FROM products WHERE id = $1 AND company_id = $2 FOR UPDATE', [item.product_id, req.company.id]);
        const product = productResult.rows[0];
        if (!product) throw new Error(`找不到商品 / 材料：${item.item_name}`);
        const quantity = Math.max(0, erpNumber(item.quantity, 0));
        const beforeStock = erpNumber(product.stock, 0);
        const afterStock = Math.round((beforeStock + quantity) * 100) / 100;
        await client.query('UPDATE products SET stock = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND company_id = $3', [afterStock, item.product_id, req.company.id]);
        await client.query(`
          INSERT INTO inventory_movements (
            company_id, product_id, movement_type, quantity, before_stock, after_stock, unit_cost, note
          )
          VALUES ($1,$2,'sale_void',$3,$4,$5,$6,$7)
        `, [req.company.id, item.product_id, quantity, beforeStock, afterStock, erpNumber(product.cost, 0), `作廢銷貨單 ${sale.sale_no || sale.id}`]);
      }
      await client.query('UPDATE sales SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND company_id = $3', ['void', req.params.id, req.company.id]);
      await client.query('COMMIT');
      audit(req.company.id, req.user.id, 'sale_voided', String(req.params.id));
      return res.json({ ok: true });
    } catch (err) {
      try {
        if (client) await client.query('ROLLBACK');
      } catch {}
      return databaseError(res, req.path, req, err);
    } finally {
      if (client) client.release();
    }
  }

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

app.get('/api/receivables/list', auth, company, async (req, res) => {
  let rows;
  if (PG_ENABLED) {
    try {
      rows = await pgAll(`
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
        WHERE company_id = $1
          AND COALESCE(status, 'confirmed') != 'void'
          AND COALESCE(total, 0) > COALESCE(received_amount, 0)
        ORDER BY sale_date DESC, id DESC
      `, [req.company.id]);
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  } else {
    rows = db.prepare(`
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
  }

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

app.get('/api/payables/list', auth, company, async (req, res) => {
  let rows;
  if (PG_ENABLED) {
    try {
      rows = await pgAll(`
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
        WHERE company_id = $1
          AND COALESCE(status, 'confirmed') != 'void'
          AND COALESCE(total, 0) > COALESCE(paid_amount, 0)
        ORDER BY purchase_date DESC, id DESC
      `, [req.company.id]);
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  } else {
    rows = db.prepare(`
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
  }

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
      const [
        platformFeeComparison,
        lowStockItems,
        receivableTrend,
        payableTrend,
        inventoryValue
      ] = await Promise.all([
        pgAll(`
          SELECT
            COALESCE(platform_key, 'manual') AS name,
            COALESCE(SUM(gross_amount), 0) AS revenue,
            COALESCE(SUM(platform_fee), 0) AS fee,
            CASE WHEN COALESCE(SUM(gross_amount), 0) > 0
              THEN ROUND((COALESCE(SUM(platform_fee), 0) / COALESCE(SUM(gross_amount), 0) * 100)::numeric, 2)
              ELSE 0
            END AS fee_rate
          FROM transactions
          WHERE company_id = $1
          GROUP BY COALESCE(platform_key, 'manual')
          ORDER BY fee_rate DESC, revenue DESC
        `, [req.company.id]),
        pgAll(`
          SELECT name, sku, unit, stock, safety_stock, updated_at
          FROM products
          WHERE company_id = $1
          ORDER BY (COALESCE(stock, 0) - COALESCE(safety_stock, 0)) ASC, updated_at DESC NULLS LAST
          LIMIT 8
        `, [req.company.id]),
        pgAll(`
          SELECT sale_date AS date, COALESCE(SUM(GREATEST(COALESCE(total,0) - COALESCE(received_amount,0), 0)),0) AS value
          FROM sales
          WHERE company_id = $1
            AND COALESCE(status, 'confirmed') != 'void'
            AND sale_date >= (CURRENT_DATE - INTERVAL '30 days')::text
          GROUP BY sale_date
          ORDER BY sale_date ASC
        `, [req.company.id]),
        pgAll(`
          SELECT purchase_date AS date, COALESCE(SUM(GREATEST(COALESCE(total,0) - COALESCE(paid_amount,0), 0)),0) AS value
          FROM purchases
          WHERE company_id = $1
            AND COALESCE(status, 'confirmed') != 'void'
            AND purchase_date >= (CURRENT_DATE - INTERVAL '30 days')::text
          GROUP BY purchase_date
          ORDER BY purchase_date ASC
        `, [req.company.id]),
        pgOne('SELECT COALESCE(SUM(COALESCE(stock,0) * COALESCE(cost,0)),0) AS total FROM products WHERE company_id = $1', [req.company.id])
      ]);
      const grossProfit = incomeTotal + monthlySalesTotal - cogsTotal - monthlyPurchasesTotal;
      const grossMarginRate = incomeTotal + monthlySalesTotal > 0
        ? Math.round((grossProfit / (incomeTotal + monthlySalesTotal)) * 1000) / 10
        : 0;
      const cashflowAlerts = [
        erpNumber(unpaidSales?.total, 0) > 0 ? `應收未收 ${erpNumber(unpaidSales?.total, 0).toLocaleString('zh-TW')} 元，請安排收款追蹤。` : '',
        erpNumber(unpaidPurchases?.total, 0) > 0 ? `應付未付 ${erpNumber(unpaidPurchases?.total, 0).toLocaleString('zh-TW')} 元，請確認付款時程。` : '',
        grossMarginRate > 0 && grossMarginRate < 25 ? '毛利率低於 25%，建議檢查進貨成本、平台費或案場成本。' : ''
      ].filter(Boolean);

      return res.json({
        revenue: incomeTotal + monthlySalesTotal,
        expenses: feesTotal + cogsTotal + vouchersTotal,
        netProfit: incomeTotal + monthlySalesTotal - feesTotal - cogsTotal - vouchersTotal - monthlyPurchasesTotal,
        grossProfit,
        grossMarginRate,
        cogs: cogsTotal,
        fees: feesTotal,
        txCount: txCount?.count || 0,
        invoicesPending: 0,
        revenueByPlatform,
        platformFeeComparison,
        lowStockItems,
        receivableTrend,
        payableTrend,
        inventoryValue: erpNumber(inventoryValue?.total, 0),
        cashflowAlerts,
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

  const platformFeeComparison = db.prepare(`
    SELECT
      COALESCE(platform_key, 'manual') AS name,
      COALESCE(SUM(gross_amount), 0) AS revenue,
      COALESCE(SUM(platform_fee), 0) AS fee,
      CASE WHEN COALESCE(SUM(gross_amount), 0) > 0
        THEN ROUND(COALESCE(SUM(platform_fee), 0) / COALESCE(SUM(gross_amount), 0) * 100, 2)
        ELSE 0
      END AS fee_rate
    FROM transactions
    WHERE company_id = ?
    GROUP BY COALESCE(platform_key, 'manual')
    ORDER BY fee_rate DESC, revenue DESC
  `).all(req.company.id);

  const lowStockItems = db.prepare(`
    SELECT name, sku, unit, stock, safety_stock, updated_at
    FROM products
    WHERE company_id = ?
    ORDER BY (COALESCE(stock, 0) - COALESCE(safety_stock, 0)) ASC, updated_at DESC
    LIMIT 8
  `).all(req.company.id);

  const receivableTrend = db.prepare(`
    SELECT sale_date AS date, COALESCE(SUM(MAX(total - received_amount, 0)),0) AS value
    FROM sales
    WHERE company_id = ?
      AND COALESCE(status, 'confirmed') != 'void'
      AND date(sale_date) >= date('now', '-30 days')
    GROUP BY sale_date
    ORDER BY sale_date ASC
  `).all(req.company.id);

  const payableTrend = db.prepare(`
    SELECT purchase_date AS date, COALESCE(SUM(MAX(total - paid_amount, 0)),0) AS value
    FROM purchases
    WHERE company_id = ?
      AND COALESCE(status, 'confirmed') != 'void'
      AND date(purchase_date) >= date('now', '-30 days')
    GROUP BY purchase_date
    ORDER BY purchase_date ASC
  `).all(req.company.id);

  const inventoryValue = db.prepare(`
    SELECT COALESCE(SUM(COALESCE(stock,0) * COALESCE(cost,0)),0) AS total
    FROM products
    WHERE company_id = ?
  `).get(req.company.id).total;

  const grossProfit = income + monthlySales - cogs - monthlyPurchases;
  const grossMarginRate = income + monthlySales > 0
    ? Math.round((grossProfit / (income + monthlySales)) * 1000) / 10
    : 0;
  const cashflowAlerts = [
    unpaidSales > 0 ? `應收未收 ${Number(unpaidSales).toLocaleString('zh-TW')} 元，請安排收款追蹤。` : '',
    unpaidPurchases > 0 ? `應付未付 ${Number(unpaidPurchases).toLocaleString('zh-TW')} 元，請確認付款時程。` : '',
    grossMarginRate > 0 && grossMarginRate < 25 ? '毛利率低於 25%，建議檢查進貨成本、平台費或案場成本。' : ''
  ].filter(Boolean);

  res.json({
    revenue: income + monthlySales,
    expenses: fees + cogs + vouchers,
    netProfit: income + monthlySales - fees - cogs - vouchers - monthlyPurchases,
    grossProfit,
    grossMarginRate,
    cogs,
    fees,
    txCount,
    invoicesPending,
    revenueByPlatform,
    platformFeeComparison,
    lowStockItems,
    receivableTrend,
    payableTrend,
    inventoryValue,
    cashflowAlerts,
    lowStock,
    monthlySales,
    monthlyPurchases,
    unpaidSales,
    unpaidPurchases,
    collectedSales,
    paidPurchases
  });
});

function dateText(value) {
  return String(value || '').slice(0, 10);
}

function addDaysText(value, days) {
  const date = new Date(`${dateText(value)}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetweenInclusive(startDate, endDate) {
  const start = new Date(`${dateText(startDate)}T00:00:00`);
  const end = new Date(`${dateText(endDate)}T00:00:00`);
  const diff = Math.round((end - start) / 86400000);
  return Math.max(diff + 1, 1);
}

function monthKey(value) {
  return dateText(value).slice(0, 7);
}

function classifySalesPlatform(note = '') {
  const text = String(note || '').toLowerCase();
  if (text.includes('官網')) return '官網';
  if (text.includes('蝦皮')) return '蝦皮';
  if (text.includes('momo')) return 'momo';
  if (text.includes('line')) return 'LINE';
  return '其他';
}

function changeRate(current, previous) {
  const next = erpNumber(current, 0);
  const prev = erpNumber(previous, 0);
  if (!prev) return null;
  return Math.round(((next - prev) / prev) * 1000) / 10;
}

function formatBiKpis(raw = {}) {
  const salesTotal = erpNumber(raw.salesTotal, 0);
  const purchaseTotal = erpNumber(raw.purchaseTotal, 0);
  const productCost = erpNumber(raw.productCost, 0);
  const grossProfit = salesTotal - productCost;
  const transactionCount = erpNumber(raw.transactionCount, 0);
  const receivedAmount = erpNumber(raw.receivedAmount, 0);
  const paidAmount = erpNumber(raw.paidAmount, 0);
  const inventoryCost = erpNumber(raw.inventoryCost, 0);

  return {
    salesTotal,
    purchaseTotal,
    productCost,
    grossProfit,
    grossMarginRate: salesTotal > 0 ? Math.round((grossProfit / salesTotal) * 1000) / 10 : 0,
    transactionCount,
    averageOrderValue: transactionCount > 0 ? Math.round((salesTotal / transactionCount) * 100) / 100 : 0,
    receivedAmount,
    paidAmount,
    accountsReceivable: Math.max(Math.round((salesTotal - receivedAmount) * 100) / 100, 0),
    accountsPayable: Math.max(Math.round((purchaseTotal - paidAmount) * 100) / 100, 0),
    lowStockCount: erpNumber(raw.lowStockCount, 0),
    inventoryCost
  };
}

function buildBiComparison(current, previous) {
  return {
    salesTotalChangeRate: changeRate(current.salesTotal, previous.salesTotal),
    purchaseTotalChangeRate: changeRate(current.purchaseTotal, previous.purchaseTotal),
    grossProfitChangeRate: changeRate(current.grossProfit, previous.grossProfit),
    grossMarginRateChange: Math.round((erpNumber(current.grossMarginRate, 0) - erpNumber(previous.grossMarginRate, 0)) * 10) / 10,
    transactionCountChangeRate: changeRate(current.transactionCount, previous.transactionCount),
    averageOrderValueChangeRate: changeRate(current.averageOrderValue, previous.averageOrderValue)
  };
}

async function getBusinessBiPg(companyId, startDate, endDate) {
  const params = [companyId, startDate, endDate];
  const salesWhere = "company_id = $1 AND sale_date >= $2 AND sale_date <= $3 AND COALESCE(status, 'confirmed') != 'void'";
  const purchaseWhere = "company_id = $1 AND purchase_date >= $2 AND purchase_date <= $3 AND COALESCE(status, 'confirmed') != 'void'";

  const [sales, purchases, costs, inventory, topProducts, salesRows] = await Promise.all([
    pgOne(`SELECT COALESCE(SUM(total),0) AS "salesTotal", COALESCE(SUM(received_amount),0) AS "receivedAmount", COUNT(*)::int AS "transactionCount" FROM sales WHERE ${salesWhere}`, params),
    pgOne(`SELECT COALESCE(SUM(total),0) AS "purchaseTotal", COALESCE(SUM(paid_amount),0) AS "paidAmount" FROM purchases WHERE ${purchaseWhere}`, params),
    pgOne(`
      SELECT COALESCE(SUM(
        CASE
          WHEN COALESCE(si.cost_subtotal,0) > 0 THEN COALESCE(si.cost_subtotal,0)
          WHEN COALESCE(si.unit_cost_snapshot,0) > 0 THEN COALESCE(si.quantity,0) * COALESCE(si.unit_cost_snapshot,0)
          ELSE COALESCE(si.quantity,0) * COALESCE(p.cost,0)
        END
      ),0) AS "productCost"
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id AND s.company_id = si.company_id
      LEFT JOIN products p ON p.id = si.product_id AND p.company_id = si.company_id
      WHERE s.${salesWhere.replaceAll('$1', '$1').replace('company_id', 'company_id')}
    `, params),
    pgOne(`
      SELECT
        COUNT(*) FILTER (WHERE COALESCE(stock,0) <= COALESCE(safety_stock,0))::int AS "lowStockCount",
        COALESCE(SUM(COALESCE(stock,0) * COALESCE(cost,0)),0) AS "inventoryCost"
      FROM products
      WHERE company_id = $1
    `, [companyId]),
    pgAll(`
      SELECT
        COALESCE(si.item_name, p.name, '未命名商品') AS name,
        COALESCE(SUM(si.quantity),0) AS quantity,
        COALESCE(SUM(si.subtotal),0) AS amount,
        COALESCE(SUM(
          CASE
            WHEN COALESCE(si.cost_subtotal,0) > 0 THEN COALESCE(si.cost_subtotal,0)
            WHEN COALESCE(si.unit_cost_snapshot,0) > 0 THEN COALESCE(si.quantity,0) * COALESCE(si.unit_cost_snapshot,0)
            ELSE COALESCE(si.quantity,0) * COALESCE(p.cost,0)
          END
        ),0) AS cost
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id AND s.company_id = si.company_id
      LEFT JOIN products p ON p.id = si.product_id AND p.company_id = si.company_id
      WHERE s.company_id = $1 AND s.sale_date >= $2 AND s.sale_date <= $3 AND COALESCE(s.status, 'confirmed') != 'void'
      GROUP BY COALESCE(si.item_name, p.name, '未命名商品')
      ORDER BY amount DESC
      LIMIT 5
    `, params),
    pgAll(`
      SELECT
        s.id,
        s.sale_date AS date,
        s.total,
        s.received_amount AS "receivedAmount",
        s.note,
        COALESCE(SUM(
          CASE
            WHEN COALESCE(si.cost_subtotal,0) > 0 THEN COALESCE(si.cost_subtotal,0)
            WHEN COALESCE(si.unit_cost_snapshot,0) > 0 THEN COALESCE(si.quantity,0) * COALESCE(si.unit_cost_snapshot,0)
            ELSE COALESCE(si.quantity,0) * COALESCE(p.cost,0)
          END
        ),0) AS "productCost"
      FROM sales s
      LEFT JOIN sale_items si ON si.sale_id = s.id AND si.company_id = s.company_id
      LEFT JOIN products p ON p.id = si.product_id AND p.company_id = si.company_id
      WHERE s.company_id = $1 AND s.sale_date >= $2 AND s.sale_date <= $3 AND COALESCE(s.status, 'confirmed') != 'void'
      GROUP BY s.id, s.sale_date, s.total, s.received_amount, s.note
      ORDER BY s.sale_date ASC, s.id ASC
    `, params)
  ]);

  return { sales, purchases, costs, inventory, topProducts, salesRows };
}

function getBusinessBiSqlite(companyId, startDate, endDate) {
  const params = [companyId, startDate, endDate];
  const sales = db.prepare(`
    SELECT COALESCE(SUM(total),0) AS salesTotal, COALESCE(SUM(received_amount),0) AS receivedAmount, COUNT(*) AS transactionCount
    FROM sales
    WHERE company_id = ? AND date(sale_date) >= date(?) AND date(sale_date) <= date(?) AND COALESCE(status, 'confirmed') != 'void'
  `).get(...params);
  const purchases = db.prepare(`
    SELECT COALESCE(SUM(total),0) AS purchaseTotal, COALESCE(SUM(paid_amount),0) AS paidAmount
    FROM purchases
    WHERE company_id = ? AND date(purchase_date) >= date(?) AND date(purchase_date) <= date(?) AND COALESCE(status, 'confirmed') != 'void'
  `).get(...params);
  const costs = db.prepare(`
    SELECT COALESCE(SUM(
      CASE
        WHEN COALESCE(si.cost_subtotal,0) > 0 THEN COALESCE(si.cost_subtotal,0)
        WHEN COALESCE(si.unit_cost_snapshot,0) > 0 THEN COALESCE(si.quantity,0) * COALESCE(si.unit_cost_snapshot,0)
        ELSE COALESCE(si.quantity,0) * COALESCE(p.cost,0)
      END
    ),0) AS productCost
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id AND s.company_id = si.company_id
    LEFT JOIN products p ON p.id = si.product_id AND p.company_id = si.company_id
    WHERE s.company_id = ? AND date(s.sale_date) >= date(?) AND date(s.sale_date) <= date(?) AND COALESCE(s.status, 'confirmed') != 'void'
  `).get(...params);
  const inventory = db.prepare(`
    SELECT
      SUM(CASE WHEN COALESCE(stock,0) <= COALESCE(safety_stock,0) THEN 1 ELSE 0 END) AS lowStockCount,
      COALESCE(SUM(COALESCE(stock,0) * COALESCE(cost,0)),0) AS inventoryCost
    FROM products
    WHERE company_id = ?
  `).get(companyId);
  const topProducts = db.prepare(`
    SELECT
      COALESCE(si.item_name, p.name, '未命名商品') AS name,
      COALESCE(SUM(si.quantity),0) AS quantity,
      COALESCE(SUM(si.subtotal),0) AS amount,
      COALESCE(SUM(
        CASE
          WHEN COALESCE(si.cost_subtotal,0) > 0 THEN COALESCE(si.cost_subtotal,0)
          WHEN COALESCE(si.unit_cost_snapshot,0) > 0 THEN COALESCE(si.quantity,0) * COALESCE(si.unit_cost_snapshot,0)
          ELSE COALESCE(si.quantity,0) * COALESCE(p.cost,0)
        END
      ),0) AS cost
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id AND s.company_id = si.company_id
    LEFT JOIN products p ON p.id = si.product_id AND p.company_id = si.company_id
    WHERE s.company_id = ? AND date(s.sale_date) >= date(?) AND date(s.sale_date) <= date(?) AND COALESCE(s.status, 'confirmed') != 'void'
    GROUP BY COALESCE(si.item_name, p.name, '未命名商品')
    ORDER BY amount DESC
    LIMIT 5
  `).all(...params);
  const salesRows = db.prepare(`
    SELECT
      s.id,
      s.sale_date AS date,
      s.total,
      s.received_amount AS receivedAmount,
      s.note,
      COALESCE(SUM(
        CASE
          WHEN COALESCE(si.cost_subtotal,0) > 0 THEN COALESCE(si.cost_subtotal,0)
          WHEN COALESCE(si.unit_cost_snapshot,0) > 0 THEN COALESCE(si.quantity,0) * COALESCE(si.unit_cost_snapshot,0)
          ELSE COALESCE(si.quantity,0) * COALESCE(p.cost,0)
        END
      ),0) AS productCost
    FROM sales s
    LEFT JOIN sale_items si ON si.sale_id = s.id AND si.company_id = s.company_id
    LEFT JOIN products p ON p.id = si.product_id AND p.company_id = si.company_id
    WHERE s.company_id = ? AND date(s.sale_date) >= date(?) AND date(s.sale_date) <= date(?) AND COALESCE(s.status, 'confirmed') != 'void'
    GROUP BY s.id, s.sale_date, s.total, s.received_amount, s.note
    ORDER BY s.sale_date ASC, s.id ASC
  `).all(...params);
  return { sales, purchases, costs, inventory, topProducts, salesRows };
}

async function buildBusinessBi(companyId, startDate, endDate) {
  const raw = PG_ENABLED
    ? await getBusinessBiPg(companyId, startDate, endDate)
    : getBusinessBiSqlite(companyId, startDate, endDate);

  const kpis = formatBiKpis({
    ...raw.sales,
    ...raw.purchases,
    ...raw.costs,
    ...raw.inventory
  });
  const topProducts = (raw.topProducts || []).map((item) => ({
    name: item.name,
    quantity: erpNumber(item.quantity, 0),
    amount: erpNumber(item.amount, 0),
    cost: erpNumber(item.cost, 0),
    grossProfit: erpNumber(item.amount, 0) - erpNumber(item.cost, 0)
  }));

  const salesRows = raw.salesRows || [];
  const daily = new Map();
  const byMonth = daysBetweenInclusive(startDate, endDate) > 92;
  salesRows.forEach((row) => {
    const key = byMonth ? monthKey(row.date) : dateText(row.date);
    const current = daily.get(key) || { date: key, salesTotal: 0, productCost: 0, grossProfit: 0 };
    current.salesTotal += erpNumber(row.total, 0);
    current.productCost += erpNumber(row.productCost, 0);
    daily.set(key, current);
  });
  topProducts.forEach(() => {});
  const revenueTrend = [...daily.values()].map((item) => ({
    date: item.date,
    salesTotal: Math.round(item.salesTotal * 100) / 100
  }));
  const profitTrend = [...daily.values()].map((item) => {
    const productCost = Math.round(item.productCost * 100) / 100;
    return {
      date: item.date,
      salesTotal: Math.round(item.salesTotal * 100) / 100,
      productCost,
      grossProfit: Math.round((item.salesTotal - productCost) * 100) / 100
    };
  });

  const platformTotals = new Map();
  salesRows.forEach((row) => {
    const platform = classifySalesPlatform(row.note);
    const current = platformTotals.get(platform) || 0;
    platformTotals.set(platform, current + erpNumber(row.total, 0));
  });
  const platformRevenue = [...platformTotals.entries()]
    .map(([name, amount]) => ({
      name,
      amount: Math.round(amount * 100) / 100,
      percentage: kpis.salesTotal > 0 ? Math.round((amount / kpis.salesTotal) * 1000) / 10 : 0
    }))
    .sort((a, b) => b.amount - a.amount);

  const inventoryRisk = PG_ENABLED
    ? await pgAll(`
        SELECT name, sku, unit, stock, safety_stock, cost, COALESCE(stock,0) * COALESCE(cost,0) AS "stockCost"
        FROM products
        WHERE company_id = $1 AND COALESCE(stock,0) <= COALESCE(safety_stock,0)
        ORDER BY (COALESCE(stock,0) - COALESCE(safety_stock,0)) ASC, updated_at DESC NULLS LAST
        LIMIT 5
      `, [companyId])
    : db.prepare(`
        SELECT name, sku, unit, stock, safety_stock, cost, COALESCE(stock,0) * COALESCE(cost,0) AS stockCost
        FROM products
        WHERE company_id = ? AND COALESCE(stock,0) <= COALESCE(safety_stock,0)
        ORDER BY (COALESCE(stock,0) - COALESCE(safety_stock,0)) ASC, updated_at DESC
        LIMIT 5
      `).all(companyId);

  const summary = [
    kpis.salesTotal > 0 ? `本期銷貨總額為 NT$${Math.round(kpis.salesTotal).toLocaleString('zh-TW')}。` : '目前此區間尚無銷貨資料。',
    kpis.productCost > 0 ? `商品成本已納入毛利計算，毛利率為 ${kpis.grossMarginRate}%。` : '商品成本目前為 0，請確認商品成本欄位是否完整。',
    kpis.transactionCount > 0 ? `本期共有 ${kpis.transactionCount} 筆銷貨單，平均客單價 NT$${Math.round(kpis.averageOrderValue).toLocaleString('zh-TW')}。` : '目前此區間交易筆數為 0。',
    kpis.lowStockCount > 0 ? `有 ${kpis.lowStockCount} 個品項低於安全庫存。` : '目前沒有低庫存警示。'
  ];

  return {
    kpis,
    revenueTrend,
    profitTrend,
    topProducts,
    platformRevenue,
    inventoryRisk: inventoryRisk.map((item) => ({
      name: item.name,
      sku: item.sku || '',
      unit: item.unit || '',
      stock: erpNumber(item.stock, 0),
      safetyStock: erpNumber(item.safety_stock ?? item.safetyStock, 0),
      cost: erpNumber(item.cost, 0),
      stockCost: erpNumber(item.stockCost ?? item.stock_cost, 0)
    })),
    summary
  };
}

async function handleBusinessBiReport(req, res) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const startDate = dateText(req.query.startDate) || today.slice(0, 8) + '01';
    const endDate = dateText(req.query.endDate) || today;
    const periodDays = daysBetweenInclusive(startDate, endDate);
    const compareEndDate = dateText(req.query.compareEndDate) || addDaysText(startDate, -1);
    const compareStartDate = dateText(req.query.compareStartDate) || addDaysText(compareEndDate, -periodDays + 1);

    const [current, previous] = await Promise.all([
      buildBusinessBi(req.company.id, startDate, endDate),
      buildBusinessBi(req.company.id, compareStartDate, compareEndDate)
    ]);

    res.json({
      range: { companyId: req.company.id, startDate, endDate, compareStartDate, compareEndDate },
      kpis: current.kpis,
      previousKpis: previous.kpis,
      comparison: buildBiComparison(current.kpis, previous.kpis),
      revenueTrend: current.revenueTrend,
      profitTrend: current.profitTrend,
      topProducts: current.topProducts,
      platformRevenue: current.platformRevenue,
      inventoryRisk: current.inventoryRisk,
      summary: current.summary
    });
  } catch (err) {
    return databaseError(res, req.path, req, err);
  }
}

app.get('/api/companies/:companyId/reports/business-bi', auth, company, handleBusinessBiReport);
app.get('/api/reports/business-bi', auth, company, handleBusinessBiReport);

app.get('/api/tenders/stats', auth, async (req, res) => {
  try {
    if (PG_ENABLED) {
      const [
        total,
        latestRun,
        agencyLevels,
        regions,
        categories,
        upcoming,
        highBudget,
        keywordMatches
      ] = await Promise.all([
        pgOne('SELECT COUNT(*)::int AS count FROM tenders'),
        pgOne('SELECT * FROM tender_sync_runs ORDER BY started_at DESC, id DESC LIMIT 1'),
        pgAll('SELECT COALESCE(agency_level, $1) AS key, COUNT(*)::int AS count FROM tenders GROUP BY COALESCE(agency_level, $1) ORDER BY count DESC', ['other']),
        pgAll('SELECT COALESCE(region, $1) AS key, COUNT(*)::int AS count FROM tenders GROUP BY COALESCE(region, $1) ORDER BY count DESC LIMIT 12', ['其他']),
        pgAll('SELECT COALESCE(category, $1) AS key, COUNT(*)::int AS count FROM tenders GROUP BY COALESCE(category, $1) ORDER BY count DESC LIMIT 12', ['工程']),
        pgAll(`
          SELECT t.*, tm.keyword, tm.score, tm.matched_reason
          FROM tenders t
          LEFT JOIN tender_matches tm ON tm.tender_id = t.id AND tm.company_id IS NULL
          WHERE NULLIF(t.deadline_date, '') IS NOT NULL
          ORDER BY t.deadline_date ASC, t.id DESC
          LIMIT 6
        `),
        pgAll(`
          SELECT t.*, tm.keyword, tm.score, tm.matched_reason
          FROM tenders t
          LEFT JOIN tender_matches tm ON tm.tender_id = t.id AND tm.company_id IS NULL
          ORDER BY COALESCE(t.budget_amount, 0) DESC, t.id DESC
          LIMIT 6
        `),
        pgAll(`
          SELECT t.*, tm.keyword, tm.score, tm.matched_reason
          FROM tender_matches tm
          JOIN tenders t ON t.id = tm.tender_id
          WHERE tm.company_id IS NULL
          ORDER BY tm.score DESC, t.deadline_date ASC NULLS LAST, t.id DESC
          LIMIT 8
        `)
      ]);
      return res.json({
        ok: true,
        total: total?.count || 0,
        lastSyncState: lastTenderSyncState,
        latestRun,
        agencyLevels,
        regions,
        categories,
        upcoming: upcoming.map(tenderRow),
        highBudget: highBudget.map(tenderRow),
        keywordMatches: keywordMatches.map(tenderRow)
      });
    }

    const total = db.prepare('SELECT COUNT(*) AS count FROM tenders').get().count || 0;
    const latestRun = db.prepare('SELECT * FROM tender_sync_runs ORDER BY started_at DESC, id DESC LIMIT 1').get() || null;
    const agencyLevels = db.prepare("SELECT COALESCE(agency_level, 'other') AS key, COUNT(*) AS count FROM tenders GROUP BY COALESCE(agency_level, 'other') ORDER BY count DESC").all();
    const regions = db.prepare("SELECT COALESCE(region, '其他') AS key, COUNT(*) AS count FROM tenders GROUP BY COALESCE(region, '其他') ORDER BY count DESC LIMIT 12").all();
    const categories = db.prepare("SELECT COALESCE(category, '工程') AS key, COUNT(*) AS count FROM tenders GROUP BY COALESCE(category, '工程') ORDER BY count DESC LIMIT 12").all();
    const upcoming = db.prepare(`
      SELECT t.*, tm.keyword, tm.score, tm.matched_reason
      FROM tenders t
      LEFT JOIN tender_matches tm ON tm.tender_id = t.id AND tm.company_id IS NULL
      WHERE NULLIF(t.deadline_date, '') IS NOT NULL
      ORDER BY t.deadline_date ASC, t.id DESC
      LIMIT 6
    `).all();
    const highBudget = db.prepare(`
      SELECT t.*, tm.keyword, tm.score, tm.matched_reason
      FROM tenders t
      LEFT JOIN tender_matches tm ON tm.tender_id = t.id AND tm.company_id IS NULL
      ORDER BY COALESCE(t.budget_amount, 0) DESC, t.id DESC
      LIMIT 6
    `).all();
    const keywordMatches = db.prepare(`
      SELECT t.*, tm.keyword, tm.score, tm.matched_reason
      FROM tender_matches tm
      JOIN tenders t ON t.id = tm.tender_id
      WHERE tm.company_id IS NULL
      ORDER BY tm.score DESC, t.deadline_date ASC, t.id DESC
      LIMIT 8
    `).all();
    return res.json({ ok: true, total, lastSyncState: lastTenderSyncState, latestRun, agencyLevels, regions, categories, upcoming: upcoming.map(tenderRow), highBudget: highBudget.map(tenderRow), keywordMatches: keywordMatches.map(tenderRow) });
  } catch (err) {
    return databaseError(res, req.path, req, err);
  }
});

function tenderWatchKeywordRow(row = {}) {
  return {
    id: row.id,
    companyId: row.company_id,
    keyword: row.keyword || '',
    region: row.region || '',
    category: row.category || '',
    minBudget: Number(row.min_budget || 0),
    maxBudget: Number(row.max_budget || 0),
    isActive: Number(row.is_active ?? 1) === 1,
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
}

function normalizeTenderWatchKeywordInput(body = {}) {
  return {
    keyword: String(body.keyword || '').trim().slice(0, 80),
    region: String(body.region || '').trim().slice(0, 40),
    category: String(body.category || '').trim().slice(0, 40),
    minBudget: Math.max(0, Number(body.minBudget ?? body.min_budget ?? 0) || 0),
    maxBudget: Math.max(0, Number(body.maxBudget ?? body.max_budget ?? 0) || 0),
    isActive: body.isActive === false || body.is_active === 0 || body.is_active === false ? 0 : 1
  };
}

app.get('/api/companies/:companyId/tender-radar/status', auth, company, async (req, res) => {
  try {
    const status = await getTenderRadarSyncState(req.company.id);
    res.json({ ok: true, ...status });
  } catch (err) {
    return databaseError(res, req.path, req, err);
  }
});

app.post('/api/companies/:companyId/tenders/refresh', auth, company, requireRole('owner', 'admin', 'staff'), async (req, res) => {
  try {
    await setTenderRadarSyncState(req.company.id, 'syncing');
    const result = await runTenderSync({ source: req.body?.source || 'all', triggeredBy: req.user.email || req.user.id });

    if (!result.ok && result.code === 'TENDER_SYNC_RUNNING') {
      const state = await getTenderRadarSyncState(req.company.id);
      return res.status(202).json({ ok: false, code: result.code, message: result.message, syncState: state });
    }

    const nextState = await setTenderRadarSyncState(req.company.id, result.ok ? 'success' : 'failed', {
      errorMessage: result.errorMessage || result.error || ''
    });

    if (!result.ok && result.code === 'TENDER_SYNC_FAILED') {
      return res.status(503).json({ ok: false, code: result.code, error: result.error, detail: result.errorMessage || '', syncState: nextState });
    }

    res.json({ ok: true, result, syncState: nextState });
  } catch (err) {
    try {
      await setTenderRadarSyncState(req.company.id, 'failed', { errorMessage: err.message || String(err) });
    } catch {
      // ignore status write failure and return the original error
    }
    return databaseError(res, req.path, req, err);
  }
});

app.get('/api/companies/:companyId/tender-keywords', auth, company, async (req, res) => {
  try {
    const rows = PG_ENABLED
      ? await pgAll('SELECT * FROM tender_watch_keywords WHERE company_id = $1 ORDER BY is_active DESC, updated_at DESC, id DESC', [req.company.id])
      : db.prepare('SELECT * FROM tender_watch_keywords WHERE company_id = ? ORDER BY is_active DESC, updated_at DESC, id DESC').all(req.company.id);
    res.json(rows.map(tenderWatchKeywordRow));
  } catch (err) {
    return databaseError(res, req.path, req, err);
  }
});

app.post('/api/companies/:companyId/tender-keywords', auth, company, requireRole('owner', 'admin', 'staff'), async (req, res) => {
  const input = normalizeTenderWatchKeywordInput(req.body);
  if (!input.keyword) return res.status(400).json({ error: '請輸入監控關鍵字' });
  if (input.maxBudget > 0 && input.maxBudget < input.minBudget) return res.status(400).json({ error: '最高預算不可小於最低預算' });

  try {
    if (PG_ENABLED) {
      const row = await pgOne(`
        INSERT INTO tender_watch_keywords (
          company_id, keyword, region, category, min_budget, max_budget, is_active, created_at, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        RETURNING *
      `, [req.company.id, input.keyword, input.region, input.category, input.minBudget, input.maxBudget, input.isActive]);
      audit(req.company.id, req.user.id, 'tender_keyword_created', String(row.id));
      return res.json(tenderWatchKeywordRow(row));
    }

    const result = db.prepare(`
      INSERT INTO tender_watch_keywords (
        company_id, keyword, region, category, min_budget, max_budget, is_active, created_at, updated_at
      )
      VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `).run(req.company.id, input.keyword, input.region, input.category, input.minBudget, input.maxBudget, input.isActive);
    audit(req.company.id, req.user.id, 'tender_keyword_created', String(result.lastInsertRowid));
    const row = db.prepare('SELECT * FROM tender_watch_keywords WHERE id = ? AND company_id = ?').get(result.lastInsertRowid, req.company.id);
    return res.json(tenderWatchKeywordRow(row));
  } catch (err) {
    return databaseError(res, req.path, req, err);
  }
});

app.put('/api/companies/:companyId/tender-keywords/:keywordId', auth, company, requireRole('owner', 'admin', 'staff'), async (req, res) => {
  const keywordId = Number(req.params.keywordId);
  const input = normalizeTenderWatchKeywordInput(req.body);
  if (!input.keyword) return res.status(400).json({ error: '請輸入監控關鍵字' });
  if (input.maxBudget > 0 && input.maxBudget < input.minBudget) return res.status(400).json({ error: '最高預算不可小於最低預算' });

  try {
    if (PG_ENABLED) {
      const row = await pgOne(`
        UPDATE tender_watch_keywords
        SET keyword = $1,
            region = $2,
            category = $3,
            min_budget = $4,
            max_budget = $5,
            is_active = $6,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $7 AND company_id = $8
        RETURNING *
      `, [input.keyword, input.region, input.category, input.minBudget, input.maxBudget, input.isActive, keywordId, req.company.id]);
      if (!row) return res.status(404).json({ error: '找不到此監控關鍵字' });
      audit(req.company.id, req.user.id, 'tender_keyword_updated', String(keywordId));
      return res.json(tenderWatchKeywordRow(row));
    }

    const result = db.prepare(`
      UPDATE tender_watch_keywords
      SET keyword = ?,
          region = ?,
          category = ?,
          min_budget = ?,
          max_budget = ?,
          is_active = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND company_id = ?
    `).run(input.keyword, input.region, input.category, input.minBudget, input.maxBudget, input.isActive, keywordId, req.company.id);
    if (!result.changes) return res.status(404).json({ error: '找不到此監控關鍵字' });
    audit(req.company.id, req.user.id, 'tender_keyword_updated', String(keywordId));
    const row = db.prepare('SELECT * FROM tender_watch_keywords WHERE id = ? AND company_id = ?').get(keywordId, req.company.id);
    return res.json(tenderWatchKeywordRow(row));
  } catch (err) {
    return databaseError(res, req.path, req, err);
  }
});

app.delete('/api/companies/:companyId/tender-keywords/:keywordId', auth, company, requireRole('owner', 'admin', 'staff'), async (req, res) => {
  const keywordId = Number(req.params.keywordId);

  try {
    if (PG_ENABLED) {
      const result = await pgQuery('DELETE FROM tender_watch_keywords WHERE id = $1 AND company_id = $2', [keywordId, req.company.id]);
      if (!result.rowCount) return res.status(404).json({ error: '找不到此監控關鍵字' });
      audit(req.company.id, req.user.id, 'tender_keyword_deleted', String(keywordId));
      return res.json({ ok: true });
    }

    const result = db.prepare('DELETE FROM tender_watch_keywords WHERE id = ? AND company_id = ?').run(keywordId, req.company.id);
    if (!result.changes) return res.status(404).json({ error: '找不到此監控關鍵字' });
    audit(req.company.id, req.user.id, 'tender_keyword_deleted', String(keywordId));
    return res.json({ ok: true });
  } catch (err) {
    return databaseError(res, req.path, req, err);
  }
});

app.get('/api/tenders/sync-runs', auth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 10) || 10, 50);
    const rows = PG_ENABLED
      ? await pgAll('SELECT * FROM tender_sync_runs ORDER BY started_at DESC, id DESC LIMIT $1', [limit])
      : db.prepare('SELECT * FROM tender_sync_runs ORDER BY started_at DESC, id DESC LIMIT ?').all(limit);
    res.json({ ok: true, rows });
  } catch (err) {
    return databaseError(res, req.path, req, err);
  }
});

app.get('/api/tenders', auth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 80) || 80, 200);
    const q = String(req.query.search || req.query.q || '').trim();
    const region = String(req.query.region || '').trim();
    const agencyLevel = String(req.query.agency_level || req.query.agencyLevel || '').trim();
    const category = String(req.query.category || '').trim();

    if (PG_ENABLED) {
      const params = [];
      const where = [];
      if (q) {
        params.push(`%${q}%`);
        where.push(`(t.tender_name ILIKE $${params.length} OR t.agency_name ILIKE $${params.length} OR t.region ILIKE $${params.length} OR t.category ILIKE $${params.length})`);
      }
      if (region && region !== '全部地區') {
        params.push(region);
        where.push(`t.region = $${params.length}`);
      }
      if (agencyLevel && agencyLevel !== '全部機關') {
        params.push(agencyLevel);
        where.push(`t.agency_level = $${params.length}`);
      }
      if (category && category !== '全部工程') {
        params.push(category);
        where.push(`t.category = $${params.length}`);
      }
      params.push(limit);
      const rows = await pgAll(`
        SELECT t.*, tm.keyword, tm.score, tm.matched_reason
        FROM tenders t
        LEFT JOIN tender_matches tm ON tm.tender_id = t.id AND tm.company_id IS NULL
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY COALESCE(t.deadline_date, '') ASC, t.publish_date DESC NULLS LAST, t.id DESC
        LIMIT $${params.length}
      `, params);
      return res.json({ ok: true, items: rows.map(tenderRow), total: rows.length });
    }

    const params = [];
    const where = [];
    if (q) {
      const like = `%${q}%`;
      where.push('(t.tender_name LIKE ? OR t.agency_name LIKE ? OR t.region LIKE ? OR t.category LIKE ?)');
      params.push(like, like, like, like);
    }
    if (region && region !== '全部地區') {
      where.push('t.region = ?');
      params.push(region);
    }
    if (agencyLevel && agencyLevel !== '全部機關') {
      where.push('t.agency_level = ?');
      params.push(agencyLevel);
    }
    if (category && category !== '全部工程') {
      where.push('t.category = ?');
      params.push(category);
    }
    params.push(limit);
    const rows = db.prepare(`
      SELECT t.*, tm.keyword, tm.score, tm.matched_reason
      FROM tenders t
      LEFT JOIN tender_matches tm ON tm.tender_id = t.id AND tm.company_id IS NULL
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY COALESCE(t.deadline_date, '') ASC, t.publish_date DESC, t.id DESC
      LIMIT ?
    `).all(...params);
    return res.json({ ok: true, items: rows.map(tenderRow), total: rows.length });
  } catch (err) {
    return databaseError(res, req.path, req, err);
  }
});

app.get('/api/tenders/:id', auth, async (req, res) => {
  try {
    const row = PG_ENABLED
      ? await pgOne(`
        SELECT t.*, tm.keyword, tm.score, tm.matched_reason
        FROM tenders t
        LEFT JOIN tender_matches tm ON tm.tender_id = t.id AND tm.company_id IS NULL
        WHERE t.id = $1
      `, [req.params.id])
      : db.prepare(`
        SELECT t.*, tm.keyword, tm.score, tm.matched_reason
        FROM tenders t
        LEFT JOIN tender_matches tm ON tm.tender_id = t.id AND tm.company_id IS NULL
        WHERE t.id = ?
      `).get(req.params.id);
    if (!row) return res.status(404).json({ error: '找不到標案資料' });
    res.json(tenderRow(row));
  } catch (err) {
    return databaseError(res, req.path, req, err);
  }
});

app.post('/api/admin/tenders/sync-now', auth, requireAdmin, async (req, res) => {
  const result = await runTenderSync({ source: req.body?.source || 'all', triggeredBy: req.user.email || req.user.id });
  if (!result.ok && result.code === 'TENDER_SYNC_FAILED') {
    return res.status(503).json({ ok: false, error: '標案資料同步暫時失敗，系統已保留既有資料。', code: 'TENDER_SYNC_FAILED', detail: result.errorMessage || '' });
  }
  res.json(result);
});

app.get('/api/admin/tenders/sources', auth, requireAdmin, (req, res) => {
  res.json({
    ok: true,
    sources: [
      { key: 'official_open_data', label: '官方開放資料', configured: Boolean(process.env.TENDER_OFFICIAL_SOURCE_URL) },
      { key: 'government_procurement', label: '政府採購資料來源', configured: Boolean(process.env.TENDER_GOV_PROCUREMENT_URL) },
      { key: 'local_government', label: '地方政府資料集', configured: Boolean(process.env.TENDER_LOCAL_SOURCE_URL) },
      { key: 'fallback_snapshot', label: '內建公開格式快照', configured: true },
      { key: 'manual_import', label: '手動匯入', configured: false }
    ],
    running: tenderSyncRunning,
    lastTenderSyncState
  });
});

app.put('/api/admin/tenders/keywords', auth, requireAdmin, async (req, res) => {
  const keyword = String(req.body?.keyword || '').trim();
  if (!keyword) return res.status(400).json({ error: '請輸入關鍵字' });
  const category = String(req.body?.category || '工程').trim();
  const productLine = String(req.body?.productLine || req.body?.product_line || 'engineering').trim();
  const enabled = req.body?.enabled === false ? 0 : 1;
  try {
    if (PG_ENABLED) {
      const row = await pgOne(`
        INSERT INTO tender_keywords (keyword, category, product_line, enabled)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (keyword) DO UPDATE SET category = EXCLUDED.category, product_line = EXCLUDED.product_line, enabled = EXCLUDED.enabled
        RETURNING *
      `, [keyword, category, productLine, enabled]);
      return res.json({ ok: true, keyword: row });
    }
    db.prepare(`
      INSERT INTO tender_keywords (keyword, category, product_line, enabled)
      VALUES (?,?,?,?)
      ON CONFLICT(keyword) DO UPDATE SET category = excluded.category, product_line = excluded.product_line, enabled = excluded.enabled
    `).run(keyword, category, productLine, enabled);
    const row = db.prepare('SELECT * FROM tender_keywords WHERE keyword = ?').get(keyword);
    return res.json({ ok: true, keyword: row });
  } catch (err) {
    return databaseError(res, req.path, req, err);
  }
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

async function getLeadPg(companyId, leadId) {
  return pgOne(`
    SELECT *
    FROM leads
    WHERE id = $1
      AND company_id = $2
  `, [leadId, companyId]);
}

app.get('/api/companies/:companyId/leads', auth, company, async (req, res) => {
  const where = ['company_id = ?'];
  const params = [req.company.id];
  const pgWhere = ['company_id = $1'];
  const pgParams = [req.company.id];

  if (req.query.status) {
    where.push('status = ?');
    params.push(req.query.status);
    pgParams.push(req.query.status);
    pgWhere.push(`status = $${pgParams.length}`);
  }

  if (req.query.source) {
    where.push('source = ?');
    params.push(req.query.source);
    pgParams.push(req.query.source);
    pgWhere.push(`source = $${pgParams.length}`);
  }

  if (req.query.project_type) {
    where.push('project_type = ?');
    params.push(req.query.project_type);
    pgParams.push(req.query.project_type);
    pgWhere.push(`project_type = $${pgParams.length}`);
  }

  if (req.query.risk_level) {
    where.push('risk_level = ?');
    params.push(req.query.risk_level);
    pgParams.push(req.query.risk_level);
    pgWhere.push(`risk_level = $${pgParams.length}`);
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

    const start = pgParams.length + 1;
    pgWhere.push(`(
      title ILIKE $${start}
      OR client_name ILIKE $${start + 1}
      OR client_phone ILIKE $${start + 2}
      OR source ILIKE $${start + 3}
      OR region ILIKE $${start + 4}
      OR project_type ILIKE $${start + 5}
      OR note ILIKE $${start + 6}
    )`);
    pgParams.push(q, q, q, q, q, q, q);
  }

  if (PG_ENABLED) {
    try {
      const rows = await pgAll(`
        SELECT *
        FROM leads
        WHERE ${pgWhere.join(' AND ')}
        ORDER BY created_at DESC, id DESC
      `, pgParams);
      return res.json(rows.map(leadRow));
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

  const rows = db.prepare(`
    SELECT *
    FROM leads
    WHERE ${where.join(' AND ')}
    ORDER BY created_at DESC, id DESC
  `).all(...params);

  res.json(rows.map(leadRow));
});

app.post('/api/companies/:companyId/leads', auth, company, requireRole('owner', 'admin', 'staff'), async (req, res) => {
  const input = normalizeLeadInput(req.body);

  if (!input.title) {
    return res.status(400).json({ error: '請輸入案源名稱' });
  }

  if (input.tenderRef) {
    try {
      const duplicate = PG_ENABLED
        ? await pgOne('SELECT * FROM leads WHERE company_id = $1 AND tender_ref = $2 LIMIT 1', [req.company.id, input.tenderRef])
        : db.prepare('SELECT * FROM leads WHERE company_id = ? AND tender_ref = ? LIMIT 1').get(req.company.id, input.tenderRef);
      if (duplicate) {
        return res.status(409).json({ error: '此標案已匯入接案中心', lead: leadRow(duplicate) });
      }
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

  if (PG_ENABLED) {
    try {
      const row = await pgOne(`
        INSERT INTO leads (
          company_id, title, client_name, client_phone, source, region,
          agency_type, project_type, estimated_amount, estimated_cost,
          expected_margin, risk_level, fit_score, status, next_action,
          note, tender_source, tender_ref, created_at, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        RETURNING *
      `, [
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
      ]);
      audit(req.company.id, req.user.id, 'lead_created', String(row.id));
      return res.json(leadRow(row));
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
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

app.patch('/api/companies/:companyId/leads/:leadId', auth, company, requireRole('owner', 'admin', 'staff'), async (req, res) => {
  const leadId = Number(req.params.leadId);
  const existing = PG_ENABLED ? await getLeadPg(req.company.id, leadId) : getLead(req.company.id, leadId);

  if (!existing) {
    return res.status(404).json({ error: '找不到此案源，或你沒有權限修改' });
  }

  const input = normalizeLeadInput(req.body, existing);

  if (!input.title) {
    return res.status(400).json({ error: '請輸入案源名稱' });
  }

  if (PG_ENABLED) {
    try {
      const row = await pgOne(`
        UPDATE leads
        SET
          title = $1,
          client_name = $2,
          client_phone = $3,
          source = $4,
          region = $5,
          agency_type = $6,
          project_type = $7,
          estimated_amount = $8,
          estimated_cost = $9,
          expected_margin = $10,
          risk_level = $11,
          fit_score = $12,
          status = $13,
          next_action = $14,
          note = $15,
          tender_source = $16,
          tender_ref = $17,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $18
          AND company_id = $19
        RETURNING *
      `, [
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
      ]);
      audit(req.company.id, req.user.id, 'lead_updated', String(leadId));
      return res.json(leadRow(row));
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
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

app.delete('/api/companies/:companyId/leads/:leadId', auth, company, requireRole('owner', 'admin', 'staff'), async (req, res) => {
  const leadId = Number(req.params.leadId);
  const existing = PG_ENABLED ? await getLeadPg(req.company.id, leadId) : getLead(req.company.id, leadId);

  if (!existing) {
    return res.status(404).json({ error: '找不到此案源，或你沒有權限刪除' });
  }

  if (PG_ENABLED) {
    try {
      await pgQuery('DELETE FROM leads WHERE id = $1 AND company_id = $2', [leadId, req.company.id]);
      audit(req.company.id, req.user.id, 'lead_deleted', String(leadId));
      return res.json({ ok: true });
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

  db.prepare(`
    DELETE FROM leads
    WHERE id = ?
      AND company_id = ?
  `).run(leadId, req.company.id);

  audit(req.company.id, req.user.id, 'lead_deleted', String(leadId));

  res.json({ ok: true });
});

app.post('/api/companies/:companyId/leads/:leadId/convert-to-jobsite', auth, company, requireRole('owner', 'admin'), async (req, res) => {
  const leadId = Number(req.params.leadId);
  const lead = PG_ENABLED ? await getLeadPg(req.company.id, leadId) : getLead(req.company.id, leadId);

  if (!lead) {
    return res.status(404).json({ error: '找不到此案源，或你沒有權限轉成案場' });
  }

  if (lead.converted_job_site_id) {
    return res.status(400).json({ error: '此案源已轉成案場' });
  }

  if (PG_ENABLED) {
    let client;
    try {
      const pgPool = await getPool();
      client = await pgPool.connect();
      await client.query('BEGIN');
      const created = await client.query(`
        INSERT INTO job_sites (
          company_id, name, site_name, client_name, client_phone, address,
          project_type, quote_amount, subtotal_amount, total_amount,
          status, note, created_at, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$8,$9,$10,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        RETURNING id
      `, [
        req.company.id,
        lead.title,
        lead.title,
        lead.client_name || '',
        lead.client_phone || '',
        lead.region || '',
        lead.project_type || '',
        Number(lead.estimated_amount || 0),
        '已簽約',
        lead.note || '由接案中心轉成案場'
      ]);
      const jobSiteId = created.rows[0].id;
      await client.query(`
        UPDATE leads
        SET status = 'converted',
            converted_job_site_id = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND company_id = $3
      `, [jobSiteId, leadId, req.company.id]);
      await client.query('COMMIT');

      audit(req.company.id, req.user.id, 'lead_converted_to_jobsite', `${leadId} -> ${jobSiteId}`);
      const [updatedLead, jobSite] = await Promise.all([
        getLeadPg(req.company.id, leadId),
        pgOne(`
          SELECT
            id,
            company_id AS "companyId",
            COALESCE(site_name, name) AS "siteName",
            COALESCE(client_name, '') AS "clientName",
            COALESCE(client_phone, '') AS "clientPhone",
            COALESCE(address, '') AS address,
            COALESCE(project_type, '') AS "projectType",
            COALESCE(quote_amount, 0) AS "quoteAmount",
            COALESCE(status, '已簽約') AS status,
            COALESCE(note, '') AS note,
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          FROM job_sites
          WHERE id = $1 AND company_id = $2
        `, [jobSiteId, req.company.id])
      ]);
      return res.json({ lead: leadRow(updatedLead), jobSite });
    } catch (err) {
      try {
        if (client) await client.query('ROLLBACK');
      } catch {
        // ignore rollback errors
      }
      return databaseError(res, req.path, req, err);
    } finally {
      if (client) client.release();
    }
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

if (DB_PROVIDER === 'sqlite') try {
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

app.get('/api/companies/:companyId/jobsites/bi-payments', auth, company, async (req, res) => {
  if (PG_ENABLED) {
    try {
      const rows = await pgAll(`
        SELECT
          job_site_id AS "jobSiteId",
          COALESCE(amount, 0) AS amount,
          payment_date AS "paymentDate"
        FROM job_site_payments
        WHERE company_id = $1
        ORDER BY payment_date ASC, id ASC
      `, [req.company.id]);
      return res.json(rows);
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

  const rows = db.prepare(`
    SELECT
      job_site_id AS jobSiteId,
      COALESCE(amount, 0) AS amount,
      payment_date AS paymentDate
    FROM job_site_payments
    WHERE company_id = ?
    ORDER BY payment_date ASC, id ASC
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


app.patch('/api/companies/:companyId/jobsites/:jobsiteId', auth, company, requireRole('owner', 'admin'), async (req, res) => {
  const jobsiteId = Number(req.params.jobsiteId);

  if (!jobsiteId) {
    return res.status(400).json({ error: '缺少 jobsiteId' });
  }

  const { updates, error } = buildJobSitePatch(req.body || {});
  if (error) return res.status(400).json({ error });
  if (!updates.size) return res.status(400).json({ error: '沒有可更新的案場欄位' });

  if (PG_ENABLED) {
    try {
      const { setSql, values } = buildPatchSet(updates, '$');
      const updated = await pgOne(`
        UPDATE job_sites
        SET ${setSql},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $${values.length + 1}
          AND company_id = $${values.length + 2}
        RETURNING
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
      `, [...values, jobsiteId, req.company.id]);
      if (!updated) return res.status(404).json({ error: '找不到此案場，或你沒有權限修改' });
      audit(req.company.id, req.user.id, 'jobsite_updated', String(jobsiteId));
      return res.json(updated);
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

  const { setSql, values } = buildPatchSet(updates);
  const result = db.prepare(`
    UPDATE job_sites
    SET ${setSql},
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND company_id = ?
  `).run(...values, jobsiteId, req.company.id);

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

app.delete('/api/companies/:companyId/jobsites/:jobsiteId', auth, company, requireRole('owner', 'admin'), async (req, res) => {
  const jobsiteId = Number(req.params.jobsiteId);

  if (!jobsiteId) {
    return res.status(400).json({ error: '缺少案場 ID' });
  }

  if (PG_ENABLED) {
    let client;
    try {
      const pool = await getPool();
      client = await pool.connect();
      await client.query('BEGIN');
      const site = await client.query('SELECT id FROM job_sites WHERE id = $1 AND company_id = $2', [jobsiteId, req.company.id]);
      if (!site.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: '找不到此案場，或你沒有權限刪除' });
      }
      const deletedEstimateItems = await client.query('DELETE FROM job_site_estimate_items WHERE company_id = $1 AND job_site_id = $2', [req.company.id, jobsiteId]);
      const deletedPayments = await client.query('DELETE FROM job_site_payments WHERE company_id = $1 AND job_site_id = $2', [req.company.id, jobsiteId]);
      const detachedInventoryMovements = await client.query('UPDATE inventory_movements SET job_site_id = NULL WHERE company_id = $1 AND job_site_id = $2', [req.company.id, jobsiteId]);
      const deletedJobSite = await client.query('DELETE FROM job_sites WHERE id = $1 AND company_id = $2', [jobsiteId, req.company.id]);
      if (!deletedJobSite.rowCount) throw new Error('案場刪除失敗，找不到資料');
      await client.query('COMMIT');
      audit(req.company.id, req.user.id, 'jobsite_deleted', JSON.stringify({ jobsiteId, deletedEstimateItems: deletedEstimateItems.rowCount, deletedPayments: deletedPayments.rowCount, detachedInventoryMovements: detachedInventoryMovements.rowCount }));
      return res.json({
        ok: true,
        deletedJobSite: deletedJobSite.rowCount,
        deletedEstimateItems: deletedEstimateItems.rowCount,
        deletedPayments: deletedPayments.rowCount,
        detachedInventoryMovements: detachedInventoryMovements.rowCount
      });
    } catch (err) {
      try {
        if (client) await client.query('ROLLBACK');
      } catch {}
      return databaseError(res, req.path, req, err);
    } finally {
      if (client) client.release();
    }
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

async function refreshJobSiteEstimateTotalsPg(companyId, jobsiteId) {
  const totals = await pgOne(`
    SELECT
      COALESCE(SUM(amount), 0) AS "estimateTotal",
      COALESCE(SUM(cost_amount), 0) AS "estimateCostTotal"
    FROM job_site_estimate_items
    WHERE company_id = $1
      AND job_site_id = $2
  `, [companyId, jobsiteId]);

  const site = await pgOne(`
    SELECT
      COALESCE(tax_mode, 'not_taxed') AS "taxMode",
      COALESCE(tax_rate, 0.05) AS "taxRate"
    FROM job_sites
    WHERE company_id = $1
      AND id = $2
  `, [companyId, jobsiteId]);

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

  await pgQuery(`
    UPDATE job_sites
    SET quote_amount = $1,
        subtotal_amount = $2,
        tax_amount = $3,
        total_amount = $4,
        estimate_cost_total = $5,
        updated_at = CURRENT_TIMESTAMP
    WHERE company_id = $6
      AND id = $7
  `, [totalAmount, subtotalAmount, taxAmount, totalAmount, estimateCostTotal, companyId, jobsiteId]);

  return { estimateTotal, estimateCostTotal, subtotalAmount, taxAmount, totalAmount, taxMode, taxRate };
}


app.get('/api/companies/:companyId/jobsites/:jobsiteId/estimate-items', auth, company, async (req, res) => {
  const jobsiteId = Number(req.params.jobsiteId);

  if (!jobsiteId) {
    return res.status(400).json({ error: '缺少 jobsiteId' });
  }

  if (PG_ENABLED) {
    try {
      const jobsite = await pgOne('SELECT id FROM job_sites WHERE id = $1 AND company_id = $2', [jobsiteId, req.company.id]);
      if (!jobsite) return res.status(404).json({ error: '找不到此案場，或你沒有權限查看估價明細' });
      const items = await pgAll(`
        SELECT
          id,
          company_id AS "companyId",
          job_site_id AS "jobSiteId",
          work_type AS "workType",
          item_category AS "itemCategory",
          item_name AS "itemName",
          quantity,
          unit,
          unit_price AS "unitPrice",
          amount,
          cost_amount AS "costAmount",
          note,
          sort_order AS "sortOrder",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM job_site_estimate_items
        WHERE company_id = $1
          AND job_site_id = $2
        ORDER BY sort_order ASC, id ASC
      `, [req.company.id, jobsiteId]);
      const totals = await refreshJobSiteEstimateTotalsPg(req.company.id, jobsiteId);
      return res.json({ items, totals });
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
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

app.post('/api/companies/:companyId/jobsites/:jobsiteId/estimate-items', auth, company, requireRole('owner', 'admin'), async (req, res) => {
  const jobsiteId = Number(req.params.jobsiteId);

  if (!jobsiteId) {
    return res.status(400).json({ error: '缺少 jobsiteId' });
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

  if (PG_ENABLED) {
    try {
      const jobsite = await pgOne('SELECT id, project_type FROM job_sites WHERE id = $1 AND company_id = $2', [jobsiteId, req.company.id]);
      if (!jobsite) return res.status(404).json({ error: '找不到此案場，或你沒有權限新增估價明細' });
      const item = await pgOne(`
        INSERT INTO job_site_estimate_items (
          company_id, job_site_id, work_type, item_category, item_name,
          quantity, unit, unit_price, amount, cost_amount, note, sort_order,
          created_at, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        RETURNING
          id,
          company_id AS "companyId",
          job_site_id AS "jobSiteId",
          work_type AS "workType",
          item_category AS "itemCategory",
          item_name AS "itemName",
          quantity,
          unit,
          unit_price AS "unitPrice",
          amount,
          cost_amount AS "costAmount",
          note,
          sort_order AS "sortOrder",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `, [req.company.id, jobsiteId, workType || jobsite.project_type || '', itemCategory || 'estimate', finalItemName, finalQuantity, unit || '', finalUnitPrice, finalAmount, Number(costAmount || 0), note || '', Number(sortOrder || 0)]);
      const totals = await refreshJobSiteEstimateTotalsPg(req.company.id, jobsiteId);
      audit(req.company.id, req.user.id, 'jobsite_estimate_item_created', String(item.id));
      return res.json({ item, totals });
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

  const jobsite = ensureJobSite(req.company.id, jobsiteId);

  if (!jobsite) {
    return res.status(404).json({ error: '找不到此案場，或你沒有權限新增估價明細' });
  }

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

app.put('/api/companies/:companyId/jobsites/:jobsiteId/estimate-items/:itemId', auth, company, requireRole('owner', 'admin'), async (req, res) => {
  const jobsiteId = Number(req.params.jobsiteId);
  const itemId = Number(req.params.itemId);

  if (!jobsiteId || !itemId) {
    return res.status(400).json({ error: '缺少 jobsiteId 或 itemId' });
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

  if (PG_ENABLED) {
    try {
      const jobsite = await pgOne('SELECT id, project_type FROM job_sites WHERE id = $1 AND company_id = $2', [jobsiteId, req.company.id]);
      if (!jobsite) return res.status(404).json({ error: '找不到此案場，或你沒有權限編輯估價明細' });
      const item = await pgOne(`
        UPDATE job_site_estimate_items
        SET work_type = $1,
            item_category = $2,
            item_name = $3,
            quantity = $4,
            unit = $5,
            unit_price = $6,
            amount = $7,
            cost_amount = $8,
            note = $9,
            sort_order = $10,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $11
          AND job_site_id = $12
          AND company_id = $13
        RETURNING
          id,
          company_id AS "companyId",
          job_site_id AS "jobSiteId",
          work_type AS "workType",
          item_category AS "itemCategory",
          item_name AS "itemName",
          quantity,
          unit,
          unit_price AS "unitPrice",
          amount,
          cost_amount AS "costAmount",
          note,
          sort_order AS "sortOrder",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `, [workType || jobsite.project_type || '', itemCategory || 'estimate', finalItemName, finalQuantity, unit || '', finalUnitPrice, finalAmount, Number(costAmount || 0), note || '', Number(sortOrder || 0), itemId, jobsiteId, req.company.id]);
      if (!item) return res.status(404).json({ error: '找不到此估價明細' });
      const totals = await refreshJobSiteEstimateTotalsPg(req.company.id, jobsiteId);
      audit(req.company.id, req.user.id, 'jobsite_estimate_item_updated', String(itemId));
      return res.json({ item, totals });
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
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

app.delete('/api/companies/:companyId/jobsites/:jobsiteId/estimate-items/:itemId', auth, company, requireRole('owner', 'admin'), async (req, res) => {
  const jobsiteId = Number(req.params.jobsiteId);
  const itemId = Number(req.params.itemId);

  if (!jobsiteId || !itemId) {
    return res.status(400).json({ error: '缺少 jobsiteId 或 itemId' });
  }

  if (PG_ENABLED) {
    try {
      const jobsite = await pgOne('SELECT id FROM job_sites WHERE id = $1 AND company_id = $2', [jobsiteId, req.company.id]);
      if (!jobsite) return res.status(404).json({ error: '找不到此案場，或你沒有權限刪除估價明細' });
      const result = await pgQuery(`
        DELETE FROM job_site_estimate_items
        WHERE id = $1
          AND job_site_id = $2
          AND company_id = $3
      `, [itemId, jobsiteId, req.company.id]);
      if (!result.rowCount) return res.status(404).json({ error: '找不到此估價明細' });
      const totals = await refreshJobSiteEstimateTotalsPg(req.company.id, jobsiteId);
      audit(req.company.id, req.user.id, 'jobsite_estimate_item_deleted', String(itemId));
      return res.json({ ok: true, totals });
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
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

app.post('/api/companies/:companyId/integrations/:platformKey/sync', auth, company, requireRole('owner', 'admin', 'staff'), async (req, res) => {
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

    if (PG_ENABLED) {
      try {
        const row = await pgOne(`
          INSERT INTO transactions (
            company_id, platform_key, channel_type, external_order_id, gross_amount,
            platform_fee, discount_amount, shipping_fee, refund_amount, net_amount,
            tax_amount, cost_of_goods_sold, platform_profit, profit, items_json
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13,$14)
          RETURNING id
        `, [
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
        ]);

        inserted.push({
          id: row.id,
          orderId,
          gross,
          net,
          profit
        });
        continue;
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

  if (PG_ENABLED) {
    try {
      await pgQuery(`
        INSERT INTO platform_accounts (company_id, platform_key, status, last_sync_at, updated_at)
        VALUES ($1,$2,$3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT (company_id, platform_key) DO UPDATE SET
          status = EXCLUDED.status,
          last_sync_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      `, [req.company.id, p.platformKey, 'mock']);
      audit(req.company.id, req.user.id, 'integration_sync', `${p.platformKey} ${count}筆`);
      return res.json({ ok: true, inserted });
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
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

app.get('/api/companies/:companyId/invoices', auth, company, async (req, res) => {
  if (PG_ENABLED) {
    try {
      const rows = await pgAll(`
        SELECT *
        FROM invoices
        WHERE company_id = $1
        ORDER BY created_at DESC, id DESC
      `, [req.company.id]);
      return res.json(rows);
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

  const rows = db.prepare(`
    SELECT *
    FROM invoices
    WHERE company_id = ?
    ORDER BY created_at DESC
  `).all(req.company.id);

  res.json(rows);
});

app.post('/api/companies/:companyId/invoices', auth, company, requireRole('owner', 'admin', 'accounting'), async (req, res) => {
  const b = req.body;
  const amount = Number(b.amountExclTax || 0);
  const tax = Math.round(amount * 0.05 * 100) / 100;
  const incl = amount + tax;
  const invoiceNo = b.invoiceNo || `BK-${Date.now()}`;

  if (PG_ENABLED) {
    try {
      const row = await pgOne(`
        INSERT INTO invoices (
          company_id, invoice_no, invoice_type, buyer_name, buyer_tax_id,
          amount_excl_tax, tax_amount, amount_incl_tax, status, issued_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *
      `, [
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
      ]);

      audit(req.company.id, req.user.id, 'invoice_created', invoiceNo);
      return res.json({
        id: row.id,
        invoiceNo,
        taxAmount: tax,
        amountInclTax: incl
      });
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

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

app.put('/api/companies/:companyId/products/:id', auth, company, requireRole('owner', 'admin'), async (req, res) => {
  const p = req.body || {};
  const name = String(p.name || '').trim();
  if (!name) return res.status(400).json({ error: '請輸入商品 / 材料名稱' });

  if (PG_ENABLED) {
    try {
      const row = await pgOne(`
        UPDATE products
        SET sku = $1,
            name = $2,
            category = $3,
            unit = $4,
            price = $5,
            cost = $6,
            stock = $7,
            safety_stock = $8,
            supplier = $9,
            storage_location = $10,
            note = $11,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $12 AND company_id = $13
        RETURNING *
      `, [
        p.sku || '',
        name,
        p.category || '',
        p.unit || '',
        Number(p.price || 0),
        Number(p.cost || 0),
        Number(p.stock || 0),
        Number(p.safetyStock ?? p.safety_stock ?? 5),
        p.supplier || '',
        p.storageLocation || p.storage_location || '',
        p.note || '',
        req.params.id,
        req.company.id
      ]);
      if (!row) return res.status(404).json({ error: '找不到商品 / 材料' });
      audit(req.company.id, req.user.id, 'product_updated', String(req.params.id));
      return res.json(row);
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

  const result = db.prepare(`
    UPDATE products
    SET sku = ?,
        name = ?,
        category = ?,
        unit = ?,
        price = ?,
        cost = ?,
        stock = ?,
        safety_stock = ?,
        supplier = ?,
        storage_location = ?,
        note = ?
    WHERE id = ? AND company_id = ?
  `).run(
    p.sku || '',
    name,
    p.category || '',
    p.unit || '',
    Number(p.price || 0),
    Number(p.cost || 0),
    Number(p.stock || 0),
    Number(p.safetyStock ?? p.safety_stock ?? 5),
    p.supplier || '',
    p.storageLocation || p.storage_location || '',
    p.note || '',
    req.params.id,
    req.company.id
  );
  if (!result.changes) return res.status(404).json({ error: '找不到商品 / 材料' });
  audit(req.company.id, req.user.id, 'product_updated', String(req.params.id));
  res.json(db.prepare('SELECT * FROM products WHERE id = ? AND company_id = ?').get(req.params.id, req.company.id));
});

app.delete('/api/companies/:companyId/products/:id', auth, company, requireRole('owner', 'admin'), async (req, res) => {
  if (PG_ENABLED) {
    try {
      const result = await pgQuery('DELETE FROM products WHERE id = $1 AND company_id = $2', [req.params.id, req.company.id]);
      if (!result.rowCount) return res.status(404).json({ error: '找不到商品 / 材料' });
      audit(req.company.id, req.user.id, 'product_deleted', String(req.params.id));
      return res.json({ ok: true });
    } catch (err) {
      if (err.code === '23503') {
        return res.status(400).json({ error: '已有單據使用此商品，請保留歷史資料' });
      }
      return databaseError(res, req.path, req, err);
    }
  }

  const result = db.prepare('DELETE FROM products WHERE id = ? AND company_id = ?').run(req.params.id, req.company.id);
  if (!result.changes) return res.status(404).json({ error: '找不到商品 / 材料' });
  audit(req.company.id, req.user.id, 'product_deleted', String(req.params.id));
  res.json({ ok: true });
});


app.get('/api/companies/:companyId/inventory-movements', auth, company, async (req, res) => {
  if (PG_ENABLED) {
    try {
      const rows = await pgAll(`
        SELECT
          im.id,
          im.company_id AS "companyId",
          im.product_id AS "productId",
          im.job_site_id AS "jobSiteId",
          im.movement_type AS "movementType",
          im.quantity,
          im.before_stock AS "beforeStock",
          im.after_stock AS "afterStock",
          im.unit_cost AS "unitCost",
          im.note,
          im.created_at AS "createdAt",
          p.name AS "productName",
          p.sku AS "productSku",
          p.unit AS unit,
          js.site_name AS "jobSiteName"
        FROM inventory_movements im
        LEFT JOIN products p ON p.id = im.product_id AND p.company_id = im.company_id
        LEFT JOIN job_sites js ON js.id = im.job_site_id AND js.company_id = im.company_id
        WHERE im.company_id = $1
        ORDER BY im.id DESC
        LIMIT 100
      `, [req.company.id]);
      return res.json(rows);
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

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

app.post('/api/companies/:companyId/inventory-movements', auth, company, requireRole('owner', 'admin', 'staff'), async (req, res) => {
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

  if (PG_ENABLED) {
    const type = movementType || '進貨入庫';
    if (!['進貨入庫', '案場用料', '退料回庫', '報廢損耗', '盤點調整'].includes(type)) {
      return res.status(400).json({ error: '不支援的庫存異動類型' });
    }
    const finalJobSiteId = jobSiteId ? Number(jobSiteId) : null;
    if ((type === '案場用料' || type === '退料回庫') && !finalJobSiteId) {
      return res.status(400).json({
        error: type === '案場用料'
          ? '案場用料必須選擇關聯案場，才能正確同步案場材料費'
          : '退料回庫必須選擇關聯案場，才能正確扣回案場材料費'
      });
    }

    let client;
    try {
      const pgPool = await getPool();
      client = await pgPool.connect();
      await client.query('BEGIN');
      const productResult = await client.query('SELECT * FROM products WHERE id = $1 AND company_id = $2 FOR UPDATE', [finalProductId, req.company.id]);
      const product = productResult.rows[0];
      if (!product) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: '找不到此材料 / 工具' });
      }

      if (finalJobSiteId) {
        const siteResult = await client.query('SELECT id FROM job_sites WHERE id = $1 AND company_id = $2', [finalJobSiteId, req.company.id]);
        if (!siteResult.rows[0]) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: '找不到此案場編號，或此案場不屬於目前公司' });
        }
      }

      const beforeStock = erpNumber(product.stock, 0);
      let afterStock = beforeStock;
      if (type === '進貨入庫' || type === '退料回庫') afterStock = beforeStock + finalQuantity;
      if (type === '案場用料' || type === '報廢損耗') afterStock = beforeStock - finalQuantity;
      if (type === '盤點調整') afterStock = finalQuantity;
      if (afterStock < 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: '庫存不足，無法扣到負數' });
      }

      const unitCost = erpNumber(product.cost, 0);
      const movementCost = finalQuantity * unitCost;
      await client.query('UPDATE products SET stock = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND company_id = $3', [afterStock, finalProductId, req.company.id]);
      if (finalJobSiteId && type === '案場用料') {
        await client.query('UPDATE job_sites SET material_cost = COALESCE(material_cost, 0) + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND company_id = $3', [movementCost, finalJobSiteId, req.company.id]);
      }
      if (finalJobSiteId && type === '退料回庫') {
        await client.query('UPDATE job_sites SET material_cost = GREATEST(COALESCE(material_cost, 0) - $1, 0), updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND company_id = $3', [movementCost, finalJobSiteId, req.company.id]);
      }
      const insert = await client.query(`
        INSERT INTO inventory_movements (
          company_id, product_id, job_site_id, movement_type, quantity,
          before_stock, after_stock, unit_cost, note
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING id
      `, [req.company.id, finalProductId, finalJobSiteId, type, finalQuantity, beforeStock, afterStock, unitCost, note || '']);
      await client.query('COMMIT');

      const rows = await pgAll(`
        SELECT
          im.id,
          im.company_id AS "companyId",
          im.product_id AS "productId",
          im.job_site_id AS "jobSiteId",
          im.movement_type AS "movementType",
          im.quantity,
          im.before_stock AS "beforeStock",
          im.after_stock AS "afterStock",
          im.unit_cost AS "unitCost",
          im.note,
          im.created_at AS "createdAt",
          p.name AS "productName",
          p.sku AS "productSku",
          p.unit AS unit,
          js.site_name AS "jobSiteName"
        FROM inventory_movements im
        LEFT JOIN products p ON p.id = im.product_id AND p.company_id = im.company_id
        LEFT JOIN job_sites js ON js.id = im.job_site_id AND js.company_id = im.company_id
        WHERE im.id = $1 AND im.company_id = $2
      `, [insert.rows[0].id, req.company.id]);
      audit(req.company.id, req.user.id, 'inventory_movement_created', String(insert.rows[0].id));
      return res.json(rows[0]);
    } catch (err) {
      try {
        if (client) await client.query('ROLLBACK');
      } catch {
        // ignore rollback errors
      }
      return databaseError(res, req.path, req, err);
    } finally {
      if (client) client.release();
    }
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

app.get('/api/companies/:companyId/accounting/accounts', auth, company, requireFeature('accounting_engine'), async (req, res) => {
  if (PG_ENABLED) {
    return res.json([]);
  }

  const rows = db.prepare(`
    SELECT *
    FROM accounts
    WHERE company_id = ?
    ORDER BY code
  `).all(req.company.id);

  res.json(rows);
});

app.get('/api/companies/:companyId/accounting/reports', auth, company, requireFeature('accounting_engine'), async (req, res) => {
  if (PG_ENABLED) {
    try {
      const [revenueRow, cogsRow, feesRow] = await Promise.all([
        pgOne('SELECT COALESCE(SUM(gross_amount),0) AS total FROM transactions WHERE company_id = $1', [req.company.id]),
        pgOne('SELECT COALESCE(SUM(cost_of_goods_sold),0) AS total FROM transactions WHERE company_id = $1', [req.company.id]),
        pgOne('SELECT COALESCE(SUM(platform_fee),0) AS total FROM transactions WHERE company_id = $1', [req.company.id])
      ]);
      const revenue = erpNumber(revenueRow?.total, 0);
      const cogs = erpNumber(cogsRow?.total, 0);
      const fees = erpNumber(feesRow?.total, 0);
      const grossMargin = revenue - cogs;
      const netProfit = revenue - cogs - fees;

      return res.json({
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
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

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

app.get('/api/companies/:companyId/accountant/clients', auth, company, requireFeature('accountant_console'), async (req, res) => {
  if (PG_ENABLED) {
    return res.json([]);
  }

  const rows = db.prepare(`
    SELECT *
    FROM accountant_clients
    WHERE company_id = ?
    ORDER BY id DESC
  `).all(req.company.id);

  res.json(rows);
});

app.post('/api/companies/:companyId/accountant/clients', auth, company, requireFeature('accountant_console'), requireRole('owner', 'admin'), async (req, res) => {
  if (PG_ENABLED) {
    return res.status(501).json({
      error: '記帳士客戶管理目前尚未開放正式環境寫入',
      code: 'FEATURE_NOT_READY'
    });
  }

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

app.get('/api/companies/:companyId/audit-logs', auth, company, async (req, res) => {
  if (PG_ENABLED) {
    try {
      const rows = await pgAll(`
        SELECT *
        FROM audit_logs
        WHERE company_id = $1
        ORDER BY id DESC
        LIMIT 100
      `, [req.company.id]);
      return res.json(rows);
    } catch (err) {
      return databaseError(res, req.path, req, err);
    }
  }

  const rows = db.prepare(`
    SELECT *
    FROM audit_logs
    WHERE company_id = ?
    ORDER BY id DESC
    LIMIT 100
  `).all(req.company.id);

  res.json(rows);
});

app.get('/api/ai/use-cases', auth, (req, res) => {
  res.json({
    ok: true,
    useCases: Object.entries(AI_USE_CASES).map(([key, value]) => ({
      key,
      label: value.label,
      purpose: value.purpose,
      disclaimer: value.disclaimer
    }))
  });
});

app.post('/api/companies/:companyId/ai/draft', auth, company, requireRole('owner', 'admin', 'staff'), requireAiUseCaseAllowed, async (req, res) => {
  const useCase = String(req.body?.useCase || '').trim();

  try {
    const result = await generateAiDraft({
      useCase,
      input: req.body?.input || {},
      company: req.company,
      user: req.user
    });

    audit(
      req.company.id,
      req.user.id,
      'ai_draft_requested',
      JSON.stringify({
        useCase,
        edition: req.aiEdition || '',
        provider: result.provider,
        status: result.status || (result.ok ? 'ok' : 'disabled'),
        inputLength: result.inputLength || 0
      })
    );

    return res.json({
      ok: result.ok,
      useCase: result.useCase,
      provider: result.provider,
      mode: result.mode,
      model: result.model,
      status: result.status,
      edition: req.aiEdition || '',
      purpose: result.purpose,
      disclaimer: result.disclaimer,
      draft: result.draft,
      createdAt: result.createdAt
    });
  } catch (error) {
    const status = error.status || 500;
    const provider = String(process.env.AI_PROVIDER || 'mock').trim().toLowerCase() || 'mock';

    audit(
      req.company.id,
      req.user.id,
      'ai_draft_failed',
      JSON.stringify({
        useCase,
        edition: req.aiEdition || '',
        provider,
        status: error.code || 'AI_PROVIDER_ERROR',
        inputLength: String(req.body?.input?.text || '').length
      })
    );

    return res.status(status).json({
      ok: false,
      useCase,
      provider,
      model: provider === 'ollama' ? String(process.env.OLLAMA_MODEL || 'llama3.2:1b') : '',
      code: error.code || 'AI_PROVIDER_ERROR',
      error: error.message || 'AI 草稿服務暫時不可用，系統未寫入任何資料。',
      disclaimer: 'AI 內容僅供輔助判斷，請以實際資料與人工確認為準。',
      draft: {
        title: 'AI 草稿產生失敗',
        summary: '目前無法產生草稿，請稍後再試或改用 mock provider。',
        items: [],
        warnings: ['系統未寫入任何正式資料。'],
        nextSteps: ['人工檢查輸入內容或系統設定。']
      },
      createdAt: new Date().toISOString()
    });
  }
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
if (DB_PROVIDER === 'sqlite') try {
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
  setTimeout(() => {
    shouldRunDailyTenderSync()
      .then((shouldRun) => {
        if (!shouldRun) return null;
        return runTenderSync({ source: 'all', triggeredBy: 'startup_daily_check' });
      })
      .catch((err) => {
        console.error('[tender sync startup] failed', { code: err.code || null, message: err.message || String(err) });
      });
  }, 30000);
  setInterval(() => {
    shouldRunDailyTenderSync()
      .then((shouldRun) => {
        if (!shouldRun) return null;
        return runTenderSync({ source: 'all', triggeredBy: 'daily_schedule' });
      })
      .catch((err) => {
        console.error('[tender sync schedule] failed', { code: err.code || null, message: err.message || String(err) });
      });
  }, Number(process.env.TENDER_SYNC_INTERVAL_MS || TENDER_DAILY_SYNC_MS));
});
