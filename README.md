# Jira-lite Ticket Sistemi

Bu proje istenen teknoloji setiyle kurulmus monorepo iskeletidir:

- API: NestJS + Prisma + PostgreSQL + Redis(BullMQ)
- Web: Next.js (App Router)

## Klasor Yapisi

- `apps/api`: Backend API
- `apps/web`: Frontend
- `docker-compose.yml`: PostgreSQL + Redis

## Kurulum

1. Ornek env dosyasini kopyala:

```powershell
copy .env.example .env
copy .env.example apps\api\.env
copy .env.example apps\web\.env.local
```

2. Servisleri ac:

```powershell
docker compose up -d
```

3. Paketleri yukle:

```powershell
npm install
```

4. Prisma generate + migrate:

```powershell
npm run prisma:generate -w @jira-lite/api
npm run prisma:migrate -w @jira-lite/api
```

5. Uygulamalari ayri terminallerde calistir:

```powershell
npm run dev -w @jira-lite/api
npm run dev -w @jira-lite/web
```

## Hedef Ozellikler (bu iskelette var)

- Proje olusturma/listeleme
- Ticket olusturma/listeleme/durum guncelleme
- BullMQ queue (ticket etkinligi icin)
- Next.js panelden API ile proje ve ticket yonetimi
