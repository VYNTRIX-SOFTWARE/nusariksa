# Workbench review visual kriteria PADK

Alat ini mendukung pengisian manual kriteria peringkat Lampiran IV PADK 43/PADK.03/2025, berdampingan dengan PDF yang dipilih dari komputer pengguna. Tidak terhubung dengan endpoint asesmen bank, tidak mengunggah file, tidak melakukan pengenalan teks otomatis, dan tidak mengesahkan hasil penilaian.

## Menyiapkan batch

Dari root repository, gunakan Node.js 24 atau lebih baru:

```bash
node scripts/padk-rank-batch.js --category=1 --template --from=1 --to=5 > review-k1-1-5.json
```

Untuk kategori 2, ganti menjadi `--category=2`. Sebaiknya buat batch kecil (1–5 indikator) agar review dan pelacakan sel tabel mudah dilakukan.

## Membuka workbench

Buka `tools/padk-review/index.html` menggunakan browser desktop modern. Semua aset berupa HTML, CSS, dan JavaScript lokal; tidak ada dependensi pihak ketiga. Apabila kebijakan browser memblokir file lokal, jalankan static server lokal yang terikat hanya ke `127.0.0.1`, bukan server publik.

1. Muat template batch JSON dari langkah sebelumnya.
2. Pilih PDF sumber yang diperoleh dari laman penerbit OJK. Dokumen ditampilkan menggunakan kemampuan penampil PDF browser; tidak dikirim ke server.
3. Gunakan nomor **halaman fisik PDF** untuk navigasi. Nomor tersebut **berbeda** dari halaman tercetak Lampiran IV pada bagian kriteria (38–80), terutama jika dokumen lengkap digabung dengan lampiran lainnya.
4. Pilih nomor indikator, baca tabel dan pastikan posisi sel peringkat 1–5. Isi ringkasan tiap peringkat beserta **halaman tercetak** yang sesuai.
5. Pilih **Simpan progres lokal** untuk menyimpan JSON parsial. File progres dapat dimuat kembali lewat pemilih template. Tidak ada autosave.
6. Setelah semua slot dalam batch lengkap, pilih **Unduh hasil batch untuk validasi CLI**. Pengunduhan baru diizinkan setelah PDF telah dipilih; tindakan ini tidak menjamin PDF berasal dari OJK ataupun telah diperiksa benar.

## Memeriksa dan menerapkan hasil ekspor

```bash
node scripts/padk-rank-batch.js --category=1 --input=review-k1-1-5-siap-validasi.json
node scripts/padk-rank-batch.js --category=1 --input=review-k1-1-5-siap-validasi.json --apply
node scripts/check-padk-transcription-drafts.js
```

Jalankan `--apply` hanya setelah review substansi terhadap tabel PDF; CLI kembali memeriksa kategori, fingerprint baseline, nomor, rank, halaman, teks, dan duplikasi. Kalau baseline draft berubah, buat ulang template dan periksa perubahan sebelum memasukkan batch baru.

Form tidak membaca parameter otomatis, tidak menyimpulkan keabsahan PDF, dan tidak melakukan approval reviewer. Output tetap `SOURCE_REVIEW_PENDING`; draft yang diperbarui tetap `DRAFT_UNVERIFIED`/`NEEDS_SOURCE_REVIEW`. Tidak ada promosi ke `packs/` dan release gate produksi tetap BLOCKED sampai verifikasi dokumen primer serta review independen terpenuhi.

## Pengamanan dan privasi

- Berkas diproses pada browser lokal; kode tidak melakukan permintaan jaringan, telemetri, atau penyimpanan browser.
- PDF hanya direferensikan dengan temporary object URL yang dilepas saat tab ditutup.
- Simpan file progres di lokasi yang aman. Jangan unggah catatan kerja atau berkas sumber internal BPR ke repository publik.
- Karena penampil PDF bergantung pada browser, gunakan pilihan **Buka tab PDF** apabila navigasi halaman di panel tidak mendukung dokumen tertentu.
- Setelah mengimpor satu batch ke draft, template sebelumnya bisa kedaluwarsa karena SHA-256 baseline berubah.
