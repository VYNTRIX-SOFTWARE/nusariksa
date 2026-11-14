# Matriks ketentuan penilaian maturitas keamanan siber

Dokumen ini memisahkan **ketentuan normatif yang dapat ditelusuri** dari **data instrumen aplikasi yang belum diverifikasi**. Pemeriksaan angka dan struktur ketentuan tidak menggantikan verifikasi seluruh teks indikator dan kriteria penilaian.

## Sumber ketentuan

- [POJK 34 Tahun 2025 — situs OJK](https://www.ojk.go.id/id/regulasi/Pages/POJK-34-Tahun-2025-Penyelenggaraan-Teknologi-Informasi-oleh-Bank-Perekonomian-Rakyat-dan-Bank-Perekonomian-Rakyat-Syariah.aspx), khususnya Pasal 23–25.
- [PADK 43/PADK.03/2025 — situs OJK](https://ojk.go.id/id/regulasi/Pages/PADK-43-PADK03-2025-Penyelenggaraan-Teknologi-Informasi-oleh-BPR-BPRS.aspx), khususnya Pasal 3, Pasal 7, dan **Lampiran IV Bab III bagian A–E**.
- FAQ PADK 43/PADK.03/2025, bagian **IV. Pedoman Ketahanan dan Keamanan Siber**, pertanyaan 2 dan 3, mengenai penyampaian hasil dan periode penilaian. FAQ tersedia melalui tautan dokumen pada halaman PADK di situs OJK.

Tanggal ditetapkan PADK adalah **17 Desember 2025**. **Pasal 7 mengatur mulai berlakunya setelah satu tahun sejak ditetapkan**. Tanggal ditetapkan tidak boleh disamakan dengan tanggal efektif. Ketentuan transisi dan kewajiban terkait tetap harus diperiksa pada konteks pelaksanaannya.

## Matriks ketentuan dan kondisi penerapan

| Aspek | Rujukan | Ketentuan yang dapat dikonfirmasi | Kondisi NusaRiksa |
| --- | --- | --- | --- |
| Kewajiban penilaian | POJK 34/2025 Pasal 24 ayat (1)–(3) | Penilaian **tahunan untuk posisi akhir Desember**; hasil **didokumentasikan**; OJK **dapat sewaktu-waktu meminta** hasilnya. | Persiapan dan penyimpanan draft tersedia. Pengiriman hasil kepada OJK tidak dilakukan otomatis. |
| Periode penilaian pertama | FAQ PADK 43/2025 bagian IV pertanyaan 3 | Penilaian pertama untuk **posisi Desember 2026**. Penilaian dapat diperbarui sewaktu-waktu bila diperlukan. | Saran periode tahunan berakhir pada 31 Desember; tanggal penginian dapat diubah dengan pertimbangan pengguna. |
| Kategori | PADK Lampiran IV Bab III bagian B angka 1 | **Kategori 1:** BPR/BPRS dengan layanan digital dan/atau terhubung dengan sistem aplikasi/infrastruktur TI mitra kerja (**80 indikator**). **Kategori 2:** layanan perbankan dasar (**60 indikator**). | Form hanya menerima 1 atau 2. Penentuan kategori harus berdasarkan layanan nyata, bukan angka skor yang diinginkan. |
| Domain dan bobot | PADK Lampiran IV Bab III bagian B angka 2 huruf a | Tata Kelola **25%**; Identifikasi **15%**; Pelindungan **25%**; Deteksi **15%**; Penanggulangan dan Pemulihan **20%**. Total **100%**. | Metadata kalkulator pratinjau sesuai angka tersebut, belum menandakan peta indikator benar. |
| Peringkat parameter | PADK Lampiran IV Bab III bagian B angka 2 huruf b | **1 Sangat Memadai** (terbaik), **2 Memadai**, **3 Cukup Memadai**, **4 Kurang Memadai**, **5 Tidak Memadai** (terburuk). Peringkat berdasarkan kondisi sebenarnya. | Skor draft memerlukan pilihan dan justifikasi oleh petugas; bukan nilai resmi. |
| Agregasi | PADK Lampiran IV Bab III bagian B angka 2 huruf c–d dan bagian E | **Peringkat domain** = rata-rata peringkat parameter; **nilai komposit** = jumlah hasil perkalian peringkat setiap domain dan bobot domain. | Rumus dasar simulasi mengikuti struktur tersebut. Pembulatan antar-batas belum dinyatakan sebagai ketentuan resmi. |
| Rentang komposit | PADK Lampiran IV Bab III bagian B angka 2 huruf e | 1: **1,00–1,80**; 2: **1,81–2,60**; 3: **2,61–3,40**; 4: **3,41–4,20**; 5: **4,21–5,00**. | Rentang pratinjau sesuai; algoritma pembulatan dua desimal tetap asumsi simulasi yang belum disahkan. |
| Susunan dokumen penilaian | PADK Lampiran IV Bab III bagian C, D, E | Terdapat **kertas kerja penilaian**, **kriteria peringkat parameter**, dan **ringkasan penilaian** lima domain. | PDF yang tersedia adalah **draft internal**; belum dapat disebut format final regulator. |
| Penyampaian hasil maturitas | POJK 34/2025 Pasal 24 ayat (2)–(3); FAQ PADK bagian IV pertanyaan 2 | Hasil perlu **disimpan/didokumentasikan**, namun **tidak diwajibkan dikirim sebagai laporan rutin tahunan**. OJK dapat meminta sewaktu-waktu. | Tidak ada generator laporan bulanan otomatis, pengiriman APOLO otomatis, atau klaim wajib LL999. |
| Laporan insiden siber | PADK Lampiran IV Bab II bagian C | **Berbeda** dari hasil maturitas: notifikasi awal paling lama **24 jam** setelah diketahui; laporan insiden paling lama **7 hari kerja** setelah diketahui, sesuai ketentuan pelaporan insiden yang berlaku. | Alur pelaporan insiden perlu ditinjau secara terpisah; tidak boleh digabung dengan kewajiban pelaporan hasil maturitas. |
| Paket APOLO dan lampiran | Pedoman pelaporan terpisah yang relevan dengan jenis laporan | Kode **LL999**, Form 01.00/02.00, dan format file memerlukan **validasi spesifikasi kanal dan tujuan laporan** secara tersendiri. | **Belum diverifikasi sebagai kewajiban pengiriman hasil maturitas.** Tidak ada klaim siap unggah APOLO. |

## Batas verifikasi instrumen

Angka kategori, bobot, peringkat, dan struktur perhitungan di atas telah dikonfirmasi terhadap ketentuan **pada tingkat norma**. Itu **bukan** konfirmasi bahwa seluruh teks dalam dataset NusaRiksa telah cocok dengan sumber resmi.

| Komponen dataset | Kuantitas | Kondisi | Langkah pemeriksaan sebelum dapat dijadikan keluaran resmi |
| --- | ---: | --- | --- |
| Indikator Kategori 1 | 80 | `DRAFT_UNVERIFIED` | Cocokkan redaksi, urutan, nomor, domain, subdomain dan halaman dengan Lampiran IV. |
| Indikator Kategori 2 | 60 | `DRAFT_UNVERIFIED` | Cocokkan terhadap tabel kategori 2, bukan menyalin otomatis dari kategori 1. |
| Teks kriteria peringkat | 400 sel unik | `DRAFT_UNVERIFIED` | Periksa masing-masing peringkat 1–5, termasuk baris tabel yang terpotong antarhalaman. |
| Pemetaan Kategori 2 ke kriteria | 60 kandidat | `DRAFT_UNVERIFIED` | Periksa kecocokan substansi dan ketidaksesuaian nomor yang telah dicatat dalam panduan sumber. |
| Metode pembulatan | Pratinjau dua desimal | **Belum terverifikasi** | Cocokkan kebijakan pembulatan terhadap contoh atau penjelasan resmi; jangan menyebut metode half-up sebagai aturan PADK. |
| Persetujuan resmi dan format ekspor final | Belum tersedia | **Tidak boleh dinyatakan selesai** | Telaah sumber, verifikasi independen, audit trail dan pengujian output sebelum perubahan status. |

Pemeriksaan manual sumber, bentuk kertas kerja, dan penelusuran baris tersedia pada [Panduan Verifikasi Sumber](../regulations/padk43/cyber/VERIFIKASI-SUMBER.md). Status `DRAFT_UNVERIFIED` dan mekanisme penguncian penerbitan instrumen wajib dipertahankan sampai syaratnya terpenuhi.

## Batas penggunaan laporan

Laporan maturitas internal NusaRiksa, **kertas kerja PADK**, **laporan insiden siber**, dan **lampiran laporan regulatori melalui APOLO** adalah keluaran yang berbeda. Nama dan bentuk berkas tidak dengan sendirinya membuktikan kepatuhan, pengesahan OJK, ataupun kewajiban pelaporan berkala.

Keluaran yang belum memenuhi pemeriksaan sumber wajib menampilkan status **draft/pratinjau internal** secara jelas. Perhitungan simulasi tidak boleh diekspor atau ditandai sebagai hasil resmi.
