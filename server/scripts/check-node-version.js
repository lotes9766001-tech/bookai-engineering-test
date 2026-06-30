import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const major = Number(process.versions.node.split('.')[0]);

if (major >= 24) {
  console.warn([
    '',
    'BookAI 本機 SQLite 模式建議使用 Node 22 LTS。',
    '目前偵測到 Node ' + process.versions.node + '，Node 24 可能導致 better-sqlite3 安裝失敗。',
    'Windows 本機開發請優先切換到 Node 22 LTS 後重新執行 npm.cmd install。',
    ''
  ].join('\n'));
}

const requiredPackages = ['better-sqlite3', 'multer'];
const missingPackages = requiredPackages.filter((packageName) => {
  try {
    require.resolve(packageName);
    return false;
  } catch {
    return true;
  }
});

if (missingPackages.length) {
  console.error([
    '',
    'BookAI 後端依賴尚未完整安裝：' + missingPackages.join(', '),
    '請先確認 Node 版本為 Node 22 LTS，接著在 server 目錄執行：',
    'npm.cmd install',
    ''
  ].join('\n'));
  process.exit(1);
}
