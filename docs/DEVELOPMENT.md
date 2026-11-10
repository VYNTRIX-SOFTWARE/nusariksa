# Dokumentasi Teknis NusaRiksa

Dokumen ini ditujukan kepada administrator sistem dan kontributor yang memasang, memelihara, serta menguji NusaRiksa. Petugas BPR/BPRS yang ingin menggunakan aplikasi melalui browser dapat mengikuti [Panduan Penggunaan NusaRiksa](PANDUAN-PENGGUNA.md).

## Lingkungan lokal

Gunakan Node.js `>=24.7.0 <27`, npm, dan PostgreSQL 17. Buat database kosong, lalu atur `DATABASE_URL` dan `APP_ORIGIN` sebagaimana dijelaskan di README.

```bash
npm ci
npm run db:migrate
npm run admin:bootstrap -- --name "BPR Contoh" --kind BPR --email admin@example.test
npm start
```

Bootstrap pertama meminta password melalui terminal. Gunakan data contoh, bukan akun karyawan bank yang sebenarnya.

| Variabel | Kegunaan |
| --- | --- |
| `DATABASE_URL` | Koneksi PostgreSQL |
| `APP_ORIGIN` | Origin browser yang diizinkan, misalnya `http://localhost:3000` |
| `PORT` | Port server pengembangan; default 3000 |
| `EVIDENCE_ENCRYPTION_KEY` | Kunci bukti legacy (64 digit hex) untuk seluruh baris historis tanpa key ID |
| `EVIDENCE_KEYRING` | JSON object ID versi kunci ke 64 digit hex; simpan sebagai secret |
| `EVIDENCE_ACTIVE_KEY_ID` | ID versi kunci aktif untuk unggahan baru |

Simpan semua kunci di luar repositori. Untuk mulai rotasi, tetapkan `EVIDENCE_KEYRING` sebagai JSON object berisi ID kunci dan kuncinya, dan `EVIDENCE_ACTIVE_KEY_ID=v2` secara bersamaan. Unggahan baru menggunakan kunci aktif dan menyimpan ID di database yang ikut diautentikasi oleh AES-GCM. Baris lama dengan `key_id IS NULL` tetap membutuhkan `EVIDENCE_ENCRYPTION_KEY` semula. Jangan menghapus kunci versi lama dari keyring selama masih ada bukti yang bergantung padanya. Rotasi ini tidak mengenkripsi ulang data historis. Simpan backup kunci terpisah, lakukan uji pemulihan database dan kunci bersama-sama. Konfigurasi invalid gagal tertutup (503), bukan fallback otomatis. Kehilangan kunci dapat menyebabkan berkas bukti tidak dapat dipulihkan.

## Struktur kode

- `apps/api/src/`: handler HTTP, aturan bisnis, autentikasi, dan otorisasi.
- `apps/api/test/`: pengujian unit dan integrasi.
- `apps/web/`: HTML dan JavaScript antarmuka.
- `database/migrations/`: perubahan struktur database. Buat migrasi baru; jangan mengedit migrasi yang sudah digabung ke `main`.
- `scripts/`: migrasi, bootstrap, tes browser, dan validasi PADK.
- `regulations/padk43/cyber/`: data draft instrumen, calon pemetaan, dan pemeriksaan sumber.

Backend harus memeriksa peran, izin, institusi, dan status asesmen pada setiap permintaan. Menyembunyikan tombol dari pengguna tidak menggantikan otorisasi API. Sesi menggunakan cookie HttpOnly.

## Pengujian

```bash
npm run check
npm run test:browser
```

`npm run check` menjalankan pemeriksaan sintaks, tes Node.js, dan validasi data PADK tahap pengembangan. Tes integrasi membutuhkan `DATABASE_URL`. Tes browser memerlukan PostgreSQL dan browser yang sesuai dengan skrip tes. Periksa jumlah tes yang dijalankan dan laporan kegagalan sebelum menerima perubahan.

Pengujian API dan database mencakup akses tanpa izin, input tidak valid, konflik revisi, dan kegagalan transaksi. Pengujian antarmuka mencakup penyimpanan serta pembacaan kembali hasilnya.

Pemeriksaan instrumen PADK:

```bash
npm run regulatory:draft-status
npm run regulatory:check
npm run regulatory:release-gate
```

`regulatory:check` bukan tanda aplikasi boleh dipakai untuk pelaporan resmi. `regulatory:release-gate` harus tetap menolak paket yang belum lengkap atau belum diperiksa. Lihat [panduan PADK](PADK.md).

## Kontribusi

Pedoman kontribusi dan prosedur peninjauan kode tersedia di [CONTRIBUTING.md](../CONTRIBUTING.md).

## Uji pemulihan

Untuk melakukan uji pemulihan terisolasi gunakan `npm run recovery:drill` sesuai [panduan pemulihan](RECOVERY.md). Perintah menguji `pg_dump`/`pg_restore`, riwayat migrasi, serta dekripsi dan hash bukti dari database hasil pemulihan. Tool ini tidak menggantikan kebijakan backup produksi, disaster recovery, atau pemulihan kunci eksternal. Jalankan hanya pada target lokal kosong dan terpisah.

## Sebelum menggunakan data produksi

NusaRiksa masih dalam pengembangan. Penerapan produksi memerlukan review otorisasi, manajemen dan pemulihan kunci, keamanan unggahan, backup–restore, pengujian operasional, serta pemeriksaan independen atas instrumen PADK. CI yang lulus tidak membuktikan aplikasi aman untuk data bank.
