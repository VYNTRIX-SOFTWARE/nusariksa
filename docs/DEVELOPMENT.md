# Panduan pengembangan

Panduan ini untuk pengembang yang ingin menjalankan, menguji, atau memperbaiki NusaRiksa. Untuk pengenalan aplikasi dan instalasi singkat, mulai dari [README](../README.md).

## Alur penggunaan pertama kali (MVP draft)

Pembuatan database dan bootstrap `SUPER_ADMIN` masih dilakukan operator teknis satu kali melalui terminal, lalu seluruh langkah pengguna berikutnya tersedia pada web:

1. Admin masuk dan memilih **Akses Pengguna** (juga tersedia melalui tombol utama di Dashboard). Undang email petugas pengisi; simpan kode undangan sekali pakai (24 jam) dan kirim langsung lewat kanal privat. Token tidak dikirim melalui email oleh NusaRiksa.
2. Petugas membuka login, memilih **Sudah punya kode undangan? Aktifkan akun**, mengisi token undangan, password minimum 12 karakter, dan konfirmasi.
3. Admin klik **Muat ulang** di Akses Pengguna, pilih peran **Petugas pengisi asesmen (IT_OFFICER)** untuk petugas yang baru aktif. Buat petugas pemeriksa terpisah dengan peran **REVIEWER**.
4. Petugas pengisi login, memilih **Mulai penilaian** dari Dashboard. Di **Persiapan Penilaian PADK**, pilih **Buat penilaian pertama**, isi judul, kategori dan periode.
5. Isi peringkat, justifikasi, dan bukti tiap indikator; periksa progres, ajukan draft, lalu pemeriksa lain dapat membuka antrean review.

Akun `SUPER_ADMIN` saja tidak otomatis dapat menilai (least privilege), tidak dapat mengubah perannya sendiri, dan perlu pengguna petugas terpisah. Kode undangan adalah **rahasia autentikasi**: hanya ditampilkan sesaat di browser admin; jangan salin ke issue, chat publik, log, atau repositori. Alur ini tidak mengesahkan konten PADK untuk pelaporan resmi.

## Katalog internal bawaan untuk MVP

Migrasi `0024_seed_internal_bpr_catalog.sql` menambahkan katalog dengan 26 kontrol internal terbit pada database yang sudah memiliki `SUPER_ADMIN`. Saat bootstrap instalasi baru, fungsi installer katalog yang sama dipanggil dalam transaksi. Penyediaan bersifat idempoten, tidak mengubah versi terbit yang telah ada dan tidak menimpa katalog custom. Jika kode `NUSARIKSA_BPR_INTERNAL` sudah dipakai katalog manual, installer tidak mengambil alih kode tersebut; periksa konflik secara privat.

UI menandai katalog `origin='builtin'` dan menyarankan versi terbitnya pada formulir asesmen tanpa memasangnya diam-diam. Setelah dipasang, assignment versi tidak dapat dibatalkan. BPR boleh membuat versi Draft berikutnya, menambah kontrol, dan menerbitkannya; atau membuat katalog sendiri. Semua kontrol bawaan adalah **baseline internal yang belum merupakan instrumen OJK**.

## Pengalaman mengisi asesmen kontrol umum (MVP)

Di **Daftar Asesmen → Workspace**, setelah katalog bawaan dipasang dan asesmen dimulai, petugas melihat daftar 26 kontrol, form jawaban, status tersimpan, progres, dan langkah selanjutnya. Tombol **Simpan & lanjut** memakai API PUT yang sama dengan Simpan dan baru memilih kontrol belum dinilai berikut setelah data tersimpan pada server; status konflik revisi dan izin backend tetap berlaku. Kontrol dapat dinavigasi dengan tombol sebelum/berikutnya, filter, atau cari belum dinilai. Perubahan belum tersimpan tidak otomatis dibuang. Bukti per kontrol tetap terenkripsi, dan review internal muncul setelah input. Progres hanya menghitung kontrol yang memiliki revision, bukan kualitas bukti atau kepatuhan OJK.

## Template regulasi siap pakai pada asesmen BPR (MVP)

NusaRiksa menampilkan panduan yang sudah disediakan pengembang untuk seluruh **26 kontrol baseline operasional TI internal**, dengan pemetaan **pasal terkait POJK 34/2025**, pertanyaan pemeriksaan, dua contoh dokumen bukti, dan catatan konteks. Panduan **read-only**, tidak membuat katalog/bukti baru pada database, tidak mengubah versi katalog historis, dan tidak memetakan kontrol kustom secara sembrono. Petugas mengisi kondisi aktual dan bukti dari pemeriksaan; helper form menyusun teks catatan dari input petugas, tanpa memilih rating atau membuat file bukti. Konfirmasi dibutuhkan sebelum membuang isian helper; penyimpanan tetap memakai API PUT/expectedRevision yang telah ada.

Untuk keamanan siber, **PADK 43/2025** menggunakan workspace khusus 60/80 indikator bawaan, bukan 26 kontrol umum. Instrumen PADK masih ditandai belum terverifikasi untuk keluaran resmi. Di UI template siap digunakan sebagai **acuan penilaian** tanpa label persiapan, tetapi tidak mengubah tanggal legal berlaku kedua aturan atau status release gate. Sumber POJK diperiksa pada salinan dokumen OJK di proyek; rujukan teks operasional bukan kutipan literal pasal.

## Alur cepat MVP: buat, pasang katalog, mulai dalam satu aksi

Endpoint `POST /assessments/start-default` memproses payload yang sama dengan `POST /assessments` (judul, periode awal/akhir). Hanya actor dengan `assessments:write`, cookie sesi valid, origin sesuai, dan validasi payload yang sama boleh memanggilnya. Backend dalam **satu transaksi** mengonfirmasi katalog internal bawaan berstatus `published`, `version=1`, berisi tepat 26 kontrol dan terikat institusi pemanggil, membuat asesmen, memasang versi tersebut, lalu memulai status `in_progress`. Gagal pada tahap mana pun = ROLLBACK. Catatan audit `CREATED`, assignment, `STARTED` tetap tercatat melalui fungsi yang sama dengan alur manual.

UI hanya mengubah formulir **Daftar Asesmen** yang ada. Mode cepat dicentang sejak awal, periode default tahun lokal, dan tombol berlabel **Buat & mulai asesmen TI**. Pengguna dapat tidak mencentang untuk membuat Draft dengan katalog custom melalui cara lama. Pembukaan asesmen baru mengikuti callback `onCreated` dan langsung membuka 26 kontrol. Tidak ada perubahan sidebar, izin, rubrik, tata kerja maker–checker, kalkulasi regulatori ataupun rilis PADK.

## Inventaris aset TI (Modul 8)

Migrasi `0025_create_ti_assets.sql` membuat tabel aset `ti_assets` dan audit append-only `ti_asset_events`. Kolom `institution_id` digunakan di semua operasi; API tidak menerima identitas bank dari browser. Admin, petugas TI dan kepatuhan dapat menulis; pemeriksa, auditor, dan viewer hanya membaca. Kode aset permanen dan unik per instansi, update/arsip memerlukan `expectedRevision`. Endpoint: `GET /assets`, `POST /assets`, `GET/PATCH /assets/:id`, `POST /assets/:id/archive`, `GET /assets/:id/history`. Pencarian/filter memakai query database dan pagination 50 baris dengan offset.

Keterhubungan aset ke risiko dan insiden masih memerlukan tabel dan workflow modul 9/10. Sampai kedua modul ada, jangan menyebut kaitan tersebut selesai.

## Modul 9: Register Risiko TI

Migrasi `0026_create_ti_risks.sql` membuat register risiko yang ditautkan secara opsional ke `ti_assets` melalui foreign key komposit `institution_id/asset_id`; `ti_risk_events` mencatat CREATED/UPDATED/ARCHIVED dengan trigger immutable. Endpoint `GET/POST /risks`, `GET /risks/asset-options`, `GET/PATCH /risks/:id`, `POST /risks/:id/archive`, `GET /risks/:id/history` memiliki session, same-origin untuk mutasi, RBAC, validasi strict, dan batas input.

Penilaian inheren dan residual adalah skor internal `kemungkinan × dampak` (1–5), kategori low (1–4), medium (5–9), high (10–16), critical (17–25). Nilai residual `NULL` berarti belum dinilai; tidak boleh dihitung sebagai nol. Menutup risiko hanya diperbolehkan bila mitigasi minimal 10 karakter dan residual <=9. Mekanisme *risk acceptance* risiko di atas medium membutuhkan modul persetujuan eksplisit yang belum ada. Register mendukung revisi optimistis, arsip non-destruktif, filter/paginasi, dan riwayat immutable. Tidak ada nilai regulator otomatis maupun hubungan fiktif dengan modul insiden.

## Modul 10: Manajemen Insiden TI/Siber

Migrasi `0027_create_ti_incidents.sql` menambahkan `ti_incidents` beserta FKs komposit untuk referensi aset dan risiko dalam institusi yang sama, dan `ti_incident_events` append-only (trigger menolak perubahan/penghapusan). Jalur REST: `GET/POST /incidents`, `GET /incidents/options`, `GET/PATCH /incidents/:id`, `POST /incidents/:id/timeline`, `GET /incidents/:id/history`, `POST /incidents/:id/archive`. Session cookie, same-origin pada mutasi, pembatasan izin `incidents:read/write`, transaksi, FK, dan optimistic revision diterapkan.

Alur status ditetapkan eksplisit: reported→investigating, investigating→contained/resolved, contained→investigating/resolved, resolved→investigating/closed. Status closed terminal; arsip hanya bila closed. Resolusi wajib memiliki root cause dan hasil pemulihan minimal 10 karakter. Catatan kronologi dibuat dari event OBSERVATION/CONTAINMENT/RECOVERY/COMMUNICATION, dengan `observed_at` opsional dan `recorded_at` server. Kronologi tak dapat diedit; bila salah, tulis koreksi baru. UI memakai daftar aset/risiko aktif; risiko yang terikat aset spesifik harus memakai aset yang sama pada insiden.

Belum ada keputusan otomatis wajib-lapor OJK, pengiriman laporan resmi, lampiran insiden terpisah, approval penutupan, atau integrasi tindak lanjut temuan. Fitur ini perlu dikerjakan/ditinjau sesuai Scope Freeze dan kebijakan masing-masing BPR sebelum release stabil.

## Lingkungan lokal

Gunakan Node.js `>=24.7.0 <27`, npm, dan PostgreSQL 17. Buat database kosong, lalu atur `DATABASE_URL` dan `APP_ORIGIN` sebagaimana dijelaskan di README.

```bash
npm ci
npm run db:migrate
npm run admin:bootstrap -- --name "BPR Contoh" --kind BPR --email admin@example.test
npm start
```

Bootstrap pertama meminta password melalui terminal. Gunakan data contoh, bukan akun karyawan bank yang sebenarnya.

| Variabel | Kegunaan |
| --- | --- |
| `DATABASE_URL` | Koneksi PostgreSQL |
| `APP_ORIGIN` | Origin browser yang diizinkan, misalnya `http://localhost:3000` |
| `PORT` | Port server pengembangan; default 3000 |
| `EVIDENCE_ENCRYPTION_KEY` | Kunci bukti legacy (64 digit hex) untuk seluruh baris historis tanpa key ID |
| `EVIDENCE_KEYRING` | JSON object ID versi kunci ke 64 digit hex; simpan sebagai secret |
| `EVIDENCE_ACTIVE_KEY_ID` | ID versi kunci aktif untuk unggahan baru |

Simpan semua kunci di luar repositori. Untuk mulai rotasi, tetapkan `EVIDENCE_KEYRING` sebagai JSON object, misalnya `{"v1":"<64 hex>","v2":"<64 hex>"}`, dan `EVIDENCE_ACTIVE_KEY_ID=v2` secara bersamaan. Unggahan baru menggunakan kunci aktif dan menyimpan ID di database yang ikut diautentikasi oleh AES-GCM. Baris lama dengan `key_id IS NULL` tetap membutuhkan `EVIDENCE_ENCRYPTION_KEY` semula. Jangan menghapus kunci versi lama dari keyring selama masih ada bukti yang bergantung padanya. Rotasi ini tidak mengenkripsi ulang data historis. Simpan backup kunci terpisah, lakukan uji pemulihan database dan kunci bersama-sama. Konfigurasi invalid gagal tertutup (503), bukan fallback otomatis. Kehilangan kunci dapat menyebabkan berkas bukti tidak dapat dipulihkan.

## Struktur kode

- `apps/api/src/`: handler HTTP, aturan bisnis, autentikasi, dan otorisasi.
- `apps/api/test/`: pengujian unit dan integrasi.
- `apps/web/`: HTML dan JavaScript antarmuka.
- `database/migrations/`: perubahan struktur database. Buat migrasi baru; jangan mengedit migrasi yang sudah digabung ke `main`.
- `scripts/`: migrasi, bootstrap, tes browser, dan validasi PADK.
- `regulations/padk43/cyber/`: data draft instrumen, calon pemetaan, dan pemeriksaan sumber.

Backend harus memeriksa peran, izin, institusi, dan status asesmen pada setiap permintaan. Menyembunyikan tombol dari pengguna tidak menggantikan otorisasi API. Sesi menggunakan cookie HttpOnly.

## Pengujian

```bash
npm run check
npm run test:browser
```

`npm run check` menjalankan pemeriksaan sintaks, tes Node.js, dan validasi data PADK tahap pengembangan. Tes integrasi membutuhkan `DATABASE_URL`. Tes browser memerlukan PostgreSQL dan browser yang sesuai dengan skrip tes. Periksa hasil dan jumlah tes yang benar-benar dijalankan sebelum membuat PR.

Perubahan API atau database harus diuji untuk akses tanpa izin, input tidak valid, konflik revisi, dan kegagalan transaksi. Untuk UI, uji tindakan menyimpan dan membaca kembali, bukan hanya tampilannya.

Pemeriksaan instrumen PADK:

```bash
npm run regulatory:draft-status
npm run regulatory:check
npm run regulatory:release-gate
```

`regulatory:check` bukan tanda aplikasi boleh dipakai untuk pelaporan resmi. `regulatory:release-gate` harus tetap menolak paket yang belum lengkap atau belum diperiksa. Lihat [panduan PADK](PADK.md).

## Aturan kontribusi

Satu PR sebaiknya membahas satu perubahan yang jelas. Kerjakan perubahan di `development` dan gunakan `main` sebagai referensi kode yang sudah diterima. Setelah squash merge, sinkronkan kembali `development` dengan `main` sebelum melanjutkan.

Jelaskan PR menggunakan **Summary, Changes, Testing, Limitations**. Issue dipakai untuk pekerjaan yang belum dikerjakan; PR tidak perlu memuat rencana sprint atau catatan pribadi. Baca [CONTRIBUTING.md](../CONTRIBUTING.md).

## Uji pemulihan

Untuk melakukan uji pemulihan terisolasi gunakan `npm run recovery:drill` sesuai [panduan pemulihan](RECOVERY.md). Perintah menguji `pg_dump`/`pg_restore`, riwayat migrasi, serta dekripsi dan hash bukti dari database hasil pemulihan. Tool ini tidak menggantikan kebijakan backup produksi, disaster recovery, atau pemulihan kunci eksternal. Jalankan hanya pada target lokal kosong dan terpisah.

## Sebelum menggunakan data produksi

NusaRiksa masih dalam pengembangan. Penerapan produksi memerlukan review otorisasi, manajemen dan pemulihan kunci, keamanan unggahan, backup–restore, pengujian operasional, serta pemeriksaan independen atas instrumen PADK. CI yang lulus tidak membuktikan aplikasi aman untuk data bank.
