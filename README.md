# Jira-lite Ticket Sistemi

Ülgen AR-GE için geliştirilmiş, rol bazlı görev yönetimi ve teslim takibi yapan monorepo uygulamasıdır.

- Backend: NestJS + Prisma + PostgreSQL + Redis (BullMQ)
- Frontend: Next.js 16 (App Router) + Framer Motion

## Proje Özeti

Sistem, takım içi görev dağıtımı ve teslim süreçlerini tek panelden yönetmek için tasarlanmıştır:

- Kaptan:
  - Üye ekler/pasifleştirir
  - Görev oluşturur, siler, durum değiştirir
  - Bir görevi birden fazla üyeye atayabilir
  - Tüm teslimleri filtreler, indirir, CSV dışa aktarır
- Üye:
  - Sadece kendine atanan görevleri görür
  - Görev durumunu güncelleyebilir
  - PDF/Word/PPT dosya teslimi yapabilir
  - Kendi teslimlerini görüntüler/indirir

Not: Sistem proje seçimi olmadan çalışır. Görevler otomatik olarak `ULGEN-SYSTEM` sistem projesi altında yönetilir.

## Öne Çıkan Özellikler

- JWT access token + httpOnly refresh cookie (`jid`) ile oturum yönetimi
- Rol bazlı yetkilendirme (Kaptan / Yönetim Kurulu / Üye)
- Çoklu atama destekli görev kartları
- Görev panosunda sürükle-bırak ile durum değiştirme
- Teslim dosyası desteği:
  - Uzantılar: `.pdf`, `.doc`, `.docx`, `.ppt`, `.pptx`
  - Boyut limiti: 25 MB
- Teslim ekranı:
  - Üye/proje/tarih filtreleri
  - Haftalık teslim grafiği
  - CSV dışa aktarma
- Modern arayüz:
  - Sekme geçiş animasyonları
  - Kart hover/micro-interaction efektleri

## Klasör Yapısı

- `apps/api`: Backend API
- `apps/web`: Frontend
- `docker-compose.yml`: PostgreSQL + Redis servisleri

## Kurulum

1. Ortam değişkenlerini oluşturun:

```powershell
copy .env.example .env
copy .env.example apps\api\.env
copy .env.example apps\web\.env.local
```

2. Veritabanı ve Redis'i başlatın:

```powershell
docker compose up -d
```

3. Bağımlılıkları yükleyin:

```powershell
npm install
```

4. Prisma işlemlerini çalıştırın:

```powershell
npm run prisma:generate -w @jira-lite/api
npm run prisma:migrate -w @jira-lite/api
```

5. Uygulamaları başlatın:

```powershell
npm run dev -w @jira-lite/api
npm run dev -w @jira-lite/web
```

## Çalışma Adresleri

- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- Health: `http://localhost:4000/health`

## İlk Giriş

Eğer sistemde aktif kaptan yoksa API ilk açılışta otomatik kaptan üretir:

- E-posta: `captain@ulgen.local`
- Şifre: `1234`

Bu değerler `.env` ile değiştirilebilir:

- `BOOTSTRAP_CAPTAIN_EMAIL`
- `BOOTSTRAP_CAPTAIN_PASSWORD`

## API Uç Noktaları (Özet)

- Kimlik:
  - `POST /auth/login`
  - `POST /auth/refresh`
  - `POST /auth/logout`
  - `GET /auth/me`
- Takım:
  - `GET /team-members`
  - `POST /team-members`
  - `DELETE /team-members/:id`
- Görev:
  - `GET /tickets`
  - `POST /tickets`
  - `PATCH /tickets/:id/status`
  - `PATCH /tickets/:id/assignee`
  - `DELETE /tickets/:id`
- Teslim:
  - `GET /tickets/:id/submissions`
  - `POST /tickets/:id/submissions`
  - `GET /tickets/submissions/:submissionId/download`

## Komutlar

- Tüm proje (root):
  - `npm run dev`
  - `npm run build`
- API:
  - `npm run dev -w @jira-lite/api`
  - `npm run build -w @jira-lite/api`
- Web:
  - `npm run dev -w @jira-lite/web`
  - `npm run build -w @jira-lite/web`
