# PADK 43/PADK.03/2025 — Proses verifikasi regulatory pack

**Status: BELUM ADA regulatory pack yang lengkap dan diperiksa untuk produksi.**

Kode pada direktori ini hanya menjalankan pemeriksaan struktur. Tidak mengisi 80/60 indikator dengan placeholder, tidak menganggap konten yang dihasilkan AI sebagai salinan resmi, dan **tidak menyimpulkan bahwa suatu paket sudah disetujui OJK**.

## Sumber dan cakupan

Rujukan utama: [PADK 43/PADK.03/2025 di situs OJK](https://ojk.go.id/id/regulasi/Pages/PADK-43-PADK03-2025-Penyelenggaraan-Teknologi-Informasi-oleh-BPR-BPRS.aspx), Lampiran IV Bab III.

| Data | Sumber |
| --- | --- |
| Kategori 1, 80 indikator | Lampiran IV Bab III bagian B dan tabel 1 bagian C |
| Kategori 2, 60 indikator | Lampiran IV Bab III bagian B dan tabel 2 bagian C |
| Pemetaan domain, subdomain, dan parameter | Lampiran IV Bab III bagian C, halaman cetak 16–37 |
| Deskripsi kriteria peringkat 1–5 | Lampiran IV Bab III bagian D, halaman cetak 38–80 |
| Skala, bobot, dan nilai komposit | Lampiran IV Bab III bagian B dan E |

`tablePage` dan `criteriaPage` menunjuk **nomor halaman tercetak Lampiran IV**, bukan indeks halaman PDF gabungan.

Status sebuah BPR/BPRS sebagai kategori 1 atau 2 harus ditetapkan berdasarkan karakteristik layanan yang sebenarnya: kategori 1 mencakup penyelenggara layanan digital dan/atau yang terhubung ke sistem aplikasi/infrastruktur TI mitra kerja, sedangkan kategori 2 menyelenggarakan layanan perbankan dasar. Jangan pilih kategori karena skor yang lebih menguntungkan.

## Alur kerja verifikasi manual

1. Unduh **dokumen PADK lengkap dari OJK** dan catat SHA-256 byte PDF persis yang dipakai untuk menyalin. Misalnya `sha256sum PADK43.pdf` di Linux atau `Get-FileHash PADK43.pdf -Algorithm SHA256` di PowerShell. Gunakan identitas tersebut sebagai `source.pdfSha256`. Hash bukan bukti bahwa file itu dokumen asli; URL, penerbit, dan integritas dokumennya juga harus diperiksa.
2. Susun dua berkas JSON: `packs/kategori-1.json` dan `packs/kategori-2.json`. Setiap berkas memuat `pack`, `compiledBy`, dan `attestations`.
3. Untuk setiap indikator, transkripsikan nomor, domain, subdomain, parameter, dan halaman tabel. Tambahkan **semua kriteria rank 1–5 beserta halaman rujukannya** dari bagian D. Jangan mengisi data tebakan, ringkasan yang mengubah makna, contoh generator, atau kriteria yang sama untuk lima rank.
4. Jalankan `node scripts/check-padk-regulatory-packs.js`. Validator memeriksa struktur, cakupan dan sidik jari, **bukan kesesuaian kata per kata dengan PDF**.
5. Lakukan review substantif dan teknis oleh dua orang berbeda yang bukan penyusun. Attestasi harus mengacu pada SHA-256 canonical regulatory pack yang dihasilkan validator. Jika ada perubahan satu karakter saja, sidik jari berubah dan attestasi harus diperbarui.
6. Buka PR khusus untuk kedua pack. Reviewer lain yang independen harus memeriksa terhadap PDF OJK yang sama dan meninggalkan approval pada GitHub. **Attestasi JSON adalah pernyataan biasa, bukan tanda tangan kriptografis atau persetujuan regulator.**
7. Jalankan `npm run regulatory:release-gate`. Gate ini gagal saat file belum ada atau tidak lolos pemeriksaan; walaupun hasilnya lulus, pemeriksaan manusia dan seluruh release gate keamanan aplikasi tetap terpisah.

## Skema JSON per kategori (bentuk, bukan konten)

```json
{
  "pack": {
    "schemaVersion": 1,
    "reference": "43/PADK.03/2025:LAMPIRAN_IV",
    "category": 1,
    "source": {
      "authority": "OJK",
      "regulation": "43/PADK.03/2025",
      "annex": "IV",
      "table": "TABEL_1",
      "url": "https://ojk.go.id/id/regulasi/Pages/PADK-43-PADK03-2025-Penyelenggaraan-Teknologi-Informasi-oleh-BPR-BPRS.aspx",
      "pdfSha256": "<64 digit SHA-256 dari file PDF yang diperiksa>"
    },
    "indicators": [
      {
        "number": 1,
        "domain": "TK",
        "subdomain": "<kode internal subdomain yang dipetakan ke teks sumber>",
        "title": "<teks parameter dari tabel C>",
        "tablePage": 16,
        "rankCriteria": [
          { "rank": 1, "criterion": "<kriteria rank 1>", "criteriaPage": 38 },
          { "rank": 2, "criterion": "<kriteria rank 2>", "criteriaPage": 38 },
          { "rank": 3, "criterion": "<kriteria rank 3>", "criteriaPage": 38 },
          { "rank": 4, "criterion": "<kriteria rank 4>", "criteriaPage": 38 },
          { "rank": 5, "criterion": "<kriteria rank 5>", "criteriaPage": 38 }
        ]
      }
    ]
  },
  "compiledBy": "<identitas penyusun>",
  "attestations": [
    {
      "reviewerId": "<reviewer substansi>",
      "role": "substance",
      "reviewedAt": "2026-11-05",
      "packSha256": "<SHA-256 canonical pack dari validator>"
    },
    {
      "reviewerId": "<reviewer teknis>",
      "role": "technical",
      "reviewedAt": "2026-11-05",
      "packSha256": "<SHA-256 canonical pack dari validator>"
    }
  ]
}
```

Contoh di atas **tidak dapat lolos validator**: hanya ada satu indikator, teks menggunakan placeholder, dan checksum tidak diisi. Tidak ada regulatory pack sintetis yang dimuat aplikasi.

## Status implementasi

- `npm run regulatory:check` memeriksa pack yang ada; jika belum ada pack pada pengembangan, perintah tetap dapat lulus tetapi mencetak pesan release gate belum terpenuhi.
- `npm run regulatory:release-gate` mensyaratkan **kedua** pack lolos struktur serta attestasi terikat SHA-256 yang berbeda per role.
- Belum ada endpoint yang secara otomatis menggunakan pack dari direktori ini. Endpoint preview PR #27 masih menerima manifest yang diberikan pemanggil, menghitung simulasi dengan label `PREVIEW_UNVERIFIED`, dan tidak menghasilkan penilaian resmi.
- **Tidak** ada jaminan keakuratan isi hanya karena 80/60 indikator dan 400/300 kriteria sudah terisi; kualitas isi memerlukan source review independen.
- Tidak ada bukti persetujuan OJK maupun legitimasi untuk penggunaan operasional hanya dari status review internal.

Perlu dilanjutkan dengan pencocokan seluruh butir kategori 1/2 terhadap Lampiran IV, kasus uji contoh perhitungan resmi, UAT praktisi, dan approval PR substansi/regulasi yang didokumentasikan.
