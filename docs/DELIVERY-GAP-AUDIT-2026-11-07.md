# NusaRiksa — gap audit menuju v1.0.0

Audit terhadap `main` setelah PR #43 merged, 7 November 2026. Fokus: alur penilaian keamanan siber PADK 43/PADK.03/2025, bukan maturitas internal Level 0–5.

## Status per kapabilitas

| Kapabilitas | Status | Bukti repository | Gap rilis |
| --- | --- | --- | --- |
| Login, RBAC, pergantian password, TOTP | DONE (fitur), PARTIAL (operasional) | `auth-http.js`, `totp-mfa.js`, `authorization.js`, tes auth/TOTP/Chromium | Reset MFA, rotasi kunci, lockout terdistribusi, UAT operasional |
| Katalog dan asesmen kontrol internal | DONE (cakupan internal) | `control-catalogs*.js`, `assessments*.js`, tes integrasi | Bukan penilaian PADK Lampiran IV |
| Evidence terenkripsi | PARTIAL | `assessment-evidence*.js`, tes integrasi | Prosedur key management, attachment PADK yang sah, restore |
| Maturitas internal Level 0–5 + maker-checker | DONE (cakupan internal) | `maturity-assessments*.js`, `maturity-assessment-reviews.js`, tes Chromium | Tidak boleh digunakan sebagai PADK rank 1–5 |
| PADK 140 nomor indikator | PARTIAL | `regulations/padk43/cyber/drafts/kategori-1.json`, `kategori-2.json` | 140 masih draft/unverified, belum sah dijadikan instrumen pengguna |
| PADK 700 kriteria peringkat | BLOCKED | `regulations/padk43/cyber/README.md`, `padk-regulatory-pack-review.js` | 0 kriteria yang dikonfirmasi terhadap PDF primer dan review independen |
| Regulatory pack untuk produksi | BLOCKED | `check-padk-regulatory-packs.js`, `padk-regulatory-pack-review.js` | PDF primer/hash, 2 review independen, release gate |
| Perhitungan PADK | PARTIAL | `padk-cyber-maturity.js`, `padk-cyber-http.js` `/regulatory/padk43/cyber/preview`, tes | Hanya preview tak terverifikasi; tidak tersambung ke penilaian tersimpan |
| Persiapan penilaian PADK | PARTIAL → vertical slice baru | `padk-preparations*.js`, `padk-preparation-ui.js`, `0017_create_padk_preparations.sql` | Kategori/periode/catatan tersimpan; belum input rank karena sumber belum valid |
| Pengisian rank per indikator PADK | MISSING/BLOCKED | Belum ada tabel, endpoint, atau UI sah untuk rank | Pack resmi wajib diverifikasi sebelum ditampilkan dan dipakai |
| Review, pengembalian, approve PADK | MISSING | Workflow maker-checker sekarang hanya untuk modul internal | State machine/audit PADK terpisah |
| Laporan PDF final PADK | MISSING | `assessment-reports*.js` hanya laporan asesmen kontrol internal | PDF PADK, format, perhitungan, evidence dan approval |
| Backup/restore, DR, UAT produksi | MISSING/BLOCKED | Belum ditemukan bukti uji restore/UAT lengkap pada repository | Harus dibuktikan, bukan diasumsikan dari CI |

## Critical path

1. Ambil **dokumen primer OJK lengkap Lampiran IV**, simpan SHA-256, periksa tabel secara visual. Halaman primer: https://ojk.go.id/id/regulasi/Pages/PADK-43-PADK03-2025-Penyelenggaraan-Teknologi-Informasi-oleh-BPR-BPRS.aspx.
2. Transkripsi dan review independen 140 indikator beserta 700 kriteria peringkat; jangan pakai placeholder/teks sintetis.
3. Terbitkan regulatory pack versi yang diberi fingerprint dan audit review. Release gate harus menolak konten belum sah.
4. Selesaikan input rank/justifikasi/evidence di UI dengan persistence, validasi DB dan permission.
5. Sambungkan engine kalkulasi, kunci metode/bobot dan pembulatan setelah validasi sumber primer.
6. Tambahkan maker-checker khusus PADK, immutability dan audit.
7. Buat PDF final berbasis data approved, verifikasi format dan claim.
8. Uji browser seluruh alur, akses antar-role, backup/restore, security review dan UAT data sintetis.

## Implementasi vertical slice saat sumber tertunda

Persiapan PADK bisa dilakukan lewat web: petugas yang memiliki `assessments:write` membuat kategori/periode, mengisi catatan dan rencana bukti, menyimpan dan membuka ulang. Akun dengan `assessments:read` dapat melihat; hanya maker boleh memperbarui. Revisi dijaga optimistic locking dan dicatat append-only. **Tidak ada endpoint submit, approve, scoring atau PDF** dari fase persiapan ini.

## Keputusan go/no-go 23 November 2026

**NO-GO** bila regulatory pack belum lolos pemeriksaan primer dan review independen, salah satu langkah input–approval–kalkulasi–PDF gagal E2E, ada isu kritikal/tinggi terbuka, atau prosedur backup/restore belum dibuktikan. Tanggal target bukan izin untuk mengubah preview menjadi skor resmi.

Lisensi AGPL-3.0-only dan legal attribution VYNTRIX tidak diubah.

## Vertical slice berikutnya — catatan persiapan per indikator (draft)

Petugas sekarang dapat membuka 80 ringkasan kerja indikator Kategori 1 atau 60 Kategori 2 pada workspace persiapan, memilih indikator, menyimpan catatan situasi dan rencana bukti per indikator, lalu membuka ulang tanpa spreadsheet. Catatan memiliki revision check dan histori append-only serta hanya dapat diubah pembuat persiapan; viewer tetap read-only.

**Keterbatasan sengaja:** label bersumber dari `regulations/padk43/cyber/drafts/kategori-*.json`, ditampilkan eksplisit sebagai **ringkasan draft**, bukan kutipan OJK terverifikasi atau materi untuk scoring. Tidak ada rank 1–5, rumus, review penilaian, approval, PDF final, atau upload dokumen evidence. Regulatory release gate tetap BLOCKED.

Sumber primer PDF PADK sudah diterima dan transkripsi kandidat 140 indikator + 400 sel kriteria tersimpan dalam review pack privat. Keterkaitan Kategori 2 ke Tabel 3, proofreading, serta review independen masih harus diselesaikan sebelum kriteria resmi digunakan. Indikator #24, #29, dan #32 Kategori 2 memerlukan pemeriksaan khusus karena redaksinya menggabungkan beberapa subpersyaratan.
