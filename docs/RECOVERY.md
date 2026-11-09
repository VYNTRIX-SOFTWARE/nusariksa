# Uji pemulihan PostgreSQL dan bukti terenkripsi

NusaRiksa menyediakan *recovery drill* yang membuat salinan sementara dengan `pg_dump` (custom archive), memulihkannya menggunakan `pg_restore` ke **database PostgreSQL lokal yang sudah tersedia dan benar-benar kosong**, lalu memeriksa riwayat migrasi dan mendekripsi setiap berkas bukti secara read-only. Pengecekan memverifikasi authentication tag AES-256-GCM serta SHA-256 plaintext untuk kedua tabel: `assessment_evidence` dan `padk_indicator_evidence`.

**Bukan sistem backup produksi, sistem recovery otomatis, atau bukti kesiapan DRP.** Script ini tidak menyiapkan jadwal backup, manajemen retensi, penyimpanan off-site, backup kunci, ataupun pengukuran RPO/RTO bank. Hasil sukses pada data uji tidak membuktikan seluruh prosedur pemulihan produksi berhasil.

## Syarat dan pembatasan keamanan

- PostgreSQL 17, Node.js yang sesuai README, dan utilitas **`pg_dump`/`pg_restore` kompatibel PostgreSQL 17** tersedia pada `PATH`.
- `DATABASE_URL` berisi koneksi sumber. `RECOVERY_DATABASE_URL` harus merujuk ke database **berbeda** dengan awalan `nusariksa_recovery_`, **hanya pada localhost/127.0.0.1/::1**, sudah dibuat oleh operator, dan **tanpa tabel/objek pengguna**.
- Pastikan sumber adalah database uji atau salinan staging yang telah diotorisasi. Database sumber dibaca oleh `pg_dump`, tidak diubah oleh drill. **Target ditulisi oleh `pg_restore`** sehingga jangan pernah memilih database yang dipakai layanan.
- Kontrol akses, ruang disk, akun PostgreSQL, isolasi jaringan, serta perlindungan data dan kunci pada mesin operator tetap tanggung jawab operator.
- Sediakan `EVIDENCE_ENCRYPTION_KEY` untuk berkas legacy (`key_id IS NULL`) dan bila menggunakan versi kunci, `EVIDENCE_KEYRING` serta `EVIDENCE_ACTIVE_KEY_ID` yang valid. Kunci diperlukan untuk membuktikan dokumen dapat dibuka setelah restore; jangan mencetak atau menaruhnya di Git.
- Untuk keamanan, parameter query connection string yang didukung oleh drill hanya `sslmode`. Password disampaikan ke utilitas PostgreSQL melalui environment, **tidak** melalui command line. Tetap lindungi environment dan host dari pengguna tidak tepercaya.

## Langkah pelaksanaan

1. Siapkan PostgreSQL lokal untuk pengujian dan database target kosong, misalnya `nusariksa_recovery_drill`. **Jangan gunakan database aktif.** Database target wajib dibuat terlebih dahulu; script tidak membuat, menghapus, atau membersihkannya.
2. Simpan `DATABASE_URL`, `RECOVERY_DATABASE_URL`, dan konfigurasi kunci pada secret environment di komputer yang tepercaya. Jangan menulis kredensial asli dalam dokumentasi atau output CI.
3. Pastikan Anda berwenang melakukan pemulihan dan target benar-benar disposable. Setel `RECOVERY_DRILL_CONFIRM=ISOLATED_EMPTY_RECOVERY_DATABASE`.
4. Jalankan `npm run recovery:drill`.
5. Periksa JSON hasil yang hanya memuat `status: PASS`, checksum SHA-256 archive, jumlah migrasi, serta hitungan bukti asesmen/PADK, legacy/versioned. Pastikan jumlah bukti masuk akal: hasil dengan **0 bukti** tidak membuktikan kemampuan pemulihan berkas yang terenkripsi.
6. Verifikasi juga fungsi aplikasi dan akses pengguna melalui UAT terpisah. Catat waktu mulai/selesai, operator, lokasi uji, hasil, serta tindak lanjut dalam catatan audit privat.
7. Hapus database target secara **manual**, setelah memastikan tidak memuat data yang harus disimpan. Script tidak melakukan `DROP DATABASE`.

## Bagaimana script menjaga isolasi

- Harus ada persetujuan eksplisit, nama target memakai awalan tertentu, host target loopback, identitas koneksi sumber dan target berbeda, dan target tidak memiliki objek pengguna.
- Proses restore menggunakan `--single-transaction --exit-on-error --no-owner --no-acl`; tidak menggunakan `--clean` atau `--create`.
- Arsip sementara berada dalam direktori sementara privat, dihapus setelah drill berhasil atau gagal. **Arsip ini bukan backup permanen**. Setelah perintah selesai, database target tetap ada dan tetap berisi hasil restore.
- Riwayat migrasi dibandingkan dengan checksum migrasi yang ada dalam versi kode saat uji.
- Seluruh berkas bukti diperiksa dengan autentikasi AES-GCM dan hash SHA-256, tanpa mengeluarkan isi dokumen, nama file, atau material kunci.
- Kegagalan menyimpulkan hasil `FAILED`; tidak ada klaim keberhasilan parsial.

## Batasan yang masih perlu ditangani

- Backup permanen yang terenkripsi, lokasi penyimpanan off-site, retensi dan penghapusan, prosedur backup kunci, audit akses, serta pemulihan layanan penuh belum diotomatisasi di sini.
- Uji kebocoran/kehilangan kunci, skenario korupsi arsip, dan drill operasional sebenarnya perlu dilakukan terpisah.
- Proses dump berjalan dengan snapshot PostgreSQL, tetapi verifikasi data target tidak menilai transaksi bisnis sesudah snapshot. RPO/RTO perlu diukur melalui latihan DRP lengkap.
- Jika sumber memuat data pribadi, database hasil restore **juga memuat data tersebut**; perlakukan sebagai data sensitif dan segera hapus setelah pengujian.
- Penilaian PADK pada aplikasi tetap bersifat **draft/simulasi**; recovery drill tidak mengesahkan regulasi atau laporan resmi.
