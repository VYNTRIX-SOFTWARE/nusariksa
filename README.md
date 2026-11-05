# NusaRiksa

NusaRiksa adalah proyek sumber terbuka dari VYNTRIX untuk membantu Bank Perekonomian Rakyat (BPR) dan BPR Syariah (BPRS) mengelola tata kelola, risiko, dan kepatuhan teknologi informasi. Aplikasi ini dirancang untuk dapat dijalankan sendiri oleh masing-masing lembaga.

Proyek masih dalam tahap pengembangan awal. **Belum siap digunakan untuk operasional bank atau menyimpan data asli.**

## Kondisi saat ini

Fondasi backend sudah menggunakan Node.js dan PostgreSQL. Bagian yang telah dikerjakan meliputi migrasi database, tabel lembaga dan akun, autentikasi password Argon2id, sesi pengguna, serta pengujian otomatis melalui GitHub Actions.

Antarmuka web menyediakan login, logout, dashboard status asesmen dari API, sidebar collapsible, daftar asesmen, serta workspace pengisian kontrol yang terhubung ke API berdasarkan izin dan status. Pengelolaan katalog kontrol, pengajuan dan pemeriksaan maker–checker, histori keputusan, serta laporan asesmen internal kini tersedia melalui web. Pengiriman undangan otomatis, MFA, dan pemulihan akun belum tersedia. Penyimpanan bukti terenkripsi masih tahap pengembangan dan belum siap untuk data bank asli. Pemetaan POJK 34 Tahun 2025 beserta ketentuan pelaksananya belum diimplementasikan.

## Menjalankan secara lokal

Lingkungan pengembangan menggunakan Node.js 24.7.0 atau lebih baru (di bawah versi 27), npm, dan PostgreSQL 17. Database kosong serta pengguna PostgreSQL dibuat terlebih dahulu; migrasi NusaRiksa tidak membuat database secara otomatis.

Instalasi dependensi:

```sh
npm ci
```

Contoh pengaturan koneksi di Windows PowerShell:

```powershell
$env:DATABASE_URL = 'postgresql://user:password@127.0.0.1:5432/nusariksa_dev'
$env:APP_ORIGIN = 'http://localhost:3000'
```

Untuk Linux atau macOS:

```sh
export DATABASE_URL='postgresql://user:password@127.0.0.1:5432/nusariksa_dev'
export APP_ORIGIN='http://localhost:3000'
```

Nilai `user`, `password`, dan nama database disesuaikan dengan PostgreSQL lokal. Setelah itu:

```sh
npm run db:migrate
npm run check
npm start
```

Server tetap mendengarkan koneksi lokal pada port 3000. Buka **`http://localhost:3000`** untuk melihat antarmuka web. Port dapat diubah melalui variabel `PORT`; `APP_ORIGIN` harus sama dengan origin yang dipakai browser (termasuk hostname dan port). Jika `localhost` tidak terhubung pada sistem tertentu, periksa resolusi loopback setempat.

`npm run check` menjalankan pemeriksaan sintaks dan pengujian. Pengujian yang memerlukan PostgreSQL dilewati apabila `DATABASE_URL` tidak tersedia.

## Antarmuka web awal

Akses `http://localhost:3000` setelah server berjalan dan akun telah dibuat. Form login memakai endpoint autentikasi yang sama dengan API. Setelah masuk, dashboard menampilkan empat metrik berdasarkan maksimal 50 data terbaru dari `GET /assessments`: jumlah ditampilkan, menunggu review, perlu perbaikan, dan disetujui. Metrik tersebut **bukan agregat seluruh database ataupun skor kepatuhan**. Periode di header adalah filter lokal berdasarkan rentang tahun mulai dan akhir asesmen, bukan pengaturan global bank. Daftar asesmen mendukung pencarian judul, filter status, sorting, serta detail baca-saja termasuk versi katalog yang benar-benar terpasang. Sidebar dapat dilipat dan pada mobile memakai drawer. Navigasi Asesmen hanya ditampilkan bila pengguna mempunyai izin `assessments:read`. Bukti pendukung sudah tersedia di Assessment Workspace sebagai lampiran per kontrol; unggah memerlukan izin dan kunci enkripsi server yang benar. Belum siap untuk data bank nyata. Pengelolaan katalog membutuhkan izin assessments:read; pembuatan, penambahan kontrol, dan publikasi membutuhkan assessments:write. Laporan asesmen internal tersedia bagi akun dengan izin reports:read. Review & Persetujuan tersedia bagi pengguna berizin `assessments:read` dan `assessments:approve`.

Sesi disimpan dalam cookie `HttpOnly`, bukan `localStorage` atau `sessionStorage`. Frontend tidak menyimpan token sesi. Semua request ditujukan ke origin yang sama. Nama institusi dan profil pengguna belum tersedia melalui API umum; header memakai label netral, bukan identitas fiktif atau UUID sebagai nama. Versi katalog tampil pada detail asesmen, bukan switcher versi global. Pengujian browser end-to-end, accessibility, dan UAT masih diperlukan sebelum menyebut frontend siap untuk pilot.

## Assessment Workspace

Dari halaman Daftar Asesmen, pengguna dengan izin `assessments:write` dapat membuat asesmen Draft. Pemilik asesmen dapat memasang **satu katalog versi terpublikasi** saat status masih Draft, lalu memulai asesmen. Katalog yang dipasang tidak dapat diganti, sesuai kontrak backend. Pemilihan katalog mengambil daftar maksimal 50 katalog dan 50 versi per katalog dari API yang ada; publikasi dan pengelolaan katalog belum disediakan pada UI.

Pada asesmen berstatus `in_progress` atau `changes_requested`, pemilik berizin dapat mengisi hasil penilaian per kontrol, catatan, dan menyimpannya secara eksplisit. Hasil yang sudah disimpan memiliki nomor revisi; client mengirim `expectedRevision` ke API. Bila server membalas konflik `409`, isian lokal **tetap dipertahankan** dan pengguna harus memuat ulang sebelum mengirim lagi; tidak ada penimpaan atau pengiriman ulang otomatis. Riwayat perubahan tersedia melalui tombol Lihat riwayat. Pengguna tanpa hak tulis atau asesmen berstatus `submitted`/`approved` hanya dapat melihat data.

Keluar dari workspace atau menutup halaman dengan perubahan yang belum disimpan akan memunculkan konfirmasi. Semua data berasal dari endpoint API, bukan DEMO. Pengajuan dan review melalui web sudah tersedia. Evidence upload versi pengembangan telah tersedia dengan penyimpanan terenkripsi, tetapi belum layak untuk data bank nyata. Pemetaan ketentuan regulator **belum** tersedia.

## Review & Persetujuan di web

Pemilik asesmen berizin `assessments:write` dapat mengajukan asesmen yang berstatus `in_progress` atau `changes_requested` **setelah seluruh kontrol dinilai**. Tindakan ini mengunci hasil penilaian dan menambah siklus pemeriksaan. Pengajuan dari editor yang masih memiliki perubahan belum disimpan tidak diizinkan.

Menu Review & Persetujuan hanya tersedia bagi akun yang memiliki `assessments:read` dan `assessments:approve`. Antrean hanya menampilkan asesmen `submitted` milik pengguna lain dari **maksimal 50 asesmen terbaru** yang dikembalikan API. Antrean ini bukan penugasan personal atau cakupan seluruh database.

Pemeriksa dapat membaca hasil dan catatan setiap kontrol di workspace, lalu memilih `approve` atau `request_changes`. Pengembalian memerlukan alasan minimal 10 karakter. Sebelum tindakan terjadi, UI meminta konfirmasi. Pengajuan, persetujuan dan pengembalian tersedia dalam riwayat `GET /assessments/:id/reviews`, termasuk nomor siklus dari server. Konflik status `409` tidak diulang otomatis. Tidak ada perubahan state machine, hak akses, atau aturan backend.

ID aktor pada riwayat hanya ditampilkan secara ringkas sebagai penanda teknis. Nama akun tidak dibuat-buat karena API profil pengguna umum belum tersedia. Penilaian internal ini bukan sertifikasi kepatuhan oleh OJK.
## API yang tersedia

| Metode | Endpoint | Fungsi |
| --- | --- | --- |
| `GET` | `/health` | Memeriksa apakah proses API berjalan |
| `GET` | `/ready` | Memeriksa koneksi PostgreSQL; mengembalikan 503 jika tidak siap |
| `POST` | `/auth/login` | Memeriksa email dan password, lalu membuat sesi |
| `GET` | `/auth/session` | Memeriksa sesi dari cookie |
| `POST` | `/auth/logout` | Mencabut sesi pengguna |
| `GET` | `/auth/permissions` | Menampilkan izin akun yang sedang login |
| `PATCH` | `/users/:userId/roles` | Memberi atau mencabut peran pengguna lain (admin) |
| `GET` | `/users` | Daftar 50 akun pertama (admin) |
| `POST` | `/users` | Membuat akun pending dan token aktivasi (admin) |
| `POST` | `/auth/activate` | Mengaktifkan akun dengan token sekali pakai |
| `POST` | `/users/:userId/disable` | Menonaktifkan akun dan mencabut sesi (admin) |
| `GET` | `/assessments` | Daftar maksimal 50 asesmen (akun dengan izin baca) |
| `POST` | `/assessments` | Membuat asesmen berstatus `draft` (petugas berizin tulis) |
| `GET` | `/assessments/:id` | Melihat satu asesmen (akun dengan izin baca) |
| `POST` | `/assessments/:id/start` | Memulai asesmen milik sendiri (petugas berizin tulis) |
| `GET / POST` | `/catalogs` | Daftar dan pembuatan katalog kontrol |
| `GET / POST` | `/catalogs/:id/versions` | Daftar versi dan penyalinan versi terpublikasi ke draft baru |
| `GET / POST` | `/catalog-versions/:id/controls` | Melihat atau menambah kontrol pada draft |
| `POST` | `/catalog-versions/:id/publish` | Menerbitkan versi katalog yang berisi kontrol |
| `POST` | `/assessments/:id/catalog` | Memasang versi terpublikasi pada asesmen draft |
| `GET` | `/assessments/:id/checklist` | Membaca checklist dari versi katalog yang terpasang |
| `GET` | `/assessments/:id/results` | Hasil kontrol, revisi, dan progres pengisian |
| `PUT` | `/assessments/:id/results/:controlId` | Mengisi atau memperbarui hasil kontrol oleh pemilik asesmen |
| `GET` | `/assessments/:id/results/:controlId/history` | Riwayat revisi hasil kontrol |
| `POST` | `/assessments/:id/submit` | Mengajukan asesmen setelah semua kontrol dinilai |
| `POST` | `/assessments/:id/review` | Menyetujui atau mengembalikan asesmen oleh pemeriksa |
| `GET` | `/assessments/:id/reviews` | Riwayat pengajuan dan keputusan pemeriksaan |
| `GET` | `/assessments/:id/report` | Laporan internal asesmen, distribusi hasil, dan keputusan pemeriksaan |
| `GET / POST` | `/assessments/:id/controls/:controlId/evidence` | Daftar bukti atau tambah bukti terenkripsi pada kontrol |
| `GET` | `/assessments/:id/evidence/:evidenceId/download` | Unduh bukti dengan otorisasi dan verifikasi GCM |

Endpoint login menerima JSON berisi `email` dan `password`. Akun harus sudah ada dalam database, berstatus `active`, dan memiliki hash password Argon2id. Admin pertama dibuat melalui perintah lokal `npm run admin:bootstrap -- --name "Nama Bank" --kind BPR --email admin@example.test` setelah `DATABASE_URL` disetel. Proses meminta password secara interaktif tanpa menampilkannya. Perintah ini hanya dapat dipakai pada database yang belum memiliki lembaga maupun akun.

Login dan logout memerlukan header `Origin` yang sesuai dengan `APP_ORIGIN`. Sesi memakai cookie `Secure`, `HttpOnly`, dan `SameSite=Strict`. Sejumlah browser menerima cookie `Secure` pada `http://localhost` untuk pengembangan, tetapi tidak semuanya (misalnya Safari dapat berbeda). Di luar lingkungan localhost, HTTPS wajib digunakan. Server HTTP lokal ini **bukan** konfigurasi produksi.

Pembatasan percobaan login masih disimpan dalam memori satu proses dan akan hilang setelah restart. MFA, pengaturan reverse proxy tepercaya, dan pengamanan untuk deployment produksi belum selesai.

Peran disimpan di tabel `user_roles`. Perubahan peran melalui layanan internal dicatat di `role_change_events` dalam transaksi yang sama. Catatan tersebut menolak pengubahan dan penghapusan biasa di tingkat database, tetapi bukan bukti anti-manipulasi terhadap administrator database. Admin aktif dapat memberi atau mencabut peran pengguna lain melalui `PATCH /users/:userId/roles` dengan JSON `{"role":"AUDITOR","action":"GRANT"}` atau `"REVOKE"`. Endpoint membutuhkan sesi dan header `Origin` yang cocok; perubahan peran serta catatan audit disimpan dalam transaksi yang sama. Admin dapat membuat akun pending melalui `POST /users` dengan JSON `{"email":"staf@example.test"}`. Token aktivasi acak dikembalikan sekali dalam respons dan harus disampaikan melalui saluran tepercaya. Token berlaku 24 jam; pengguna memasukkan token dan password baru ke `POST /auth/activate`. Tidak ada email undangan otomatis. Admin juga dapat melihat daftar akun dan menonaktifkan akun; pengaktifan kembali akun nonaktif belum didukung. Semua perubahan status dicatat dalam audit log. Asesmen awal sudah menggunakan izin `assessments:read` dan `assessments:write`. Pembuatan menerima JSON `{"title":"Asesmen TI 2027","periodStart":"2027-01-01","periodEnd":"2027-12-31"}`. Pembuat otomatis menjadi penanggung jawab. Status asesmen meliputi `draft`, `in_progress`, `submitted`, `changes_requested`, dan `approved`. Pengisian kontrol, review, persetujuan, dan lampiran bukti sudah memiliki halaman frontend; bukti belum siap digunakan untuk dokumen bank asli. Perubahan status tercatat dalam audit log.

## Katalog kontrol dan checklist

Katalog dibuat dengan kode dan judul, lalu versi pertama dimulai sebagai draft. Kontrol ditambahkan dengan kode, judul, deskripsi opsional, dan referensi dokumen/bagian opsional. Informasi referensi yang diinput pengguna **bukan bukti bahwa kontrol telah diverifikasi terhadap regulasi**.

Versi draft dapat diterbitkan setelah berisi setidaknya satu kontrol. Versi yang sudah diterbitkan tidak dapat diubah; versi berikutnya menyalin isi versi terpublikasi ke draft baru. Setiap asesmen dapat mengaitkan satu versi katalog ketika masih draft. Checklist menggunakan versi katalog yang terpasang. Setelah asesmen berstatus `in_progress`, pemilik yang memiliki izin tulis dapat mengisi hasil penilaian. Batas awal adalah 200 kontrol per versi.

Penilaian menerima `rating` berupa `compliant`, `partially_compliant`, `non_compliant`, atau `not_applicable`, serta `note` dan `expectedRevision`. Kontrol yang belum dinilai tampil sebagai `not_assessed`. Pengisian pertama memakai `expectedRevision: 0`; perubahan berikutnya harus menggunakan nomor revisi terkini. Catatan minimal 10 karakter diperlukan untuk hasil selain `compliant`. Tiap revisi tersimpan dalam riwayat audit yang dilindungi dari pengubahan biasa.

Pengajuan review hanya bisa dilakukan pemilik setelah seluruh kontrol dalam katalog terisi. Selama status `submitted` dan `approved`, hasil terkunci dari perubahan. Pemeriksa dengan izin `assessments:approve` tidak boleh menjadi pemilik asesmen tersebut. Keputusan `approve` menyetujui asesmen, sedangkan `request_changes` harus menyertakan alasan minimal 10 karakter. Hasil yang dikembalikan dapat diperbaiki dan diajukan ulang. Setiap pengajuan dan keputusan dicatat bersama nomor siklus review.

Laporan internal tersedia lewat `GET /assessments/:id/report` bagi pengguna dengan izin `reports:read`. Respons JSON memuat identitas lembaga dan asesmen, referensi versi katalog, hasil setiap kontrol, jumlah penilaian per kategori, progres pengisian, serta keputusan pemeriksa terakhir. Laporan berstatus final hanya jika asesmen sudah `approved`. Persentase progres menunjukkan **kelengkapan pengisian**, bukan skor kepatuhan. Belum tersedia ekspor PDF. Unggah bukti hanya tersedia dalam tahap pengembangan dan belum untuk dokumen bank asli.

Belum ada perhitungan skor kepatuhan otomatis atau hasil pemindaian keamanan file bukti. Hasil ini merupakan penilaian internal pengguna, bukan penetapan kepatuhan oleh regulator.

Belum ada katalog bawaan, daftar kontrol resmi POJK, atau pemetaan pasal yang telah diverifikasi. Pemilihan isi kontrol dan sumber regulasi menjadi pekerjaan terpisah sebelum asesmen digunakan untuk kepatuhan.

## Pengembangan dan lisensi

Arah pengembangan mencakup pengelolaan akses, pencatatan risiko, bukti pendukung, serta pemetaan ketentuan TI untuk BPR dan BPRS. Perkembangannya dicatat dalam [rencana pengembangan](docs/ROADMAP.md).

Kontribusi dapat dimulai dari [panduan kontribusi](CONTRIBUTING.md). Temuan keamanan dilaporkan melalui jalur yang dijelaskan dalam [kebijakan keamanan](SECURITY.md).

NusaRiksa menggunakan lisensi [GNU AGPL-3.0-only](LICENSE). Penggunaan komersial diperbolehkan sesuai ketentuan lisensinya. Informasi hak cipta tersedia di [NOTICE.md](NOTICE.md).

NusaRiksa bukan produk resmi atau layanan yang disahkan oleh Otoritas Jasa Keuangan. Penggunaan aplikasi tidak menggantikan tanggung jawab bank dalam memenuhi ketentuan yang berlaku.

## Laporan asesmen internal di web

Menu **Laporan Asesmen** hanya tampil bagi akun dengan izin `reports:read`. Bila juga memiliki `assessments:read`, pengguna dapat memilih asesmen dari maksimal 50 data terbaru yang dikembalikan API; daftar tersebut bukan keseluruhan arsip. Tanpa izin baca asesmen, pengguna dapat membuka laporan menggunakan UUID asesmen yang sudah diketahui, dengan otorisasi tetap diterapkan pada backend.

Halaman mengambil data melalui `GET /assessments/:id/report` dan menampilkan identitas institusi dan asesmen, versi katalog, kelengkapan pengisian, distribusi hasil, rincian kontrol, serta keputusan pemeriksa terakhir. Label **Final Internal** hanya muncul jika respons backend menandai `final=true`. Kelengkapan pengisian tidak boleh ditafsirkan sebagai skor kepatuhan atau pengesahan OJK.

Antarmuka tetap menggunakan aset same-origin, DOM rendering aman, CSP, dan cookie sesi yang sudah ada. Tidak terdapat ekspor PDF maupun pemetaan regulasi tervalidasi; lampiran bukti masih tahap pengembangan. Pengujian browser end-to-end, aksesibilitas dan UAT masih menjadi persyaratan sebelum digunakan pada operasional.

## Pengelolaan katalog kontrol di web

Menu **Katalog Kontrol** tampil bagi pengguna dengan izin `assessments:read`. Pengguna dengan tambahan `assessments:write` dapat membuat katalog, menambah kontrol pada versi Draft, menerbitkan versi, dan menyalin versi terbit terbaru menjadi Draft baru. Semua operasi menggunakan endpoint katalog yang sudah ada dengan sesi dan aturan akses server.

Versi yang telah diterbitkan bersifat tidak dapat diubah. API belum menyediakan operasi edit atau hapus kontrol, sehingga UI hanya mendukung penambahan kontrol baru; penyalinan versi tidak mengubah atau mengganti kontrol yang sudah ada. Setiap versi dibatasi 200 kontrol. Daftar hanya memuat maksimal 50 katalog berdasarkan kode dan 50 versi terbaru per katalog.

Referensi dokumen pada kontrol disimpan sebagaimana diinput pengguna dan belum diverifikasi sebagai pemetaan regulasi. Untuk membuat asesmen, versi katalog harus berstatus Published. Pengujian browser end-to-end, aksesibilitas dan UAT masih diperlukan sebelum pengoperasian dengan data bank.

## Evidence Management — fondasi pengembangan (PR #24)

Panel bukti muncul pada kontrol asesmen bagi pemegang izin `evidence:read`. Pemilik asesmen dengan `evidence:write` dapat menambah berkas selama status `in_progress` atau `changes_requested`. Bukti yang telah diunggah tidak dapat ditimpa, diganti maupun dihapus melalui API ini. Reviewer dan auditor berizin dapat melihat metadata dan mengunduh berkas.

Unggah memakai JSON dengan field `fileName`, `mediaType` dan `contentBase64` ke `POST /assessments/:id/controls/:controlId/evidence`. Berkas terbatas pada PDF/PNG/JPEG sampai **1 MiB** dan maksimal **10 lampiran per kontrol**. Backend memeriksa signature dasar (magic bytes), tetapi **belum melakukan antivirus scanning atau validasi semantik dokumen**. Unduhan menggunakan `application/octet-stream`, header `attachment` dan `nosniff`, bukan pratinjau inline.

Konten disimpan sebagai `ciphertext` AES-256-GCM di PostgreSQL dengan nonce unik, tag autentikasi dan SHA-256 plaintext. Metadata file dan hubungan asesmen/kontrol ikut diikat sebagai AAD. Tabel memakai foreign key untuk mencegah bukti ditempelkan pada katalog yang salah, dan trigger menolak UPDATE/DELETE/TRUNCATE biasa. Proteksi ini tidak melindungi dari administrator database yang memiliki hak superuser.

Untuk mencoba upload di lingkungan pengembangan, siapkan `EVIDENCE_ENCRYPTION_KEY` sebagai **64 karakter hex acak (32 byte)** di lingkungan proses server, misalnya nilai dari `openssl rand -hex 32`. Jangan simpan kunci dalam git, log atau file konfigurasi yang dikomit. Simpan dan backup kunci menggunakan secret manager yang sesuai; **kehilangan kunci berarti semua bukti terenkripsi tidak dapat dipulihkan**. Pergantian/rotasi kunci belum tersedia. Tanpa kunci valid, upload dan unduh mengembalikan HTTP 503; daftar metadata tetap tersedia bagi pengguna berizin.

**Belum untuk operasional BPR/BPRS:** belum ada antivirus/CDR, file quarantine, pengelolaan retensi dan legal hold, mekanisme rotasi kunci, audit unduhan yang persisten, object storage, pemantauan kapasitas, dan browser E2E/UAT. Blob disimpan pada tabel PostgreSQL sehingga memengaruhi ukuran backup. Jangan gunakan untuk data bank asli hingga seluruh release gate ditutup.

## Metodologi Maturitas TI (fondasi pengembangan)

Modul **Metodologi Maturitas** tersedia bagi pengguna dengan `assessments:read`; penyusunan dan publikasi memerlukan tambahan `assessments:write`. Pengguna dapat membuat model dengan kode, judul, dan referensi metodologi yang eksplisit, menambah domain, kemudian menentukan kriteria **Level 0 sampai Level 5** per domain. Untuk diterbitkan, tiap domain harus memiliki keenam kriteria dan model wajib memiliki minimal satu domain. Versi yang telah terbit terkunci. Versi Draft berikutnya menyalin definisi terbit agar revisi tidak mengubah histori metodologi sebelumnya.

Endpoint tersedia: `GET/POST /maturity-models`, `GET/POST /maturity-models/:id/versions`, `GET/POST /maturity-versions/:id/domains`, `PUT /maturity-domains/:id/levels/:level`, dan `POST /maturity-versions/:id/publish`. Semua endpoint memeriksa sesi, permission, akses institusi, dan origin untuk operasi tulis.

**Registri metodologi dan penilaian internal per domain kini tersedia dalam pengembangan.** Belum ada approval reviewer atas hasil maturitas maupun pemetaan metodologi yang telah diverifikasi OJK. Angka 0–5 adalah rentang kriteria yang dikonfigurasi pengguna, bukan klaim bahwa Level 3/4 otomatis memenuhi ketentuan regulator. Pengujian browser E2E, aksesibilitas dan UAT masih menjadi release gate.

## Penilaian Maturitas TI — engine internal (PR #26, development)

Menu **Penilaian Maturitas** memungkinkan pemilik asesmen membuat penilaian dari metodologi **Published** dengan kebijakan agregasi yang ditetapkan secara eksplisit. Domain dinilai pada **Level 0–5** sesuai enam kriteria pada versi rubrik yang terkunci. Setiap nilai wajib memiliki justifikasi minimal 10 karakter; lampiran bukti dapat ditautkan menggunakan UUID berkas bukti dari modul Evidence Management. Server memastikan lampiran berasal dari institusi yang sama dan pemegang izin memiliki akses `evidence:read`; sistem **tidak menguji apakah bukti memadai** untuk level yang dipilih.

Model mendukung dua metode agregasi internal yang tersimpan dan terkunci pada versi rubrik:
- `minimum`: level agregat sama dengan level domain **terendah**.
- `mean_floor`: rata-rata aritmetika level seluruh domain dengan bobot setara, lalu **dibulatkan ke bawah**.

Nilai agregat **tidak dihitung** bila satu saja domain belum dinilai. Pemilihan metode dilakukan pada Draft melalui `PUT /maturity-versions/:id/aggregation`. Versi metodologi yang sudah Published sebelum fitur ini dan belum memiliki metode tidak memperoleh nilai default; buat versi Draft berikutnya, pilih metode, lalu terbitkan agar dapat digunakan dalam penilaian. Tidak ada modifikasi otomatis pada versi lama.

Endpoint: `GET/POST /maturity-assessments`, `GET /maturity-assessments/:id`, `PUT /maturity-assessments/:id/domains/:domainId`, dan `GET /maturity-assessments/:id/domains/:domainId/history`. Update memakai `expectedRevision` untuk menolak stale write (HTTP 409), dan setiap revisi dicatat dalam log append-only. Penilaian hanya dapat diubah oleh pemilik dengan `assessments:write`. Pengguna dengan `assessments:read` dapat membaca dalam cakupan institusinya.

**Bukan maturity assessment resmi OJK.** Level agregat ini merupakan kalkulasi internal dari kebijakan pengguna, tidak membuktikan kepatuhan atau kematangan terhadap suatu standar eksternal. Belum ada review/approval hasil maturitas, evaluasi kecukupan bukti, audit browser E2E, atau UAT. Jangan gunakan data bank asli sebelum security hardening dan acceptance selesai.

## Fondasi simulasi PADK 43/2025 Lampiran IV (PR #27)

NusaRiksa menyediakan endpoint **pratinjau teknis** untuk kalkulasi maturitas **keamanan siber** sesuai struktur penilaian Lampiran IV PADK 43/PADK.03/2025. Kerangka ini **terpisah** dari penilaian maturitas internal Level 0–5. Kategori 1 mensyaratkan 80 indikator dan kategori 2 mensyaratkan 60 indikator. Rumus pratinjau mengambil rata-rata peringkat 1–5 pada lima domain, kemudian mengalikannya dengan bobot 25%, 15%, 25%, 15%, dan 20%. Peringkat **1 adalah hasil paling memadai**, bukan paling buruk.

Endpoint `GET /regulatory/padk43/cyber/framework` tersedia bagi pengguna `assessments:read`. Endpoint `POST /regulatory/padk43/cyber/preview` hanya menerima manifest 80/60 indikator yang lengkap dan peringkat masing-masing indikator dari pengguna dengan `assessments:write`. Permintaan tidak disimpan pada database. Skor komposit **tidak muncul** sampai semua indikator dinilai. Hasil akan selalu ditandai `PREVIEW_UNVERIFIED`.

**Belum tersedia** peta indikator 80/60 yang sudah diverifikasi, kriteria lengkap tiap peringkat, bukti/approval, penyimpanan kertas kerja, browser UI, maupun ekspor. Penentuan pembulatan dua desimal masih menunggu verifikasi terhadap contoh resmi. **Fitur ini belum dapat menghasilkan hasil maturitas resmi PADK.** Detail kontrak, asumsi dan release gate ada di [docs/PADK-CYBER-MATURITY.md](docs/PADK-CYBER-MATURITY.md).

## Regulatory Pack Quality Gate — PADK Lampiran IV (PR #28)

Parser dan validator untuk paket indikator kategori 1/2 tersedia. Setiap indikator harus memiliki nomor, domain, subdomain, teks parameter, referensi halaman, dan kriteria peringkat 1–5; sumber PDF ditautkan dengan SHA-256. Paket ditolak bila data tidak lengkap atau ada kriteria duplikat. Sidik jari canonical SHA-256 dipakai untuk mendeteksi perubahan setelah review, dengan attestasi substansi dan teknis dari orang berbeda.

**Belum ada regulatory pack lengkap yang di-commit.** Tidak ada seed indikator dummy dan tidak ada klaim bahwa reviewer OJK telah mengesahkan hasil. `npm run regulatory:check` memeriksa file yang tersedia pada pengembangan; `npm run regulatory:release-gate` gagal sampai kedua kategori lengkap. Verifikasi isi terhadap PDF OJK dan review independen pada PR tetap wajib di luar pengecekan otomatis. Panduan: [Regulatory Pack Review](regulations/padk43/cyber/README.md).
