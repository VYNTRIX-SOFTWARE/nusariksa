# NusaRiksa

NusaRiksa adalah aplikasi sumber terbuka untuk membantu Bank Perekonomian Rakyat (BPR) dan Bank Perekonomian Rakyat Syariah (BPRS) mengelola pekerjaan tata kelola teknologi informasi: asesmen, pencatatan aset dan risiko, penanganan insiden, tindak lanjut temuan, serta pemeriksaan internal.

Proyek ini dikembangkan oleh **VYNTRIX** dengan lisensi **AGPL-3.0-only**. Setiap lembaga menjalankan aplikasi dan database miliknya sendiri.

## Fitur yang tersedia

- **Asesmen TI:** katalog bawaan berisi 26 kontrol operasional dengan pertanyaan pemeriksaan, rujukan POJK 34/2025, contoh bukti, dan alur pengajuan serta peninjauan oleh petugas lain. Pengguna dapat memilih kontrol yang relevan sebelum asesmen dimulai.
- **Kertas kerja keamanan siber:** persiapan penilaian berdasarkan referensi Lampiran IV PADK 43/PADK.03/2025, termasuk pencatatan justifikasi, bukti, dan pemeriksaan draft. Instrumen masih memerlukan verifikasi independen dan **belum boleh digunakan untuk menghasilkan penilaian resmi regulator**.
- **Inventaris aset dan risiko TI:** catatan aset, penanggung jawab, lokasi, tingkat kritikalitas, risiko terkait, dan rencana mitigasi.
- **Insiden TI/siber:** pencatatan kejadian, kronologi tindakan, keterkaitan dengan aset dan risiko, serta hasil pemulihan.
- **Tindak lanjut temuan:** rencana perbaikan, bukti penyelesaian, tenggat, dan verifikasi oleh pemeriksa yang berwenang.
- **Penyedia layanan TI:** register vendor, kontrak, masa berlaku, target SLA, dan evaluasi layanan.
- **Pemulihan layanan TI:** rencana pemulihan, PIC, target RTO/RPO, referensi cadangan, dan catatan pengujian. Aplikasi mencatat hasil yang diberikan pengguna; tidak menjalankan proses pemulihan infrastruktur secara otomatis.
- **Pusat Pekerjaan TI dan laporan:** ringkasan catatan yang perlu perhatian, riwayat perubahan, serta ekspor PDF/CSV internal sesuai hak akses.

Contoh, daftar kontrol, dan referensi peraturan membantu petugas menyiapkan pencatatan. **NusaRiksa tidak mengisi kondisi faktual, membuat bukti, atau menyatakan kepatuhan bank secara otomatis.** Hasil kerja perlu ditinjau oleh pihak yang berwenang.

## Panduan penggunaan

Petugas TI, kepatuhan, serta pemeriksa dapat mulai dari [Panduan Penggunaan NusaRiksa](docs/PANDUAN-PENGGUNA.md). Panduan tersebut menjelaskan penggunaan aplikasi lewat browser tanpa memerlukan pengetahuan tentang kode sumber.

## Menjalankan NusaRiksa secara lokal

Persyaratan:

- Node.js **24.7.0 atau lebih baru, tetapi di bawah 27**;
- npm;
- PostgreSQL **17**.

Buat database PostgreSQL kosong untuk pengujian, lalu pasang dependensi:

```bash
npm ci
```

Atur koneksi dan alamat aplikasi. Contoh pada Linux/macOS:

```bash
export DATABASE_URL='postgresql://user:password@127.0.0.1:5432/nusariksa'
export APP_ORIGIN='http://localhost:3000'
```

Contoh pada PowerShell:

```powershell
$env:DATABASE_URL = 'postgresql://user:password@127.0.0.1:5432/nusariksa'
$env:APP_ORIGIN = 'http://localhost:3000'
```

Jalankan migrasi, periksa kesesuaian database, buat administrator awal, lalu mulai layanan:

```bash
npm run db:migrate
npm run db:status
npm run admin:bootstrap -- --name "BPR ABC" --kind BPR --email admin@example.test
npm start
```

Kata sandi administrator awal diminta melalui terminal. Buka `http://localhost:3000`; secara bawaan aplikasi hanya mendengarkan pada `127.0.0.1`.

Untuk menjalankan pemeriksaan kode dan tes:

```bash
npm run check
```

### Kunci enkripsi dan keamanan data

Sebelum mengunggah bukti atau menggunakan MFA, atur kunci melalui lingkungan yang dikelola secara aman:

- `EVIDENCE_KEYRING` dan `EVIDENCE_ACTIVE_KEY_ID` untuk bukti baru menggunakan keyring berversi;
- `EVIDENCE_ENCRYPTION_KEY` jika masih ada bukti lama tanpa identitas kunci;
- `MFA_ENCRYPTION_KEY` berupa kunci acak 32 byte dalam format base64 untuk perlindungan data MFA.

Simpan kunci serta cadangannya di luar repository. Jangan memakai data nasabah, dokumen rahasia, atau kredensial bank untuk pengujian awal. Lihat [panduan pengembangan](docs/DEVELOPMENT.md), [operasional instalasi dan upgrade](docs/OPERATIONS.md), serta [uji pemulihan](docs/RECOVERY.md) sebelum menjalankan lingkungan uji yang lebih luas.

## Dokumentasi

Dokumentasi dikelompokkan berdasarkan pembacanya di [indeks dokumentasi](docs/README.md):

- **Pengguna BPR/BPRS:** [panduan penggunaan](docs/PANDUAN-PENGGUNA.md).
- **Administrator dan penguji:** [operasional](docs/OPERATIONS.md), [kesiapan pilot](docs/PILOT-READINESS.md), dan [pemulihan](docs/RECOVERY.md).
- **Developer dan kontributor:** [panduan pengembangan](docs/DEVELOPMENT.md) dan [kontribusi](CONTRIBUTING.md).
- **Peninjau regulasi:** [penilaian keamanan siber PADK](docs/PADK.md) dan [matriks ketentuan](docs/MATRIKS-KETENTUAN-PENILAIAN-KEAMANAN-SIBER.md).

Laporan kerentanan disampaikan secara privat sesuai [kebijakan keamanan](SECURITY.md).

## Lisensi

Kode NusaRiksa didistribusikan dengan lisensi **AGPL-3.0-only**. Ketentuan lisensi, atribusi, serta penggunaan nama dan identitas proyek tercantum dalam [LICENSE](LICENSE), [NOTICE.md](NOTICE.md), dan [TRADEMARKS.md](TRADEMARKS.md).
