# Jira-lite Ticket Sistemi

Ülgen AR-GE için geliştirilmiş, rol bazlı görev yönetimi ve teslim takibi uygulamasıdır.

- API: NestJS + Prisma + PostgreSQL + Redis (BullMQ)
- Web: Next.js 16 + Framer Motion

## Mevcut Durum

- Proje yerelde çalışırken veritabanı `docker-compose.yml` içindeki PostgreSQL servisindedir.
- Yerel bağlantı örneği: `postgresql://postgres:postgres@localhost:5432/jira_lite?schema=public`
- Bu nedenle bilgisayar kapalıysa sistem çalışmaz.

## Cloud (Global) Yayın

Proje cloud yayın için hazırlandı:
- Cloud Postgres desteği (`DATABASE_URL`)
- Cloud Redis desteği (`REDIS_URL`)
- S3/R2 dosya depolama desteği (`STORAGE_DRIVER=s3`)
- CORS için çoklu origin desteği (`WEB_ORIGIN` virgülle ayrılmış)

Adım adım yayın dokümanı:
- `DEPLOY.md`
- Production env örneği:
  - `.env.production.example`

## Özellikler

- Kaptan:
  - Üye ekleme / pasifleştirme
  - Görev oluşturma / silme / atama / durum yönetimi
  - Çoklu atama
  - Tüm teslimleri filtreleme, indirme, CSV dışa aktarma
- Üye:
  - Kendisine atanan görevleri görme
  - Görev durumu güncelleme
  - PDF/Word/PPT teslim gönderme
  - Kendi teslimlerini görüntüleme ve indirme
- Modern arayüz:
  - Sekme geçiş animasyonları
  - Sürükle-bırak görev yönetimi
  - Kişisel giriş deneyimi (terminal briefing + özlü söz ekranı)

## Klasör Yapısı

- `apps/api`: Backend
- `apps/web`: Frontend
- `DEPLOY.md`: Production yayın rehberi
- `docker-compose.yml`: Yerel PostgreSQL + Redis

## Yerel Kurulum

1. Ortam dosyalarını oluştur:

```powershell
copy .env.example .env
copy .env.example apps\api\.env
copy .env.example apps\web\.env.local
```

2. Servisleri aç:

```powershell
docker compose up -d
```

3. Bağımlılıkları kur:

```powershell
npm install
```

4. Prisma:

```powershell
npm run prisma:generate -w @jira-lite/api
npm run prisma:migrate -w @jira-lite/api
```

5. Uygulamaları başlat:

```powershell
npm run dev -w @jira-lite/api
npm run dev -w @jira-lite/web
```

## Çalışma Adresleri

- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- Health: `http://localhost:4000/health`

## İlk Giriş

Eğer sistemde aktif kaptan yoksa otomatik oluşturulur:
- E-posta: `captain@ulgen.local`
- Şifre: `1234`
- Ad Soyad: `Ece MUTLUER`

## Komutlar

- Tüm proje:
  - `npm run dev`
  - `npm run build`
- API:
  - `npm run dev -w @jira-lite/api`
  - `npm run build -w @jira-lite/api`
- Web:
  - `npm run dev -w @jira-lite/web`
  - `npm run build -w @jira-lite/web`
