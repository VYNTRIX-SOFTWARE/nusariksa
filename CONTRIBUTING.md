# Berkontribusi pada NusaRiksa

Kontribusi kode, pengujian, dokumentasi, dan pemeriksaan akurasi instrumen PADK diterima.

## Sebelum mulai

1. Cari issue yang sudah ada. Jika belum ada, jelaskan masalah, cara mengulang, dan hasil yang diharapkan.
2. Siapkan lingkungan sesuai [panduan pengembangan](docs/DEVELOPMENT.md). Jangan gunakan data nasabah atau dokumen bank untuk tes.
3. Untuk perubahan PADK, baca [panduan PADK](docs/PADK.md). Data draft tidak boleh ditandai terverifikasi tanpa bukti pemeriksaan sumber dan reviewer independen.

## Pull Request

Gunakan branch `development` untuk pekerjaan yang akan ditinjau dan `main` untuk perubahan yang sudah diterima. Hindari mencampur perubahan yang tidak berkaitan. Pengelola proyek menentukan kapan PR di-merge.

Jalankan pemeriksaan berikut sebelum mengajukan PR:

```bash
npm ci
npm run check
npm run test:browser
```

Tes integrasi dan browser memerlukan PostgreSQL serta lingkungan yang sesuai. Jangan mengklaim tes berhasil jika belum dijalankan atau terlewat.

Gunakan empat bagian dalam deskripsi PR:

- **Summary:** masalah yang diselesaikan.
- **Changes:** perubahan yang dilakukan.
- **Testing:** perintah dan hasil pengujian sebenarnya.
- **Limitations:** risiko atau batasan yang relevan.

Roadmap dan daftar pekerjaan berikutnya tidak perlu dimasukkan ke PR. Tulis judul, pesan commit, dan penjelasan singkat dalam bahasa Indonesia; nama fungsi, API, dan variabel tetap mengikuti konvensi kode.

## Dokumentasi untuk pengguna

Gunakan **README.md** untuk memperkenalkan NusaRiksa, menjelaskan cara instalasi singkat, dan menyediakan tautan dokumentasi. Langkah kerja melalui browser ditulis dalam **[Panduan Penggunaan NusaRiksa](docs/PANDUAN-PENGGUNA.md)** dengan istilah yang mudah dipahami petugas BPR/BPRS.

Tuliskan instruksi berdasarkan fungsi yang benar-benar tersedia. Gunakan bahasa yang jelas dan langsung, serta hindari memasukkan nomor PR, catatan sprint, atau status internal pengerjaan ke dalam dokumentasi pengguna. Batasan yang memengaruhi keputusan, keamanan, dan pelaporan tetap perlu dijelaskan secara faktual.

## Keamanan dan data

Jangan commit password, token, kunci, data nasabah, dokumen internal BPR/BPRS, atau laporan pemeriksaan yang bersifat rahasia. Laporkan kerentanan melalui jalur privat sesuai [SECURITY.md](SECURITY.md), bukan issue publik yang memuat detail eksploitasi.

## Lisensi dan atribusi

Kontribusi harus dapat didistribusikan menurut **AGPL-3.0-only** atau lisensi yang kompatibel. Hak cipta kontributor tidak otomatis dialihkan ke VYNTRIX ketika PR di-merge. Pertahankan pemberitahuan hak cipta pihak ketiga. Lihat [LICENSE](LICENSE), [NOTICE.md](NOTICE.md), dan [TRADEMARKS.md](TRADEMARKS.md).
