# Production Deployment Guide

This project is now prepared for cloud deployment.

Recommended stack:
- Database: Neon Postgres (or Supabase/Render Postgres)
- Redis: Upstash Redis (or Redis Cloud)
- File storage: Cloudflare R2 (S3 compatible) or AWS S3
- API hosting: Render / Railway / Fly.io
- Web hosting: Vercel

This repo includes:
- `render.yaml` for API deployment on Render
- `apps/web/vercel.json` for Web deployment on Vercel

## 1) Create Cloud Services

1. Create a Postgres database and copy the connection URL.
2. Create a Redis instance and copy the `redis://` or `rediss://` URL.
3. Create an S3-compatible bucket (R2/S3) and copy:
   - bucket name
   - endpoint
   - region
   - access key / secret key

## 2) API Environment Variables

Set these in your API hosting panel:

```bash
NODE_ENV=production
API_PORT=4000

DATABASE_URL=postgresql://...
REDIS_URL=rediss://...

WEB_ORIGIN=https://your-web-domain.com

JWT_SECRET=change-this-to-a-strong-random-secret
ACCESS_TOKEN_TTL_SECONDS=300
REFRESH_TOKEN_TTL_DAYS=14
ONE_SESSION_PER_USER=true
TRUST_PROXY=true
AUTH_LOGIN_RATE_LIMIT_MAX=10
AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS=60
AUTH_REFRESH_RATE_LIMIT_MAX=60
AUTH_REFRESH_RATE_LIMIT_WINDOW_SECONDS=300
AUTH_RATE_LIMIT_USE_REDIS=true
PASSWORD_RESET_TTL_MINUTES=30
PASSWORD_RESET_URL_BASE=https://your-web-domain.com/reset-password
EMAIL_PROVIDER=gmail_api
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
GMAIL_SENDER_EMAIL=mustafa.din067@gmail.com
RESEND_API_KEY=...
RESEND_FROM=Jira-lite <no-reply@your-domain.com>
EMAIL_HTTP_TIMEOUT_MS=15000
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=Jira-lite <no-reply@your-domain.com>
LOG_FORMAT=json
COOKIE_SAME_SITE=none
COOKIE_SECURE=true
# optional (example: .your-domain.com)
COOKIE_DOMAIN=

BOOTSTRAP_CAPTAIN_EMAIL=captain@ulgen.local
BOOTSTRAP_CAPTAIN_PASSWORD=1234

STORAGE_DRIVER=s3
S3_BUCKET=your-bucket
S3_REGION=auto
S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=true
S3_SIGNED_URL_TTL_SECONDS=300
```

Notes:
- `WEB_ORIGIN` supports comma-separated values if needed:
  - `https://your-web-domain.com,https://www.your-web-domain.com`
- If API and Web are on different domains, keep:
  - `COOKIE_SAME_SITE=none`
  - `COOKIE_SECURE=true`
- If you want local disk storage on server, use:
  - `STORAGE_DRIVER=local`
  - This is not recommended for production.

## 3) Web Environment Variables

Set this in Vercel (or your web host):

```bash
NEXT_PUBLIC_API_URL=https://your-api-domain.com
```

## 4) Database Migration in Production

Run once after deploying API (or in CI/CD step):

```bash
npm install
npm run prisma:generate -w @jira-lite/api
npm run prisma:migrate -w @jira-lite/api
```

If your hosting provider supports one-time post-deploy command, use:

```bash
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
```

Note:
- `render.yaml` runs `prisma migrate deploy` in the build step before API build.

## 5) Health Check

After deploy:

- API health: `https://your-api-domain.com/health`
- Web: `https://your-web-domain.com`

## 5.1) Fast Path (Render + Vercel)

1. Push this repository to GitHub.
2. Render:
   - New + Blueprint -> select repo -> it detects `render.yaml`.
   - Set missing secret envs (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, S3 keys, etc).
   - Deploy and confirm `https://<render-domain>/health` is 200.
3. Vercel:
   - Import repo, set Root Directory to `apps/web`.
   - Add env: `NEXT_PUBLIC_API_URL=https://<render-domain>`.
   - Deploy and get web URL.
4. Update API `WEB_ORIGIN` with Vercel URL (and custom domain if used), then redeploy API.
5. Re-test login, refresh, file upload/download flows.

## 6) Storage Migration (Important)

Current local uploads in this repo:
- `apps/api/uploads/*`

When switching to S3/R2:
- new uploads go to cloud bucket
- existing local files remain local unless migrated manually

If old local files are important, upload them to the bucket and update corresponding
`Submission.storageName` values if keys change.

## 7) Security Checklist

- Use a strong `JWT_SECRET`.
- Restrict CORS with exact `WEB_ORIGIN`.
- Password hashing is Argon2-based; old SHA256 hashes are upgraded on next login.
- Keep auth rate limit env values in place (login/refresh endpoints).
- Do not commit production `.env` files.
- Enable backups for Postgres.
- Enable bucket lifecycle and access controls.
