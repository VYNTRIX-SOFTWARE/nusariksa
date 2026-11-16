# Data instrumen PADK

Folder ini menampung data penilaian keamanan siber berdasarkan **Lampiran IV PADK 43/PADK.03/2025**. **Dua candidate regulatory pack telah dirakit secara lengkap** berdasarkan transkripsi sumber, tetapi belum dapat dipakai sebagai instrumen resmi. Tahap `ASSEMBLED_PENDING_SUBSTANCE_AND_TECHNICAL_REVIEW` berbeda dari `DRAFT_UNVERIFIED` milik data kerja lama dan berbeda dari kelayakan rilis.

Baca [panduan penilaian PADK](../../../docs/PADK.md) untuk kategori, bobot domain, kalkulasi, dan batasan penggunaan.

## Isi folder

| Lokasi | Kegunaan |
| --- | --- |
| `drafts/kategori-1.json` | 80 indikator kerja Kategori 1 |
| `drafts/kategori-2.json` | 60 indikator kerja Kategori 2 |
| `drafts/table3-criteria-source.br` | 400 teks kriteria yang diekstrak dari Tabel 3 |
| `sources/lampiran-iv-extraction.json` | Transkripsi 540 baris dari PDF, termasuk 140 parameter dan 400 kriteria unik; review independen belum selesai |
| `candidates/kategori-1.json` | Candidate regulatory pack Kategori 1: 80 indikator dan 400 kriteria |
| `candidates/kategori-2.json` | Candidate regulatory pack Kategori 2: 60 indikator dan 300 penempatan kriteria kandidat |
| `candidates/review-manifest.json` | Penanda konflik parameter/kriteria dan pemetaan Kategori 2 yang belum dapat dianggap final |
| `review/category2-candidates.json` | Kandidat pemetaan 60 indikator Kategori 2 ke Tabel 3 |
| `packs/` | Regulatory pack **sesudah** review substansi dan teknis; belum tersedia, tidak diisi otomatis |

## Menyusun regulatory pack

1. Ambil PDF langsung dari [situs OJK](https://ojk.go.id/id/regulasi/Pages/PADK-43-PADK03-2025-Penyelenggaraan-Teknologi-Informasi-oleh-BPR-BPRS.aspx). Catat URL, tanggal akses, dan SHA-256 file. Hash saja tidak membuktikan keaslian penerbit.
2. Bandingkan teks parameter, domain, halaman tabel, kriteria peringkat 1–5, dan halaman kriteria dengan PDF. Jangan menyalin parafrasa `workingSummary` sebagai kutipan regulasi.
3. Verifikasi pemetaan Kategori 2 berdasarkan substansi, bukan sekadar kemiripan istilah.
4. Periksa `candidates/kategori-1.json` dan `candidates/kategori-2.json` yang sudah lengkap secara struktur. Cocokkan 540 baris sumber serta seluruh hubungan indikator-kriteria secara independen. **Jangan menyalin kandidat ke `packs/` tanpa menyelesaikan pengecualian substansi.**
5. Lakukan pemeriksaan substansi dan teknis oleh dua orang berbeda yang bukan penyusun. Simpan rujukan halaman dan attestasi yang terikat pada fingerprint pack. Attestasi JSON bukan tanda tangan digital atau persetujuan OJK.
6. Jalankan pemeriksaan dan review perubahan kode sebelum data dipakai aplikasi.

```bash
npm run regulatory:draft-status
npm run regulatory:candidates
npm run regulatory:check
npm run regulatory:release-gate
```

`regulatory:candidates` memastikan **140 indikator dan 700 penempatan kriteria** lengkap, menelusuri redaksi ke berkas transkripsi sumber, serta menolak perubahan pemetaan tanpa perubahan sumber. Hasilnya tetap **bukan** attestasi bahwa transkripsi identik dengan PDF resmi atau bahwa hubungan antarparameter telah disahkan. `regulatory:check` memeriksa struktur, sedangkan `regulatory:release-gate` **harus menolak** penggunaan produksi sampai seluruh bukti dan review tersedia. Rincian opsi dapat dilihat pada `scripts/check-padk-regulatory-packs.js`.

Setiap pack wajib memuat identitas sumber (`source.url` dan `source.pdfSha256`), kategori, daftar indikator lengkap, kriteria rank, nomor halaman, penyusun, dan attestasi reviewer yang berbeda.

**Jangan mengisi placeholder agar pemeriksaan lulus.** Data yang belum diperiksa harus tetap berstatus draft. Alat pembanding PDF lokal dijelaskan di [panduan review](../../../tools/padk-review/README.md).


### Penanda Kategori 2 pada master Tabel 3

`review/category-scope.json` menyimpan 60 nomor master yang digunakan sebagai penanda pembanding Kategori 2 dengan status `DRAFT_UNVERIFIED`. Penanda tersebut merupakan **referensi kerja untuk membandingkan crosswalk**, bukan ketentuan resmi ataupun otorisasi untuk menggunakan kriteria tertentu. Untuk perbedaan indikator Kategori 2 nomor 29, panel menampilkan dua kandidat (Tabel 3 nomor 35 dan 32) tanpa memilih salah satunya. Redaksi indikator dari Tabel 2 tetap berdiri sendiri. Jangan menghapus release gate regulatori.

## Cakupan yang sudah selesai dan pengecualian yang terbuka

- **Selesai dirakit:** Kategori 1 (80 parameter, 400 kriteria); Kategori 2 (60 parameter, 300 kriteria kandidat); 540 baris referensi dengan teks sumber dan halaman fisik PDF; metadata SHA-256 sumber yang sama.
- **Belum disahkan:** kecocokan redaksi terhadap PDF per halaman, keputusan pemetaan tujuh indikator Kategori 2, tujuh anomali substansi Tabel 3, metode pembulatan komposit, dan review independen.
- **Kasus utama:** indikator Kategori 2 nomor 29 menggabungkan pelatihan siber dan simulasi phishing, sedangkan Tabel 3 nomor 32 dan 35 memisahkannya. Candidate pack memuat lima kriteria dari nomor 35 **untuk kebutuhan pembandingan saja**. Nomor 32 tetap tercatat di manifest; ini **bukan** keputusan final tentang satu peringkat dan tidak boleh dipakai sebagai skor resmi.
- **Rilis:** `packs/` tetap kosong, status `productionEligible=false`, dan `regulatory:release-gate` tetap gagal sampai ketentuan rilis terpenuhi.

Kelengkapan data dan kejujuran status adalah dua syarat yang berbeda. Jangan menaikkan status hanya dengan mengganti literal `DRAFT_UNVERIFIED` atau membuat attestasi palsu.


## Pemeriksaan approval GitHub sebelum rilis

Pemeriksaan struktur (`regulatory:check`) tidak memerlukan jaringan dan tetap bisa dijalankan ketika pack final belum tersedia. Namun, **gerbang rilis** harus memperoleh bukti review yang dapat dikonfirmasi langsung ke GitHub; data JSON reviewer tidak cukup.

Jalankan dari *checkout Git yang bersih* dan berada tepat pada **commit hasil squash merge** dari PR yang memuat **kedua** berkas final `packs/kategori-1.json` dan `packs/kategori-2.json`:

```bash
export GITHUB_TOKEN='<token baca repo, pull request, dan commit>'
npm run regulatory:release-gate -- \
  --source-pdf=/lokasi/privat/PADK-resmi.pdf \
  --evidence-file=/lokasi/privat/hasil-review.json \
  --review-pr=123
```

Simpan PDF dan evidence **di luar repository**. Token dibaca melalui environment, tidak melalui parameter URL dan tidak boleh dimasukkan ke log. Gunakan akses *read-only* ke repository dan pull request.

Syarat verifikasi GitHub:

1. PR sudah merged ke `main` (squash manual), berasal dari repository yang sama, dan penulis PR sesuai `compiledBy`.
2. SHA merge sama dengan `git rev-parse HEAD`; tree commit yang di-review sama persis dengan tree hasil squash, tanpa modifikasi lokal ataupun file untracked.
3. Kedua regulatory pack merupakan berkas yang berubah di PR tersebut.
4. Dua reviewer GitHub yang berbeda dari penyusun memberi review `APPROVED` pada **HEAD terbaru** PR; approval yang `DISMISSED`, tertimpa `CHANGES_REQUESTED`, atau terikat SHA lama ditolak.
5. `reviewerId` merupakan login GitHub asli dan `reviewedAt` adalah tanggal **UTC** sesuai `submitted_at` API GitHub. Identitas, tanggal, peran, dan fingerprint pada tiap pack harus konsisten dengan evidence.
6. GitHub API harus dapat dihubungi secara langsung. Error HTTP, token kosong, dan daftar review yang terpotong akan menutup gerbang, bukan dianggap sukses.

**Batas pembuktian:** API GitHub membuktikan status approval dan keterkaitan commit, **bukan** bahwa setiap baris PADK telah diperiksa benar oleh manusia. Review PDF sumber, keputusan pengecualian, metode skoring, UAT, dan keseluruhan bukti tetap wajib dipertanggungjawabkan. Persetujuan PR juga bukan persetujuan regulator.

Pada kondisi saat ini `packs/` masih kosong dan seluruh kandidat belum disahkan. Gerbang rilis harus **tetap gagal** sampai semua syarat regulatori dan review independen benar-benar diselesaikan.

## Menyiapkan berkas pemeriksaan instrumen

Gunakan PDF sumber lokal yang SHA-256-nya sesuai dengan transkripsi untuk menghasilkan berkas pemeriksaan. Simpan hasil pemeriksaan di luar repository dan pastikan direktori tujuan belum tersedia.

```bash
npm run regulatory:workpack -- \
  --source-pdf=/lokasi-privat/PADK.pdf \
  --output-dir=/lokasi-privat/review-instrumen
```

Berkas keluaran meliputi daftar pemeriksaan sel sumber, pemetaan indikator, pengecualian, perbandingan metode pembulatan, dan template evidence. Setiap keputusan pemeriksaan diawali dengan status `PENDING`; alat ini tidak memberikan persetujuan regulatori secara otomatis.

Untuk memeriksa ulang kesesuaian urutan teks pada sel PDF, jalankan:

```bash
python -m pip install pdfplumber
python tools/padk-source-review/verify-pdf-cells.py \
  --source-pdf=/lokasi-privat/PADK.pdf \
  --source-json=regulations/padk43/cyber/sources/lampiran-iv-extraction.json
```

Pemeriksaan mesin bukan pengganti penelaahan dokumen oleh reviewer yang berwenang. Bukti pemeriksaan, identitas reviewer, dan dokumen internal bank tidak boleh disimpan di repository publik.
