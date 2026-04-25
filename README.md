# Jira-lite Ticket Sistemi

Takım yönetimi ve görev takibi için geliştirilmiş, Jira'dan ilham alan lightweight bir proje yönetim uygulaması.

## Özellikler

### Rol Bazlı Erişim
| Rol | Yetkiler |
|-----|----------|
| **Captain** | Tam yönetim — proje, görev, üye, duyuru, izin onayı |
| **RD Leader** | Kendi departmanında görev atama ve yönetim |
| **Member** | Atanan görevleri görüntüleme, dosya yükleme, yorum yapma |
| **Intern** | Member ile aynı, toplantı davetlerinde ayrı filtreleme |
| **Board** | Salt görüntüleme ve genel istatistik erişimi |

### Görev Yönetimi
- Dört kolonlu **Kanban panosu**: `TODO → IN_PROGRESS → IN_REVIEW → DONE`
- Sürükle-bırak ile kolon değiştirme (HTML5 Drag & Drop)
- Liste görünümü ile Kanban arasında geçiş
- Öncelik seviyeleri: `LOW / MEDIUM / HIGH / CRITICAL`
- Son teslim tarihi belirleme ve gecikme takibi
- Toplu görev seçimi ve toplu durum değiştirme
- Görev bağımlılıkları (önce tamamlanması gereken görevler, döngüsel bağımlılık koruması)
- Görev şablonları — sık kullanılan görevleri şablon olarak kaydedip formdan tek tıkla yükle

### Dashboard ve Analitik
- **Departman bazlı görev durumu** — BarChart (Tamamlanan / Aktif / Gecikmiş)
- **Öncelik dağılımı** — PieChart (LOW / MEDIUM / HIGH / CRITICAL)
- **Son 7 gün tamamlanan görev trendi** — LineChart
- Üye performans metrikleri (toplam / aktif / tamamlanan / geciken görev, ortalama tamamlama süresi)

### Aktivite Logu (Audit Log)
- Her görev oluşturma, silme ve durum değişikliği otomatik loglanır
- Kim ne zaman ne yaptı — sayfalanmış zaman çizelgesi görünümü
- Aktör, işlem türü ve etkilenen varlığa göre filtrelenebilir

### Takvim Görünümü
- Aylık takvim — dış kütüphane kullanılmadan custom CSS grid
- Renk kodlaması: turuncu = deadline, mavi = toplantı, yeşil = izin
- Ay navigasyonu ve birden fazla etkinlik için "+N daha" özeti
- Captain ve Member için ayrı takvim sekmeleri

### Yorum ve İşbirliği
- Atanan üyeler için göreve özel yorum sistemi
- **@Mention** — yorumda `@isim` yazınca açılır liste, bahsedilen üyeye anlık SSE bildirimi
- **Emoji reaksiyonları** — 6 emoji (👍 ❤️ 😂 🔥 👀 ✅), hover açılır picker, kaldırma desteği

### Dosya Teslimi ve Önizleme
- Görev başına dosya yükleme (PDF, DOCX, PPTX, vb. — 25 MB sınır)
- Tarayıcı içi **PDF önizleme** (iframe)
- Tarayıcı içi **DOCX önizleme** (docx-preview)
- Geç teslim nedeni ile birlikte açıklama notu
- Kaptan adına üye dosyası yükleme

### Gerçek Zamanlı Bildirimler (SSE)
- Göreve atandığında anlık bildirim toast'u
- İnceleme sonucu (onay/ret) bildirimi
- Yorum geldiğinde uyarı
- @Mention ile bahsedildiğinde bildirim
- Son 24 saatte dolacak görevler için **deadline toast**
- Yeni duyuru için sekme rozeti (okunmamış sayacı)

### Duyuru Sistemi
- Tüm takıma veya seçili üyelere hedefli duyuru
- Okunmamış duyuru sayacı (canlı güncelleme)

### İzin ve Yokluk Takibi
- Üyeler izin talebi oluşturabilir
- Captain/RD Leader onay/ret akışı
- Departman bazlı izin görünümü

### Toplantı Yönetimi
- Toplantı linki ve zaman bilgisi paylaşımı
- Stajyer dahil/hariç filtresi
- Tümü veya seçili üyeler hedef modu

### Otomatik Deadline E-postası
- Her saat çalışan cron job
- Son 24 saate giren, tamamlanmamış görevler için e-posta
- Tekrarlanan bildirim önleme (`deadlineNotifiedAt` takibi)

### Güvenlik
- **Global rate limiting**: 120 istek / 60 saniye (NestJS Throttler)
- Auth rotaları için daha kısıtlı özel limitler
- Rol bazlı erişim kontrolü her endpoint'te

### Arayüz
- **Karanlık / Aydınlık mod** — localStorage ile kalıcı
- **Mobil responsive** — 768 px ve 480 px breakpoint'leri ile tam uyumluluk
- Framer Motion animasyonları
- Giriş ekranında motivasyon alıntısı ve terminal animasyonu
- Bug raporu FAB butonu
- Skeleton yükleme ekranları

## Teknoloji Yığını

| Katman | Teknoloji |
|--------|-----------|
| Backend | NestJS + Prisma ORM + PostgreSQL |
| Kuyruk | BullMQ + Redis |
| Frontend | Next.js 15 + Framer Motion |
| Grafikler | Recharts |
| Gerçek Zamanlı | Server-Sent Events (SSE) |
| Rate Limiting | @nestjs/throttler |
| E-posta | Nodemailer (SMTP) |
| Depolama | AWS S3 / S3-uyumlu (MinIO) |
| Belge Önizleme | pdf.js iframe + docx-preview |
| Zamanlayıcı | @nestjs/schedule (Cron) |

## Veritabanı Modelleri

| Model | Açıklama |
|-------|----------|
| `TeamMember` | Kullanıcılar ve roller |
| `Project` | Projeler ve üye atamaları |
| `Ticket` | Görevler, öncelik, durum, son tarih |
| `TicketDependency` | Görevler arası önkoşul ilişkisi |
| `TicketTemplate` | Yeniden kullanılabilir görev şablonları |
| `Comment` | Görev yorumları |
| `CommentReaction` | Emoji reaksiyonları |
| `Submission` | Dosya teslimatleri |
| `AuditLog` | Sistem geneli aktivite logu |
| `Meeting` | Toplantı bilgileri |
| `Announcement` | Duyurular |
| `Leave` | İzin talepleri |

## Hızlı Başlangıç (Local)

1. Ortam dosyalarını oluştur:

```powershell
copy .env.example .env
copy .env.example apps\api\.env
copy .env.example apps\web\.env.local
```

2. Local servisleri başlat (PostgreSQL + Redis):

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

5. Uygulamaları çalıştır:

```powershell
npm run dev -w @jira-lite/api
npm run dev -w @jira-lite/web
```

## Adresler

- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- Health: `http://localhost:4000/health`

## Production / Global Yayın

- Adım adım rehber: `DEPLOY.md`
- Render tanımı: `render.yaml`
- Vercel ayarı: `apps/web/vercel.json`
- Örnek production env: `.env.production.example`

## Komutlar

| Komut | Açıklama |
|-------|----------|
| `npm run dev` | Tüm uygulamaları paralel başlatır |
| `npm run build` | Tüm paketi derler |
| `npm run typecheck` | TypeScript tip kontrolü |
| `npm run verify` | Build + tip kontrolü |
| `npm run dev -w @jira-lite/api` | Sadece API |
| `npm run dev -w @jira-lite/web` | Sadece Web |
| `npm run test:e2e -w @jira-lite/api` | E2E testler |
| `npm run prisma:migrate -w @jira-lite/api` | Migration çalıştır |
