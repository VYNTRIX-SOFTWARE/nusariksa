# Kriteria Tabel 3 PADK — hasil ekstraksi untuk layar input MVP

Dokumen ini menjelaskan **data draf kerja**, bukan bukti bahwa teks telah disahkan OJK atau divalidasi oleh dua reviewer.

- Dasar: PDF unggahan `PADK 43-PADK03-2025 Penyelenggaraan Teknologi Informasi oleh BPR BPRS.pdf`, SHA-256 `63868e2fe99a48485b17646618934c1fffb27b125811929e12bd70d170081e1b`, 225 halaman.
- Cakupan: Tabel 3 Lampiran IV, PDF halaman 157–198, 80 baris × 5 peringkat = **400 teks kriteria unik**.
- Sumber data aplikasi: `regulations/padk43/cyber/drafts/table3-criteria-source.br`, JSON terkompresi Brotli. SHA-256 dari JSON hasil dekompresi: `91edaaadcad31247ff3f703fe1e2dddbb470e99860e3bb07a00280c1c5fd4c60`.
- Teks disederhanakan hanya pada pemisah whitespace/line breaks dari hasil ekstraksi PDF digital. **Isi semantik, OCR-equivalent, ejaan, urutan rank, pemisahan tabel, dan kesesuaian dengan PDF resmi belum diverifikasi secara menyeluruh**.
- Halaman sumber disertakan untuk membantu petugas memeriksa kembali dokumen asli.
- Aplikasi menggunakan endpoint login-required `GET /regulatory/padk43/cyber/preparations/:id/indicators/:number/criteria`. Respon harus selalu `EXTRACTED_SOURCE_UNVERIFIED`, `mappingVerified=false`, `criteriaVerified=false`, `sourceTextVerified=false`, `officialScoreAvailable=false`, dan `finalReportAvailable=false`.
- Kategori 1: calon baris Tabel 3 sama dengan nomor indikator. Kategori 2: calon nomor Tabel 3 didapat dari `review/category2-candidates.json`, **tidak disahkan**. Khusus nomor **3, 18, 19, 20, 24, 29, 32** ditandai dengan risiko perbedaan redaksi tinggi. Jangan samakan persetujuan kandidat dengan pemeriksaan semua kelima teks kriteria.
- Pengguna hanya bisa memilih **peringkat draft sementara**; kemampuan memilih peringkat tidak membuktikan bahwa kriteria telah dinyatakan benar secara regulasi.

## Yang harus dinyatakan lengkap sebelum laporan final

1. Buktikan PDF sumber identik dengan versi resmi otoritas, bukan hanya konsisten dengan PDF yang diunggah.
2. Proofread **80 baris × 5 rank = 400 sel kriteria** terhadap halaman PDF visual; periksa row yang berlanjut ke halaman berikutnya.
3. Proofread Tabel 1 (80 parameter), Tabel 2 (60 parameter), dan seluruh pemetaan Kategori 2 secara independen oleh reviewer substansi dan teknis yang kompeten.
4. Selesaikan anomali yang teridentifikasi (termasuk Tabel 3 #2, #26, #36, dan header #74/#79) menggunakan keputusan yang dapat ditelusuri ke sumber.
5. Verifikasi bobot, perhitungan rata-rata dan komposit, serta kebijakan pembulatan sebelum mengaktifkan pengesahan hasil dan PDF final.

Data ini dipublikasikan sebagai **referensi draf yang bisa dilihat petugas saat mengerjakan indikator**, bukan sebagai regulatory pack siap produksi.
