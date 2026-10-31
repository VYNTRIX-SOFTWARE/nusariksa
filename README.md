# NusaRiksa

NusaRiksa adalah proyek sumber terbuka dari VYNTRIX untuk membantu Bank Perekonomian Rakyat (BPR) dan BPR Syariah (BPRS) mengelola tata kelola, risiko, dan kepatuhan teknologi informasi. Aplikasi ini dirancang untuk dapat dijalankan sendiri oleh masing-masing lembaga.

Proyek masih dalam tahap pengembangan awal. **Belum siap digunakan untuk operasional bank atau menyimpan data asli.**

## Kondisi saat ini

Fondasi backend sudah menggunakan Node.js dan PostgreSQL. Bagian yang telah dikerjakan meliputi migrasi database, tabel lembaga dan akun, autentikasi password Argon2id, sesi pengguna, serta pengujian otomatis melalui GitHub Actions.

Antarmuka pengguna, pembuatan akun awal, pengaturan hak akses, MFA, pengelolaan dokumen bukti, asesmen, dan laporan kepatuhan belum tersedia. Pemetaan POJK 34 Tahun 2025 beserta ketentuan pelaksananya juga belum diimplementasikan.

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

Endpoint login menerima JSON berisi `email` dan `password`. Akun harus sudah ada dalam database, berstatus `active`, dan memiliki hash password Argon2id. Belum tersedia proses resmi untuk membuat akun pertama.

Login dan logout memerlukan header `Origin` yang sesuai dengan `APP_ORIGIN`. Sesi memakai cookie `Secure`, `HttpOnly`, dan `SameSite=Strict`. Penggunaan cookie di browser memerlukan pengaturan HTTPS yang sesuai; server HTTP lokal ini hanya untuk pengembangan.

Pembatasan percobaan login masih disimpan dalam memori satu proses dan akan hilang setelah restart. MFA, pengaturan reverse proxy tepercaya, dan pengamanan untuk deployment produksi belum selesai.

Peran pengguna disimpan di tabel `user_roles`. Enam peran awal tersedia untuk pengujian hak akses, tetapi belum ada API untuk memberi atau mencabut peran. Modul kerja belum menggunakan aturan izin ini; endpoint `/auth/permissions` hanya menampilkan izin dari sesi aktif.

## Pengembangan dan lisensi

Arah pengembangan mencakup pengelolaan akses, pencatatan risiko, bukti pendukung, serta pemetaan ketentuan TI untuk BPR dan BPRS. Perkembangannya dicatat dalam [rencana pengembangan](docs/ROADMAP.md).

Kontribusi dapat dimulai dari [panduan kontribusi](CONTRIBUTING.md). Temuan keamanan dilaporkan melalui jalur yang dijelaskan dalam [kebijakan keamanan](SECURITY.md).

NusaRiksa menggunakan lisensi [GNU AGPL-3.0-only](LICENSE). Penggunaan komersial diperbolehkan sesuai ketentuan lisensinya. Informasi hak cipta tersedia di [NOTICE.md](NOTICE.md).

NusaRiksa bukan produk resmi atau layanan yang disahkan oleh Otoritas Jasa Keuangan. Penggunaan aplikasi tidak menggantikan tanggung jawab bank dalam memenuhi ketentuan yang berlaku.
