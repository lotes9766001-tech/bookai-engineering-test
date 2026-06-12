import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const sqlitePath = process.env.DB_PATH || path.join(rootDir, 'server', 'bookai.sqlite');
const databaseUrl = process.env.DATABASE_URL || '';

const tables = [
  {
    name: 'users',
    columns: ['id', 'name', 'email', 'password_hash', 'last_login_at', 'created_source', 'created_utm_source', 'login_count', 'created_at']
  },
  {
    name: 'companies',
    columns: [
      'id', 'name', 'tax_id', 'industry', 'companyAddress', 'address', 'plan', 'owner_id',
      'billing_status', 'subscription_plan', 'subscription_started_at', 'subscription_expires_at',
      'is_paid_customer', 'billing_note', 'has_official_site', 'official_site_url',
      'official_site_status', 'official_site_note', 'is_tester', 'tester_started_at',
      'tester_note', 'tester_feedback_status', 'created_at'
    ]
  },
  {
    name: 'company_users',
    columns: ['id', 'company_id', 'user_id', 'role', 'created_at']
  },
  {
    name: 'job_sites',
    columns: [
      'id', 'company_id', 'name', 'site_name', 'client_name', 'client_phone', 'address',
      'contact_name', 'contact_phone', 'project_type', 'area_pings', 'price_per_ping',
      'food_cost', 'quote_amount', 'received_amount', 'material_cost', 'labor_cost',
      'outsourced_cost', 'misc_cost', 'tax_mode', 'tax_rate', 'subtotal_amount',
      'tax_amount', 'total_amount', 'estimate_cost_total', 'status', 'note',
      'created_at', 'updated_at'
    ]
  },
  {
    name: 'job_site_payments',
    columns: ['id', 'company_id', 'job_site_id', 'amount', 'payment_date', 'method', 'note', 'created_at']
  },
  {
    name: 'visitor_logs',
    columns: ['id', 'visitor_id', 'page', 'referrer', 'utm_source', 'utm_medium', 'utm_campaign', 'source', 'ip', 'user_agent', 'created_at']
  },
  {
    name: 'traffic_events',
    columns: ['id', 'visitor_id', 'user_id', 'event_type', 'source', 'page', 'referrer', 'utm_source', 'utm_medium', 'utm_campaign', 'ip', 'user_agent', 'created_at']
  },
  {
    name: 'audit_logs',
    columns: ['id', 'company_id', 'user_id', 'action', 'detail', 'created_at']
  }
];

function sqliteTableExists(db, table) {
  return Boolean(db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name = ?
  `).get(table));
}

function sqliteColumns(db, table) {
  if (!sqliteTableExists(db, table)) return new Set();
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
}

function normalizeRow(row, columns, existingColumns) {
  return columns.map((column) => {
    if (!existingColumns.has(column)) return null;
    return row[column] ?? null;
  });
}

async function resetSequence(pool, table) {
  await pool.query(`
    SELECT setval(
      pg_get_serial_sequence($1, 'id'),
      COALESCE((SELECT MAX(id) FROM ${table}), 1),
      true
    )
  `, [table]);
}

async function main() {
  if (!databaseUrl) {
    console.error('DATABASE_URL 未設定，無法遷移到 PostgreSQL。');
    process.exit(1);
  }

  if (!fs.existsSync(sqlitePath)) {
    console.error(`找不到 SQLite 資料庫：${sqlitePath}`);
    process.exit(1);
  }

  const { Pool } = await import('pg');
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('sslmode=disable') ? false : { rejectUnauthorized: false }
  });
  const sqlite = new Database(sqlitePath, { readonly: true });

  try {
    await pool.query('BEGIN');

    for (const table of tables) {
      if (!sqliteTableExists(sqlite, table.name)) {
        console.log(`skip ${table.name}: SQLite table not found`);
        continue;
      }

      const existingColumns = sqliteColumns(sqlite, table.name);
      const rows = sqlite.prepare(`SELECT * FROM ${table.name}`).all();
      if (!rows.length) {
        console.log(`skip ${table.name}: empty`);
        continue;
      }

      const placeholders = table.columns.map((_, index) => `$${index + 1}`).join(', ');
      const updateColumns = table.columns
        .filter((column) => column !== 'id')
        .map((column) => `${column} = EXCLUDED.${column}`)
        .join(', ');
      const sql = `
        INSERT INTO ${table.name} (${table.columns.join(', ')})
        VALUES (${placeholders})
        ON CONFLICT (id) DO UPDATE SET ${updateColumns}
      `;

      for (const row of rows) {
        await pool.query(sql, normalizeRow(row, table.columns, existingColumns));
      }

      await resetSequence(pool, table.name);
      console.log(`migrated ${table.name}: ${rows.length}`);
    }

    await pool.query('COMMIT');
    console.log('SQLite -> PostgreSQL migration completed.');
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    sqlite.close();
    await pool.end();
  }
}

main();
