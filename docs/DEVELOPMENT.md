# Panduan pengembangan

Panduan ini untuk pengembang yang ingin menjalankan, menguji, atau memperbaiki NusaRiksa. Untuk pengenalan aplikasi dan instalasi singkat, mulai dari [README](../README.md).

## Alur penggunaan pertama kali (MVP draft)

Pembuatan database dan bootstrap `SUPER_ADMIN` masih dilakukan operator teknis satu kali melalui terminal, lalu seluruh langkah pengguna berikutnya tersedia pada web:

1. Admin masuk dan memilih **Akses Pengguna** (juga tersedia melalui tombol utama di Dashboard). Undang email petugas pengisi; simpan kode undangan sekali pakai (24 jam) dan kirim langsung lewat kanal privat. Token tidak dikirim melalui email oleh NusaRiksa.
2. Petugas membuka login, memilih **Sudah punya kode undangan? Aktifkan akun**, mengisi token undangan, password minimum 12 karakter, dan konfirmasi.
3. Admin klik **Muat ulang** di Akses Pengguna, pilih peran **Petugas pengisi asesmen (IT_OFFICER)** untuk petugas yang baru aktif. Buat petugas pemeriksa terpisah dengan peran **REVIEWER**.
4. Petugas pengisi login, memilih **Mulai penilaian** dari Dashboard. Di **Persiapan Penilaian PADK**, pilih **Buat penilaian pertama**, isi judul, kategori dan periode.
5. Isi peringkat, justifikasi, dan bukti tiap indikator; periksa progres, ajukan draft, lalu pemeriksa lain dapat membuka antrean review.

Akun `SUPER_ADMIN` saja tidak otomatis dapat menilai (least privilege), tidak dapat mengubah perannya sendiri, dan perlu pengguna petugas terpisah. Kode undangan adalah **rahasia autentikasi**: hanya ditampilkan sesaat di browser admin; jangan salin ke issue, chat publik, log, atau repositori. Alur ini tidak mengesahkan konten PADK untuk pelaporan resmi.

## Katalog internal bawaan untuk MVP

Migrasi `0024_seed_internal_bpr_catalog.sql` menambahkan katalog dengan 26 kontrol internal terbit pada database yang sudah memiliki `SUPER_ADMIN`. Saat bootstrap instalasi baru, fungsi installer katalog yang sama dipanggil dalam transaksi. Penyediaan bersifat idempoten, tidak mengubah versi terbit yang telah ada dan tidak menimpa katalog custom. Jika kode `NUSARIKSA_BPR_INTERNAL` sudah dipakai katalog manual, installer tidak mengambil alih kode tersebut; periksa konflik secara privat.

UI menandai katalog `origin='builtin'` dan menyarankan versi terbitnya pada formulir asesmen tanpa memasangnya diam-diam. Setelah dipasang, assignment versi tidak dapat dibatalkan. BPR boleh membuat versi Draft berikutnya, menambah kontrol, dan menerbitkannya; atau membuat katalog sendiri. Semua kontrol bawaan adalah **baseline internal yang belum merupakan instrumen OJK**.

## Pengalaman mengisi asesmen kontrol umum (MVP)

Di **Daftar Asesmen → Workspace**, setelah katalog bawaan dipasang dan asesmen dimulai, petugas melihat daftar 26 kontrol, form jawaban, status tersimpan, progres, dan langkah selanjutnya. Tombol **Simpan & lanjut** memakai API PUT yang sama dengan Simpan dan baru memilih kontrol belum dinilai berikut setelah data tersimpan pada server; status konflik revisi dan izin backend tetap berlaku. Kontrol dapat dinavigasi dengan tombol sebelum/berikutnya, filter, atau cari belum dinilai. Perubahan belum tersimpan tidak otomatis dibuang. Bukti per kontrol tetap terenkripsi, dan review internal muncul setelah input. Progres hanya menghitung kontrol yang memiliki revision, bukan kualitas bukti atau kepatuhan OJK.

## Template regulasi siap pakai pada asesmen BPR (MVP)

NusaRiksa menampilkan panduan yang sudah disediakan pengembang untuk seluruh **26 kontrol baseline operasional TI internal**, dengan pemetaan **pasal terkait POJK 34/2025**, pertanyaan pemeriksaan, dua contoh dokumen bukti, dan catatan konteks. Panduan **read-only**, tidak membuat katalog/bukti baru pada database, tidak mengubah versi katalog historis, dan tidak memetakan kontrol kustom secara sembrono. Petugas mengisi kondisi aktual dan bukti dari pemeriksaan; helper form menyusun teks catatan dari input petugas, tanpa memilih rating atau membuat file bukti. Konfirmasi dibutuhkan sebelum membuang isian helper; penyimpanan tetap memakai API PUT/expectedRevision yang telah ada.

Untuk keamanan siber, **PADK 43/2025** menggunakan workspace khusus 60/80 indikator bawaan, bukan 26 kontrol umum. Instrumen PADK masih ditandai belum terverifikasi untuk keluaran resmi. Di UI template siap digunakan sebagai **acuan penilaian** tanpa label persiapan, tetapi tidak mengubah tanggal legal berlaku kedua aturan atau status release gate. Sumber POJK diperiksa pada salinan dokumen OJK di proyek; rujukan teks operasional bukan kutipan literal pasal.

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

Simpan semua kunci di luar repositori. Untuk mulai rotasi, tetapkan `EVIDENCE_KEYRING` sebagai JSON object, misalnya `{"v1":"<64 hex>","v2":"<64 hex>"}`, dan `EVIDENCE_ACTIVE_KEY_ID=v2` secara bersamaan. Unggahan baru menggunakan kunci aktif dan menyimpan ID di database yang ikut diautentikasi oleh AES-GCM. Baris lama dengan `key_id IS NULL` tetap membutuhkan `EVIDENCE_ENCRYPTION_KEY` semula. Jangan menghapus kunci versi lama dari keyring selama masih ada bukti yang bergantung padanya. Rotasi ini tidak mengenkripsi ulang data historis. Simpan backup kunci terpisah, lakukan uji pemulihan database dan kunci bersama-sama. Konfigurasi invalid gagal tertutup (503), bukan fallback otomatis. Kehilangan kunci dapat menyebabkan berkas bukti tidak dapat dipulihkan.

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

`npm run check` menjalankan pemeriksaan sintaks, tes Node.js, dan validasi data PADK tahap pengembangan. Tes integrasi membutuhkan `DATABASE_URL`. Tes browser memerlukan PostgreSQL dan browser yang sesuai dengan skrip tes. Periksa hasil dan jumlah tes yang benar-benar dijalankan sebelum membuat PR.

Perubahan API atau database harus diuji untuk akses tanpa izin, input tidak valid, konflik revisi, dan kegagalan transaksi. Untuk UI, uji tindakan menyimpan dan membaca kembali, bukan hanya tampilannya.

Pemeriksaan instrumen PADK:

```bash
npm run regulatory:draft-status
npm run regulatory:check
npm run regulatory:release-gate
```

`regulatory:check` bukan tanda aplikasi boleh dipakai untuk pelaporan resmi. `regulatory:release-gate` harus tetap menolak paket yang belum lengkap atau belum diperiksa. Lihat [panduan PADK](PADK.md).

## Aturan kontribusi

Satu PR sebaiknya membahas satu perubahan yang jelas. Kerjakan perubahan di `development` dan gunakan `main` sebagai referensi kode yang sudah diterima. Setelah squash merge, sinkronkan kembali `development` dengan `main` sebelum melanjutkan.

Jelaskan PR menggunakan **Summary, Changes, Testing, Limitations**. Issue dipakai untuk pekerjaan yang belum dikerjakan; PR tidak perlu memuat rencana sprint atau catatan pribadi. Baca [CONTRIBUTING.md](../CONTRIBUTING.md).

## Uji pemulihan

Untuk melakukan uji pemulihan terisolasi gunakan `npm run recovery:drill` sesuai [panduan pemulihan](RECOVERY.md). Perintah menguji `pg_dump`/`pg_restore`, riwayat migrasi, serta dekripsi dan hash bukti dari database hasil pemulihan. Tool ini tidak menggantikan kebijakan backup produksi, disaster recovery, atau pemulihan kunci eksternal. Jalankan hanya pada target lokal kosong dan terpisah.

## Sebelum menggunakan data produksi

NusaRiksa masih dalam pengembangan. Penerapan produksi memerlukan review otorisasi, manajemen dan pemulihan kunci, keamanan unggahan, backup–restore, pengujian operasional, serta pemeriksaan independen atas instrumen PADK. CI yang lulus tidak membuktikan aplikasi aman untuk data bank.
