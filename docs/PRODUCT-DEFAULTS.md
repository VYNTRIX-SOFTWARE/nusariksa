# Prinsip produk NusaRiksa: siap diisi, bukan siap dikonfigurasi

Status: keputusan desain produk, **bukan** pernyataan verifikasi materi regulasi.

## Pengalaman pengguna yang dituju

Petugas BPR/BPRS seharusnya cukup:
1. Memilih pekerjaan: asesmen TI operasional, penilaian maturitas keamanan siber, inventaris aset, register risiko, temuan, atau rencana pemulihan.
2. Memilih paket/instrumen standar yang disarankan dan melihat sumber serta versi.
3. Mengonfirmasi profil lembaga, jenis layanan, kategori instrumen bila relevan, dan periode.
4. Menjawab **kondisi aktual** dan menuliskan dasar pemeriksaan, memilih level/hasil, serta mengunggah bukti.
5. Meninjau ringkasan, memperbaiki kekurangan, mengajukan ke pemeriksa internal.
6. Mengunduh hasil yang tersimpan (draft internal atau final internal sesuai status) tanpa harus memikirkan mekanisme ekspor.

**Jangan otomatis mengisikan jawaban hasil penilaian, bukti atau sign-off:** BPR bertanggung jawab atas kondisi faktual.

## Paket standar saat ini

| Paket | Isi bawaan yang benar-benar tersedia | Catatan status |
| --- | --- | --- |
| Asesmen TI operasional | 26 kontrol, pertanyaan panduan, contoh dokumen, pasal terkait POJK 34/2025 | **Interpretasi operasional NusaRiksa**, bukan 26 pertanyaan resmi dari OJK |
| Penilaian maturitas keamanan siber | 80 indikator untuk Kategori 1, 60 indikator untuk Kategori 2, 5 kriteria peringkat kandidat, panduan draft | Pemetaan/redaksi **DRAFT_UNVERIFIED** dan skor resmi terkunci; dasar Lampiran IV PADK 43/PADK.03/2025 |
| Model maturitas generik | CRUD model, domain, rubrik, versi, penilaian dan review | **Belum tersedia model bawaan siap pakai**; pengguna saat ini harus menyiapkan model sendiri |

Untuk PADK, pengguna tidak perlu membuat indikator/kriteria dari nol. Namun **dilarang menandai kriteria sebagai terverifikasi** hingga review independen selesai. Rincian ketidakcocokan sumber dipertahankan dalam proses review tanpa mengungkap dokumen pembanding privat.

## Backlog paket bawaan, bukan data faktual lembaga

- Metodologi maturitas internal NusaRiksa, terbit dan immutable, dipasang otomatis pada lembaga baru melalui mekanisme seed idempotent/versioned. Tidak boleh disamakan dengan skor maturitas PADK.
- Pustaka contoh risiko TI khas BPR/BPRS: gangguan CBS, ransomware, backup gagal, akses tidak sah, koneksi vendor, dan kebocoran data. **Tidak boleh otomatis menjadi risiko yang benar-benar terjadi** atau menyetel kemungkinan/dampak faktual.
- Katalog kategori dan contoh aset TI (server CBS, endpoint, jaringan, storage, aplikasi, data). Aset instansi baru tercatat setelah dipilih dan dikonfirmasi pengguna.
- Template rencana pemulihan, temuan dan tindak lanjut, kebijakan dan prosedur TI serta referensi bukti yang relevan.
- Requirement matrix dari POJK 34/2025 dan PADK 43/2025 per pasal/lampiran dengan sumber, status verifikasi, ruang lingkup, dan versi instrumen. Hindari mengklaim kepatuhan melalui satu checklist yang tidak mencakup seluruh kewajiban.

Semua paket standar harus memiliki kode stabil, versi immutable setelah terbit, status verifikasi, ruang lingkup kategori/kondisi, tanggal referensi, dan jejak perubahan. Bank dapat menggunakan metode khusus melalui mode lanjutan tanpa harus memulainya dari nol.

## Ekspor dan label dokumen

- Asesmen TI operasional: laporan web/JSON plus unduhan **PDF internal** dan **CSV untuk Excel**. CSV bukan .xlsx dan dibangun dari data tersimpan, bukan isi filter saat ini.
- PADK: saat ini **PDF kertas kerja draft internal** saja. **Jangan mengaktifkan ekspor laporan OJK/final** selama instrumen berstatus DRAFT_UNVERIFIED.
- Semua unduhan membutuhkan sesi dan hak baca laporan, mencantumkan ID, periode, status draft/final internal, penilaian dan review. Tidak boleh membuat skor kepatuhan otomatis dari jumlah jawaban.
- Prioritas lanjutan: workbook .xlsx multi-sheet yang mudah direview, PDF yang lebih editorial, dan paket bukti/metadata audit. Penerbitan khusus pelaporan regulator harus melewati release gate substansi resmi.

## Kriteria UAT

UAT pengguna baru sukses jika dari login mereka dapat memilih penilaian yang siap pakai, menyimpan jawaban pertama dalam beberapa langkah tanpa membuka halaman metodologi/katalog kontrol, meninjau status penyimpanan, mengirim review internal, dan mengunduh hasil tanpa mencari dokumentasi teknis.

## Standar keluaran dokumen (Report Engine V2)

Dua alur yang sudah memiliki ekspor PDF internal menggunakan komponen layout bersama dengan header/footer, pagination, tipografi, ringkasan yang dapat ditelusuri, dan detail data tersimpan. Laporan hanya boleh menampilkan informasi yang tersedia di snapshot server; tidak boleh menambahkan hasil, temuan, tanda tangan, rencana aksi aktual, atau skor yang tidak ada. Ini berlaku untuk seluruh modul baru. Tidak boleh menyamakan **Asesmen TI operasional** (26 kontrol NusaRiksa) dengan instrumen **PADK maturitas keamanan siber** (kategori 1/2, 80/60 indikator). PADK tetap berstatus `DRAFT_UNVERIFIED` sampai regulator release gate ditutup secara formal setelah verifikasi.
