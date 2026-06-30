# Render Deployment Notes

Recommended Render Web Service settings:

- Build Command: `npm install && npm --prefix server install && npm --prefix client install && npm --prefix client run build`
- Start Command: `npm --prefix server start`
- Runtime: Node 22 LTS (`.node-version` pins `22.23.1`)

Production should use PostgreSQL by setting `DATABASE_URL` or `BOOKAI_DB_PROVIDER=postgresql`.
SQLite is intended for local development or explicit `BOOKAI_DB_PROVIDER=sqlite` use.

CMS image uploads are served from `/uploads` and stored under `server/uploads/website-assets`.
Render's free filesystem is not durable across redeploys, so this is acceptable for preview/demo usage only.
For production commerce usage, move website assets to Supabase Storage, S3, or Cloudflare R2.
