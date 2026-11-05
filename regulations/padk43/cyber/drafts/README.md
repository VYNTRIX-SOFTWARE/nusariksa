# Workbench transkripsi Lampiran IV — masih DRAFT

**Status 5 November 2026: belum ada regulatory pack yang dapat digunakan dalam asesmen bank.**

Folder `drafts/` menampung *catatan kerja*, bukan dataset regulasi tervalidasi. Seluruh record memakai `DRAFT_UNVERIFIED` / `NEEDS_SOURCE_REVIEW`. Field `workingSummary` adalah **ringkasan sementara**, bukan kutipan resmi atau nilai parameter yang boleh digunakan saat menetapkan peringkat. Tidak ada kriteria peringkat yang diisi tanpa pengecekan.

## Baseline kerja

| Kategori | Indikator diharapkan | Dicatat dalam draft | Kriteria peringkat diperlukan | Dicatat |
| --- | ---: | ---: | ---: | ---: |
| 1 | 80 | 6 | 400 | 0 |
| 2 | 60 | 6 | 300 | 0 |
| **Total** | **140** | **12** | **700** | **0** |

Catatan sumber awal mengacu pada **Lampiran IV Bab III, Kertas Kerja Penilaian Tingkat Maturitas Keamanan Siber**:

- Kategori 1: indikator 1–6, halaman tercetak **16**.
- Kategori 2: indikator 1–6, halaman tercetak **28**.
- Kelima peringkat tiap indikator ditetapkan pada bagian D, halaman tercetak 38–80; **belum diisi dan belum di-approve**.

Rujukan otoritatif: [halaman PADK 43/PADK.03/2025 OJK](https://ojk.go.id/id/regulasi/Pages/PADK-43-PADK03-2025-Penyelenggaraan-Teknologi-Informasi-oleh-BPR-BPRS.aspx). Catatan awal dibaca dari salinan PDF publik pihak ketiga, tetapi **file PDF OJK yang terbit belum berhasil diperoleh dan dicek identitas byte/hash-nya untuk transkripsi ini**. Jangan memperlakukan salinan tersebut sebagai bukti autentikasi sumber primer. Saat PDF asli OJK tersedia, lakukan pembandingan isi dan halaman sebelum melanjutkan.

## Perintah

```bash
npm run regulatory:draft-status
node scripts/check-padk-transcription-drafts.js --json
npm run regulatory:draft-strict
npm run regulatory:check
npm run regulatory:release-gate -- --source-pdf=/path/ke/PADK43-resmi.pdf
```

- `regulatory:draft-status` menghitung progres 140 indikator dan 700 kriteria serta menampilkan status *belum terverifikasi*. Tetap lulus sebagai pemeriksaan pengembangan.
- `regulatory:draft-strict` sengaja **gagal** walaupun jumlah butir lengkap jika review sumber belum terpenuhi. Tidak ada pembuktian regulasi dari catatan kerja.
- `regulatory:check` memeriksa berkas produksi di `packs/` apabila tersedia, **tidak membaca draft**.
- `regulatory:release-gate` memerlukan dua pack lengkap dan berkas PDF sumber pada `--source-pdf`; hash PDF sumber harus sama dengan hash di kedua pack. Pemeriksaan kecocokan SHA **tidak membuktikan** bahwa teks parameter sudah disalin dengan benar atau bahwa OJK menyetujui implementasi.
- `npm run check` menjalankan tes otomatis dan dua pemeriksaan pengembangan di atas, **bukan** release gate produksi.

## Cara mengisi dengan benar

1. Peroleh PDF **langsung dari laman OJK**. Catat URL berkas yang benar, SHA-256, tanggal pengambilan, dan lokasi halaman tercetak. Idealnya lakukan pemeriksaan visual/render pada tabel berkolom dan baris yang melewati halaman.
2. Untuk setiap kategori, lengkapi nomor dan domain yang benar, kode subdomain untuk aplikasi, serta **teks parameter sumber** pada draft review; jangan cukup memakai ringkasan `workingSummary` ketika membuat regulatory pack final.
3. Petakan rank 1–5 **per indikator** dari bagian D. Pastikan posisi baris dan kolom tepat, terutama pada tabel yang terpotong saat ganti halaman.
4. Periksa setiap butir dengan dua reviewer independen, termasuk sampel silang kategori 1 dan 2 dan perbedaan pada butir yang sekilas sama.
5. Setelah seluruh sumber diperiksa, **buat file terpisah** pada `packs/kategori-1.json` dan `packs/kategori-2.json` mengikuti skema di [panduan regulatory pack](../README.md). Jangan mengganti `DRAFT_UNVERIFIED` menjadi `VERIFIED` pada file kerja ini.
6. Jalankan gate, lakukan review PR terhadap PDF asli dan uji kertas kerja serta kasus batas pembulatan. Kesesuaian isi tidak cukup dibuktikan oleh CI atau attestasi JSON.

## Batasan keamanan dan release

Draft tidak terhubung ke endpoint kalkulator, tidak disimpan di database, dan tidak disajikan lewat frontend. Tidak ada API untuk menilai hasil sebagai resmi. CI boleh hijau ketika draft belum lengkap; release gate wajib tetap terblokir.

Rumus domain dan komposit yang dikutip dari **Lampiran IV Bab III huruf B.2.c–d** menggunakan rata-rata peringkat parameter per domain lalu penjumlahan berbobot 25%/15%/25%/15%/20%; *metode pembulatan pada batas* masih wajib diverifikasi. Struktur ini berbeda dari model maturity internal generik NusaRiksa.
