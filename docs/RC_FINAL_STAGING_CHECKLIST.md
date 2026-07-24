# BookAI RC Staging Checklist

Use existing `bookai-rc3-staging` and `bookai-rc3-staging-db`; do not recreate resources.

- [ ] Startup log contains `POSTGRES_STARTUP: ready`
- [ ] No `POSTGRES_STARTUP_FAILED`
- [ ] No `POSTGRES_SCHEMA_VERSION_MISMATCH`
- [ ] `/api/ping` returns 200
- [ ] Healthy `/api/health` returns 200
- [ ] Database or schema not ready returns 503
- [ ] Login, pending review, RBAC and company isolation
- [ ] Engineering, ERP, BI and CMS
- [ ] Upload, restart and image persistence
- [ ] SIGTERM, Pool shutdown and CORS
- [ ] Tender single-instance behavior
- [ ] Do not rerun Migration without Boss authorization
- [ ] Do not operate Production
