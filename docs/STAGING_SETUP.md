# RC3 Staging Setup

This package provides staging-only configuration and preflight scripts. No cloud resource is created automatically.

Required isolated resources:

1. A new PostgreSQL staging database, empty and deletable, with SSL enabled.
2. A separate Render Web Service using branch `release/bookai-rc1-staging`.
3. New staging-only values for `DATABASE_URL`, `JWT_SECRET`, `BOOTSTRAP_SECRET`, `APP_URL`, and `CORS_ALLOWED_ORIGINS`.
4. `STAGING_ISOLATED=true`, `TENDER_SYNC_ENABLED=false`, `AI_ENABLED=false`, and all external side-effect flags false.

Never paste connection strings or credentials into Git, chat, or documents. Do not reuse Production resources.
