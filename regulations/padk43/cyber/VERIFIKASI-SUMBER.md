# Panduan Verifikasi Sumber PADK

Perintah berikut menghasilkan workpaper sementara dari **80 indikator Kategori 1**, **60 indikator Kategori 2**, dan **400 teks kriteria unik** pada Tabel 3:

```bash
node scripts/padk-source-workpaper.js --format=csv > padk-verifikasi-sumber.csv
node scripts/padk-source-workpaper.js --format=json > padk-verifikasi-sumber.json
node scripts/padk-source-workpaper.js --format=ringkasan > padk-ringkasan-pemeriksaan.json
```

**Ringkasan pemeriksaan** memisahkan baris kriteria yang perlu pengecekan redaksi, tabel yang terpotong antarhalaman, dan indikator Kategori 2 dengan pemetaan kandidat. Penanda ini membantu menentukan urutan pemeriksaan, **bukan bukti perbedaan regulasi yang sudah disahkan**.

Kondisi daftar saat ini:

- **31 sel kriteria** perlu pemeriksaan redaksi karena terkait tujuh baris parameter/kriteria yang sudah dicatat sebagai anomali untuk ditinjau. Pada Tabel 3 nomor 2, prioritas ini khusus peringkat 1; pada nomor 20, 21, 22, 27, 28, dan 29, seluruh lima peringkat perlu diperiksa.
- **24 sel kriteria** lain berasal dari nomor tabel yang melewati batas halaman dan perlu dicek sambungan isi teksnya.
- **7 indikator Kategori 2** (3, 18, 19, 20, 24, 29, 32) membutuhkan review pemetaan terhadap Tabel 3.

### Temuan sumber: Kategori 2 nomor 29 terdiri dari dua aspek

Pada salinan PDF Lampiran IV dengan SHA-256 `63868e2fe99a48485b17646618934c1fffb27b125811929e12bd70d170081e1b`:

- **Tabel 2, indikator 29, halaman fisik PDF 151** (halaman Lampiran IV 32): satu indikator membahas **pelatihan ketahanan dan keamanan siber secara berkala** sekaligus **simulasi phishing setidaknya sekali setiap tahun**.
- **Tabel 3, parameter 32, halaman fisik 172** (halaman Lampiran IV 53): kriteria pelatihan keamanan siber bagi pegawai.
- **Tabel 3, parameter 35, halaman fisik 174** (halaman Lampiran IV 55): kriteria simulasi phishing bagi pegawai.

Dua referensi internal sebelumnya mengarah ke nomor 32 dan 35 secara berbeda. Pembacaan sumber menunjukkan bahwa **kedua nomor menjelaskan dua aspek dari satu indikator Kategori 2**, bukan semata-mata dua alternatif yang saling meniadakan. Ini **belum menetapkan cara menggabungkan dua rangkaian peringkat menjadi satu nilai parameter**.

NusaRiksa menampilkan kedua set kriteria untuk **review substansi**, mempertahankan hanya **satu indikator nomor 29**, dan tidak melakukan agregasi atau memilih salah satu nilai secara otomatis. Keputusan pemetaan serta metode penentuan satu peringkat tetap harus dicatat dengan dasar sumber dan pemeriksaan terpisah. Status instrumen tetap `DRAFT_UNVERIFIED`. Jangan mengubahnya menjadi dua indikator atau menggandakan kontribusi skor.


- **62 dari 540 baris** memiliki penanda perhatian khusus, tetapi **540 dari 540 baris masih PENDING**. Angka 62 adalah jumlah slot review berisiko lebih tinggi, **bukan jumlah kesalahan regulasi yang dipastikan**.

Daftar anomali redaksi berasal dari satu sumber pencatatan yang digunakan juga oleh panel pemeriksaan kriteria. Perubahan status atau putusan reviewer tidak dilakukan oleh generator ini. Seluruh teks tetap harus dibandingkan ke dokumen asli.

Untuk pemeriksaan seluruh 540 baris secara berdampingan dengan PDF lokal, gunakan [Workbench Verifikasi Sumber PADK](../../../tools/padk-source-review/README.md). Berkas JSON hasil pemeriksaan tetap privat, dapat dilanjutkan, dan statusnya **tidak otomatis menjadi sumber yang telah terverifikasi**.

**Status seluruh baris awal: PENDING.** Teks dalam kolom `teks_draft` berasal dari working copy/ekstraksi yang sudah ada di repository, bukan teks yang telah dinyatakan cocok dengan PDF resmi OJK. Kolom SHA-256 PDF resmi dan identitas reviewer sengaja dikosongkan.

Gunakan hanya PDF yang diunduh dari [halaman PADK 43/2025 di situs OJK](https://ojk.go.id/id/regulasi/Pages/PADK-43-PADK03-2025-Penyelenggaraan-Teknologi-Informasi-oleh-BPR-BPRS.aspx). Simpan URL file PDF, waktu unduh, SHA-256, jumlah halaman, dan bukti asal dokumen secara terpisah. Nomor `halaman_tercetak_draft` **belum divalidasi** dan dapat berbeda dari halaman fisik PDF.

Untuk setiap record: buka halaman terkait, bandingkan redaksi dan domain/parameter, isi halaman fisik, tulis teks sumber yang diperiksa, pilih verdict manual (`MATCH`, `MISMATCH`, atau `UNREADABLE`), lalu lengkapi catatan, reviewer, dan tanggal review. Prioritaskan Tabel 3 nomor 2, 26, 36, 74, 79. Kategori 2 nomor 3, 18, 19, 20, 24, 29, 32 ditandai untuk review pemetaan secara terpisah.

**Jangan commit workpaper yang sudah memuat identitas reviewer atau dokumen internal bank ke repository publik.** Simpan hasil review di tempat privat dengan audit trail. CSV/JSON ini adalah checklist, **bukan pipeline approval atau importer regulatory pack**. Mengisi status `MATCH` secara manual tidak membuat `regulatory:release-gate` lulus. Reviewer substansi dan teknis harus independen, serta hasilnya ditinjau sebelum data regulatori dipublikasikan.

Workpaper baru dapat dijadikan dasar penyusunan instrumen final setelah seluruh 540 record cocok dengan sumber resmi, review independen selesai, dan semua perbedaan dituntaskan. Sampai persyaratan tersebut terpenuhi, official scoring tetap tidak tersedia.

## Pencocokan salinan PDF

Untuk memeriksa apakah sebuah salinan PDF sama persis dengan working copy instrumen yang pernah digunakan, jalankan:

```bash
node scripts/padk-pdf-fingerprint.js --source-pdf=/lokasi/file.pdf
```

Perintah ini menghitung SHA-256 dari file lokal dan membandingkannya dengan hash salinan kerja yang direkam pada source data. **Hash yang sama membuktikan kesamaan byte, bukan bahwa dokumen telah diperoleh dari OJK.** Simpan URL unduhan dari domain resmi, tanggal akses, dan hasil review dokumen secara terpisah. File PDF tidak diunggah oleh perintah ini.

Tabel 3 nomor 2 kriteria peringkat 1 perlu perhatian khusus: pada salinan yang diperiksa, parameter nomor 2 membahas *risk appetite*, sedangkan teks kriterianya membahas strategi ketahanan dan keamanan siber (Lampiran IV halaman tercetak 38–39). Workpaper menampilkan catatan sumber dan tetap berstatus PENDING. Jangan mengganti teks sumber atau menyatakan kriteria tersebut sah tanpa klarifikasi dan review independen.
