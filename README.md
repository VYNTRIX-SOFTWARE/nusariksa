# NusaRiksa

**NusaRiksa** adalah aplikasi sumber terbuka untuk membantu Bank Perekonomian Rakyat (BPR) dan Bank Perekonomian Rakyat Syariah (BPRS) mencatat, menilai, dan meninjau pelaksanaan tata kelola teknologi informasi. Setiap lembaga dapat menjalankan NusaRiksa pada server dan database miliknya sendiri.

NusaRiksa dikembangkan oleh **VYNTRIX** dan didistribusikan dengan lisensi **AGPL-3.0-only**.

## Apa yang bisa dilakukan?

- **Asesmen TI:** memeriksa pelaksanaan kontrol TI menggunakan daftar pemeriksaan bawaan, melampirkan bukti, dan meminta peninjauan oleh petugas lain.
- **Penilaian keamanan siber:** mencatat penilaian indikator, alasan penilaian, bukti, dan hasil simulasi berdasarkan referensi PADK.
- **Inventaris aset TI:** mengelola daftar perangkat, aplikasi, penanggung jawab, lokasi, dan tingkat kritikalitas.
- **Register risiko TI:** menilai kemungkinan dan dampak risiko, mencatat mitigasi, serta menghubungkannya dengan aset.
- **Penanganan insiden TI/siber:** mencatat kejadian, kronologi tindakan, pemulihan, serta hubungan dengan aset dan risiko.
- **Tindak lanjut temuan:** mendokumentasikan kondisi yang perlu diperbaiki, menetapkan PIC dan tenggat, mengajukan hasil tindakan, serta mencatat verifikasi dari pemeriksa yang berbeda.
- **Pengelolaan vendor TI:** mencatat penyedia layanan, perjanjian, target SLA, masa berlaku kontrak, dan hasil evaluasi layanan.
- **Pengguna dan pemeriksaan:** mengelola hak akses, meninjau hasil pekerjaan, serta menelusuri riwayat perubahan.

Katalog asesmen TI bawaan menyediakan **26 kontrol operasional** beserta pertanyaan pemeriksaan, panduan pengisian, dan contoh bukti. Petugas tetap perlu mengisi hasil berdasarkan kondisi dan dokumen lembaganya.

**Catatan penggunaan:** penilaian, simulasi, dan dokumen yang dihasilkan NusaRiksa perlu ditelaah oleh petugas berwenang sebelum digunakan untuk pengambilan keputusan atau pelaporan eksternal. Aplikasi ini tidak dengan sendirinya menyatakan sebuah bank patuh terhadap seluruh ketentuan OJK.

## Panduan penggunaan

Untuk petugas dan pemeriksa BPR/BPRS, mulai dari **[Panduan Penggunaan NusaRiksa](docs/PANDUAN-PENGGUNA.md)**. Panduan tersebut menjelaskan cara masuk, memulai asesmen, mencatat bukti, mengelola aset dan risiko, serta menangani insiden.

## Menjalankan NusaRiksa secara lokal

Persyaratan:

- Node.js **24.7.0 atau lebih baru, tetapi di bawah 27**
- npm
- PostgreSQL 17

Siapkan database PostgreSQL kosong dan akun database dengan izin yang sesuai. Pasang dependensi:

```bash
npm ci
```

Atur koneksi database dan alamat aplikasi. Contoh di Linux/macOS:

```bash
export DATABASE_URL='postgresql://user:password@127.0.0.1:5432/nusariksa_dev'
export APP_ORIGIN='http://localhost:3000'
```

Contoh di PowerShell:

```powershell
$env:DATABASE_URL = 'postgresql://user:password@127.0.0.1:5432/nusariksa_dev'
$env:APP_ORIGIN = 'http://localhost:3000'
```

Jalankan migrasi, buat akun administrator pertama, lalu mulai aplikasi:

```bash
npm run db:migrate
npm run admin:bootstrap -- --name "BPR Contoh" --kind BPR --email admin@example.test
npm start
```

Password administrator pertama diminta melalui terminal. Buka **http://localhost:3000** melalui browser. Server lokal menggunakan `127.0.0.1` dan port 3000 sebagai pengaturan bawaan.

Untuk menjalankan pengujian:

```bash
npm run check
```

### Keamanan berkas bukti

Berkas bukti menggunakan enkripsi pada penyimpanan. Sebelum mengunggah berkas, administrator sistem perlu mengonfigurasi kunci yang sesuai:

- `EVIDENCE_ENCRYPTION_KEY` untuk bukti yang masih menggunakan format kunci lama;
- `EVIDENCE_KEYRING` dan `EVIDENCE_ACTIVE_KEY_ID` untuk pengelolaan beberapa versi kunci.

Simpan kunci di luar repository dan bersama cadangan yang aman. Jangan menggunakan data nasabah, kata sandi, atau dokumen rahasia sebagai data uji. Petunjuk pengelolaan dan pemulihan kunci tersedia dalam [dokumentasi teknis](docs/DEVELOPMENT.md) dan [panduan pemulihan](docs/RECOVERY.md).

## Dokumentasi

- [Panduan penggunaan untuk BPR/BPRS](docs/PANDUAN-PENGGUNA.md)
- [Instalasi dan pemeliharaan teknis](docs/DEVELOPMENT.md)
- [Penilaian keamanan siber dan referensinya](docs/PADK.md)
- [Pemulihan database dan berkas bukti](docs/RECOVERY.md)
- [Panduan kontribusi](CONTRIBUTING.md)
- [Kebijakan keamanan](SECURITY.md)

## Lisensi

NusaRiksa menggunakan **AGPL-3.0-only**. Lihat [LICENSE](LICENSE), [NOTICE.md](NOTICE.md), dan [TRADEMARKS.md](TRADEMARKS.md) untuk ketentuan distribusi dan penggunaan identitas proyek.
