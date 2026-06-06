import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const dbPath = process.env.DB_PATH || path.join(rootDir, 'server', 'bookai.sqlite');
const backupDir = path.join(rootDir, 'backups');

if (!fs.existsSync(dbPath)) {
  console.error(`❌ 找不到資料庫檔案：${dbPath}`);
  process.exit(1);
}

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const now = new Date();
const stamp = now
  .toISOString()
  .replace(/T/, '_')
  .replace(/\..+/, '')
  .replace(/:/g, '-');

const backupPath = path.join(backupDir, `bookai_backup_${stamp}.sqlite`);

fs.copyFileSync(dbPath, backupPath);

const size = fs.statSync(backupPath).size;

console.log('✅ BookAI SQLite 備份完成');
console.log(`來源：${dbPath}`);
console.log(`備份：${backupPath}`);
console.log(`大小：${Math.round(size / 1024)} KB`);
