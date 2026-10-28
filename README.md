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
npm run check
npm start
```

Akses `http://127.0.0.1:3000/health` untuk pemeriksaan proses. Endpoint `/ready` mengembalikan HTTP 200 hanya ketika koneksi PostgreSQL tersedia, atau HTTP 503 jika belum tersedia. Server hanya mendengarkan pada `127.0.0.1`; jangan membukanya ke internet.

## PostgreSQL untuk pengembangan

Siapkan PostgreSQL 17 dan database kosong milik pengembang. Atur variabel `DATABASE_URL` pada terminal atau pengelola secret lokal. Contoh formatnya:

```text
postgresql://<user>:<password>@127.0.0.1:5432/<database>
```

Jalankan `npm run db:migrate` untuk menerapkan migrasi yang belum dijalankan. Migrasi yang sudah diterapkan tidak boleh diedit. Pengujian integrasi database hanya dijalankan saat `DATABASE_URL` tersedia. CI menyediakan PostgreSQL sementara untuk keperluan tersebut.

Jangan gunakan kredensial produksi atau membuka koneksi database ke jaringan publik. TLS untuk database jarak jauh dan pengelolaan secret produksi belum disiapkan.

## Keputusan awal

- JavaScript ES Modules untuk kode dan pengujian.
- Antarmuka Vue 3 belum diimplementasikan. PostgreSQL baru digunakan untuk migrasi awal dan pemeriksaan koneksi.
- Instalasi satu lembaga menjadi target awal.
- Dokumentasi dan pesan commit menggunakan Bahasa Indonesia. Perintah, nama fungsi, serta endpoint API mengikuti istilah teknis berbahasa Inggris.

Baca [panduan kontribusi](CONTRIBUTING.md), [kebijakan keamanan](SECURITY.md), dan [rencana awal](docs/ROADMAP.md).

## Lisensi

Kode tersedia berdasarkan GNU AGPL versi 3 saja (`AGPL-3.0-only`). Penggunaan komersial diperbolehkan sesuai [ketentuan lisensi](LICENSE). Lihat [pemberitahuan hak cipta](NOTICE.md).
