# NusaRiksa

NusaRiksa adalah aplikasi sumber terbuka dari VYNTRIX untuk membantu BPR dan BPRS mendokumentasikan penilaian teknologi informasi, menyimpan bukti, dan melakukan pemeriksaan internal. Aplikasi dapat dijalankan sendiri oleh masing-masing lembaga.

**Status pengembangan:** aplikasi belum siap untuk data bank sebenarnya atau pelaporan resmi OJK. Instrumen maturitas keamanan siber PADK masih menggunakan hasil ekstraksi dan pemetaan yang belum diverifikasi.

## Fitur

- Akun, peran dan izin, login, pergantian password, serta MFA TOTP.
- Asesmen kontrol internal, katalog, lampiran bukti, review, dan laporan internal.
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

## Mengisi penilaian PADK

1. Login, buat penilaian berdasarkan periode, lalu pilih kategori sesuai layanan BPR/BPRS.
2. Baca kriteria indikator dan bandingkan hasil ekstraksi dengan halaman PDF sumber.
3. Pilih peringkat sementara, tulis justifikasi, simpan, lalu unggah bukti PDF/PNG/JPEG.
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
- [Penilaian dan batasan PADK](docs/PADK.md)
- [Kontribusi](CONTRIBUTING.md)
- [Kebijakan keamanan](SECURITY.md)

## Lisensi

NusaRiksa menggunakan **AGPL-3.0-only**. Periksa [LICENSE](LICENSE), [NOTICE.md](NOTICE.md), dan [TRADEMARKS.md](TRADEMARKS.md) sebelum mendistribusikan modifikasi atau menggunakan identitas proyek.
