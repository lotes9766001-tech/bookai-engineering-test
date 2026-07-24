import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
assert.match(source, /login-legacy/);
assert.match(source, /return res\.status\(404\)/);
for (const code of [
  'INVALID_LOGIN_INPUT', 'INVALID_CREDENTIALS', 'USER_PENDING_REVIEW', 'USER_REJECTED',
  'USER_SUSPENDED', 'COMPANY_NOT_APPROVED', 'COMPANY_INACTIVE', 'MEMBERSHIP_NOT_AVAILABLE',
  'SERVICE_NOT_READY', 'LOGIN_FAILED', 'LOGIN_AUDIT_WRITE_FAILED'
]) assert.match(source, new RegExp(code));
assert.match(source, /recordTrafficEvent/);
assert.match(source, /token creation failed/);
assert.doesNotMatch(source, /login-legacy[^\n]*process\.env/);
assert.doesNotMatch(source, /login-legacy[^\n]*req\.query/);
assert.doesNotMatch(source, /login-legacy[^\n]*req\.headers/);

// Safety contract: privileged identities still pass password and membership code paths.
const loginStart = source.indexOf("app.post('/api/auth/login'");
const legacyStart = source.indexOf("app.post('/api/auth/login-legacy'");
const loginSource = source.slice(loginStart, legacyStart);
assert.match(loginSource, /bcrypt\.compareSync/);
assert.match(loginSource, /isPrivilegedEmail/);
assert.match(loginSource, /USER_REJECTED|USER_SUSPENDED/);
assert.match(loginSource, /company_users/);
assert.match(loginSource, /requestId/);
assert.doesNotMatch(loginSource, /password_hash.*res\.json/);
assert.doesNotMatch(loginSource, /DATABASE_URL.*res\.json/);
console.log('Auth login contract smoke tests passed.');
