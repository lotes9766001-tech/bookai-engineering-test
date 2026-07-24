import { createRequire } from 'node:module';
import { getPool, closePostgresPool } from '../server/pg-db.js';

const require = createRequire(import.meta.url);
const bcrypt = require('../server/node_modules/bcryptjs');

const TARGET_EMAIL = 'lotes.9766001@gmail.com';
const QA_EMAIL = 'lotes.9766001+bookai-staging@gmail.com';

function gateCreate(env = process.env) {
  if (env.NODE_ENV !== 'production') throw new Error('STAGING_QA_PRODUCTION_REQUIRED');
  if (env.STAGING_ISOLATED !== 'true') throw new Error('STAGING_ISOLATED_REQUIRED');
  if (env.ALLOW_STAGING_QA_ACCOUNT_CREATE !== 'true') throw new Error('STAGING_QA_CREATE_NOT_AUTHORIZED');
  if (!env.STAGING_QA_PASSWORD) throw new Error('STAGING_QA_PASSWORD_REQUIRED');
  if (String(env.STAGING_QA_PASSWORD).length < 12) throw new Error('STAGING_QA_PASSWORD_TOO_SHORT');
}

function safeSummary(row = {}) {
  return {
    userExists: Boolean(row.userId), userId: row.userId || null,
    normalizedEmailMatches: Boolean(row.normalizedEmailMatches), passwordHashPresent: Boolean(row.passwordHashPresent),
    review_status: row.review_status || null, status: row.status || null, is_active: row.is_active ?? null,
    membershipExists: Boolean(row.membershipExists), membershipRole: row.membershipRole || null,
    companyExists: Boolean(row.companyId), companyId: row.companyId || null,
    companyReviewStatus: row.companyReviewStatus || null, companyStatus: row.companyStatus || null, companyActive: row.companyActive ?? null
  };
}

async function findAccount(query, email) {
  const { rows } = await query(`SELECT u.id AS user_id, u.email, u.password_hash, u.review_status, u.status, u.is_active,
    cu.role, c.id AS company_id, c.review_status AS company_review_status, c.status AS company_status, c.is_active AS company_active
    FROM users u LEFT JOIN company_users cu ON cu.user_id = u.id LEFT JOIN companies c ON c.id = cu.company_id WHERE lower(u.email) = lower($1)`, [email]);
  const row = rows[0];
  return safeSummary(row && {
    userId: row.user_id, normalizedEmailMatches: row.email?.toLowerCase() === email.toLowerCase(), passwordHashPresent: Boolean(row.password_hash),
    review_status: row.review_status, status: row.status, is_active: row.is_active, membershipExists: Boolean(row.role), membershipRole: row.role,
    companyId: row.company_id, companyReviewStatus: row.company_review_status, companyStatus: row.company_status, companyActive: row.company_active
  });
}

export async function run(mode = process.argv[2] || 'check', env = process.env, pool = null) {
  if (!['check', 'create'].includes(mode)) throw new Error('STAGING_QA_MODE_INVALID');
  if (mode === 'create') gateCreate(env);
  const client = pool ? await pool.connect() : await getPool().connect();
  try {
    const target = await findAccount(client.query.bind(client), TARGET_EMAIL);
    console.log(JSON.stringify({ mode, target }));
    if (mode === 'check') return target;
    if (target.userExists) throw new Error('TARGET_EMAIL_ALREADY_EXISTS');
    const existingQa = await findAccount(client.query.bind(client), QA_EMAIL);
    if (existingQa.userExists) return { mode, created: false, reason: 'QA_ACCOUNT_ALREADY_EXISTS' };
    await client.query('BEGIN');
    try {
      const hash = await bcrypt.hash(env.STAGING_QA_PASSWORD, 12);
      const user = await client.query(`INSERT INTO users (name,email,password_hash,status,review_status,approval_status,is_active) VALUES ($1,$2,$3,'active','approved','approved',true) RETURNING id`, ['STAGING-QA Boss Tester', QA_EMAIL, hash]);
      const company = await client.query(`INSERT INTO companies (name,owner_id,status,review_status,approval_status,is_active) VALUES ($1,$2,'active','approved','approved',true) RETURNING id`, ['STAGING-QA BookAI 測試公司', user.rows[0].id]);
      await client.query(`INSERT INTO company_users (company_id,user_id,role) VALUES ($1,$2,'owner')`, [company.rows[0].id, user.rows[0].id]);
      await client.query('COMMIT');
      console.log(JSON.stringify({ mode, created: true, role: 'owner' }));
      return { mode, created: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error('STAGING_QA_TRANSACTION_FAILED');
    }
  } finally { client.release(); if (!pool) await closePostgresPool(); }
}

if (import.meta.url === `file://${process.argv[1].replaceAll('\\', '/')}`) {
  run().catch((error) => { console.error(JSON.stringify({ ok: false, code: error.message })); process.exitCode = 1; });
}

export { gateCreate, safeSummary, TARGET_EMAIL, QA_EMAIL };
