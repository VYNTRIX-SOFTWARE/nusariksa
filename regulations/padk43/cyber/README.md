# Data instrumen PADK

Folder ini menampung data penilaian keamanan siber berdasarkan **Lampiran IV PADK 43/PADK.03/2025**. Data di `drafts/` masih bahan kerja dan belum boleh dipakai sebagai instrumen resmi.

Baca [panduan penilaian PADK](../../../docs/PADK.md) untuk kategori, bobot domain, kalkulasi, dan batasan penggunaan.

## Isi folder

| Lokasi | Kegunaan |
| --- | --- |
| `drafts/kategori-1.json` | 80 indikator kerja Kategori 1 |
| `drafts/kategori-2.json` | 60 indikator kerja Kategori 2 |
| `drafts/table3-criteria-source.br` | 400 teks kriteria yang diekstrak dari Tabel 3 |
| `review/category2-candidates.json` | Kandidat pemetaan 60 indikator Kategori 2 ke Tabel 3 |
| `packs/` | Regulatory pack yang telah diperiksa; saat ini belum tersedia |

## Menyusun regulatory pack

1. Ambil PDF langsung dari [situs OJK](https://ojk.go.id/id/regulasi/Pages/PADK-43-PADK03-2025-Penyelenggaraan-Teknologi-Informasi-oleh-BPR-BPRS.aspx). Catat URL, tanggal akses, dan SHA-256 file. Hash saja tidak membuktikan keaslian penerbit.
2. Bandingkan teks parameter, domain, halaman tabel, kriteria peringkat 1–5, dan halaman kriteria dengan PDF. Jangan menyalin parafrasa `workingSummary` sebagai kutipan regulasi.
3. Verifikasi pemetaan Kategori 2 berdasarkan substansi, bukan sekadar kemiripan istilah.
4. Susun `packs/kategori-1.json` dan `packs/kategori-2.json` sesuai skema yang diperiksa validator.
5. Lakukan pemeriksaan substansi dan teknis oleh dua orang berbeda yang bukan penyusun. Simpan rujukan halaman dan attestasi yang terikat pada fingerprint pack. Attestasi JSON bukan tanda tangan digital atau persetujuan OJK.
6. Jalankan pemeriksaan dan review perubahan kode sebelum data dipakai aplikasi.

```bash
npm run regulatory:draft-status
npm run regulatory:check
npm run regulatory:release-gate
```

`regulatory:check` memeriksa struktur, **bukan** memastikan seluruh redaksi benar. `regulatory:release-gate` harus menolak pack yang belum memenuhi syarat. Rincian opsi dapat dilihat pada `scripts/check-padk-regulatory-packs.js`.

Setiap pack wajib memuat identitas sumber (`source.url` dan `source.pdfSha256`), kategori, daftar indikator lengkap, kriteria rank, nomor halaman, penyusun, dan attestasi reviewer yang berbeda.

**Jangan mengisi placeholder agar pemeriksaan lulus.** Data yang belum diperiksa harus tetap berstatus draft. Alat pembanding PDF lokal dijelaskan di [panduan review](../../../tools/padk-review/README.md).
