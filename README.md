# AdminKstream

Panel admin Next.js (App Router) untuk mengendalikan seluruh operasi platform streaming Kstream. Kini mendukung manajemen lengkap movie tunggal dan series beserta daftar episode, metadata subtitle multi-bahasa, dan integrasi Mux.

## Fitur Utama

- **Autentikasi & Role** – Firebase Auth (email/password & Google) dengan session cookie, role `super-admin`, `admin`, dan `editor` + redirect aman.
- **Dashboard & Analytics** – Ringkasan performa, active users, audience split, dan daftar konten trending.
- **Manajemen Konten** –
  - Movie: metadata penuh (mux video, trailer, thumbnail, subtitle multi bahasa).
  - Series: metadata utama + playlist episode; episode dapat ditambah/diedit/dihapus.
- **Upload Workflow** – Form terpisah untuk movie dan series dengan dukungan direct upload Mux dan konversi subtitle `.srt → .vtt`.
- **Pengelolaan User** – Set custom claim role/plan, suspend/activate admin/editor.
- **Audit Log & Alerts** – Riwayat aksi admin dan notifikasi realtime (upload sukses/gagal, error, dsb).
- **Tools** – Export (CSV/JSON), import metadata massal, dan konversi subtitle.

## Struktur Folder

```
app/
  (auth)/login/page.js
  (admin)/
    layout.js
    page.js                # Dashboard
    content/page.js        # Daftar movie & series
    upload/page.js         # Form movie / series
    analytics/page.js
    users/page.js
    logs/page.js
    notifications/page.js
    settings/page.js
    tools/page.js
  api/
    auth/session/route.js
    content/route.js               # aggregator movie + series
    movies/route.js
    movies/[id]/route.js
    series/route.js
    series/[id]/route.js
    series/[id]/episodes/route.js
    series/[id]/episodes/[episodeId]/route.js
    mux/
      direct-upload/route.js
      upload-status/route.js
      assets/[assetId]/route.js
    tools/
      export/route.js
      import/route.js
      convert-subtitle/route.js
components/
  auth/LoginForm.js
  content/ContentTable.js
  upload/UploadForm.js
  upload/MovieForm.js
  upload/SeriesForm.js
  layout/*.js
  analytics/*.js
  users/UserTable.js
  logs/AuditLogTable.js
  notifications/NotificationCenter.js
  settings/SettingsForm.js
  tools/ToolsPanel.js
lib/
  firebase.js / firebaseClient.js
  session.js
  firestoreService.js
  analyticsService.js
  muxService.js
  notificationsService.js
  usersService.js
  settingsService.js
utils/
  constants.js
  validators.js
  subtitles.js
  formatters.js
```

## Firestore & Data Model

```
movies/{movieId}
series/{seriesId}
```

### movies/{movieId}
- `type` : `"movie"`
- `title`, `description`, `category`
- `mux_video_id`, `thumbnail?`, `trailer?`
- `subtitles`: array `{ lang, label, url }`
- `tags?`, `createdAt`, `updatedAt`

### series/{seriesId}
- `type` : `"series"`
- `title`, `description`, `category`
- `thumbnail`, `trailer?`, `subtitles?`, `tags?`
- `episodes`: array berisi objek episode
  - `episodeId`, `epNumber`, `title`, `description`
  - `mux_video_id`, `thumbnail?`, `subtitles?`, `createdAt`, `updatedAt`

Episode dapat di-CRUD via form series atau endpoint:
- `POST /api/series/{id}/episodes`
- `PUT /api/series/{id}/episodes/{episodeId}`
- `DELETE /api/series/{id}/episodes/{episodeId}`

## Konfigurasi Lingkungan

```env
# Firebase Admin (server)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Firebase Client SDK
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Mux Video
MUX_TOKEN_ID=
MUX_TOKEN_SECRET=
```

> **Catatan**: collection admin user memakai `users/{uid}` sesuai struktur yang Anda gunakan (contoh: menyimpan `displayName`, `role`, `photoUrl`, dsb).

## Menjalankan Proyek

```bash
npm install
npm run dev
# buka http://localhost:3000
```

Lint:

```bash
npm run lint
```

## Workflow Konten

1. **Tambah Movie** – pilih tab *Tambah Movie*, isi metadata + upload video via Mux (opsional), tambahkan subtitle multi bahasa.
2. **Tambah Series** – pilih tab *Tambah Series*, isi metadata utama, lalu kelola playlist episode.
3. **Kelola Konten** – halaman *Konten* menampilkan gabungan movie & series,
   - Edit metadata (movie/series)
   - Kelola episode series
   - Hapus movie atau seluruh series
4. **Subtitle Converter** – unggah file `.srt` di form subtitle, sistem otomatis mengonversi ke `.vtt` (siap diunggah ke CDN/Mux).

Selamat mengelola pusat kontrol AdminKstream!