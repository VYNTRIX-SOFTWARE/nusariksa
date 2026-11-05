# Fondasi kalkulasi maturitas keamanan siber — PADK 43/PADK.03/2025

**Status:** pratinjau teknis untuk pengembangan; **belum ada regulatory pack tervalidasi**, kertas kerja operasional, approval, atau laporan resmi. Jangan menggunakan hasil untuk pelaporan OJK, penilaian bank asli, atau klaim kepatuhan.

## Referensi

- OJK: [PADK 43/PADK.03/2025 — Penyelenggaraan TI BPR/BPRS](https://ojk.go.id/id/regulasi/Pages/PADK-43-PADK03-2025-Penyelenggaraan-Teknologi-Informasi-oleh-BPR-BPRS.aspx).
- Lampiran IV, Bab III: pedoman penilaian tingkat maturitas keamanan siber, khususnya tata cara pengisian kertas kerja dan ringkasan penilaian.
- Materi sosialisasi OJK (September 2026), bagian pedoman maturitas keamanan siber: sumber pembanding, **bukan pengganti naskah peraturan**.

Parameter yang sudah dapat dijadikan invariant teknis:

| Aspek | Aturan |
|---|---|
| Kategori 1 | 80 indikator |
| Kategori 2 | 60 indikator |
| Tata Kelola | Bobot 25% |
| Identifikasi | Bobot 15% |
| Pelindungan | Bobot 25% |
| Deteksi | Bobot 15% |
| Penanggulangan dan Pemulihan | Bobot 20% |
| Peringkat parameter | Integer 1–5; **1 paling memadai**, 5 paling tidak memadai |
| Peringkat domain | Rata-rata peringkat seluruh indikator dalam domain |
| Nilai komposit | Jumlah (rata-rata domain × bobot domain) |
| Peringkat komposit | 1.00–1.80: Sangat Memadai; 1.81–2.60: Memadai; 2.61–3.40: Cukup Memadai; 3.41–4.20: Kurang Memadai; 4.21–5.00: Tidak Memadai |

**Penting:** pada materi sosialisasi, contoh angka dalam beberapa kolom subdomain tidak konsisten bila langsung dijumlahkan sebagai total 80/60 indikator. Jangan memakai angka contoh tersebut untuk mengarang peta nomor indikator. Penyusunan manifest harus diverifikasi satu per satu dari Tabel 1 dan 2 Lampiran IV.

## Kontrak kalkulator pratinjau

Endpoint hanya tersedia kepada pengguna dengan sesi dan permission yang sesuai:

- `GET /regulatory/padk43/cyber/framework` — mengembalikan metadata domain, bobot, peringkat, dan jumlah indikator; memerlukan `assessments:read`.
- `POST /regulatory/padk43/cyber/preview` — simulasi read-only yang **tidak menyimpan data**; memerlukan `assessments:write`, origin yang sesuai, JSON, dan payload maksimal 256 KiB.

Payload `POST` berupa objek:

```json
{
  "manifest": {
    "reference": "43/PADK.03/2025:LAMPIRAN_IV",
    "category": 1,
    "indicators": []
  },
  "ratings": []
}
```

`indicators` harus diisi **seluruh** 80 atau 60 parameter hasil verifikasi manual, bukan array kosong atau fixture sintetis. Setiap parameter membutuhkan `number` (nomor kertas kerja unik, 1..80 atau 1..60), `domain` (`TK`, `ID`, `PL`, `DT`, `PP`), `subdomain` (kode yang terlacak ke sumber) dan `title` (teks ringkas berdasarkan hasil pemetaan). Belum ada manifest resmi yang dikirim bersama aplikasi. Contoh di atas hanya menunjukkan bentuk objek; **bukan** data siap hitung.

`ratings` berisi satu entri `{ "number": N, "rank": 1..5 }` per indikator yang benar-benar dinilai. Nomor ganda, nomor asing, kategori salah, domain hilang, dan rank non-integer akan ditolak. Kriteria penilaian per peringkat dan evidensinya **belum disertakan** dalam manifest minimal ini.

Server mengembalikan `complete=false` dan `compositePreview=null` sampai semua indikator memiliki peringkat. Setelah lengkap, respons mencakup nilai rata-rata dan kontribusi per domain, nilai komposit mentah, serta klasifikasi pratinjau. `mappingVerified=false`, `regulatoryResult=false` dan `status=PREVIEW_UNVERIFIED` **selalu** ditetapkan oleh server. `manifestSha256` adalah sidik jari manifest normalisasi agar perubahan pemetaan dapat terdeteksi; **bukan** bukti bahwa pemetaan telah diverifikasi.

## Keputusan pembulatan: perlu pengesahan metodologi

Materi menampilkan rentang nilai komposit dalam dua desimal. Kalkulator pratinjau menggunakan pembulatan **half-up dua desimal** sebelum memilih rentang. Ini merupakan **keputusan implementasi sementara**, bukan klaim bahwa OJK secara eksplisit menentukan algoritma tie-breaking tersebut. Nilai mentah tetap ditampilkan untuk analisis.

Sebelum rilis yang mengklaim kesesuaian Lampiran IV, reviewer regulasi harus memeriksa kasus batas, terutama angka tepat di antara 1.80 dan 1.81, serta membandingkan hasilnya dengan kertas kerja/hasil penghitungan resmi.

## Gerbang penerimaan yang belum selesai

1. Susun dan verifikasi **dua** manifest kategori yang benar dari teks Lampiran IV. Simpan referensi halaman dan versi sumber; jangan memakai template indikator sintetis dari pengujian sebagai regulatory pack.
2. Petakan kriteria penilaian setiap parameter untuk peringkat 1–5, lalu tandai hasil telaah dengan reviewer berbeda (maker–checker).
3. Validasi struktur domain/subdomain, kategori, formula, pembulatan, serta contoh komposit dengan referensi resmi.
4. Persist hasil, referensi bukti, approval, dan histori versi secara immutable di database sebelum implementasi kertas kerja operasional dan ekspor.
5. Browser E2E, UAT praktisi BPR/BPRS, pentest, perlindungan data pribadi, dan pengujian restore. Tanpa seluruh gerbang ini, fitur tidak boleh dinyatakan siap produksi.

Implementasi ini **terpisah** dari kalkulator maturitas internal generik PR #26. Tidak ada migrasi, pengubahan bobot generik, atau klaim bahwa `minimum`/`mean_floor` merupakan rumus PADK.

## Quality gate untuk regulatory pack (PR #28)

Validator `apps/api/src/padk-regulatory-pack-review.js` memeriksa seluruh 80/60 indikator dan kelima kriteria peringkat setiap indikator, kode domain, halaman tabel dan halaman kriteria, hash file PDF sumber, serta dua attestasi yang terikat ke fingerprint paket. Dokumentasi dan format file ada di [regulations/padk43/cyber/README.md](../../regulations/padk43/cyber/README.md).

Ini **bukan** tanda bahwa pack resmi telah selesai. Sumber indikator untuk kedua kategori masih harus ditranskripsi dan direview secara terpisah dari PDF OJK. `npm run regulatory:release-gate` harus gagal selama paket belum ada; CI pengembangan boleh lulus tanpa memalsukan data. Skrip struktural juga tidak dapat menggantikan approval independen atas isi dan referensi halaman.
