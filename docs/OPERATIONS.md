# Operasional instalasi, upgrade, dan pemulihan NusaRiksa

Panduan ini untuk administrator lingkungan **uji/pilot dengan data sintetis**. Prosedur ini belum merupakan izin menjalankan NusaRiksa dengan data bank sesungguhnya. Keputusan uji terbatas tetap mengikuti [kesiapan pilot](PILOT-READINESS.md).

## Syarat sebelum mulai

- Kunci versi kode yang akan dijalankan dan simpan SHA/tag sebelumnya. Gunakan Node.js **24.22.3 atau lebih baru dalam lini 24 LTS** serta PostgreSQL **17**. Periksa dependensi melalui `npm ci --ignore-scripts` sesuai kebijakan organisasi.
- Sediakan PostgreSQL dan akun aplikasi dengan izin minimal, database khusus instalasi, segmentasi jaringan, serta backup terpisah. Tidak ada mekanisme *multi-tenant* untuk menjalankan beberapa lembaga dalam satu instalasi.
- `APP_ORIGIN` harus alamat browser yang diizinkan. HTTP dibatasi loopback; untuk akses jaringan gunakan terminasi HTTPS pada reverse proxy tepercaya dan pembatasan akses langsung. Server NusaRiksa sendiri hanya mendengarkan `127.0.0.1`.
- Konfigurasikan `DATABASE_URL`, `APP_ORIGIN`, `EVIDENCE_KEYRING`, `EVIDENCE_ACTIVE_KEY_ID`, `MFA_ENCRYPTION_KEY`, dan jika ada bukti lama `EVIDENCE_ENCRYPTION_KEY`. Gunakan secret store; jangan simpan nilainya pada repository, riwayat shell, tiket, log, atau lampiran PR. **Kunci MFA** harus 32 byte acak dalam format base64 dan harus ikut dalam rencana backup key material.
- Sebelum mengubah aplikasi, pastikan tersedia **backup yang telah diuji pemulihannya**, prosedur pemulihan kunci, ruang disk, hak akses operator, dan cara mengembalikan lalu lintas ke versi sebelumnya. Uji `recovery:drill` dilakukan pada database target lokal kosong sesuai [panduan pemulihan](RECOVERY.md); alat tersebut bukan backup permanen.

## Instalasi baru dengan data sintetis

1. Siapkan database PostgreSQL 17 kosong. Pastikan `node --version` menunjukkan Node.js 24.22.3 atau lebih baru dalam lini 24, lalu jalankan `npm run runtime:check` dan `npm ci --ignore-scripts`.
2. Setel semua environment melalui media rahasia yang aman. Buat kunci acak sendiri untuk lingkungan uji; jangan gunakan kunci produksi.
3. Jalankan `npm run db:migrate` satu kali. Jangan mengubah berkas migrasi yang sudah pernah dirilis.
4. Jalankan `npm run db:status`. Harus menghasilkan `status: PASS`, versi PostgreSQL 17 dan jumlah checksum migrasi yang cocok dengan source. Perintah ini **read-only**.
5. Jalankan `npm run admin:bootstrap -- --name "BPR Contoh" --kind BPR --email admin@example.test` dengan identitas sintetis. Simpan password sesuai kebijakan akses.
6. Setel `NUSARIKSA_PILOT_DATA_MODE=synthetic` hanya setelah memastikan tidak ada data nyata, lalu `npm run pilot:preflight -- --database`. Hasil `PREFLIGHT_CHECKS_PASSED` hanya lulus pemeriksaan otomatis.
7. Mulai dengan `npm start`. Uji `GET /health` untuk liveness dan `GET /ready` untuk koneksi, PostgreSQL 17, serta integritas migrasi. Status siap wajib HTTP 200; HTTP 503 berarti hentikan rencana pilot. Lanjutkan UAT autentikasi/MFA dan alur register sesuai checklist privat.

## Upgrade terkontrol

1. **Sebelum downtime:** pastikan ada hasil UAT yang relevan, SHA versi lama, hasil `npm run db:status` dengan kode yang sedang berjalan, kapasitas penyimpanan, dan backup DB serta **semua kunci** yang dapat dipulihkan. Simpan bukti operator dan waktu secara privat.
2. Jadwalkan *maintenance window*. Hentikan pembuatan catatan dan unggahan, lalu hentikan proses aplikasi menggunakan `SIGTERM` atau `SIGINT`. Server menghentikan koneksi masuk, mencoba menyelesaikan request yang sedang aktif hingga 10 detik, kemudian mengakhiri pool database.
3. Perbarui Node.js pada host/container ke patch 24 LTS yang didukung dan verifikasi versi runtime yang digunakan layanan. Pasang versi aplikasi yang sudah ditinjau dan diuji; jalankan `npm run runtime:check`, `npm ci --ignore-scripts`, lalu `npm run db:migrate`. Migrasi menggunakan transaksi dan advisory lock, tetapi perubahan struktur tetap memerlukan backup.
4. Jalankan `npm run db:status` dari **kode versi baru**. Jika BLOCKED, jangan nyalakan kembali layanan atau memulai pilot sebelum penyebab migrasi diperiksa.
5. Jalankan `npm run pilot:preflight -- --database` hanya di lingkungan dengan data sintetis. Mulai aplikasi, periksa `/ready`, lalu uji login, MFA, izin, penulisan dan pembacaan, satu laporan, serta backup/recovery. Catat hasil dan keputusan operator.
6. Lanjutkan layanan hanya setelah semua pemeriksaan dan persetujuan internal sesuai kewenangan terpenuhi.

## Ketika upgrade gagal

- **Kegagalan sebelum migrasi:** pertahankan database dan kunci; kembali ke versi kode sebelumnya, jalankan pemeriksaan dari versi tersebut dan verifikasi layanan.
- **Kegagalan setelah migrasi:** jangan sekadar menjalankan kode lama dengan skema baru. Migrasi tidak menyediakan *down migration* otomatis. Pastikan kompatibilitas terlebih dahulu. Bila tidak kompatibel atau data rusak, lakukan pemulihan ke **database terisolasi** dari backup terverifikasi, uji migrasi dan dekripsi bukti, lalu rencanakan *cutover* yang disetujui.
- Jangan menjalankan `DROP`, penghapusan tabel, restore ke database aktif, atau rollback database otomatis. Periksa transaksi yang terjadi setelah titik backup sebelum pemulihan; data tersebut dapat hilang jika dipulihkan tanpa rekonsiliasi.
- Jika `/health` 200 tetapi `/ready` 503, jalankan `npm run db:status` di host yang berwenang. Penyebab umum: database tidak tersedia, PostgreSQL bukan versi 17, migrasi belum diterapkan, atau checksum berubah. Pesan HTTP sengaja tidak memaparkan rincian SQL/kredensial.
- Jika preflight memblokir `mfa_key` atau `evidence_keys`, pulihkan secret yang valid melalui jalur pengelolaan kunci. Jangan menghasilkan kunci pengganti secara sembarangan: kunci MFA dan bukti lama diperlukan untuk membuka data terenkripsi yang terkait.
- Catat kegagalan dan eskalasi secara privat. Periksa mekanisme pemantauan host, reverse proxy, dan PostgreSQL; sistem **belum menyediakan log terpusat, backup terjadwal, rotasi kunci otomatis, atau pemulihan produksi satu tombol**.

## Verifikasi akhir sebelum pilot

Keberhasilan CI, `db:status`, `pilot:preflight`, `/ready`, dan `recovery:drill` **tidak** menggantikan UAT manusia, penilaian keamanan host, pemantauan, uji restore off-site, atau keputusan Go/No-Go. Instrumen PADK yang belum diverifikasi tetap diperlakukan sebagai draft internal, bukan hasil resmi OJK. Hanya uji terbatas dengan data sintetis yang dijelaskan pada tahapan ini.
