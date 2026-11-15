# Workbench verifikasi sumber PADK

Workbench ini membantu memeriksa **80 indikator Kategori 1, 60 indikator Kategori 2, dan 400 teks kriteria unik** dari Lampiran IV PADK 43/PADK.03/2025. Ini adalah pemeriksaan dokumen secara manual; **bukan mesin penilai otomatis atau persetujuan regulator**.

## Menyiapkan workpaper

Jalankan perintah dari akar repositori:

```bash
node scripts/padk-source-workpaper.js --format=json > padk-workpaper.json
```

Unduh PDF dari [halaman PADK resmi OJK](https://ojk.go.id/id/regulasi/Pages/PADK-43-PADK03-2025-Penyelenggaraan-Teknologi-Informasi-oleh-BPR-BPRS.aspx). Catat URL berkas yang sebenarnya, waktu akses, dan SHA-256. **Hash PDF sendiri tidak membuktikan siapa penerbitnya**. Jangan menganggap PDF dari situs pihak ketiga sebagai PDF yang keasliannya telah terverifikasi.

## Pemeriksaan pada perangkat lokal

1. Buka `tools/padk-source-review/index.html` di browser. Jika browser membatasi `file://`, jalankan server statis **hanya di `127.0.0.1`** tanpa mempublikasikannya.
2. Impor `padk-workpaper.json` dan pilih PDF sumber lokal. PDF ditampilkan di sisi kiri.  SHA-256 file lokal dihitung oleh browser bila lingkungan mendukung. Workbench membandingkan hash ini dengan salinan referensi yang digunakan NusaRiksa. Hasil identik **tidak membuktikan keaslian penerbit**; hasil berbeda memerlukan pemeriksaan versi dan asal dokumen.
3. Gunakan filter **Perhatian khusus dahulu** untuk memeriksa 62 slot berisiko tinggi sebelum menelusuri seluruh 540 baris. Penanda bukan putusan bahwa PDF resmi keliru.
4. Pada setiap baris, bandingkan **teks draft**, **nomor dan domain indikator**, **teks sumber yang diperiksa**, dan **halaman fisik PDF**. Pastikan nomor halaman tercetak berbeda dengan halaman fisik apabila ada.
5. Isi keputusan `MATCH`, `MISMATCH`, atau `UNREADABLE` **hanya setelah memeriksa bukti PDF secara manual**. Isi teks sumber, halaman fisik, identitas pemeriksa, tanggal, SHA-256 dan URL penerbit resmi. Perbedaan wajib mempunyai catatan.
6. Klik **Simpan catatan pada workpaper**, lalu **Unduh progres JSON** secara berkala. Pengisian disimpan **di memori tab**, bukan server, dan akan hilang apabila tab ditutup tanpa mengunduh. JSON dapat diimpor ulang untuk melanjutkan pemeriksaan.
7. Setelah mengunduh, baca ringkasan validasi JSON melalui:

```bash
node scripts/padk-source-review-progress.js --input=padk-verifikasi-sumber-progres.json
```

## Validasi dan batas status

- **`PENDING`**: pemeriksaan baris belum selesai.
- **`MATCH`**: petugas mencatat teks yang cocok menurut pemeriksaan awal. Bukan pernyataan bahwa penerbitan dokumen, kualitas ekstraksi, atau pemetaan sudah disahkan.
- **`MISMATCH`**: ada perbedaan yang perlu ditindaklanjuti; catatan wajib dilengkapi.
- **`UNREADABLE`**: sumber tidak cukup terbaca untuk dinilai.

Seluruh hasil ini berstatus `DRAFT_SOURCE_REVIEW_PENDING`; nilai `sourceAuthenticityVerified`, `independentReviewCompleted`, dan `productionEligible` **tetap `false`**. Penghitungan hasil pemeriksaan awal tidak pernah menaikkan `counts.verified` menjadi angka sah.

Alat tidak mengunggah PDF, tidak mengirim data ke API NusaRiksa, tidak menggunakan penyimpanan browser dan tidak mengubah regulatory pack. Berkas hasil berisi identitas reviewer sehingga harus disimpan **secara privat**, bukan di repository publik.

Sebelum data instrumen layak dirilis, pencocokan seluruh baris perlu dikaji secara independen oleh pemeriksa substansi dan teknis yang berbeda. Perbedaan harus diselesaikan berdasarkan naskah resmi; keputusan reviewer perlu memiliki audit trail. Pelaksanaan review bukan bukti persetujuan OJK.
