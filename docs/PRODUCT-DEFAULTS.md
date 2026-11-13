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
| Model maturitas internal | Metodologi NusaRiksa v1 (6 domain × level 0–5), terbit immutable, metode agregasi konservatif minimum | Model internal disediakan otomatis ketika akun pertama aktif; **bukan instrumen maturitas keamanan siber PADK/OJK**, dan hasil penilaian tidak diisi otomatis |
| Model maturitas khusus | CRUD model, domain, rubrik, versi, penilaian dan review | Mode lanjutan untuk metodologi buatan lembaga sendiri |

Untuk PADK, pengguna tidak perlu membuat indikator/kriteria dari nol. Namun **dilarang menandai kriteria sebagai terverifikasi** hingga review independen selesai. Rincian ketidakcocokan sumber dipertahankan dalam proses review tanpa mengungkap dokumen pembanding privat.

## Ketentuan data contoh dan instrumen

Contoh aset, risiko, insiden, temuan, atau prosedur pemulihan merupakan **referensi**, bukan catatan kondisi faktual lembaga. Pencatatan data aktual hanya dilakukan berdasarkan pilihan dan konfirmasi petugas. Risiko tidak boleh dibuat otomatis sebagai kejadian nyata, atau memperoleh nilai likelihood/impact tanpa penilaian pengguna.

Instrumen standar harus memiliki identitas dan versi stabil, status verifikasi sumber, cakupan, serta audit trail perubahan. Versi yang telah terbit tidak boleh diubah diam-diam. Bank dapat menggunakan metodologi khusus tanpa harus membuat data faktual dari contoh.

## Ekspor dan label dokumen

- Asesmen TI operasional: laporan web/JSON plus unduhan **PDF internal** dan **CSV untuk Excel**. CSV bukan .xlsx dan dibangun dari data tersimpan, bukan isi filter saat ini.
- PADK: saat ini **PDF kertas kerja draft internal** saja. **Jangan mengaktifkan ekspor laporan OJK/final** selama instrumen berstatus DRAFT_UNVERIFIED.
- Semua unduhan membutuhkan sesi dan hak baca laporan, mencantumkan ID, periode, status draft/final internal, penilaian dan review. Tidak boleh membuat skor kepatuhan otomatis dari jumlah jawaban.
- Laporan khusus regulator hanya boleh diaktifkan setelah pemeriksaan substansi dan release gate regulatori terpenuhi.

## Kriteria UAT

UAT pengguna baru sukses jika dari login mereka dapat memilih penilaian yang siap pakai, menyimpan jawaban pertama dalam beberapa langkah tanpa membuka halaman metodologi/katalog kontrol, meninjau status penyimpanan, mengirim review internal, dan mengunduh hasil tanpa mencari dokumentasi teknis.

## Standar keluaran dokumen (Report Engine V2)

Dua alur yang sudah memiliki ekspor PDF internal menggunakan komponen layout bersama dengan header/footer, pagination, tipografi, ringkasan yang dapat ditelusuri, dan detail data tersimpan. Laporan hanya boleh menampilkan informasi yang tersedia di snapshot server; tidak boleh menambahkan hasil, temuan, tanda tangan, rencana aksi aktual, atau skor yang tidak ada. Ini berlaku untuk seluruh modul baru. Tidak boleh menyamakan **Asesmen TI operasional** (26 kontrol NusaRiksa) dengan instrumen **PADK maturitas keamanan siber** (kategori 1/2, 80/60 indikator). PADK tetap berstatus `DRAFT_UNVERIFIED` sampai regulator release gate ditutup secara formal setelah verifikasi.

## Metodologi maturitas internal bawaan

- Saat pengguna pertama aktif, migrasi memasang versi 1 yang sudah dipublikasikan, dengan 6 domain dan 6 kriteria level per domain, tanpa membuat penilaian atau hasil nilai otomatis.
- Tenant existing mendapat backfill idempotent. Kode stabil `NUSARIKSA_INTERNAL`; pada update berikutnya jangan mengubah versi published, buat versi baru bila metodologi berubah.
- Metode agregasi `minimum` hanya menghitung ketika semua domain dinilai. Kriteria memandu penilaian manusia, bukan kesimpulan audit otomatis.
- Form penilaian memilih model serta versi published secara otomatis, sementara pilihan metodologi lain tetap tersedia. Judul dan periode disarankan dan dapat dikoreksi.
- UAT manual pada browser Windows dan pemeriksaan alur maker-checker tetap diperlukan sebelum public release.
