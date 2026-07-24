import assert from 'node:assert/strict';
import { gateCreate, safeSummary } from './staging-qa-account.js';

for (const env of [
  {}, { NODE_ENV: 'production' }, { NODE_ENV: 'production', STAGING_ISOLATED: 'true' },
  { NODE_ENV: 'production', STAGING_ISOLATED: 'true', ALLOW_STAGING_QA_ACCOUNT_CREATE: 'true' },
  { NODE_ENV: 'production', STAGING_ISOLATED: 'true', ALLOW_STAGING_QA_ACCOUNT_CREATE: 'true', STAGING_QA_PASSWORD: 'short' }
]) assert.throws(() => gateCreate(env));
gateCreate({ NODE_ENV: 'production', STAGING_ISOLATED: 'true', ALLOW_STAGING_QA_ACCOUNT_CREATE: 'true', STAGING_QA_PASSWORD: 'a-secure-fake-password' });
assert.deepEqual(safeSummary({}), { userExists: false, userId: null, normalizedEmailMatches: false, passwordHashPresent: false, review_status: null, status: null, is_active: null, membershipExists: false, membershipRole: null, companyExists: false, companyId: null, companyReviewStatus: null, companyStatus: null, companyActive: null });
const output = JSON.stringify(safeSummary({ userId: 1, passwordHashPresent: true, membershipExists: true, membershipRole: 'owner', companyId: 2 }));
assert.equal(output.includes('fake-password-hash'), false);
console.log('Staging QA account safety gate smoke tests passed.');
