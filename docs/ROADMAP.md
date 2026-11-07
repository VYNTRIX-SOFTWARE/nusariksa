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

## Quality gate paket indikator PADK (PR #28)

- Tersedia: validator 80/60 indikator dan 400/300 kriteria peringkat 1–5, referensi halaman, fingerprint SHA-256 canonical, pernyataan reviewer substansi/teknis independen, serta pemeriksaan skrip untuk pengembangan dan rilis.
- **Belum tersedia:** isi lengkap kategori 1/2 yang telah dikonfirmasi halaman demi halaman dari PDF OJK; tidak ada data sintetis yang diterbitkan sebagai regulatory pack.
- Quality gate otomatis memeriksa struktur; reviewer manusia harus memeriksa ketepatan transkripsi dan rumus sebelum approval. `regulatory:release-gate` harus gagal pada kondisi tanpa kedua pack.
- Selanjutnya: transkripsi dan QA seluruh isi resmi, verifikasi kasus batas komposit, import versi regulatory pack yang immutable, kertas kerja per indikator, approval hasil, browser E2E, dan UAT.

## Source-bound transkripsi PADK — PR #29

- Workbench transkripsi parsial dilengkapi pelacakan jumlah indikator dan kriteria, status `DRAFT_UNVERIFIED`, serta nomor yang belum dicatat. Status draft PR #35: kategori 1 = 80/80 indikator dan 0/400 kriteria; kategori 2 = 60/60 indikator dan 0/300 kriteria. Seluruh nomor telah dicatat sebagai ringkasan sementara, tetapi belum diverifikasi pada PDF OJK primer dan belum memiliki kriteria peringkat. Transisi Deteksi dan Penanggulangan & Pemulihan berbeda pada dua kategori.
- Source review **belum selesai**: catatan awal bersumber dari salinan PDF publik; file asli OJK perlu diunduh, di-hash SHA-256, dan dicocokkan terhadap semua tabel dan halaman sebelum melanjutkan.
- Release gate memerlukan file PDF yang benar-benar dibaca, hash sesuai kedua pack, dan review independen isi/transkripsi. Kode pengecekan bukan persetujuan OJK.
- Selanjutnya: selesaikan 140 indikator/700 kriteria dari Lampiran IV, silang-periksa butir kategori, lakukan approval reviewer, buat regulatory pack immutable, dan verifikasi rumus terhadap contoh OJK.

## Input batch kriteria PADK (PR #36)

- Template kriteria yang belum diisi dapat diekspor per rentang nomor dan per kategori tanpa membuat isi parameter atau nilai peringkat.
- Importer memvalidasi halaman (38–80), rank (1–5), duplikasi, kelengkapan teks, fingerprint baseline, dan hanya mengubah draft setelah opsi `--apply` diberikan secara eksplisit.
- Draft tetap memerlukan pemeriksaan PDF penerbit dan review independen. Belum tersedia regulatory pack produksi atau hasil validasi 700 kriteria; release gate tetap terblokir.
- P0 berikutnya: pemeriksaan visual dan transkripsi kriteria Tabel 3 secara bertahap, rekonsiliasi parameter antar kategori, dan pengujian hasil pada contoh regulasi.

## Workbench review visual offline (PR #38)

- Antarmuka lokal untuk membandingkan PDF Lampiran IV dengan isian level 1–5 per indikator, halaman PDF fisik dan halaman tercetak dipisahkan secara eksplisit.
- Penyimpanan progres parsial dan ekspor JSON lengkap yang dapat diperiksa melalui importer CLI sebelum `--apply`; tidak ada koneksi eksternal atau promosi otomatis menjadi regulatory pack.
- **Belum ada kriteria regulator yang ditambahkan atau diverifikasi (0/700).** Langkah berikutnya memeriksa PDF primer OJK dan memulai transkripsi per batch beserta review substansi dan teknis.

## Maker–checker maturitas internal (Sprint #39)

- Backend: submit hasil lengkap, persetujuan atau pengembalian reviewer yang berbeda dari maker, pembekuan hasil selama review, siklus pengajuan ulang, dan histori keputusan append-only.
- Detail asesmen menyertakan status review; endpoint terproteksi sesi, permission, dan origin. Migrasi `0014` menambah status serta review event terpisah dari asesmen kontrol reguler.
- Belum ada UI antrean reviewer dan belum diuji browser nyata; ini merupakan tahap backend, bukan kesiapan produksi.
- Rubrik maturitas internal Level 0–5 tetap berbeda dengan **peringkat keamanan siber PADK 1–5**. Regulatory pack PADK masih belum lengkap (0/700 kriteria).

## Sprint #40 — Reviewer UI untuk maturitas internal (Draft PR)

- Daftar antrean reviewer khusus dari `GET /maturity-assessments/review-queue` mengembalikan maksimal 50 pengajuan berstatus `submitted` dari institusi pengguna, dengan izin `assessments:approve` dan pemisahan maker–checker.
- UI Penilaian Maturitas menampilkan antrean pemeriksa, status/siklus review, pengajuan maker, tindakan `approve` dan `request_changes`, justifikasi, evidence referensi, serta histori append-only.
- Otorisasi, isolasi institusi, dan pembekuan penilaian ditentukan backend; penyembunyian kontrol UI bukan pengganti pemeriksaan server.
- Ada uji unit validasi kontrol UI serta tambahan pengujian integrasi HTTP untuk antrean dan transisi status. Hasil CI dan pengujian browser nyata **harus diperiksa sebelum Ready for review**.
- Batasan: bukan workflow peringkat keamanan siber resmi PADK, belum ada penugasan reviewer, pagination, ataupun audit kecukupan bukti secara manusia.

## Sprint #42 — ganti password dan rotasi sesi

- Pengguna aktif dapat mengganti password sendiri melalui `POST /auth/change-password` dan dialog web.
- Password lama diverifikasi menggunakan Argon2id; password baru minimal 12 byte, maksimal 1024 byte dan wajib berbeda dari password sebelumnya.
- Perubahan hash, pencabutan semua sesi lama, pembuatan sesi pengganti, dan event `PASSWORD_CHANGE` dijalankan secara atomik dalam transaksi PostgreSQL. Event audit tidak menyimpan password maupun hash.
- API memerlukan cookie sesi valid, pemeriksaan origin, JSON yang ketat, dan pembatasan percobaan password salah melalui limiter in-memory. Penggunaan multiproses memerlukan limiter terpusat.
- Cookie pengganti tetap `Secure; HttpOnly; SameSite=Strict` dan sesi lain langsung tidak valid.
- Belum termasuk pemulihan password lupa, MFA, penyimpanan konfigurasi TLS/reverse proxy produksi, dan manajemen sesi lintas perangkat di UI. Kelayakan produksi tetap bergantung pada pengujian keamanan dan UAT.

## Sprint #43 — MFA TOTP (Draft)

- Login akun dengan TOTP aktif dipisah dua tahap: password benar hanya membuat challenge MFA 5 menit, tanpa sesi aplikasi; sesi dibuat setelah TOTP atau recovery code valid.
- Enrollment meminta password saat ini, memberikan secret/otpauth URI untuk authenticator dan konfirmasi TOTP dalam 10 menit; secret disimpan terenkripsi AES-256-GCM dengan AAD terikat user ID.
- Kunci `MFA_ENCRYPTION_KEY` wajib berupa base64 kanonis dari 32 byte acak, disimpan di konfigurasi server, bukan source control. Jika kunci tidak tersedia setelah MFA aktif, login gagal tertutup (503), **bukan** melewati MFA.
- TOTP 6 digit SHA1 30 detik (jendela ±1) anti-replay per user; recovery code 128-bit, sekali pakai, 10 buah ditampilkan satu kali pada konfirmasi. Hash recovery disimpan dengan HMAC berbasis kunci server.
- Challenge login 32 byte acak disimpan sebagai SHA-256, maksimal 5 percobaan, sekali pakai; audit events `MFA_ENABLE`, `MFA_LOGIN`, `MFA_RECOVERY_LOGIN`.
- Aktivasi mencabut semua sesi lama dan menerbitkan sesi baru. MFA bersifat pilihan pengguna, belum dipaksakan berdasarkan role.
- Batasan: belum ada reset MFA yang aman oleh admin, regenerasi recovery code, rate-limiter terdistribusi, kebijakan wajib MFA, dan uji pemulihan kunci; belum layak dipakai dengan data bank produksi tanpa prosedur operasional tersebut.
