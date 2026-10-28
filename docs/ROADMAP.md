# Rencana pengembangan awal

## Fondasi repositori

API pemeriksaan hidup, pengujian HTTP, pemeriksaan sintaks, CI, dan dokumentasi minimal. PostgreSQL telah disiapkan untuk migrasi dan pemeriksaan koneksi. Skema akun dan layanan token sesi telah disiapkan; endpoint login, autentikasi password, dan penyimpanan dokumen belum diimplementasikan.

## Tahap selanjutnya

1. Implementasikan autentikasi dengan Argon2id, kontrol sesi, dan pengujian negatif.
2. Tambahkan otorisasi per peran dan alur persetujuan dengan pengujian akses.
3. Penyimpanan bukti terenkripsi serta pengelolaan kunci.
4. Pemetaan regulasi berversi setelah penelaahan ketentuan resmi.

Setiap tahap memerlukan implementasi dan pengujian yang dapat diulang sebelum dinyatakan selesai.
