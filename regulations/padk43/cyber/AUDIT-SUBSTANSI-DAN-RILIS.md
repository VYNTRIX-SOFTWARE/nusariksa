# Audit sumber dan pembatasan rilis instrumen maturitas siber

Dokumen ini merupakan catatan QA teknis terhadap **salinan PADK 43/PADK.03/2025 Lampiran IV**. Pemeriksaan mesin tidak menggantikan verifikasi redaksi oleh pemeriksa independen ataupun keputusan metodologi. Seluruh regulatory pack masih bersifat kandidat dan **tidak memenuhi syarat untuk menghasilkan nilai resmi**.

## Acuan dan pemeriksaan sel

- SHA-256 PDF kerja 225 halaman: `63868e2fe99a48485b17646618934c1fffb27b125811929e12bd70d170081e1b`.
- Halaman fisik Tabel 1: 135–146; Tabel 2: 147–156; Tabel 3: 157–198; ringkasan: 199.
- Pemeriksaan mesin tanggal 16 November 2026 menggunakan batas sel pada tabel PDF, penggabungan sel yang berlanjut lintas halaman, dan normalisasi urutan karakter Unicode NFKC/alfanumerik.
- Hasil pemeriksaan terhadap transkripsi kerja: **80/80** parameter Tabel 1, **60/60** parameter Tabel 2, **400/400** sel Tabel 3 menunjukkan kecocokan teks **setelah normalisasi**, dengan halaman sumber sesuai dan tanpa kehilangan nomor tabel. Ini lebih spesifik daripada pengujian multiset token per halaman.
- Pemeriksaan tidak membuktikan kesamaan tanda baca, spasi tipografis, semantik kriteria, keaslian pengunduhan independen dari OJK, atau review substansi/teknis manusia. Bukti per-sel tidak otomatis diubah menjadi `MATCH` hasil pemeriksaan manusia.

## Pemeriksaan crosswalk Kategori 2

Seluruh **60** kandidat pasangan Tabel 2–Tabel 3 diperiksa melalui pembandingan parameter Tabel 2 ke parameter Kategori 1 bernomor sesuai Tabel 3. Daftar lengkap terdapat pada [audit-crosswalk-60.csv](review/audit-crosswalk-60.csv). Hasil teknis: **49** pasangan mempunyai redaksi parameter identik setelah normalisasi alfanumerik, sementara **11** pasangan mempunyai perbedaan redaksi (nomor Kategori 2: 3, 18, 19, 20, 24, 26, 29, 30, 32, 45, 47). Perbedaan dapat mencerminkan ruang lingkup atau redaksi tambahan, bukan otomatis salah peta.

Prioritas pemeriksaan substansi untuk pemetaan Kategori 2: **3, 18, 19, 20, 24, 29, 32**. Pemilihan kandidat tidak sama dengan persetujuan crosswalk. Semua 60 keputusan akhir harus memiliki jejak alasan dan reviewer independen.

Khusus indikator Kategori 2 **29**, Tabel 2 halaman fisik 151 mencakup *pelatihan berkala* dan *simulasi phishing*. Tabel 3 nomor **32** (halaman 172) membahas pelatihan, sementara nomor **35** (halaman 174) membahas simulasi. Hanya ada **satu indikator** nomor 29. Penyatuan peringkat tidak boleh dilakukan dengan membuang salah satu aspek, menambahkan indikator kedua, atau menggunakan rata-rata/minimum/maksimum tanpa dasar yang diputuskan dan diuji.

## Ketidaksesuaian kolom parameter–kriteria

| Tabel 3 | Halaman PDF fisik | Risiko substansi |
| --- | --- | --- |
| 2 | 157–158 | Peringkat 1 membahas strategi siber, sementara parameter membahas `risk appetite`. |
| 20 | 167 | Parameter audit intern TI, tetapi kriteria kaji ulang manajemen risiko. |
| 21 | 167 | Parameter kaji ulang risiko, tetapi kriteria budaya keamanan siber. |
| 22 | 167–168 | Parameter budaya siber, tetapi kriteria pengukuran kerentanan. |
| 27 | 170 | Parameter Business Impact Analysis, tetapi kriteria pengujian keamanan. |
| 28 | 170–171 | Parameter pengujian keamanan, tetapi kriteria kaji ulang kebijakan. |
| 29 | 171 | Parameter kaji ulang kebijakan, tetapi kriteria inventaris risiko. |

Teks sumber tetap dipertahankan. Tidak ada pergeseran atau penyusunan ulang kriteria berdasarkan dugaan. Setiap pengecualian harus mendapatkan keputusan substansi yang dapat ditelusuri sebelum pemakaian resmi.

## Skor dan batasan pembulatan

Lampiran IV halaman fisik 133–134 dan 199 menetapkan peringkat parameter 1–5 (1 terbaik), rata-rata parameter per domain, bobot **25%, 15%, 25%, 15%, 20%**, serta agregasi nilai komposit. Rentang komposit: **1,00–1,80; 1,81–2,60; 2,61–3,40; 3,41–4,20; 4,21–5,00**.

Dokumen sumber tidak secara eksplisit menetapkan aturan pembulatan untuk hasil komposit dengan lebih dari dua angka desimal di sekitar batas seperti **1,805** atau **2,605**. Implementasi yang tersedia menggunakan *half-up* dua desimal **hanya untuk simulasi**. Metode final perlu diputuskan dan diuji terhadap semua batas, tanpa menyebutnya metode resmi sebelum ada dasar yang cukup.

## Syarat promosi ke paket final

Direktori `packs/` harus kosong sampai tersedia seluruh hal berikut:

1. Bukti sumber resmi dan hash PDF yang konsisten serta pemeriksaan redaksi sumber per sel oleh pemeriksa;
2. Keputusan 60 crosswalk Kategori 2, 14 pengecualian (7 sumber dan 7 pemetaan), dan aturan satu peringkat Kategori 2 nomor 29 yang sudah diimplementasikan;
3. Verifikasi metode skoring serta kasus batas dan keterlacakan keputusan ke source;
4. Reviewer substansi dan teknis yang berbeda, bukan penyusun, dengan fingerprint paket dan bukti review PR independen yang nyata.

Validator bukti dalam kode memeriksa konsistensi **klaim** tersebut, bukan autentikasi kejujuran metadata. Gerbang rilis **sengaja menolak** rilis apabila bukti review GitHub independen belum dapat diverifikasi. Tidak diperkenankan memasukkan nama reviewer atau status approval sintetis, ataupun menyalin kandidat ke `packs/` agar gerbang tampak hijau.
