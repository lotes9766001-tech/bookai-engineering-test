# RC3 Staging Acceptance Checklist

- [ ] New Render service, not Production service
- [ ] New empty PostgreSQL database with SSL
- [ ] `STAGING_ISOLATED=true`
- [ ] Preflight passes without printing values
- [ ] Migration plan/status reviewed
- [ ] Migrations executed only on confirmed staging
- [ ] Schema verification and health pass
- [ ] Tender Sync, AI, email, LINE, payment side effects disabled
- [ ] Synthetic accounts/data only
- [ ] `/api/ping` and `/api/health` verified
- [ ] Restart/redeploy and log redaction verified
