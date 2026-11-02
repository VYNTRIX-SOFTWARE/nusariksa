# Rencana pengembangan awal

## Fondasi repositori

API pemeriksaan hidup, pengujian HTTP, pemeriksaan sintaks, CI, dan dokumentasi minimal. PostgreSQL telah disiapkan untuk migrasi dan pemeriksaan koneksi. Skema akun dan layanan token sesi telah disiapkan; hash password Argon2id dan verifikasi kredensial internal sudah tersedia. Endpoint login, pemeriksaan sesi, logout, fondasi peran dan izin, serta pencatatan perubahan peran, inisialisasi admin pertama, dan pengelolaan akun awal tersedia untuk pengembangan; penyimpanan dokumen belum diimplementasikan. Asesmen dasar kini memiliki periode, penanggung jawab, status, dan riwayat perubahan. Katalog kontrol dapat disusun, diterbitkan secara berversi, dan dikaitkan ke asesmen. Hasil penilaian per kontrol kini dapat diisi dan direvisi dengan jejak audit. Alur maker–checker menerima pengajuan, keputusan pemeriksa yang terpisah, dan pengembalian untuk perbaikan.

## Tahap selanjutnya

1. Perkuat autentikasi: rate limit lintas proses, TLS/reverse proxy, MFA, dan proteksi CSRF untuk operasi yang mengubah data.
2. Tambahkan alur pemulihan akun dan pengaktifan ulang yang diaudit, lalu terapkan izin pada operasi modul dan alur persetujuan.
3. Buat laporan hasil penilaian dan frontend web untuk alur asesmen end-to-end. Penyimpanan bukti terenkripsi menyusul.
4. Pemetaan regulasi berversi setelah penelaahan ketentuan resmi.

Setiap tahap memerlukan implementasi dan pengujian yang dapat diulang sebelum dinyatakan selesai.
