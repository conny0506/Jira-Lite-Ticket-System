# Jira-lite Ticket Sistemi

Rol bazli gorev yonetimi ve teslim takibi uygulamasi.

- API: NestJS + Prisma + PostgreSQL + Redis (BullMQ)
- Web: Next.js 16 + Framer Motion

## Hizli Baslangic (Local)

1. Ortam dosyalarini olustur:

```powershell
copy .env.example .env
copy .env.example apps\api\.env
copy .env.example apps\web\.env.local
```

2. Local servisleri kaldir:

```powershell
docker compose up -d
```

3. Bagimliliklari kur:

```powershell
npm install
```

4. Prisma:

```powershell
npm run prisma:generate -w @jira-lite/api
npm run prisma:migrate -w @jira-lite/api
```

5. Uygulamalari calistir:

```powershell
npm run dev -w @jira-lite/api
npm run dev -w @jira-lite/web
```

## Adresler

- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- Health: `http://localhost:4000/health`

## Production / Global Yayin

- Adim adim rehber: `DEPLOY.md`
- Render tanimi: `render.yaml`
- Vercel ayari: `apps/web/vercel.json`
- Ornek production env: `.env.production.example`

## Guvenlik ve Hassas Bilgiler

- Gercek secret degerlerini asla repoya koyma.
- `gerekli_bilgiler.txt`, `*.local.txt`, `.env` dosyalari commit edilmemelidir.
- Secretlar icin sadece template kullan:
  - `gerekli_bilgiler.template.txt`
  - `.env.example`
  - `.env.production.example`
- `JWT_SECRET`, `DATABASE_URL`, `REDIS_URL`, `SMTP_*`, `RESEND_*`, `GMAIL_*`, `S3_*` gibi alanlar sadece ortam degiskeni olarak girilmelidir.
- Bir secret sizdiysa hemen rotate et (yeni key/token olustur).

## Komutlar

- Tum proje:
  - `npm run dev`
  - `npm run build`
- API:
  - `npm run dev -w @jira-lite/api`
  - `npm run build -w @jira-lite/api`
- Web:
  - `npm run dev -w @jira-lite/web`
  - `npm run build -w @jira-lite/web`
