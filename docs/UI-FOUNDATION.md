# UI Foundation — NusaRiksa

Implementasi ini mengikuti NUSARIKSA UI/UX Design Standard v1 yang disediakan pemilik produk. Semua angka layar produksi berasal dari API; tidak ada data DEMO atau skor kepatuhan.

## Status modul

- EXISTING UI: login, logout, sesi, Dashboard, filter tahun/status, Daftar Asesmen, Assessment Workspace (membuat, memasang katalog, memulai, mengisi hasil, membaca revisi), pengajuan, antrean review, persetujuan/pengembalian, histori maker–checker, laporan internal asesmen berbasis API, dan pengelolaan katalog kontrol melalui web.
- EXISTING API, UI belum tersedia: penyuntingan/penghapusan kontrol yang sudah dibuat (endpoint belum tersedia).
- DEVELOPMENT: evidence terenkripsi per kontrol, belum siap untuk data bank nyata. FUTURE: regulatory pack tervalidasi, temuan, notifikasi, profil institusi umum.

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
4. Tidak ada menu palsu untuk regulatory pack yang belum punya UI. Panel evidence pada workspace dikendalikan izin evidence:read/evidence:write dan status asesmen. Menu laporan hanya untuk pemegang izin reports:read; menu katalog untuk assessments:read, mutasi katalog hanya untuk assessments:write.
5. Detail tidak mengarang versi katalog dan tidak memakai UUID sebagai nama pengguna.
6. Request 401 kembali ke login, error tidak ditampilkan sebagai angka nol, dan forbidden menjelaskan akses.
7. UI harus diuji pada desktop 1280/1440 px, mobile 390 px, keyboard, zoom 200%, dan audit kontras sebelum dinyatakan production-ready.

## Pengujian dan pekerjaan lanjutan

Unit tests memverifikasi perhitungan KPI, filter tahun lintas periode, pencarian, status, sorting, dan server CSP/allowlist aset. Pengujian browser interaktif tetap menjadi acceptance terpisah sebelum rilis.
## Assessment Workspace (PR #20)

- Layout split 35:65: daftar kontrol, editor hasil, catatan, progres, versi katalog, dan riwayat.
- Katalog dipasang sekali saat Draft (versi Published). Tidak ada dropdown untuk mengubah versi setelah dipasang.
- Penyimpanan memakai PUT per kontrol dengan nomor revisi dari server. 409 tidak pernah diulang otomatis.
- Penilaian hanya dapat diubah oleh owner dengan assessments:write saat in_progress atau changes_requested; status submitted/approved tetap read-only.
- Data sintetis tidak digunakan dalam UI produksi. Katalog dan regulatory mappings belum diverifikasi.
- UI belum lolos browser E2E, audit aksesibilitas, maupun UAT produksi. Semua itu tetap release gate wajib.

## Review & Persetujuan (PR #21)

- Maker dapat mengajukan hanya bila semua kontrol dalam katalog terpasang telah dinilai dan editor tidak memiliki perubahan belum tersimpan.
- Review queue hanya bagi pemegang izin `assessments:read` dan `assessments:approve`, memuat status submitted milik pengguna lain dari maksimal 50 asesmen terbaru.
- Reviewer membuka workspace baca-saja, memeriksa kontrol dan catatan, kemudian memilih setuju atau kembalikan untuk perbaikan dengan konfirmasi eksplisit.
- Alasan pengembalian minimal 10 karakter. Keputusan menggunakan POST yang sama dengan backend, tanpa retry otomatis saat 409.
- Riwayat dari `/assessments/:id/reviews` menampilkan siklus dan peristiwa sebenarnya. Tidak mengarang nama orang atau klaim kepatuhan.
- Tidak ada perubahan backend, DB, permission, atau regulatory mapping. Uji browser E2E, aksesibilitas dan UAT masih release gate.

## Laporan internal asesmen (PR #22 — merged)

- Navigasi laporan berdasarkan `reports:read`, tanpa menyamakan izin tersebut dengan `assessments:read`.
- Pilihan asesmen berbasis maksimal 50 terbaru pada `GET /assessments` hanya bila izin baca asesmen tersedia; pemegang izin laporan saja dapat memasukkan UUID asesmen secara manual.
- Satu laporan diambil dengan `GET /assessments/:id/report`; UI menampilkan institusi, versi katalog, periode, status internal, progress pengisian, distribusi hasil, rincian per kontrol dan keputusan review terakhir.
- `completionPercent` adalah kelengkapan pengisian, bukan skor kepatuhan. Status final internal hanya mengikuti field `final` backend; tidak ada klaim pengesahan OJK.
- Rendering menggunakan DOM aman tanpa `innerHTML` untuk data API, request same-origin, CSP dan allowlist dipertahankan, serta respons async usang diabaikan.
- Pengujian model dan aset ditambahkan. Browser E2E, audit aksesibilitas dan UAT tetap menjadi release gate yang belum terpenuhi.

## Pengelolaan katalog kontrol (PR #23)

- Menu Katalog Kontrol hanya untuk akun dengan `assessments:read`. Semua mutasi juga membutuhkan `assessments:write`; otorisasi final tetap pada backend.
- Daftar katalog dari `GET /catalogs` dibatasi 50 kode pertama; daftar versi dari `GET /catalogs/:id/versions` dibatasi 50 versi terbaru.
- Pembuatan katalog melalui `POST /catalogs` membuat versi 1 berstatus Draft. Kontrol baru ditambahkan melalui `POST /catalog-versions/:id/controls`, maksimal 200 per versi dan tanpa edit/hapus di UI karena API belum menyediakannya.
- Draft dapat diterbitkan bila memiliki minimal satu kontrol, dengan konfirmasi eksplisit. Versi Published read-only; `POST /catalogs/:id/versions` menyalin versi terpublikasi terbaru menjadi Draft berikutnya.
- Rujukan sumber adalah input pengguna dan tidak otomatis dianggap resmi/terverifikasi. Tidak ada seed katalog POJK atau klaim pemetaan regulasi.
- Permintaan tidak diulang otomatis pada status 409. Teks respons API dirender dengan DOM aman; stale response diabaikan.
- Unit test, pengujian aset/CSP dan integrasi API yang telah ada dijalankan pada CI; browser E2E, audit aksesibilitas dan UAT tetap release gate terpisah.

## Evidence Management (PR #24 — pengembangan)

- Metadata/file diambil per kontrol pada Assessment Workspace; pembacaan hanya untuk evidence:read.
- Upload hanya untuk pemilik asesmen dengan evidence:write saat status in_progress atau changes_requested.
- Download selalu sebagai attachment octet-stream dan tidak merender PDF/gambar dalam halaman.
- Enkripsi AES-256-GCM di aplikasi dan trigger immutable di database; key wajib terkonfigurasi untuk upload/unduh.
- Batas 1 MiB/file, 10 file/kontrol, PDF/PNG/JPEG, magic bytes sederhana.
- Antivirus scanning, rotasi kunci, retensi, audit unduhan dan browser E2E belum tersedia. Ini bukan production-ready.

## Metodologi Maturitas (PR #25 — pengembangan)

- Halaman Metodologi Maturitas mengikuti UI/UX Standard v1 dan memakai vanilla JavaScript + API same-origin.
- Akses baca `assessments:read`, akses mutasi `assessments:write`, dengan backend tetap sebagai sumber otorisasi.
- Input sumber metodologi diwajibkan; teks dari API hanya dirender dengan DOM aman.
- Model dapat memiliki maksimal 50 daftar yang dimuat, hingga 50 versi dan 30 domain per versi; setiap domain mempunyai kriteria Level 0–5.
- Publikasi memerlukan satu domain atau lebih dan keenam kriteria per domain. Published read-only, revisi dilakukan pada salinan Draft berikutnya.
- Halaman registri metodologi menampilkan kebijakan agregasi; penilaian level dan ringkasan internal berada pada halaman Penilaian Maturitas terpisah. Tidak ada klaim maturitas resmi OJK.
- Browser E2E, audit aksesibilitas, serta UAT tetap belum ditutup sebagai release gate.

## Penilaian Maturitas internal (PR #26 — development)

- Halaman Penilaian Maturitas terpisah dari Metodologi Maturitas, tetap memakai vanilla JS, API same-origin, CSP, dan token sesi hanya di cookie HttpOnly.
- Pengguna dengan \`assessments:read\` melihat maksimal 50 asesmen terbaru. Pembuatan dan penilaian per domain memerlukan \`assessments:write\`; penilaian dibatasi pemilik asesmen.
- Input level mengikuti kriteria Level 0–5 dari rubrik terbit; justifikasi wajib, lampiran evidence bersifat opsional dengan UUID yang diverifikasi server. Referensi evidence bukan penilaian otomatis tentang kecukupan bukti.
- Versi metodologi tidak bisa dimodifikasi setelah terbit. Metode agregasi \`minimum\` atau \`mean_floor\` disimpan pada Draft dan disalin ke Draft versi berikutnya. Versi lama tanpa metode tidak mendapat default tersembunyi.
- Hasil agregat tidak tersedia selama satu pun domain belum dinilai. Form mempertahankan isian pada HTTP 409 dan meminta refresh; perubahan memiliki revision counter dan histori append-only.
- Label jelas menyatakan level ini perhitungan internal yang belum melalui approval atau sertifikasi OJK. Browser E2E, UAT, dan aksesibilitas masih outstanding.
