# Workbench transkripsi Lampiran IV — masih DRAFT

**Status 5 November 2026: belum ada regulatory pack yang dapat digunakan dalam asesmen bank.**

Folder `drafts/` menampung *catatan kerja*, bukan dataset regulasi tervalidasi. Seluruh record memakai `DRAFT_UNVERIFIED` / `NEEDS_SOURCE_REVIEW`. Field `workingSummary` adalah **ringkasan sementara**, bukan kutipan resmi atau nilai parameter yang boleh digunakan saat menetapkan peringkat. Tidak ada kriteria peringkat yang diisi tanpa pengecekan.

## Baseline kerja

| Kategori | Indikator diharapkan | Dicatat dalam draft | Kriteria peringkat diperlukan | Dicatat |
| --- | ---: | ---: | ---: | ---: |
| 1 | 80 | 20 | 400 | 0 |
| 2 | 60 | 20 | 300 | 0 |
| **Total** | **140** | **40** | **700** | **0** |

Catatan sumber awal mengacu pada **Lampiran IV Bab III, Kertas Kerja Penilaian Tingkat Maturitas Keamanan Siber**:

- Kategori 1: indikator **1–7** dari halaman tercetak **16**, **8–12** dari halaman **17**, **13–20** dari halaman **18**.
- Kategori 2: indikator **1–7** dari halaman tercetak **28**, **8–12** dari halaman **29**, **13–19** dari halaman **30**, dan **20** dari halaman **31**.
- Indikator **18–20** tidak identik antar kategori: pada kategori 1 laporan maturitas, laporan kepada Direksi, dan audit intern merupakan nomor 18, 19, dan 20; pada kategori 2 laporan maturitas kepada Direksi digabung pada nomor 18, audit intern dengan cakupan hak akses ada pada nomor 19, sedangkan evaluasi kebijakan/prosedur/limit ada pada nomor 20.
- Semua ringkasan adalah **parafrasa kerja**, bukan teks parameter lengkap yang sudah diverifikasi dan tidak boleh diimpor sebagai regulatory pack.
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

## Temuan yang wajib dicek pada PDF primer

Pembacaan teks PDF pihak ketiga untuk **Tabel 3 (kriteria peringkat)** menunjukkan kemungkinan perpindahan isi antarsel atau baris ketika teks diekstraksi, terutama pada indikator 2 serta sekitar nomor 20–22. Contohnya, deskripsi peringkat yang terbaca pada nomor 2 tampak membahas strategi (bukan selera risiko), sedangkan sebagian kriteria sekitar nomor 20–22 terlihat berdekatan dengan parameter nomor berikutnya. Ini **belum membuktikan naskah OJK salah**; sangat mungkin masalah struktur tabel/ekstraksi.

**Keputusan kerja:** Jangan mengisi kriteria peringkat dari teks ekstraksi tersebut tanpa mengecek posisi sel pada visual PDF resmi, nomor dan halaman tabel, dan review independen. Karena verifikasi visual/source PDF resmi belum berhasil diselesaikan dalam sesi ini, semua `rankCriteria` tetap kosong. Prioritas berikutnya ialah verifikasi tabel visual Lampiran IV bagian C dan D, bukan mengarang isian hanya untuk menaikkan progres.
