# Panduan Verifikasi Sumber PADK

Perintah berikut menghasilkan workpaper sementara dari **80 indikator Kategori 1**, **60 indikator Kategori 2**, dan **400 teks kriteria unik** pada Tabel 3:

```bash
node scripts/padk-source-workpaper.js --format=csv > padk-verifikasi-sumber.csv
node scripts/padk-source-workpaper.js --format=json > padk-verifikasi-sumber.json
```

**Status seluruh baris awal: PENDING.** Teks dalam kolom `teks_draft` berasal dari working copy/ekstraksi yang sudah ada di repository, bukan teks yang telah dinyatakan cocok dengan PDF resmi OJK. Kolom SHA-256 PDF resmi dan identitas reviewer sengaja dikosongkan.

Gunakan hanya PDF yang diunduh dari [halaman PADK 43/2025 di situs OJK](https://ojk.go.id/id/regulasi/Pages/PADK-43-PADK03-2025-Penyelenggaraan-Teknologi-Informasi-oleh-BPR-BPRS.aspx). Simpan URL file PDF, waktu unduh, SHA-256, jumlah halaman, dan bukti asal dokumen secara terpisah. Nomor `halaman_tercetak_draft` **belum divalidasi** dan dapat berbeda dari halaman fisik PDF.

Untuk setiap record: buka halaman terkait, bandingkan redaksi dan domain/parameter, isi halaman fisik, tulis teks sumber yang diperiksa, pilih verdict manual (`MATCH`, `MISMATCH`, atau `UNREADABLE`), lalu lengkapi catatan, reviewer, dan tanggal review. Prioritaskan Tabel 3 nomor 2, 26, 36, 74, 79. Kategori 2 nomor 3, 18, 19, 20, 24, 29, 32 ditandai untuk review pemetaan secara terpisah.

**Jangan commit workpaper yang sudah memuat identitas reviewer atau dokumen internal bank ke repository publik.** Simpan hasil review di tempat privat dengan audit trail. CSV/JSON ini adalah checklist, **bukan pipeline approval atau importer regulatory pack**. Mengisi status `MATCH` secara manual tidak membuat `regulatory:release-gate` lulus. Reviewer substansi dan teknis harus independen, serta hasilnya ditinjau sebelum data regulatori dipublikasikan.

Workpaper baru dapat dijadikan dasar penyusunan instrumen final setelah seluruh 540 record cocok dengan sumber resmi, review independen selesai, dan semua perbedaan dituntaskan. Sampai persyaratan tersebut terpenuhi, official scoring tetap tidak tersedia.
