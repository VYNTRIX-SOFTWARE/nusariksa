# NusaRiksa

NusaRiksa adalah aplikasi sumber terbuka dari VYNTRIX untuk membantu BPR dan BPRS mendokumentasikan penilaian teknologi informasi, menyimpan bukti, dan melakukan pemeriksaan internal. Aplikasi dapat dijalankan sendiri oleh masing-masing lembaga.

**Status pengembangan:** aplikasi belum siap untuk data bank sebenarnya atau pelaporan resmi OJK. Instrumen maturitas keamanan siber PADK masih menggunakan hasil ekstraksi dan pemetaan yang belum diverifikasi.

## Fitur

- Akun, peran dan izin, login, pergantian password, serta MFA TOTP.
- Asesmen kontrol internal dengan **26 kontrol baseline TI bawaan** (template internal), katalog tambahan manual, lampiran bukti, review, dan laporan internal.
- Penilaian PADK berdasarkan kategori dan periode: peringkat sementara 1–5, justifikasi, dan bukti.
- Pengajuan, pengembalian, dan pemeriksaan kelengkapan draft oleh pengguna berbeda.
- Lima kriteria peringkat dari ekstraksi Tabel 3 Lampiran IV beserta rujukan halaman PDF.
- Perhitungan nilai domain, komposit simulasi, dan ekspor PDF kertas kerja draft.

**Hasil simulasi dan PDF draft bukan penilaian resmi.** Penggunaan NusaRiksa juga tidak otomatis memenuhi seluruh ketentuan POJK 34/2025 dan PADK 43/PADK.03/2025. Baca [panduan PADK](docs/PADK.md).

## Menjalankan secara lokal

Gunakan Node.js **24.7.0 atau lebih baru, tetapi di bawah 27**, npm, dan PostgreSQL 17. Buat database dan pengguna PostgreSQL sebelum menjalankan migrasi.

```bash
npm ci
```

Di Linux/macOS:

```bash
export DATABASE_URL='postgresql://user:password@127.0.0.1:5432/nusariksa_dev'
export APP_ORIGIN='http://localhost:3000'
```

Di PowerShell:

```powershell
$env:DATABASE_URL = 'postgresql://user:password@127.0.0.1:5432/nusariksa_dev'
$env:APP_ORIGIN = 'http://localhost:3000'
```

Sesuaikan kredensial dan nama database, lalu jalankan:

```bash
npm run db:migrate
npm run admin:bootstrap -- --name "BPR Contoh" --kind BPR --email admin@example.test
npm run check
npm start
```

Bootstrap pertama meminta password melalui terminal interaktif. Buka **http://localhost:3000**. Server pengembangan hanya mendengarkan di `127.0.0.1` dan menggunakan port 3000 secara default. Atur `PORT` jika diperlukan; `APP_ORIGIN` harus sama dengan alamat yang dipakai browser.

Mode lama membutuhkan `EVIDENCE_ENCRYPTION_KEY` berupa **64 karakter heksadesimal** (32 byte). Rotasi menggunakan `EVIDENCE_KEYRING` (JSON berisi key ID dan kunci) bersama `EVIDENCE_ACTIVE_KEY_ID`; pertahankan kunci lama untuk mengakses bukti historis. Simpan kunci di luar Git; jangan gunakan dokumen nasabah untuk pengujian. Baca [panduan rotasi](docs/DEVELOPMENT.md).

## Memulai pengisian di web

Setelah bootstrap `SUPER_ADMIN`, buka Dashboard lalu **Kelola akses pengguna**. Undang petugas melalui email, serahkan kode undangan satu kali secara privat, dan minta petugas memilih **Aktifkan akun** pada halaman login. Setelah akun aktif, admin memberikan peran `IT_OFFICER` melalui halaman Akses Pengguna. Petugas dapat login, memilih **Mulai penilaian**, lalu **Buat penilaian pertama** pada halaman PADK. Gunakan akun `REVIEWER` terpisah untuk pemeriksaan draft. Lihat [panduan langkah pertama](docs/DEVELOPMENT.md).

## Katalog bawaan untuk asesmen kontrol umum

Instalasi yang sudah bermigrasi dan memiliki admin, serta instalasi baru setelah bootstrap, otomatis memperoleh katalog **Baseline Operasional TI BPR/BPRS** dengan 26 kontrol internal (tata kelola, aset, akun, operasi, data, jaringan, pemulihan dan vendor). Buat asesmen kontrol umum pada menu **Daftar Asesmen**: katalog bawaan akan langsung disarankan pada tahap persiapan. Pemilik tetap harus menekan **Pasang katalog** dan mengonfirmasinya, karena pemasangan tidak dapat diganti.

Untuk kebutuhan khusus BPR/BPRS, menu **Katalog Kontrol** tetap memungkinkan pembuatan katalog manual atau versi Draft berikutnya dari baseline bawaan. Tambahkan kontrol sendiri lalu terbitkan versi baru tanpa mengubah versi lama yang sudah dipakai asesmen.

**Penting:** Katalog ini hanya **template internal NusaRiksa**, bukan teks pasal POJK/PADK yang telah diverifikasi. Katalog asesmen kontrol umum ini **berbeda** dari 60/80 indikator pada menu **Persiapan PADK**. Progres dan hasilnya tidak boleh diklaim sebagai kepatuhan resmi.

## Mengisi 26 kontrol TI bawaan (MVP)

Sesudah memasang katalog bawaan dan menekan **Mulai asesmen**, form kontrol muncul **sebelum review internal**. Kontrol aktif menampilkan nomor urut dan status penyimpanan. Isi hasil penilaian sesuai bukti, kemudian pilih **Simpan di kontrol ini** atau **Simpan & lanjut** untuk berpindah ke kontrol berikutnya yang belum dinilai. Navigasi **Sebelumnya / Berikutnya / Cari yang belum dinilai** tidak menyimpan data otomatis; perubahan yang belum disimpan perlu dikonfirmasi bila berpindah. Progres menunjukkan berapa dari 26 kontrol sudah dinilai, bukan nilai kepatuhan resmi. Bukti dilampirkan per kontrol, sedangkan riwayat disembunyikan di panel opsional. Pemeriksaan internal tetap membutuhkan akun reviewer berbeda.

## Mengisi penilaian PADK

1. Login, buat penilaian berdasarkan periode, lalu pilih kategori sesuai layanan BPR/BPRS.
2. Baca kriteria indikator dan bandingkan hasil ekstraksi dengan halaman PDF sumber.
3. Pada ruang kerja indikator, bandingkan kriteria ekstraksi dengan PDF resmi, pilih peringkat sementara, tulis justifikasi, lalu pilih **Simpan indikator ini** atau **Simpan & lanjut** untuk pindah ke indikator belum lengkap. Catatan tambahan bersifat opsional; setelah menyimpan, bukti PDF/PNG/JPEG dapat diunggah.
4. Setelah semua indikator terisi, ajukan draft untuk pemeriksaan.
5. Pemeriksa berbeda dapat mengembalikan draft atau menerima **kelengkapan draft internal**.
6. Lihat progres, komposit simulasi, atau unduh PDF kertas kerja draft.

Status `draft_accepted` **bukan persetujuan nilai resmi**. Hasil final masih memerlukan verifikasi instrumen, pemetaan Kategori 2, aturan perhitungan, pengesahan hasil, dan pengujian operasional.

## Struktur proyek

| Lokasi | Kegunaan |
| --- | --- |
| `apps/api/` | API, autentikasi, aturan bisnis, dan pengujian backend |
| `apps/web/` | Antarmuka web |
| `database/migrations/` | Migrasi PostgreSQL |
| `regulations/padk43/cyber/` | Draft instrumen, pemetaan, dan verifikasi PADK |
| `scripts/` | Migrasi, pemeriksaan, dan pengujian browser |
| `tools/padk-review/` | Alat pembanding kriteria dengan PDF |
| `docs/` | Panduan pengembangan dan instrumen PADK |

## Dokumentasi

- [Pengembangan dan pengujian](docs/DEVELOPMENT.md)
- [Panduan uji pemulihan database dan bukti terenkripsi](docs/RECOVERY.md)
- [Penilaian dan batasan PADK](docs/PADK.md)
- [Kontribusi](CONTRIBUTING.md)
- [Kebijakan keamanan](SECURITY.md)

## Lisensi

NusaRiksa menggunakan **AGPL-3.0-only**. Periksa [LICENSE](LICENSE), [NOTICE.md](NOTICE.md), dan [TRADEMARKS.md](TRADEMARKS.md) sebelum mendistribusikan modifikasi atau menggunakan identitas proyek.
