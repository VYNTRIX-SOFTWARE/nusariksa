# UI Foundation — NusaRiksa

Implementasi ini mengikuti NUSARIKSA UI/UX Design Standard v1 yang disediakan pemilik produk. Semua angka layar produksi berasal dari API; tidak ada data DEMO atau skor kepatuhan.

## Status modul

- EXISTING UI: login, logout, sesi, Dashboard, filter tahun/status, detail baca-saja, Daftar Asesmen.
- EXISTING API, UI belum tersedia: pembuatan asesmen, katalog kontrol, hasil penilaian, maker–checker, laporan internal.
- FUTURE: evidence repository, regulatory pack tervalidasi, temuan, notifikasi, profil institusi umum.

## Application shell dan informasi

- Sidebar 256 px (expanded) / 68 px (collapsed), drawer pada mobile, breadcrumb dan nama halaman di topbar.
- Dashboard untuk akun yang login. Navigasi Daftar Asesmen hanya jika backend mengembalikan assessments:read.
- Header menampilkan identitas instalasi tunggal, bukan switcher tenant. API belum menyediakan nama institusi yang dapat dibaca semua peran.
- Filter tahun pada header hanya menyaring asesmen dalam dataset yang dimuat; asesmen lintas tahun tetap masuk ke masing-masing tahun yang beririsan.
- Versi katalog ditampilkan pada detail asesmen berdasarkan GET /assessments/:id/checklist, bukan pack global palsu.

## Tokens dan komponen

- Purple primary #6D4AFF, hover #5936E8, soft #F5F2FF, background #F7F8FA, border #E5E7EB.
- StatusChip selalu memiliki label teks. MetricCard memfilter status pada daftar, tidak mengubah backend.
- Compact DataTable mendukung pencarian judul, status, pengurutan, dan scrolling horizontal lokal. Data maksimal 50 terbaru dari API.
- Dialog baca-saja, empty/loading/error/forbidden states, tombol collapse, drawer mobile, visible keyboard focus.

## Kriteria penerimaan

1. Tidak ada perubahan business logic, schema, permission atau kontrak API.
2. Metrik hanya menghitung data yang diterima, tidak disebut angka total semua bank atau skor kepatuhan.
3. Navigasi mengikuti permissions; SUPER_ADMIN tidak otomatis memiliki hak assessments:write atau approve.
4. Tidak ada menu palsu untuk regulatory pack, evidence, review, atau laporan yang belum punya UI.
5. Detail tidak mengarang versi katalog dan tidak memakai UUID sebagai nama pengguna.
6. Request 401 kembali ke login, error tidak ditampilkan sebagai angka nol, dan forbidden menjelaskan akses.
7. UI harus diuji pada desktop 1280/1440 px, mobile 390 px, keyboard, zoom 200%, dan audit kontras sebelum dinyatakan production-ready.

## Pengujian dan pekerjaan lanjutan

Unit tests memverifikasi perhitungan KPI, filter tahun lintas periode, pencarian, status, sorting, serta server CSP/allowlist aset. Pengujian browser interaktif sebenarnya masih menjadi acceptance terpisah sebelum rilis. Tahap berikutnya adalah Assessment Workspace dan alur maker–checker menggunakan API yang sudah tersedia.