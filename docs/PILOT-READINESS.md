# Kesiapan uji coba terbatas NusaRiksa

Dokumen ini membantu administrator, petugas TI, dan pemeriksa menentukan apakah instalasi **uji** dapat diuji secara terbatas. **Belum merupakan izin penggunaan produksi, pengesahan keamanan, atau penilaian kepatuhan OJK.** Seluruh langkah awal harus menggunakan data sintetis. Jangan mengisi data nasabah, akun karyawan bank, kunci operasional, atau berkas rahasia pada lingkungan uji yang belum dinyatakan aman.

## 1. Pemeriksaan awal otomatis

Siapkan Node.js sesuai README, PostgreSQL 17, database pengujian terpisah, dan variabel lingkungan dari [panduan pengembangan](DEVELOPMENT.md). Untuk pengujian, gunakan kunci enkripsi acak tersendiri, **bukan kunci bank**.

Atur tanda ruang lingkup hanya jika seluruh data memang sintetis:

```bash
export NUSARIKSA_PILOT_DATA_MODE=synthetic
npm run pilot:preflight
npm run pilot:preflight -- --database
```

Di PowerShell:

```powershell
$env:NUSARIKSA_PILOT_DATA_MODE = 'synthetic'
npm run pilot:preflight -- --database
```

Pemeriksaan membaca versi Node.js, format APP_ORIGIN dan DATABASE_URL, PORT, struktur keyring bukti, **kunci MFA**, serta konfirmasi data sintetis. Opsi `--database` melakukan koneksi **read-only** dan membandingkan checksum seluruh migrasi dengan source code. Perintah tidak memodifikasi database, tidak mengunggah data, dan tidak mencetak URL koneksi, password, atau material kunci. Gunakan `--json` untuk hasil yang mudah diproses dalam otomasi.

Arti hasil:

- `BLOCKED`: satu atau lebih prasyarat tidak terpenuhi. Hentikan rencana pilot.
- `REVIEW_REQUIRED`: belum memeriksa database atau terdapat risiko yang perlu diperiksa manusia (misalnya reverse proxy publik).
- `PREFLIGHT_CHECKS_PASSED`: semua pemeriksaan **otomatis ini** lulus, bukan keputusan Go/No-Go.

Gunakan juga `npm run db:status` untuk memeriksa versi PostgreSQL 17 dan checksum migrasi tanpa mengubah data. Prosedur aman untuk upgrade instalasi yang sudah berjalan tersedia di [panduan operasional](OPERATIONS.md).

Hasil selain `PREFLIGHT_CHECKS_PASSED` menghasilkan exit code bukan nol. Koneksi database jarak jauh yang tidak dikonfigurasi untuk verifikasi sertifikat dan hostname tidak akan diperiksa. Bukti ini sendiri tidak menjamin bahwa data uji benar-benar sintetis; operator wajib memastikan.

## 2. Checklist lingkungan sebelum uji manusia

Seluruh pemeriksaan harus memiliki hasil, bukti privat, dan nama penanggung jawab. Jangan memasukkan alamat server internal, data bank, atau hasil audit rahasia ke repository publik.

| Pemeriksaan | Bukti yang perlu disimpan secara privat |
| --- | --- |
| Instalasi bersih Node.js dan PostgreSQL 17 | Versi, langkah instalasi, `db:status`, hasil migrasi, startup, serta `/ready` dan tanggal uji |
| Isolasi lingkungan | Bukti data sintetis, segmentasi jaringan, kontrol akses host/database, tidak terbuka ke internet tanpa persetujuan |
| HTTPS dan reverse proxy bila diakses selain loopback | Sertifikat valid, daftar origin, konfigurasi reverse proxy, pembatasan akses langsung |
| Keyring bukti, kunci MFA, hak akses, rotasi, dan cadangan kunci | Prosedur serta uji pemulihan seluruh kunci; **jangan salin nilai kunci** |
| Database dan file backup | Jadwal, enkripsi, retensi, lokasi terpisah, akses minimal, serta bukti keberhasilan |
| Recovery drill | Hasil `npm run recovery:drill`, bukti non-nol untuk payload terenkripsi, serta verifikasi layanan setelah restore |
| Pemantauan dan audit | Log akses, log kegagalan, penyimpanan aman, notifikasi, dan prosedur eskalasi |
| Keamanan aplikasi | Pengujian otorisasi backend, session/MFA, validasi input/unggahan, dependensi, dan review perubahan |
| Panduan petugas | Dokumentasi login, alur maker–checker, pencatatan risiko/insiden/temuan, laporan, dan pemulihan |

**Catatan:** script recovery drill yang sudah ada hanya menguji dump/restore ke database terisolasi dan verifikasi bukti terenkripsi. Ia **tidak** menyediakan backup produksi terjadwal, backup kunci, atau DRP lengkap. Perlu bukti tersendiri untuk proses tersebut.

## 3. Skenario UAT minimum

Gunakan akun uji terpisah untuk administrator, pembuat, pemeriksa, auditor/pembaca. Catat PASS/FAIL/BLOCKED, waktu, versi commit, bukti anonim, masalah, dan PIC tindak lanjut **di tempat privat**, bukan di GitHub publik.

| ID | Skenario | Hasil yang diharapkan |
| --- | --- | --- |
| U01 | Instalasi dan bootstrap dari database kosong | Instalasi berhasil dan tidak membuat pengguna di luar proses bootstrap |
| U02 | Login, logout, sesi kedaluwarsa, MFA | Sesi dan faktor kedua bekerja; token tidak muncul pada halaman atau log |
| U03 | Akun tanpa izin mencoba API baca/tulis | Backend menolak, bukan hanya menyembunyikan tombol |
| U04 | Pembuat memasukkan asesmen dan bukti sintetis | Data tersimpan, validasi diterapkan, dan riwayat perubahan tersedia |
| U05 | Pemeriksa lain meninjau asesmen/temuan | Pemisahan pembuat dan pemeriksa dipertahankan |
| U06 | Pembuat mencoba memeriksa pekerjaannya sendiri | Ditolak oleh backend |
| U07 | Catat aset, risiko, dan insiden yang saling terkait | Referensi sesuai, detail dan timeline dapat dibuka |
| U08 | Catat temuan dari risiko/insiden lalu tindak lanjuti | Sumber dapat ditelusuri sesuai hak baca |
| U09 | Catat vendor, kontrak, dan evaluasi SLA | Masa berlaku, status, dan catatan evaluasi konsisten |
| U10 | Catat rencana pemulihan dan hasil uji | RTO/RPO dan hasil yang tidak diukur tidak dibuat-buat |
| U11 | Periksa Pusat Pekerjaan TI | Angka konsisten dan detail menuju catatan yang benar |
| U12 | Buat banyak catatan dengan nomor otomatis | Tidak ada duplikasi dan kode historis tidak diubah |
| U13 | Unduh CSV dan PDF register | Isi dari data tersimpan, izin sesuai, tidak ada klaim laporan resmi |
| U14 | Uji pemulihan database dan bukti terenkripsi | Restore, verifikasi bukti, dan login setelah restore berhasil |
| U15 | Uji kehilangan layanan, kegagalan backup, dan rollback | Insiden dapat dikenali, eskalasi jelas, serta jalur pemulihan teruji |
| U16 | Periksa tampilan mobile/desktop dan alur kerja nonteknis | Petugas dapat menyelesaikan skenario tanpa bantuan developer |

## 4. Keputusan Go/No-Go

Pemeriksaan otomatis hanya salah satu masukan. Keputusan kelayakan **pilot terbatas** memerlukan setidaknya:

1. Seluruh masalah keamanan kritis/tinggi yang relevan telah diselesaikan atau memiliki keputusan risiko tertulis dari pihak berwenang; masalah kritis tidak boleh dikesampingkan untuk mencoba data nyata.
2. Backup, restore, pemulihan kunci, pembatasan akses, dan penanganan gangguan terbukti pada lingkungan uji.
3. Skenario UAT inti lulus serta setiap kegagalan memiliki penanggung jawab dan tindakan koreksi.
4. Penanggung jawab teknis dan pemilik aplikasi memberikan persetujuan tercatat atas ruang lingkup uji, bukan persetujuan produksi.
5. **Instrumen PADK masih dalam status draft/belum diverifikasi independen.** Hasil simulasi tidak boleh digunakan sebagai skor/pelaporan regulator resmi.

Jika bukti belum lengkap, pilih **NO-GO** dan ulangi pemeriksaan setelah perbaikan. Hindari klaim bahwa “CI hijau” berarti aplikasi sudah aman untuk data bank.
