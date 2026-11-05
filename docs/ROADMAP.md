# Rencana pengembangan awal

## Fondasi repositori

API pemeriksaan hidup, pengujian HTTP, pemeriksaan sintaks, CI, dan dokumentasi minimal. PostgreSQL telah disiapkan untuk migrasi dan pemeriksaan koneksi. Skema akun dan layanan token sesi telah disiapkan; hash password Argon2id dan verifikasi kredensial internal sudah tersedia. Endpoint login, pemeriksaan sesi, logout, fondasi peran dan izin, serta pencatatan perubahan peran, inisialisasi admin pertama, dan pengelolaan akun awal tersedia untuk pengembangan; penyimpanan dokumen kini memiliki fondasi evidence terenkripsi yang belum lolos hardening produksi. Asesmen dasar kini memiliki periode, penanggung jawab, status, dan riwayat perubahan. Katalog kontrol dapat disusun, diterbitkan secara berversi, dan dikaitkan ke asesmen. Hasil penilaian per kontrol kini dapat diisi dan direvisi dengan jejak audit. Alur maker–checker menerima pengajuan, keputusan pemeriksa yang terpisah, dan pengembalian untuk perbaikan. Laporan internal JSON menyajikan progres, hasil kontrol, dan keputusan review terakhir. Antarmuka web menampilkan login, dashboard berbasis data API, sidebar collapsible, filter tahun/status, daftar asesmen dan workspace untuk membuat asesmen, mengaitkan katalog, memulai penilaian, menyimpan hasil per kontrol, serta membaca histori revisi. Pengajuan asesmen, antrean reviewer, keputusan setuju/kembalikan, serta riwayat maker–checker tersedia pada UI. Antarmuka laporan internal kini mengambil ringkasan, distribusi penilaian, rincian kontrol dan keputusan review terakhir dari endpoint yang sudah ada; laporan bukan pengesahan kepatuhan oleh OJK. Pengelolaan katalog kontrol melalui web tersedia untuk membuat katalog, membaca versi, menambah kontrol pada Draft, menerbitkan versi, dan menyalin versi terbit menjadi Draft berikutnya.

## Tahap selanjutnya

1. Perkuat autentikasi: rate limit lintas proses, TLS/reverse proxy, MFA, dan proteksi CSRF untuk operasi yang mengubah data.
2. Tambahkan alur pemulihan akun dan pengaktifan ulang yang diaudit, lalu terapkan izin pada operasi modul dan alur persetujuan.
3. Jalankan pengujian browser end-to-end atas dashboard, asesmen, katalog, review, dan pelaporan. Penyimpanan bukti terenkripsi tahap awal memerlukan uji anti-malware, kebijakan retensi, pemulihan kunci, dan pengujian browser sebelum digunakan dengan data bank asli.
4. Pemetaan regulasi berversi setelah penelaahan ketentuan resmi.

Setiap tahap memerlukan implementasi dan pengujian yang dapat diulang sebelum dinyatakan selesai.

## Metodologi dan asesmen maturitas

- Fondasi tersedia: model maturitas berreferensi, versi Draft/Published, domain, dan enam kriteria per domain; versi Published tidak dapat diubah.
- Penilaian level per domain, justifikasi, tautan evidence yang diverifikasi keberadaannya, dan agregasi internal minimum/rata-rata floor kini tersedia. Belum tersedia: reviewer acceptance, pemeriksaan kecukupan evidence, metodologi regulator tervalidasi, serta baseline dan target improvement.
- Skoring agregat internal hanya memakai kebijakan eksplisit per versi (minimum atau mean_floor), dan hanya ditampilkan setelah semua domain dinilai. Validasi metodologi, bobot, dan hubungan antar-domain terhadap referensi resmi masih perlu kajian; kelengkapan asesmen kontrol bukan skor maturitas.
- Kesiapan produksi masih memerlukan security hardening, browser E2E, audit aksesibilitas, UAT, serta review referensi regulasi resmi.

## Tahap lanjutan Maturity Assessment

- PR #26 (development): maturity assessment terikat pada rubrik terbit dan kebijakan agregasi internal, penilaian per domain, justifikasi, referensi evidence, revisi dengan concurrency check, dan histori hasil.
- Berikutnya: maker–checker untuk hasil maturitas, metodologi/rumus yang tervalidasi dan dapat diaudit, evidence adequacy review, baseline–target, trend, dan remediation tracking.
- Release gate: browser E2E nyata, uji akses dan konflik lintas akun, aksesibilitas, pentest/security review, mekanisme retensi bukti, UAT praktisi, dan dokumentasi batasan klaim regulator.

## PADK 43/PADK.03/2025 — Maturitas Keamanan Siber

- Fondasi kalkulasi pratinjau (PR #27): kategori 1/2 (80/60 indikator), 5 domain dan bobot resmi, skala 1–5 dengan 1 paling memadai, nilai domain sebagai rata-rata indikator, komposit berbobot dan klasifikasi bersyarat hanya bila lengkap.
- Kalkulator **dipisah** dari metodologi maturitas internal PR #26. Tidak ada peta indikator sintetis yang dirilis sebagai pack regulasi; belum ada persistence, kertas kerja UI, review kriteria, evidence, atau PDF.
- P0 untuk release: teliti nomor, subdomain, parameter dan kriteria level 1–5 dari dua tabel Lampiran IV secara penuh; verifikasi rumus dan pembulatan di titik batas, lalu kunci *regulatory pack* dengan versi/approval yang dapat diaudit.
- Tahap berikutnya: kertas kerja UI kategori 1/2, jawaban per parameter dengan justifikasi/bukti, maker–checker, komposit yang tervalidasi, dan ekspor sesuai kertas kerja.
- Validasi, keterbatasan dan rujukan: [docs/PADK-CYBER-MATURITY.md](PADK-CYBER-MATURITY.md).

