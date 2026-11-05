# Rencana pengembangan awal

## Fondasi repositori

API pemeriksaan hidup, pengujian HTTP, pemeriksaan sintaks, CI, dan dokumentasi minimal. PostgreSQL telah disiapkan untuk migrasi dan pemeriksaan koneksi. Skema akun dan layanan token sesi telah disiapkan; hash password Argon2id dan verifikasi kredensial internal sudah tersedia. Endpoint login, pemeriksaan sesi, logout, fondasi peran dan izin, serta pencatatan perubahan peran, inisialisasi admin pertama, dan pengelolaan akun awal tersedia untuk pengembangan; penyimpanan dokumen kini memiliki fondasi evidence terenkripsi yang belum lolos hardening produksi. Asesmen dasar kini memiliki periode, penanggung jawab, status, dan riwayat perubahan. Katalog kontrol dapat disusun, diterbitkan secara berversi, dan dikaitkan ke asesmen. Hasil penilaian per kontrol kini dapat diisi dan direvisi dengan jejak audit. Alur maker–checker menerima pengajuan, keputusan pemeriksa yang terpisah, dan pengembalian untuk perbaikan. Laporan internal JSON menyajikan progres, hasil kontrol, dan keputusan review terakhir. Antarmuka web menampilkan login, dashboard berbasis data API, sidebar collapsible, filter tahun/status, daftar asesmen dan workspace untuk membuat asesmen, mengaitkan katalog, memulai penilaian, menyimpan hasil per kontrol, serta membaca histori revisi. Pengajuan asesmen, antrean reviewer, keputusan setuju/kembalikan, serta riwayat maker–checker tersedia pada UI. Antarmuka laporan internal kini mengambil ringkasan, distribusi penilaian, rincian kontrol dan keputusan review terakhir dari endpoint yang sudah ada; laporan bukan pengesahan kepatuhan oleh OJK. Pengelolaan katalog kontrol melalui web tersedia untuk membuat katalog, membaca versi, menambah kontrol pada Draft, menerbitkan versi, dan menyalin versi terbit menjadi Draft berikutnya.

## Tahap selanjutnya

1. Perkuat autentikasi: rate limit lintas proses, TLS/reverse proxy, MFA, dan proteksi CSRF untuk operasi yang mengubah data.
2. Tambahkan alur pemulihan akun dan pengaktifan ulang yang diaudit, lalu terapkan izin pada operasi modul dan alur persetujuan.
3. Jalankan pengujian browser end-to-end atas dashboard, asesmen, katalog, review, dan pelaporan. Penyimpanan bukti terenkripsi tahap awal memerlukan uji anti-malware, kebijakan retensi, pemulihan kunci, dan pengujian browser sebelum digunakan dengan data bank asli.
4. Pemetaan regulasi berversi setelah penelaahan ketentuan resmi.

Setiap tahap memerlukan implementasi dan pengujian yang dapat diulang sebelum dinyatakan selesai.
