# Jira-lite Ticket Sistemi — Codebase Rehberi

## Proje Özeti

Türk ekipler için Jira'dan ilham alınmış hafif proje yönetim uygulaması. Ticket takibi, Kanban board, gerçek zamanlı bildirimler, dosya gönderimi ve ekip yönetimi içerir.

**Monorepo yapısı:** npm workspaces
- `apps/api` → NestJS REST API (port 4000)
- `apps/web` → Next.js frontend (port 3000)

---

## Teknoloji Stack

| Katman | Teknoloji |
|--------|-----------|
| Backend framework | NestJS 10 |
| ORM | Prisma 6.2 |
| Veritabanı | PostgreSQL 16 |
| Cache / Queue backend | Redis 7 + BullMQ 5 |
| Şifre hash | Argon2id (legacy SHA256 → otomatik yükseltme) |
| Frontend framework | Next.js 16.1 (App Router) |
| UI runtime | React 19 |
| Animasyon | Framer Motion 12 |
| Grafik | Recharts 3 |
| Gerçek zamanlı | Server-Sent Events (SSE) |
| Email | Nodemailer (SMTP / Gmail API / Resend) |
| Dosya depolama | Local veya AWS S3 / Cloudflare R2 |
| CI | GitHub Actions (`.github/workflows/ci.yml`) |
| Deployment | Render.com (API) + Vercel (web) |

---

## Klasör Yapısı

```
/ (root)
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── auth/              # JWT, Argon2, rate-limit, refresh token, parola sıfırlama
│   │   │   ├── board/             # Kanban kart CRUD, checklist, etiket, yorum
│   │   │   ├── tickets/           # Ticket iş mantığı, atama, inceleme, bağımlılık
│   │   │   ├── projects/          # Proje yönetimi
│   │   │   ├── team-members/      # Kullanıcı yönetimi
│   │   │   ├── comments/          # Ticket yorumları + emoji reaksiyon
│   │   │   ├── announcements/     # Sistem duyuruları
│   │   │   ├── audit-logs/        # Varlık değişiklik takibi
│   │   │   ├── leaves/            # İzin talebi + onay akışı
│   │   │   ├── meetings/          # Toplantı planlama
│   │   │   ├── templates/         # Yeniden kullanılabilir ticket şablonları
│   │   │   ├── scheduler/         # Cron: 24h deadline hatırlatıcı
│   │   │   ├── queue/             # BullMQ job queue
│   │   │   ├── storage/           # S3/local dosya yükleme (max 25MB)
│   │   │   ├── events/            # SSE stream yönetimi
│   │   │   ├── quotes/            # Motivasyonel alıntılar
│   │   │   ├── prisma/            # PrismaService (DB bağlantısı)
│   │   │   ├── app.module.ts      # Kök NestJS modülü
│   │   │   ├── health.controller.ts
│   │   │   └── main.ts            # Bootstrap, validation pipe, CORS, Helmet
│   │   ├── prisma/
│   │   │   ├── schema.prisma      # Tüm modeller (aşağıya bak)
│   │   │   └── migrations/        # 24+ migration (Şubat-Nisan 2026)
│   │   └── test/                  # Jest E2E testleri
│   └── web/
│       └── app/
│           ├── page.tsx           # Ana dashboard (monolitik, ~63KB)
│           ├── layout.tsx         # Root layout (Inter font)
│           ├── globals.css        # CSS değişkenleri, dark/light tema
│           ├── board/
│           │   └── page.tsx       # Kanban board sayfası
│           ├── forgot-password/
│           │   └── page.tsx       # Parola sıfırlama isteği
│           ├── reset-password/
│           │   └── page.tsx       # Token ile yeni parola
│           ├── components/        # 13 yeniden kullanılabilir bileşen
│           └── lib/
│               ├── boardApi.ts    # API istemcisi + tipler
│               └── miniMarkdown.tsx # Güvenli özel Markdown renderer
├── docker-compose.yml             # PostgreSQL 16 + Redis 7 (local dev)
├── render.yaml                    # Render.com deploy konfigürasyonu
├── .env.example                   # Tüm env var şablonu
├── .env.production.example        # Production env şablonu
└── DEPLOY.md                      # Üretim dağıtım rehberi
```

---

## Frontend Bileşen Hiyerarşisi

```
RootLayout (layout.tsx)
└── page.tsx — Ana dashboard
    ├── Auth kontrolü (localStorage: jira_auth)
    ├── Rol bazlı tab sistemi
    │   ├── CAPTAIN/BOARD: 12 sekme (tam yetki)
    │   └── MEMBER: 9 sekme (sadece okuma)
    ├── KanbanBoard.tsx        — Sürükle-bırak ticket kolonları
    ├── DashboardCharts.tsx    — Recharts: bar + pie + line grafik
    ├── CalendarView.tsx       — Aylık takvim (deadline, toplantı, izin)
    └── AuditLogFeed.tsx       — Sistem audit logu

/board rotası:
board/page.tsx
└── BoardView.tsx (orkestratör)
    ├── BoardSkeleton.tsx      — Yüklenme iskeleti
    ├── BoardCardModal.tsx     — Kart detay editörü (checklist, atama, yorum)
    ├── BoardCommentPanel.tsx  — SSE ile canlı yorumlar, @mention, emoji
    ├── BoardActivityFeed.tsx  — Aktivite geçmişi
    ├── BoardArchivePanel.tsx  — Arşivlenmiş kartlar + geri yükleme
    ├── BoardStatsPanel.tsx    — WIP limiti durumu
    └── BoardKeyboardHelp.tsx  — Klavye kısayolları yardım modalı
```

---

## State Management

Zustand/Redux yoktur. Saf React pattern:

| Mekanizma | Kullanım |
|-----------|----------|
| `localStorage['jira_auth']` | `BoardAuthBundle` (token, kullanıcı, süre) |
| `localStorage['jira_theme']` | `'dark' \| 'light'` |
| `useState` | Form taslakları, seçili kartlar, filtreler, UI durum |
| Prop drilling | Bundle ve callback'ler bileşen ağacına aktarılır |
| SSE + `addEventListener` | Canlı yorum / bildirim güncellemeleri |
| `useEffect` + manuel refetch | Sayfa yüklendiğinde veri çekme |

---

## Prisma Veri Modelleri

### Enum'lar
| Enum | Değerler |
|------|---------|
| `TicketStatus` | TODO, IN_PROGRESS, IN_REVIEW, DONE |
| `TicketPriority` | LOW, MEDIUM, HIGH, CRITICAL |
| `BoardCardStatus` | TODO, IN_PROGRESS, DONE |
| `BoardCardPriority` | LOW, MEDIUM, HIGH |
| `TeamRole` | MEMBER, BOARD, CAPTAIN, RD_LEADER |
| `Department` | SOFTWARE, INDUSTRIAL, MECHANICAL, ELECTRICAL_ELECTRONICS |
| `LeaveStatus` | PENDING, APPROVED, REJECTED |
| `TicketReviewAction` | APPROVED, REJECTED |
| `MeetingTargetMode` | ALL, SELECTED |

### Modeller
| Model | Açıklama |
|-------|---------|
| `TeamMember` | Kullanıcı (rol, departman, bildirim ayarları, parola hash) |
| `TeamMemberDepartment` | Kullanıcı-departman bağlantısı (çoktan-çoğa) |
| `Project` | Proje konteyneri |
| `ProjectAssignment` | Proje-üye bağlantısı |
| `Ticket` | İş öğesi (durum, öncelik, atama, inceleme, dosya) |
| `TicketAssignment` | Ticket-üye bağlantısı (seenAt takibi) |
| `TicketReview` | Ticket onay/red geçmişi |
| `TicketDependency` | Ticket bağımlılıkları (öz-referans) |
| `TicketTemplate` | Yeniden kullanılabilir ticket şablonları |
| `Submission` | Ticket dosya gönderileri (fileName, storageName, mimeType, size) |
| `Comment` | Ticket yorumları |
| `CommentReaction` | Yorum emoji reaksiyonları (commentId+memberId+emoji PK) |
| `AuthSession` | Refresh token oturumları (hash'li, expire/revoke destekli) |
| `LoginAudit` | IP + userAgent giriş geçmişi (son 20 kayıt) |
| `Meeting` | Toplantı (URL, hedef mod, departman filtresi, hatırlatıcı) |
| `MeetingDepartment` | Toplantı-departman bağlantısı |
| `Leave` | İzin talebi (PENDING→APPROVED/REJECTED akışı) |
| `Announcement` | Sistem duyurusu |
| `AuditLog` | Tüm varlık değişiklikleri (actorId, action, entityType, metadata JSON) |
| `MotivationalQuote` | Günlük motivasyon alıntıları |
| `BoardCard` | Kanban kartı (seq, pozisyon, kapak rengi/görseli, WIP) |
| `BoardCardAssignee` | Kart ataması |
| `BoardCardLabel` | Kart-etiket bağlantısı |
| `BoardLabel` | Kanban etiketi (isim, renk) |
| `BoardChecklistItem` | Kart checklist öğesi (sıralı) |
| `BoardComment` | Kart yorumu (mention dizisi dahil) |
| `BoardCommentReaction` | Kart yorum emoji reaksiyonu |
| `BoardConfig` | WIP limitleri (tekil kayıt, id=1) |

---

## Authentication & Yetkilendirme

**JWT HS256** (özel implementasyon, `auth/token.util.ts`):
- Access token TTL: 300 sn (5 dk)
- Refresh token TTL: 14 gün
- Refresh token DB'de hash'li saklanır
- `ONE_SESSION_PER_USER=true` → yeni girişte eski oturumlar iptal edilir

**Rate limiting:**
- Login: 10 istek / 60 sn / IP
- Refresh: 60 istek / 300 sn / IP
- Global: 120 istek / 60 sn (NestJS Throttler)
- Redis destekli veya in-memory (yapılandırılabilir)

**Rol yetkileri:**
- `CAPTAIN` → Her şey
- `BOARD` → Board + okuma
- `RD_LEADER` → Alan lideri
- `MEMBER` → Okuma + kendi ticket'ları

**Parola:** Argon2id (memoryCost=19456, timeCost=2). Eski SHA256 hash → ilk girişte otomatik yükseltme.

---

## Gerçek Zamanlı (SSE)

İki aşamalı auth akışı:
1. `POST /events/ticket` → 5 dakikalık geçici bilet al
2. `GET /events/stream?ticket=...` → SSE akışını aç
3. Heartbeat: her 25 sn `ping` eventi

**Olay tipleri:**
```
ticket:assigned       ticket:reviewed       ticket:deadline
comment:new           mention:new           announcement:new
board:card:upserted   board:card:deleted    board:card:archived
board:card:restored   board:label:changed
board:comment:new     board:comment:updated board:comment:deleted
```

---

## API Modülleri

| Modül | Endpoint prefix | Sorumluluk |
|-------|----------------|------------|
| auth | `/auth` | Giriş, kayıt, token yenileme, parola sıfırlama |
| tickets | `/tickets` | Ticket CRUD, atama, inceleme, bağımlılık, şablon |
| board | `/board` | Kart CRUD, checklist, etiket, yorum, arşiv, WIP config |
| projects | `/projects` | Proje yönetimi |
| team-members | `/team-members` | Kullanıcı yönetimi |
| meetings | `/meetings` | Toplantı planlama + email hatırlatıcı |
| leaves | `/leaves` | İzin talebi + onay |
| announcements | `/announcements` | Duyuru yayınlama |
| quotes | `/quotes` | Motivasyonel alıntılar |
| audit-logs | `/audit-logs` | Sistem logları |
| events | `/events` | SSE stream |
| health | `/health` | Sağlık kontrolü (Render için) |

---

## Arka Plan Görevleri

**Deadline Scheduler** (`scheduler/deadline-scheduler.service.ts`):
- Her saat çalışır (`@Cron(CronExpression.EVERY_HOUR)`)
- 23–24 saat içinde deadline'ı olan ve henüz bildirilmemiş ticket'ları bulur
- SSE üzerinden atanan kişilere push gönderir
- `notificationEmailEnabled=true` ise email gönderir
- `deadlineNotifiedAt` ile tekrar bildirimi önler

**BullMQ Queue** (`queue/queue.service.ts`):
- Queue adı: `ticket-events`
- Redis destekli
- Tamamlanan job'lar 100 adede kadar saklanır

---

## Email Servisi

**Aktif production provider: `gmail_api`** (Render.com SMTP portlarını engellediği için SMTP çalışmaz)

Desteklenen provider'lar (`EMAIL_PROVIDER` env):
- `gmail_api` → Gmail OAuth2 — **production'da kullanılan** (HTTP tabanlı, Render'da çalışır)
- `smtp` → Nodemailer — sadece lokal geliştirme / kendi sunucusu olanlar için
- `resend` → Resend API — alternatif HTTP tabanlı seçenek

**Gmail API kurulum için gerekli env var'lar:**
```bash
EMAIL_PROVIDER=gmail_api
GMAIL_CLIENT_ID=...         # Google Cloud Console → OAuth 2.0 Client ID
GMAIL_CLIENT_SECRET=...     # Google Cloud Console → OAuth 2.0 Client Secret
GMAIL_REFRESH_TOKEN=...     # OAuth Playground'dan alınır (7 günde bir yenilenmeli — test mode)
GMAIL_SENDER_EMAIL=...      # Gönderici Gmail adresi (ulgenarge@gmail.com)
```

**Önemli:** Google Cloud Console'da OAuth consent screen "Testing" modunda olduğu için
refresh token 7 günde bir sona erer. Production'a almak için "Publishing status → Publish App" gerekir.

**Gmail API refresh token yenileme:**
1. [developers.google.com/oauthplayground](https://developers.google.com/oauthplayground)
2. Dişli → Use your own OAuth credentials → Client ID + Secret gir
3. Gmail API v1 → `gmail.send` scope seç → Authorize APIs
4. `ulgenarge@gmail.com` ile giriş → Exchange authorization code for tokens
5. Yeni `refresh_token` değerini Render'daki `GMAIL_REFRESH_TOKEN`'a yaz

**Email türleri** (`auth/password-reset-mail.service.ts`):
- Parola sıfırlama
- Görev ataması (ticket assign)
- Toplantı hatırlatıcı (15 dk önce — `meetings/meetings.service.ts`)
- Toplantı güncelleme / iptal
- Deadline hatırlatıcı (24 saat önce — `scheduler/deadline-scheduler.service.ts`)
- Hoş geldin (yeni üye)
- Terfi bildirimi
- Hata raporu (`BUG_REPORT_EMAIL_TO` env'e gider)

---

## Dosya Depolama

`storage/storage.service.ts` — sürücü: `STORAGE_DRIVER` env

| Sürücü | Yapılandırma |
|--------|-------------|
| `local` | `./uploads/` dizinine kaydeder |
| `s3` | AWS S3 / Cloudflare R2 (presigned URL, 300 sn TTL) |

Limit: 25 MB. UUID ile dosya adı yeniden oluşturulur (güvenlik).

---

## Ortam Değişkenleri

Kritik değişkenler — production (Render.com) mevcut değerleri:

```bash
# Veritabanı (Neon.tech)
DATABASE_URL="postgresql://neondb_owner:...@ep-square-sound-abuqt1b9-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
DIRECT_DATABASE_URL="postgresql://neondb_owner:...@ep-square-sound-abuqt1b9.eu-west-2.aws.neon.tech/neondb?..."

# Redis (Upstash)
REDIS_URL=rediss://default:...@grateful-sawfly-66265.upstash.io:6379

# Uygulama
API_PORT=4000
WEB_ORIGIN=https://jira-lite-ticket-system-web.vercel.app
PASSWORD_RESET_URL_BASE=https://jira-lite-ticket-system-web.vercel.app/reset-password

# Güvenlik
JWT_SECRET=...
ONE_SESSION_PER_USER=true
COOKIE_SECURE=true
COOKIE_SAME_SITE=none
TRUST_PROXY=true

# Auth rate limit
AUTH_LOGIN_RATE_LIMIT_MAX=10
AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS=60
AUTH_REFRESH_RATE_LIMIT_MAX=60
AUTH_REFRESH_RATE_LIMIT_WINDOW_SECONDS=300
AUTH_RATE_LIMIT_USE_REDIS=true

# Email — production'da Gmail API kullanılıyor (SMTP Render'da çalışmaz)
EMAIL_PROVIDER=gmail_api
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...      # 7 günde bir yenilenmeli (OAuth consent screen test modunda)
GMAIL_SENDER_EMAIL=ulgenarge@gmail.com
SMTP_FROM=mustafa.din067@gmail.com   # fallback olarak bırakıldı
EMAIL_HTTP_TIMEOUT_MS=15000
BUG_REPORT_EMAIL_TO=mustafa.din067@gmail.com

# Depolama (Cloudflare R2)
STORAGE_DRIVER=s3
S3_BUCKET=ulgen
S3_REGION=auto
S3_ENDPOINT=https://0890246daf44237ca037dcb2493c5f14.r2.cloudflarestorage.com
S3_FORCE_PATH_STYLE=true
S3_SIGNED_URL_TTL_SECONDS=300
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...

# Diğer
NODE_ENV=production
NPM_CONFIG_PRODUCTION=false
PASSWORD_RESET_TTL_MINUTES=30
BOOTSTRAP_CAPTAIN_PASSWORD=247115
```

---

## Geliştirme Komutları

```bash
# Local servisler başlat (PostgreSQL + Redis)
docker compose up -d

# Her iki uygulamayı paralel başlat
npm run dev

# Sadece API
npm run dev:api

# Sadece web
npm run dev:web

# Prisma
npm run prisma:generate -w @jira-lite/api
npm run prisma:migrate  -w @jira-lite/api   # development
npm run prisma:deploy   -w @jira-lite/api   # production

# Type kontrolü
npm run typecheck

# E2E testler
npm run test:e2e:api

# Tam CI pipeline (typecheck + build + test)
npm run verify
```

---

## Üretim Dağıtımı

| Servis | Platform | URL |
|--------|----------|-----|
| API | Render.com | `jira-lite-api` servisi |
| Web | Vercel | `https://jira-lite-ticket-system-web.vercel.app` |
| Veritabanı | Neon.tech | `ep-square-sound-abuqt1b9.eu-west-2.aws.neon.tech` |
| Redis | Upstash | `grateful-sawfly-66265.upstash.io` |
| Dosyalar | Cloudflare R2 | bucket: `ulgen` |

Render build adımları (`render.yaml`):
1. `npm ci`
2. `prisma generate`
3. `prisma migrate deploy`
4. `npm run build -w @jira-lite/api`

Sağlık kontrolü: `GET /health`

**Render'da değişiklik yapmak için:**
- Dashboard → `jira-lite-api` → Environment (env var) veya Manual Deploy (redeploy)

---

## Test

```
apps/api/test/
├── health.e2e-spec.ts          # Sağlık endpoint testi
├── auth.e2e-spec.ts            # Kimlik doğrulama akışı
└── tickets-bulk.e2e-spec.ts    # Toplu ticket işlemleri
```

- Framework: Jest + Supertest
- Config: `apps/api/jest-e2e.json`
- Sadece E2E testler mevcut (unit test yok)
- CI tetikleyici: `main`/`master` push + PR

---

## Güvenlik Özellikleri

- CORS: `WEB_ORIGIN` env ile yapılandırılabilir
- Helmet: HSTS, XSS koruması, CSP
- DTO validasyonu: class-validator whitelist modu
- Parameterize sorgular: Prisma (SQL injection yok)
- Kısa token TTL: Access token 5 dk
- Güvenli refresh token: 48 byte kriptografik rastgele
- Email HTML escape: XSS önleme
- Özel Markdown renderer (`miniMarkdown.tsx`): `dangerouslySetInnerHTML` yok

---

## Bilinen Özellikler / Notlar

- `apps/web/app/page.tsx` çok büyük (~63KB) — potansiyel refactor adayı
- Sürükle-bırak: Native HTML5 Drag API (react-beautiful-dnd yok)
- Markdown: Güvenli özel parser (`**bold**`, `*italic*`, `` `code` ``, linkler, başlıklar, listeler)
- Konfeti animasyonu: Görev tamamlanınca kutlama
- @mention: BoardCommentPanel'de kullanıcı etiketleme + popover
- Toplu işlemler: Çoklu kart seçimi + batch action
- WIP limitleri: `BoardConfig` tablosunda, kolon başına yapılandırılabilir
- Tema: `data-theme` HTML attribute ile CSS değişken sistemi (dark/light)
- Mobil: `clamp()` + CSS Grid/Flex, tam responsive

---

## Bilinen Sorunlar & Kısıtlamalar

- **Render.com SMTP engeli:** Render outbound SMTP portlarını (587, 465) engeller. Bu yüzden `EMAIL_PROVIDER=smtp` production'da çalışmaz. Gmail API veya Resend kullanılmalıdır.
- **Gmail OAuth refresh token süresi:** OAuth consent screen "Testing" modunda olduğu için refresh token **7 günde bir** geçersiz olur (`invalid_grant` hatası). Kalıcı çözüm için Google'ın "Publish App" onayı gerekir veya her 7 günde OAuth Playground'dan yeni token alınmalıdır.
- **Toplantı hatırlatıcı sessiz hata:** `sendUpcomingMeetingReminders` fonksiyonu DB hatası veya alıcısız toplantı durumunda log üretmiyordu — `meetings/meetings.service.ts`'e logging eklendi (commit: `30c3e5f`).
- **Toplantı hatırlatıcı alıcı filtresi:** `notificationEmailEnabled=false` olan üyeler toplantı emaili almaz. Eğer tüm üyeler email almıyorsa bu alanı DB'den kontrol et.
