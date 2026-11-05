# NusaRiksa — Project checkpoint

**Snapshot:** 5 November 2026 (Asia/Jakarta)  
**Repository:** https://github.com/VYNTRIX-SOFTWARE/nusariksa  
**Proyek:** Open Source TI / NusaRiksa  
**Terakhir merged:** PR #29  
**Sprint pengembangan:** PR #30, perlu ditinjau sebelum merge.  
**Catatan:** status branch, PR, serta CI harus selalu diperiksa ulang lewat GitHub. Dokumen ini mencatat keputusan dan keadaan kode yang diikutkan bersama perubahan sprint, bukan klaim status GitHub permanen.

## 1. Kontrak arsitektur dan produk

- NusaRiksa adalah aplikasi **open-source GRC dan asesmen TI** untuk BPR/BPRS Indonesia; repo publik dengan lisensi **AGPL-3.0-only**. **Bukan CBS**.
- **Single-tenant**, self-hosted, modular monolith. Backend **Node.js 24+**, **PostgreSQL 17**, frontend **vanilla HTML/CSS/JavaScript**. Jangan menggantinya dengan React/Vue atau multi-tenant tanpa keputusan eksplisit.
- Aset web same-origin; keamanan backend berbasis sesi cookie HttpOnly, Argon2id, CSRF/origin, CSP, RBAC server-side dan audit trail. Tidak ada skor, sertifikasi, klaim pengesahan OJK, atau data bank yang boleh dipalsukan.
- Desain mengikuti `docs/UI-FOUNDATION.md`, termasuk warna primer `#6D4AFF`. Tidak menambahkan `AGENTS.md`, file konfigurasi agen AI, atau metadata AI ke repo.

## 2. Workflow GitHub yang wajib dipertahankan

1. **Langsung bekerja melalui GitHub connector di chat**. Tidak meminta pengguna memindahkan pekerjaan ke Codex.
2. Tulis kode di **branch permanen `development`**, tanpa force push/reset. `main` adalah branch protected.
3. Setelah squash merge PR, cek kedua commit tree dan kondisi branch, lalu rekonsiliasi histori `development` secara aman tanpa perubahan isi dan tanpa force push.
4. Buat **Draft PR `development` → `main`**. Pengguna yang menentukan **Ready for review** dan **Squash and merge**; jangan lakukan sendiri.
5. Tunggu CI `push` dan `pull_request` pada HEAD terakhir. Unit/integration test hijau **bukan** tanda production-ready.
6. Deskripsi PR dalam **bahasa Indonesia, singkat dan teknis**: perubahan sebenarnya, hasil pengujian yang terverifikasi, dan batasan. Hindari promosi.
7. **Perbarui file checkpoint ini pada setiap sprint/PR baru** berdasarkan kondisi GitHub dan keputusan terbaru.

## 3. Modul dan PR yang sudah merged

| PR | Cakupan |
| --- | --- |
| #14–#17 | Katalog kontrol, penilaian kontrol, maker–checker, API laporan |
| #18–#23 | Login/shell, dashboard, workspace asesmen, reviewer, laporan dan katalog via web |
| #24 | Evidence terenkripsi AES-256-GCM, lampiran per kontrol, metadata append-only |
| #25 | Registri model maturitas internal berversi, domain, rubrik Level 0–5 |
| #26 | Penilaian maturitas internal per domain; agregasi `minimum` / `mean_floor` |
| #27 | Kalkulator **preview** maturitas siber PADK, output selalu `PREVIEW_UNVERIFIED` |
| #28 | Validator regulatory pack 80/60 indikator dan 5 kriteria per butir, fingerprint, attestasi dan release gate |
| #29 | Workbench transkripsi parsial, status progres, hash PDF sumber untuk release gate |

Semua butir di atas sudah masuk `main` berdasarkan verifikasi saat memulai PR #30. Status setiap modul tetap memerlukan E2E, keamanan, dan UAT sebelum digunakan dengan data bank asli.

## 4. Dua model maturitas yang BERBEDA

**Model maturitas internal** (`PR #25–26`): rubrik pengguna Level 0–5, penilaian domain, justifikasi/evidence dan riwayat revisi. Metode perhitungan tersimpan `minimum` atau `mean_floor`. **Tidak sama** dengan maturitas keamanan siber PADK.

**Model keamanan siber PADK 43/PADK.03/2025 Lampiran IV**:

- Kategori 1: **80 indikator**; kategori 2: **60 indikator**.
- Lima domain, bobot: **Tata Kelola 25%**, **Identifikasi 15%**, **Pelindungan 25%**, **Deteksi 15%**, **Penanggulangan dan Pemulihan 20%**.
- Peringkat parameter integer **1–5**, dengan **1 = sangat memadai (terbaik)** dan 5 = tidak memadai.
- Kalkulasi domain = rata-rata peringkat parameter pada domain; komposit = jumlah peringkat domain × bobot.
- Pembulatan half-up ke 2 desimal dalam pratinjau merupakan **asumsi implementasi yang belum divalidasi** pada kasus batas.
- API `GET /regulatory/padk43/cyber/framework` dan `POST /regulatory/padk43/cyber/preview` menerima manifest dari pemanggil; **tidak menyimpan asesmen** dan tidak menghasilkan laporan resmi. `mappingVerified=false`, `regulatoryResult=false`.

## 5. Regulatory pack dan progres sumber per PR #30

- Draft kerja: `regulations/padk43/cyber/drafts/kategori-1.json` dan `kategori-2.json`.
- **40 dari 140 indikator telah dicatat sebagai ringkasan kerja**, masing-masing nomor **1–20 pada kategori 1 dan 2**. **0 dari 700 kriteria peringkat** sudah terisi. Angka ini adalah **cakupan draft** saja, bukan bukti akurasi transkripsi atau kesesuaian regulasi.
- Draft masing-masing tetap `DRAFT_UNVERIFIED`/`NEEDS_SOURCE_REVIEW`, `pdfSha256=null` dan `verifiedAgainstOfficialPdf=false`.
- Perhatikan **nomor 18–20 pada dua kategori berbeda substansi**. Jangan mengkloning kategori 1 menjadi kategori 2 tanpa source review; bedakan pula kasus tabel yang bersambung lintas halaman.
- Sumber kerja berupa teks salinan PDF pihak ketiga. Halaman regulasi resmi tersedia pada [OJK](https://ojk.go.id/id/regulasi/Pages/PADK-43-PADK03-2025-Penyelenggaraan-Teknologi-Informasi-oleh-BPR-BPRS.aspx); **byte PDF primer, SHA-256, pemeriksaan visual tabel, dan review independen belum selesai**. Dokumen kerja bukan regulatory pack tersertifikasi.
- Dua berkas produksi `regulations/padk43/cyber/packs/kategori-1.json` dan `kategori-2.json` **belum ada**. `regulatory:release-gate` harus tetap gagal.
- `npm run regulatory:draft-status` memantau cakupan, `regulatory:draft-strict` menolak draft belum tervalidasi, `regulatory:release-gate -- --source-pdf=<PDF>` juga memeriksa SHA-256 byte PDF. Hash sendiri tidak membuktikan kebenaran isi atau approval regulator.
- Rencana source review dan risiko salinan terdapat di `regulations/padk43/cyber/drafts/README.md` dan `docs/PADK-CYBER-MATURITY.md`.

## 6. Target rilis dan release gate

- Target **23 November 2026** untuk keputusan **Go/No-Go v1.0.0 Stable**, **bersyarat**, bukan janji rilis. Geser tanggal jika gate gagal; jangan relabel versi beta untuk menutupi ketidaklengkapan.
- P0 belum lulus: kertas kerja 80/60 indikator plus lima kriteria/indikator yang tervalidasi, verifikasi klasifikasi komposit, regulatory pack kedua kategori yang direview, maker–checker untuk maturitas siber, bukti dan kertas kerja final, PDF reporting, browser E2E, UAT praktisi BPR/BPRS, keamanan operasional (MFA, TLS, scan file, retensi, rotasi kunci, backup–restore, audit unduh) dan pentest.
- **Tidak boleh menggunakan data bank asli** hingga release gate operasional dan keamanan dinyatakan lulus.
- Jangan menyamakan CI hijau, cakupan draft, atau hash dengan kepatuhan/penilaian regulator.

## 7. Prioritas setelah sprint PR #30

1. Peroleh PDF Lampiran IV langsung dari OJK, catat SHA-256 byte dan cocokkan tabel secara visual termasuk sel yang bersambung antarhalaman.
2. Lanjutkan catatan kerja nomor 21–80 (kategori 1) dan 21–60 (kategori 2), sertakan nomor tabel dan halaman yang benar.
3. Petakan **700 kriteria rank 1–5** dengan pemeriksaan substansi/teknis oleh reviewer berbeda; jangan menghasilkan dari template generik atau AI tanpa sumber.
4. Bentuk regulatory pack immutable yang benar-benar divalidasi dan lakukan pengujian terhadap contoh perhitungan resmi.
5. Implementasi kertas kerja UI, maker–checker, evidence, PDF, uji browser dan UAT. Pertahankan keamanan/observability sebagai release gate.

**Untuk melanjutkan di chat baru:** baca dokumen ini, cek PR terbaru dan branch secara live, jangan minta pengguna mengulang keputusan yang sudah ada. Tetap kerjakan perubahan melalui GitHub connector, lalu buat Draft PR tanpa melakukan merge.
