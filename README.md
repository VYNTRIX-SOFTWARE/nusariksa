# NusaRiksa

NusaRiksa adalah proyek sumber terbuka dari VYNTRIX untuk membantu Bank Perekonomian Rakyat (BPR) dan BPR Syariah (BPRS) mengelola tata kelola, risiko, dan kepatuhan teknologi informasi. Aplikasi ini dirancang untuk dapat dijalankan sendiri oleh masing-masing lembaga.

Proyek masih dalam tahap pengembangan awal. **Belum siap digunakan untuk operasional bank atau menyimpan data asli.**

## Kondisi saat ini

Fondasi backend sudah menggunakan Node.js dan PostgreSQL. Bagian yang telah dikerjakan meliputi migrasi database, tabel lembaga dan akun, autentikasi password Argon2id, sesi pengguna, serta pengujian otomatis melalui GitHub Actions.

Antarmuka pengguna, pengiriman undangan otomatis, MFA, pemulihan akun, pengelolaan dokumen bukti, checklist asesmen, dan laporan kepatuhan belum tersedia. Pengaturan akun dan peran saat ini baru melalui API. Pemetaan POJK 34 Tahun 2025 beserta ketentuan pelaksananya juga belum diimplementasikan.

## Menjalankan secara lokal

Lingkungan pengembangan menggunakan Node.js 24.7.0 atau lebih baru (di bawah versi 27), npm, dan PostgreSQL 17. Database kosong serta pengguna PostgreSQL dibuat terlebih dahulu; migrasi NusaRiksa tidak membuat database secara otomatis.

Instalasi dependensi:

```sh
npm ci
```

Contoh pengaturan koneksi di Windows PowerShell:

```powershell
$env:DATABASE_URL = 'postgresql://user:password@127.0.0.1:5432/nusariksa_dev'
$env:APP_ORIGIN = 'http://127.0.0.1:3000'
```

Untuk Linux atau macOS:

```sh
export DATABASE_URL='postgresql://user:password@127.0.0.1:5432/nusariksa_dev'
export APP_ORIGIN='http://127.0.0.1:3000'
```

Nilai `user`, `password`, dan nama database disesuaikan dengan PostgreSQL lokal. Setelah itu:

```sh
npm run db:migrate
npm run check
npm start
```

Server berjalan di `http://127.0.0.1:3000` secara default. Port dapat diubah melalui variabel `PORT`; `APP_ORIGIN` perlu mengikuti alamat dan port yang digunakan.

`npm run check` menjalankan pemeriksaan sintaks dan pengujian. Pengujian yang memerlukan PostgreSQL dilewati apabila `DATABASE_URL` tidak tersedia.

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

Endpoint login menerima JSON berisi `email` dan `password`. Akun harus sudah ada dalam database, berstatus `active`, dan memiliki hash password Argon2id. Admin pertama dibuat melalui perintah lokal `npm run admin:bootstrap -- --name "Nama Bank" --kind BPR --email admin@example.test` setelah `DATABASE_URL` disetel. Proses meminta password secara interaktif tanpa menampilkannya. Perintah ini hanya dapat dipakai pada database yang belum memiliki lembaga maupun akun.

Login dan logout memerlukan header `Origin` yang sesuai dengan `APP_ORIGIN`. Sesi memakai cookie `Secure`, `HttpOnly`, dan `SameSite=Strict`. Penggunaan cookie di browser memerlukan pengaturan HTTPS yang sesuai; server HTTP lokal ini hanya untuk pengembangan.

Pembatasan percobaan login masih disimpan dalam memori satu proses dan akan hilang setelah restart. MFA, pengaturan reverse proxy tepercaya, dan pengamanan untuk deployment produksi belum selesai.

Peran disimpan di tabel `user_roles`. Perubahan peran melalui layanan internal dicatat di `role_change_events` dalam transaksi yang sama. Catatan tersebut menolak pengubahan dan penghapusan biasa di tingkat database, tetapi bukan bukti anti-manipulasi terhadap administrator database. Admin aktif dapat memberi atau mencabut peran pengguna lain melalui `PATCH /users/:userId/roles` dengan JSON `{"role":"AUDITOR","action":"GRANT"}` atau `"REVOKE"`. Endpoint membutuhkan sesi dan header `Origin` yang cocok; perubahan peran serta catatan audit disimpan dalam transaksi yang sama. Admin dapat membuat akun pending melalui `POST /users` dengan JSON `{"email":"staf@example.test"}`. Token aktivasi acak dikembalikan sekali dalam respons dan harus disampaikan melalui saluran tepercaya. Token berlaku 24 jam; pengguna memasukkan token dan password baru ke `POST /auth/activate`. Tidak ada email undangan otomatis. Admin juga dapat melihat daftar akun dan menonaktifkan akun; pengaktifan kembali akun nonaktif belum didukung. Semua perubahan status dicatat dalam audit log. Asesmen awal sudah menggunakan izin `assessments:read` dan `assessments:write`. Pembuatan menerima JSON `{"title":"Asesmen TI 2027","periodStart":"2027-01-01","periodEnd":"2027-12-31"}`. Pembuat otomatis menjadi penanggung jawab. Status hanya `draft` dan `in_progress`; checklist, bukti, penilaian, dan persetujuan baru akan dikembangkan. Perubahan status tercatat dalam audit log.

## Pengembangan dan lisensi

Arah pengembangan mencakup pengelolaan akses, pencatatan risiko, bukti pendukung, serta pemetaan ketentuan TI untuk BPR dan BPRS. Perkembangannya dicatat dalam [rencana pengembangan](docs/ROADMAP.md).

Kontribusi dapat dimulai dari [panduan kontribusi](CONTRIBUTING.md). Temuan keamanan dilaporkan melalui jalur yang dijelaskan dalam [kebijakan keamanan](SECURITY.md).

NusaRiksa menggunakan lisensi [GNU AGPL-3.0-only](LICENSE). Penggunaan komersial diperbolehkan sesuai ketentuan lisensinya. Informasi hak cipta tersedia di [NOTICE.md](NOTICE.md).

NusaRiksa bukan produk resmi atau layanan yang disahkan oleh Otoritas Jasa Keuangan. Penggunaan aplikasi tidak menggantikan tanggung jawab bank dalam memenuhi ketentuan yang berlaku.
