# Penilaian maturitas keamanan siber PADK

NusaRiksa menyediakan kertas kerja berdasarkan **Lampiran IV PADK 43/PADK.03/2025**. Fitur yang tersedia saat ini digunakan untuk **draft dan simulasi**, belum untuk menerbitkan hasil resmi.

Sumber utama: [PADK 43/PADK.03/2025 di situs OJK](https://ojk.go.id/id/regulasi/Pages/PADK-43-PADK03-2025-Penyelenggaraan-Teknologi-Informasi-oleh-BPR-BPRS.aspx).

## Kategori dan cara menghitung

Pilih kategori sesuai karakteristik layanan BPR/BPRS. Kategori 1 berkaitan dengan layanan digital dan/atau koneksi ke sistem aplikasi atau infrastruktur TI mitra kerja; Kategori 2 mencakup layanan perbankan dasar sesuai PADK. Jangan memilih kategori berdasarkan hasil yang ingin dicapai.

| Komponen | Acuan |
| --- | --- |
| Kategori 1 | 80 indikator |
| Kategori 2 | 60 indikator |
| Peringkat indikator | 1–5; 1 paling memadai |
| Tata Kelola | Bobot 25% |
| Identifikasi | Bobot 15% |
| Pelindungan | Bobot 25% |
| Deteksi | Bobot 15% |
| Penanggulangan dan Pemulihan | Bobot 20% |

Nilai domain adalah rata-rata peringkat indikator pada domain tersebut. Komposit adalah jumlah rata-rata domain dikalikan bobotnya. Rentang komposit: **1,00–1,80; 1,81–2,60; 2,61–3,40; 3,41–4,20; 4,21–5,00**.

**Kebijakan pembulatan belum terverifikasi.** Kalkulator simulasi menggunakan pembulatan half-up dua desimal. Jangan memperlakukannya sebagai kebijakan regulator yang sudah disahkan.

## Data instrumen

- `regulations/padk43/cyber/drafts/kategori-1.json` dan `kategori-2.json`: 80 dan 60 indikator kerja, masih `DRAFT_UNVERIFIED`.
- `regulations/padk43/cyber/drafts/table3-criteria-source.br`: ekstraksi **80 baris Tabel 3 × 5 peringkat = 400 teks kriteria unik**.
- `regulations/padk43/cyber/review/category2-candidates.json`: kandidat pemetaan 60 indikator Kategori 2 ke Tabel 3, belum disahkan.
- `apps/api/src/padk-cyber-maturity.js`: mesin kalkulasi pratinjau, bukan kalkulator hasil resmi.

Ada 140 indikator di dua kategori dan 700 kemungkinan penggunaan kriteria peringkat, tetapi **bukan 700 teks kriteria berbeda**.

PDF yang pernah digunakan dalam ekstraksi memiliki SHA-256 `63868e2fe99a48485b17646618934c1fffb27b125811929e12bd70d170081e1b`. Hash mengidentifikasi salinan tersebut, **bukan bukti salinan identik dengan dokumen resmi OJK**. Teks yang melewati batas halaman atau tabel perlu dibandingkan kembali secara visual.

Pemetaan Kategori 2 nomor **3, 18, 19, 20, 24, 29, 32** memerlukan pemeriksaan khusus. Periksa pula redaksi Tabel 3 nomor 2, 26, 36 dan header 74/79.

## Mengisi kertas kerja draft

1. Pilih kategori dan periode penilaian.
2. Bandingkan lima kriteria yang ditampilkan dengan halaman sumber PDF; teks dalam aplikasi masih hasil ekstraksi.
3. Isi peringkat sementara, justifikasi, dan bukti pendukung.
4. Lanjutkan pengisian dari indikator belum lengkap melalui navigasi **Ke indikator belum lengkap**. Progres pengajuan dihitung dari peringkat sementara dan justifikasi minimal 20 karakter per indikator; catatan saja tidak dianggap lengkap. Perpindahan saat ada perubahan yang belum disimpan memerlukan konfirmasi.
5. Ajukan draft setelah seluruh indikator terisi. Pemeriksa lain dapat mengembalikan atau menerima **kelengkapan draft internal**.
6. Lihat nilai komposit simulasi dan PDF kertas kerja draft. Status `draft_accepted` **bukan approval nilai resmi**.

Bukti PDF/PNG/JPEG disimpan terenkripsi dan ditautkan ke indikator. Daftar bukti di PDF bukan pengganti file asli.

## Antrean pemeriksaan draft internal

Pemeriksa dengan izin `assessments:approve` dapat membuka bagian **Draft menunggu pemeriksaan** pada halaman Persiapan PADK. Daftar menampilkan draft `submitted` milik maker lain dalam institusi yang sama, diurutkan dari waktu pengajuan yang paling lama, dengan batas 50 entri per muatan. Pemeriksa dapat membuka satu draft langsung untuk mengecek catatan, bukti, dan memutuskan pengembalian atau penerimaan **kelengkapan draft internal**. Setelah keputusan dibuat, draft keluar dari antrean saat dimuat ulang. Antrean bukan persetujuan regulator atau hasil final.

## Syarat sebelum dipakai secara resmi

1. Dapatkan PDF PADK dari penerbit resmi; catat URL, tanggal akses, dan hash file.
2. Periksa seluruh **80 indikator Kategori 1, 60 indikator Kategori 2, dan 400 sel kriteria unik** terhadap dokumen sumber, termasuk baris yang terpotong antarhalaman.
3. Verifikasi setiap pemetaan Kategori 2 melalui review substansi dan teknis yang independen.
4. Uji contoh perhitungan, batas nilai komposit, dan metode pembulatan terhadap sumber yang telah diperiksa.
5. Lengkapi regulatory pack, bukti review, dan release gate.
6. Uji approval hasil final, PDF final, audit trail, keamanan, backup–restore, dan UAT sebelum digunakan di bank.

Penilaian maturitas keamanan siber tidak mewakili seluruh kewajiban **POJK 34/2025**. PDF penilaian juga tidak otomatis merupakan laporan yang harus diunggah melalui APOLO.

## Perintah pemeriksaan

```bash
npm run regulatory:draft-status
npm run regulatory:check
npm run regulatory:release-gate
```

Perintah terakhir memang harus gagal sampai persyaratan rilis terpenuhi. Untuk bentuk regulatory pack, lihat [panduan data PADK](../regulations/padk43/cyber/README.md). Untuk pemeriksaan PDF secara lokal, baca [panduan alat review](../tools/padk-review/README.md).

## Mengisi indikator melalui aplikasi

Ruang kerja indikator didahulukan daripada review dan simulasi. Di layar lebar, kriteria dan jawaban ditampilkan berdampingan; di layar kecil disusun satu kolom. Gunakan **Simpan & lanjut** untuk menyimpan dan berpindah ke indikator belum lengkap. Catatan tambahan disimpan dalam panel opsional; catatan yang sudah ada otomatis ditampilkan kembali. Progres hanya menyatakan kelengkapan draft internal, bukan verifikasi PADK resmi.


## Perbedaan redaksi parameter dan kriteria sumber

Tabel 3 pada PDF salinan kerja memiliki beberapa perbedaan antara kolom parameter dan kriteria peringkat. Untuk nomor **2, 20, 21, 22, 27, 28, dan 29**, panel kriteria menampilkan peringatan serta menonaktifkan tombol pemilihan peringkat langsung berdasarkan kriteria tersebut. Halaman fisik PDF sumber yang diperiksa: **157, 167–168, dan 170–171**. Kriteria masih dapat dibaca sebagai bahan pemeriksaan. Catatan draft dan proses review internal tetap tersedia; ini **tidak** berarti redaksi sumber telah diperbaiki ataupun official scoring telah diaktifkan. Perbedaan harus ditindaklanjuti melalui pemeriksaan substansi terhadap PDF resmi dan review independen.


Pemeriksaan sumber perlu mencakup **parameter dan seluruh lima kriteria** per baris, bukan hanya kriteria peringkat pertama. Rangkaian ketidaksesuaian pada nomor 20–22 dan 27–29 tidak boleh diselesaikan dengan memindahkan rank ke nomor lain tanpa keputusan substansi dan review independen.
