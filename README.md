# NusaRiksa

NusaRiksa adalah proyek sumber terbuka untuk membantu BPR dan BPR Syariah mengelola tata kelola, risiko, dan kepatuhan teknologi informasi. Proyek ini diprakarsai oleh VYNTRIX dan terbuka bagi kontributor.

**Status: pengembangan awal. Belum layak untuk produksi atau penggunaan data perbankan asli.**

## Ruang lingkup

Pengembangan direncanakan mencakup pemetaan ketentuan POJK 34/2025 dan aturan pelaksananya, asesmen keamanan siber, pengelolaan bukti pendukung, alur persetujuan, dan penyusunan laporan. Belum ada fitur kepatuhan yang selesai.

Proyek ini tidak berafiliasi dengan Otoritas Jasa Keuangan dan tidak menggantikan penilaian regulator atau penanggung jawab kepatuhan bank.

## Menjalankan fondasi

Prasyarat: Node.js 24 dan npm.

```sh
npm ci
npm run cek
npm run mulai:api
```

Akses `http://127.0.0.1:3000/kesehatan` untuk memeriksa server pengembangan. Server ini hanya berjalan pada loopback, tanpa login maupun basis data; jangan membukanya ke internet.

## Keputusan awal

- JavaScript ES Modules untuk kode dan pengujian.
- Antarmuka Vue 3 dan PostgreSQL belum diimplementasikan.
- Instalasi satu lembaga menjadi target awal.
- Dokumentasi, pesan commit, dan PR menggunakan Bahasa Indonesia.

Baca [panduan kontribusi](CONTRIBUTING.md), [kebijakan keamanan](SECURITY.md), dan [rencana awal](docs/RENCANA.md).

## Lisensi

Kode tersedia berdasarkan GNU AGPL versi 3 saja (`AGPL-3.0-only`). Penggunaan komersial diperbolehkan sesuai [ketentuan lisensi](LICENSE). Lihat [pemberitahuan hak cipta](NOTICE.md).
