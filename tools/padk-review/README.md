# Memeriksa kriteria PADK dengan PDF

Alat di folder ini membantu membandingkan kriteria peringkat 1–5 dengan dokumen PDF sumber. Berjalan di browser dan tidak mengunggah PDF atau hasil pemeriksaan ke server NusaRiksa. Hasilnya tetap draft sampai review independen selesai.

## Membuat template

Dari folder utama repositori, jalankan:

```bash
node scripts/padk-rank-batch.js --category=1 --template --from=1 --to=5 > review-k1-1-5.json
```

Untuk Kategori 2 gunakan `--category=2`. Batch kecil memudahkan pemeriksaan setiap sel tabel.

## Pemeriksaan di browser

1. Buka `tools/padk-review/index.html` dengan browser desktop.
2. Impor template JSON dan pilih PDF yang diperoleh dari sumber OJK.
3. Cocokkan nomor indikator, lima peringkat, serta **nomor halaman fisik PDF**. Nomor fisik bisa berbeda dengan nomor halaman tercetak Lampiran IV.
4. Simpan progres dalam JSON lokal. Tidak ada autosave.
5. Ekspor hasil setelah setiap kriteria terisi.

Jika browser membatasi akses file lokal, gunakan server statis yang hanya mendengarkan di `127.0.0.1`. Jangan mengunggah data atau catatan bank ke repositori publik.

## Memeriksa hasil ekspor

```bash
node scripts/padk-rank-batch.js --category=1 --input=review-k1-1-5-siap-validasi.json
node scripts/padk-rank-batch.js --category=1 --input=review-k1-1-5-siap-validasi.json --apply
npm run regulatory:draft-status
```

Jalankan `--apply` hanya setelah membandingkan teks dengan PDF. Pemeriksaan CLI memvalidasi format dan baseline, **tidak mengesahkan kebenaran dokumen atau isinya**. Setelah sebuah batch diterapkan, buat template baru karena fingerprint baseline berubah.

File kerja tetap disimpan pada komputer pengguna. Alat ini bukan antivirus, sistem approval, atau bukti bahwa file PDF berasal dari OJK.
