# Panduan Penggunaan NusaRiksa

**Untuk petugas TI, kepatuhan, pemeriksa, dan pengelola sistem BPR/BPRS**

NusaRiksa membantu lembaga mencatat hasil pemeriksaan TI, menyimpan bukti, dan menindaklanjuti pekerjaan pengelolaan aset, risiko, serta insiden. Panduan ini menjelaskan langkah penggunaan melalui browser.

## 1. Mulai menggunakan aplikasi

### Masuk ke akun

1. Buka alamat NusaRiksa yang diberikan pengelola sistem.
2. Masukkan alamat email dan kata sandi akun.
3. Jika autentikasi dua faktor sudah diaktifkan, masukkan kode verifikasi sesuai petunjuk.
4. Setelah berhasil masuk, pilih pekerjaan yang ingin dilakukan melalui menu aplikasi.

**Jika belum memiliki akun:** hubungi administrator. Administrator akan mengundang akun melalui menu **Akses Pengguna** dan memberikan kode undangan melalui saluran yang aman. Pada halaman masuk, pilih **Aktifkan akun**, kemudian ikuti langkah pembuatan kata sandi. Administrator selanjutnya menetapkan hak akses sesuai tugas Anda.

Tidak semua pengguna memiliki menu dan tombol yang sama. Hak akses ditentukan berdasarkan peran yang diberikan administrator.

## 2. Membuat asesmen TI

Gunakan menu **Daftar Asesmen** untuk memulai pemeriksaan pelaksanaan kontrol teknologi informasi.

1. Klik **Buat asesmen**.
2. Periksa judul dan periode pemeriksaan yang sudah terisi. Ubah jika diperlukan.
3. Biarkan pilihan **Gunakan katalog TI bawaan dan langsung mulai** aktif untuk memakai daftar pemeriksaan yang sudah disediakan.
4. Klik **Buat & mulai asesmen TI**.
5. NusaRiksa membuka daftar pemeriksaan yang siap diisi.

Katalog bawaan berisi **26 kontrol operasional TI**. Untuk tiap kontrol tersedia pertanyaan pemeriksaan dan contoh jenis dokumen yang dapat digunakan sebagai bukti. Contoh bukti adalah petunjuk, **bukan** pernyataan bahwa bank sudah memiliki dokumen tersebut.

### Mengisi hasil pemeriksaan

1. Pilih kontrol yang ingin diperiksa.
2. Baca pertanyaan dan petunjuk kontrol.
3. Periksa proses, konfigurasi, atau dokumen lembaga yang sesuai.
4. Isi hasil penilaian dan catatan kondisi yang benar-benar ditemukan.
5. Lampirkan dokumen bukti apabila tersedia dan relevan.
6. Klik **Simpan di kontrol ini** untuk tetap berada pada kontrol tersebut, atau **Simpan & lanjut** untuk beralih ke kontrol yang belum dinilai.

Gunakan **Sebelumnya**, **Berikutnya**, atau **Cari yang belum dinilai** untuk berpindah kontrol. Pastikan perubahan sudah disimpan sebelum berpindah.

**Hal penting:** progres menunjukkan jumlah kontrol yang sudah diisi, bukan persentase kepatuhan bank. Hasil penilaian dan bukti harus diperiksa kembali sebelum dinyatakan selesai.

### Pemeriksaan oleh petugas lain

Setelah seluruh informasi yang diperlukan terisi, ikuti pilihan pengajuan pemeriksaan yang tersedia pada halaman asesmen. Petugas pemeriksa dengan hak akses yang sesuai dapat meninjau isian dan bukti, kemudian memberikan keputusan atau meminta perbaikan. Jika ada catatan perbaikan, petugas pengisi perlu menindaklanjutinya dan mengajukan pemeriksaan kembali.

Untuk memakai daftar pemeriksaan yang disusun lembaga sendiri, nonaktifkan opsi katalog bawaan ketika membuat asesmen. Anda dapat memilih katalog yang sudah diterbitkan sebelum memulai pengisian.

## 3. Mengisi penilaian keamanan siber

Gunakan **Persiapan Penilaian PADK** untuk mencatat penilaian indikator keamanan siber.

1. Buat penilaian berdasarkan periode dan kategori yang sesuai dengan layanan lembaga.
2. Pilih indikator yang hendak diperiksa.
3. Baca kriteria penilaian dan periksa kesesuaiannya dengan dokumen peraturan serta kondisi lembaga.
4. Isi peringkat sementara, alasan penilaian, dan bukti pendukung.
5. Klik **Simpan indikator ini** atau **Simpan & lanjut**.
6. Jika seluruh indikator telah dikerjakan, ajukan pemeriksaan melalui proses yang tersedia.
7. Petugas pemeriksa dapat meninjau kelengkapan dan meminta perbaikan.

Hasil komposit dan berkas PDF pada halaman ini digunakan sebagai **bahan kerja dan peninjauan internal**. Sebelum dipakai untuk keperluan resmi, pastikan instrumen, perhitungan, dan kesimpulan telah diperiksa menurut ketentuan yang berlaku.

## 4. Mengelola inventaris aset TI

Buka **Inventaris Aset TI** untuk mencatat perangkat dan aplikasi yang digunakan lembaga.

### Menambah aset

1. Klik **Tambah aset**.
2. Isi nama aset, lalu pilih jenis sesuai fungsi sebenarnya. Kode dapat ditulis sendiri atau dibuat menggunakan **Buat saran kode**; periksa agar tidak bertabrakan dengan kode inventaris lain.
3. Pilih **jenis aset** berdasarkan fungsi aktual. Petunjuk di bawah pilihan menyediakan contoh aset BPR/BPRS, seperti server core banking, PC teller, router, aplikasi, dan perangkat backup. Contoh tersebut bukan aset yang otomatis tercatat.
4. Isi penanggung jawab/PIC dan lokasi.
5. Pilih **kritikalitas** setelah meninjau dampak jika aset berhenti: apakah transaksi atau layanan kritis terhenti, apakah data terdampak, dan apakah alternatif tersedia. Nilai rendah/sedang/tinggi harus ditentukan petugas; formulir baru tidak memilihkannya otomatis.
6. Pilih status operasional, tambahkan catatan bila diperlukan, lalu klik **Simpan aset**. Nilai aset baru disimpan setelah petugas mengonfirmasi seluruh isian.

Daftar aset menampilkan nama, kode, jenis, lokasi, PIC, dan kritikalitas dalam kartu ringkas. Gunakan **Lihat rincian dan riwayat** untuk membuka data lengkap. Pencarian dan filter dapat dibersihkan dengan **Reset filter**. Jumlah yang ditampilkan menunjukkan isi halaman saat ini, bukan keseluruhan aset bank.

### Mengubah atau mengarsipkan aset

Pilih aset pada daftar, kemudian klik **Ubah** untuk memperbarui informasinya. Gunakan **Arsipkan** apabila aset tidak lagi dikelola dalam daftar aktif. Pengarsipan tidak menghapus informasi dan riwayatnya; kode aset tetap tercatat.

Anda dapat membuka **Riwayat perubahan aset** untuk melihat catatan pembaruan.

## 5. Mencatat dan memantau risiko TI

Buka **Register Risiko TI**. Setiap instalasi NusaRiksa menyediakan **24 skenario risiko umum dalam PostgreSQL**, termasuk catatan **daftar awal lembaga berstatus Belum dinilai**. Ini bukan hasil asesmen, kejadian faktual, atau rating risiko lembaga; jangan menghitungnya sebagai risiko yang sudah dinilai.

Pada tab **Risiko Lembaga**, gunakan daftar awal untuk memulai dari skenario yang sudah tersedia. Klik **Nilai dan catat** untuk mengisi kode, nama, dan skenario secara otomatis dalam formulir; sesuaikan redaksi bila perlu. Petugas masih harus menetapkan kemungkinan, dampak, PIC, dan tanggal target berdasarkan kondisi aktual. Setelah disimpan, data berpindah menjadi risiko lembaga yang sudah dinilai dan mendapat audit trail. Klik **Tidak relevan** untuk mengesampingkan contoh tanpa menghapus atau menciptakan nilai fiktif.

Tab **Referensi Risiko TI** menampilkan seluruh katalog dari database, termasuk potensi dampak, hal yang perlu diperiksa dan opsi pengendalian. Referensi yang dinyatakan tidak relevan dapat dikembalikan ke daftar awal. Skenario yang telah dipakai tidak dapat diadopsi lagi untuk menghindari duplikasi dari referensi yang sama.

**Penting:** tidak ada kemungkinan, dampak, hasil residual, PIC, mitigasi, atau tanggal target yang otomatis dianggap nyata hanya karena skenario sudah disediakan. Nilai faktual harus diputuskan petugas.
1. Klik **Tambah risiko**. Pada bagian identifikasi, pilih contoh dari **Pustaka contoh risiko BPR/BPRS** bila relevan, lalu klik **Gunakan contoh**, atau tulis sendiri.
2. Periksa dan sesuaikan nama serta skenario dengan keadaan bank. Contoh bukan pernyataan bahwa risiko tersebut telah terjadi atau sudah dinilai.
3. Isi kode sendiri atau pilih **Buat saran kode**, lalu periksa keunikannya. Pilih aset terkait jika memang relevan.
4. **Pilih sendiri** kemungkinan dan dampak (skala 1–5). Formulir baru tidak mengisi 3×3 atau nilai lain. Skor inheren hanya muncul sesudah kedua nilai dipilih.
5. Buka panel **Penilaian risiko residual** hanya jika pengendalian sudah dievaluasi. Kedua nilai residual boleh dibiarkan kosong.
6. Isi PIC, target penyelesaian, status, dan rencana mitigasi sesuai informasi faktual. Target tanggal tidak ditetapkan otomatis.
7. Klik **Simpan risiko**, kemudian periksa kartu register dan detail penilaian serta tindak lanjutnya.

NusaRiksa menghitung **risiko inheren** dari kemungkinan × dampak. Tingkat yang ditampilkan adalah acuan kerja internal:

| Skor | Tingkat risiko |
| --- | --- |
| 1–4 | Rendah |
| 5–9 | Sedang |
| 10–16 | Tinggi |
| 17–25 | Kritis |

Jika pengendalian telah dievaluasi, isi kemungkinan dan dampak **residual**. Biarkan kedua kolom kosong apabila belum dinilai; sistem tidak menganggap risiko yang belum dinilai sebagai risiko rendah.

Pilih risiko dari daftar untuk mengubah mitigasi, PIC, tenggat, atau status penanganannya. Riwayat pembaruan tetap tersimpan. Penutupan risiko membutuhkan mitigasi yang tercatat dan hasil residual yang memenuhi batas penutupan internal aplikasi. Penilaian dan keputusan akhir tetap merupakan tanggung jawab pejabat berwenang.

## 6. Mencatat dan menangani insiden TI/siber

Buka **Insiden TI/Siber** untuk mendokumentasikan gangguan, kejadian keamanan, atau masalah lain yang memengaruhi sistem dan data.

### Melaporkan kejadian

1. Klik **Tambah insiden**.
2. Isi kode, judul, deskripsi, dan waktu ketika kejadian diketahui.
3. Pilih kategori dan tingkat keparahan.
4. Pilih aset terdampak serta risiko terkait jika memang ada dalam daftar.
5. Isi PIC dan uraian dampak yang diketahui.
6. Simpan laporan insiden.

Insiden baru dimulai dari status **Dilaporkan**.

### Mencatat tindakan dan menyelesaikan insiden

1. Buka insiden yang sedang ditangani.
2. Pada **Kronologi penanganan**, pilih jenis aktivitas: Observasi, Pengendalian, Pemulihan, atau Komunikasi.
3. Jelaskan tindakan yang benar-benar dilakukan dan waktu kejadian jika diketahui, lalu klik **Catat kronologi**.
4. Gunakan **Perbarui status / penanganan** untuk melanjutkan investigasi, mencatat pengendalian, atau memperbarui hasil pemulihan.
5. Sebelum menyatakan insiden **Dipulihkan**, isi akar penyebab dan hasil pemulihan.
6. Setelah penanganan selesai, ubah status menjadi **Ditutup**. Insiden yang telah ditutup dapat diarsipkan.

Kronologi yang sudah tersimpan tidak dihapus atau diedit. Jika perlu membetulkan informasi, tambahkan catatan koreksi baru agar jejak penanganan tetap dapat ditelusuri.

**Perhatikan:** pencatatan insiden di NusaRiksa **tidak otomatis mengirim laporan kepada OJK**. Petugas perlu memeriksa kewajiban pelaporan dan eskalasi berdasarkan jenis kejadian dan ketentuan yang berlaku.

## 7. Menindaklanjuti temuan pemeriksaan

Gunakan menu **Tindak Lanjut Temuan** untuk mengelola masalah yang perlu diperbaiki berdasarkan hasil pemeriksaan, catatan risiko, atau insiden.

1. Pilih **Tambah temuan**. Formulir dibagi menjadi tiga kelompok: **Temuan dan sumber pemeriksaan**, **Penanggung jawab dan target perbaikan**, serta **Hasil tindakan dan bukti**.
2. Isi judul dan kondisi yang benar-benar ditemukan. Kode dapat ditulis sendiri atau dibuat melalui **Buat saran kode**; periksa keunikannya. Pilih **prioritas** berdasarkan dampak aktual; formulir tidak menetapkan otomatis prioritas Sedang.
3. Pilih asal temuan secara eksplisit. Jika tersedia, tautkan ke **hasil kontrol asesmen**, **risiko**, atau **insiden** yang sudah tercatat. Pilih **Pemeriksaan langsung** untuk sumber yang diperiksa di luar daftar tersebut.
4. Tetapkan PIC, target penyelesaian, dan rencana perbaikan sesuai hasil pemeriksaan. Tidak ada tanggal, PIC, atau tindakan otomatis.
5. Temuan dapat **disimpan lebih dulu** meskipun pekerjaan belum selesai dan bukti belum tersedia. Perbarui hasil tindakan dan referensi bukti setelah petugas benar-benar menyelesaikannya.
6. Buka detail temuan untuk melihat **langkah berikutnya** dan tiga pemeriksaan kelengkapan: rencana tindakan, hasil tindakan, serta referensi bukti. Tombol **Ajukan pemeriksaan** baru aktif bagi pembuat temuan setelah ketiganya terisi minimal 10 karakter. Kelengkapan teks bukan bukti keberhasilan faktual.
7. Pemeriksa yang berbeda wajib memilih **Perbaikan telah diverifikasi** atau **Kembalikan untuk perbaikan** secara eksplisit, kemudian menulis hasil pemeriksaan. NusaRiksa tidak memilih keputusan verifikasi otomatis.
8. Jika dikembalikan, petugas meninjau catatan pemeriksa di **Riwayat tindak lanjut**, memperbarui hasil dan bukti, lalu mengajukan kembali. Temuan yang telah diverifikasi berstatus **Selesai** dan dapat diarsipkan.

Daftar temuan menampilkan kartu dengan judul, status, prioritas, PIC, target, dan sumber secara langsung. Pencarian dan filter dapat dibersihkan melalui **Reset filter**. Jumlah hasil menunjukkan **isi halaman saat ini**, bukan total temuan seluruh lembaga. Setiap pembaruan dan keputusan tetap tersedia dalam **Riwayat tindak lanjut**.

**Referensi bukti** berisi keterangan yang dapat ditelusuri, seperti nomor tiket, nama berita acara, atau lokasi dokumen internal. Kolom ini belum menggantikan pemeriksaan dokumen aslinya. Jangan mencantumkan kata sandi atau data nasabah yang tidak diperlukan.

## 8. Mengelola penyedia layanan dan kontrak TI

Buka **Vendor TI** untuk mencatat penyedia jasa, kontrak, serta hasil evaluasi layanan yang digunakan lembaga.

### Mencatat penyedia dan kontrak

1. Klik **Tambah penyedia**. Masukkan kode, nama penyedia, kategori layanan, tingkat kritikalitas, dan PIC internal.
2. Isi kontak penyedia apabila tersedia, lalu simpan.
3. Buka penyedia tersebut dan pilih **Tambah kontrak**.
4. Masukkan kode kontrak, nama layanan, nomor perjanjian, ruang lingkup, tanggal mulai dan berakhir, serta PIC.
5. Isi target ketersediaan dan target waktu respons **hanya jika tercantum dalam perjanjian**. Biarkan kosong jika tidak ada.
6. Klik **Simpan kontrak**.

Pada daftar penyedia dan detail kontrak, NusaRiksa menunjukkan kontrak yang masih berlaku, akan berakhir dalam 30 hari, atau sudah melewati tanggal berakhir. Penanda tersebut dihitung dari tanggal yang dimasukkan petugas, bukan dari konfirmasi langsung penyedia.

### Mencatat evaluasi layanan

1. Pilih kontrak yang akan dievaluasi.
2. Klik **Catat evaluasi**, kemudian masukkan periode penilaian.
3. Isi nilai ketersediaan dan waktu respons terukur berdasarkan laporan atau bukti yang benar-benar tersedia.
4. Tambahkan hasil pemeriksaan dan rencana tindak lanjut.
5. Klik **Simpan evaluasi**.

NusaRiksa membandingkan realisasi dengan target numerik yang diisi pada kontrak. Jika target atau pengukuran yang diperlukan belum tersedia, hasilnya ditampilkan sebagai **Belum dapat dinilai**. Perbandingan numerik tidak menggantikan penilaian seluruh ketentuan SLA atau kinerja penyedia.

Evaluasi yang telah disimpan menjadi catatan tetap. Sesudah ada evaluasi, periode kontrak dan target SLA tidak bisa diubah pada catatan yang sama. Untuk kontrak yang telah diakhiri, gunakan status **Diakhiri** dan arsipkan bila diperlukan. Data riwayat perjanjian maupun hasil evaluasi tetap tersimpan.

## 9. Dokumen bukti dan riwayat pemeriksaan

Untuk hasil pemeriksaan yang memerlukan bukti, unggah berkas yang sesuai dengan kontrol atau indikator. Gunakan dokumen yang memang berlaku di lembaga, periksa isinya sebelum mengunggah, dan jangan membuat bukti hanya untuk memenuhi kolom aplikasi.

Riwayat perubahan membantu petugas menelusuri kapan informasi diperbarui. Pada pengelolaan aset, risiko, dan insiden, gunakan tampilan detail untuk melihat catatan yang tersimpan.

Jangan memasukkan password, token akses, kunci enkripsi, atau data pribadi nasabah yang tidak diperlukan ke dalam catatan dan lampiran.

## 10. Jika mengalami kendala

| Kondisi | Tindakan yang disarankan |
| --- | --- |
| Tidak bisa masuk | Periksa email, kata sandi, dan kode verifikasi. Hubungi administrator bila akun belum diaktifkan. |
| Menu atau tombol tidak terlihat | Periksa apakah peran akun sudah sesuai dengan pekerjaan yang ditugaskan. |
| Perubahan gagal disimpan | Periksa isian wajib, lalu muat ulang data bila muncul pemberitahuan konflik perubahan. |
| Aset tidak muncul sebagai pilihan risiko/insiden | Pastikan aset tercatat dan belum diarsipkan. |
| Risiko tidak muncul sebagai pilihan insiden | Pastikan risiko masih aktif dan pilih aset yang sesuai jika risiko sudah tertaut ke aset tertentu. |
| Insiden tidak dapat ditutup | Periksa status sebelumnya serta kelengkapan akar penyebab dan hasil pemulihan. |
| Temuan tidak dapat diajukan | Periksa kelengkapan rencana, catatan hasil tindakan, dan referensi bukti. |
| Penyedia tidak bisa diarsipkan | Akhiri terlebih dahulu kontrak yang masih berstatus aktif. |
| Evaluasi vendor ditolak | Pastikan periode berada dalam masa kontrak dan realisasi hanya diisi untuk target SLA yang tercantum. |
| Tombol verifikasi tidak tersedia | Pastikan akun pemeriksa punya hak verifikasi dan bukan pembuat temuan. |
| Bukti tidak dapat dibuka atau diunggah | Hubungi administrator untuk memeriksa izin berkas dan konfigurasi penyimpanan bukti. |

## 11. Meninjau hasil sebelum digunakan

Gunakan hasil asesmen dan catatan operasional sebagai bahan pemeriksaan serta pengambilan keputusan internal. Sebelum menjadikannya dasar laporan eksternal, petugas yang berwenang perlu meninjau ketepatan data, bukti, perhitungan, dan ketentuan yang relevan.

Untuk bantuan instalasi, akun, atau konfigurasi server, hubungi administrator NusaRiksa di lembaga Anda.


## Rencana Pemulihan TI (BCP/DRP)

Buka **Rencana Pemulihan TI**, lalu pilih **Tambah rencana**. Daftar rencana menampilkan kode, layanan, PIC, status, target RTO/RPO, dan jumlah pengujian yang tercatat. Gunakan pencarian dan **Reset filter** bila diperlukan. Jumlah hasil menunjukkan isi halaman yang sedang ditampilkan, bukan total seluruh rencana.

Formulir rencana dibagi menjadi **empat kelompok pekerjaan**:

1. **Layanan dan gangguan:** pilih **Kerangka contoh** bila relevan lalu klik **Gunakan kerangka**. Contoh hanya membantu teks nama layanan, skenario, dampak, kriteria aktivasi, dan urutan langkah pemulihan. Periksa seluruh contoh berdasarkan keadaan dan kebijakan bank. Petugas dapat menulis rencana sendiri tanpa contoh. Kode rencana dapat disarankan dengan **Buat saran kode** dan harus unik sebelum disimpan.
2. **PIC dan sasaran pemulihan:** tetapkan PIC utama/pengganti. Isi **RTO** (target lama waktu memulihkan layanan) dan **RPO** (batas toleransi kehilangan data diukur dalam waktu) dalam satuan menit **hanya jika ditetapkan bank**. Keduanya independen; kolom kosong berarti **belum ditetapkan**, bukan nol menit atau tidak ada risiko.
3. **Prosedur pemulihan:** isi langkah pemulihan sesuai urutan kerja yang disetujui. Masukkan komunikasi, eskalasi, serta ketergantungan layanan bila sudah ditentukan.
4. **Dokumen pendukung:** catat referensi backup dan bukti nyata bila tersedia. Status **Draft** berarti masih disusun; **Dikelola** hanya status pencatatan, bukan pengesahan oleh Direksi maupun jaminan siap pulih.

Pilih salah satu rencana untuk melihat detailnya dalam tiga bagian: layanan/aktivasi, PIC/target, serta prosedur/dokumen. Teks **Langkah berikutnya** membantu mengingat apakah rencana belum diuji atau sudah memiliki riwayat pengujian.

Gunakan **Catat pengujian** hanya setelah pengujian sungguh dilaksanakan. Petugas **wajib memilih sendiri tanggal, metode, dan hasil pengujian**; NusaRiksa tidak memberikan hasil **Berhasil** secara otomatis. RTO/RPO aktual hanya diisi bila benar-benar terukur. Untuk hasil **Berhasil**, diperlukan bukti dan RTO aktual; jika target RPO pada rencana ada, RPO aktual juga wajib diukur. Pengujian berhasil harus memenuhi target yang ditetapkan. Riwayat pengujian bersifat permanen; koreksi ditambahkan sebagai catatan baru, tidak mengubah catatan lama.

Gunakan **Arsipkan** untuk rencana yang tidak lagi dipakai tanpa menghapus jejak perubahannya. **NusaRiksa tidak menjalankan prosedur pemulihan maupun mengesahkan kesiapan layanan secara otomatis.**


## Katalog TI bawaan dengan referensi POJK

Saat membuat asesmen internal, biarkan opsi **Gunakan katalog TI bawaan dan langsung mulai** aktif. NusaRiksa otomatis memasang 26 kontrol operasional yang sudah berisi pertanyaan, contoh evidence, dan referensi pasal terkait POJK 34/2025. Petugas cukup mengisi kondisi sebenarnya di bank dan melampirkan bukti yang relevan. Referensi pasal adalah acuan pendukung, bukan transkripsi hukum yang menggantikan pembacaan peraturan. Katalog lama dan seluruh assessment historis tetap dipertahankan.


## Aktivasi akun yang dipandu

Pada halaman masuk, gunakan tombol **Lihat** untuk memeriksa kata sandi jika perlu. Untuk akun baru, klik **Aktifkan akun**: langkah pertama memasukkan kode undangan dari administrator, lalu langkah kedua membuat dan mengonfirmasi kata sandi minimal 12 karakter. Informasi kecocokan kata sandi tampil sebelum tombol aktivasi aktif. Kode undangan baru diverifikasi oleh server saat proses aktivasi dikirim. Jangan membagikan kode undangan atau kata sandi melalui tangkapan layar.


## Alur penilaian PADK yang disederhanakan (draft)

Setelah membuat persiapan penilaian, NusaRiksa membuka **indikator pertama** dan mengarahkan fokus ke ruang kerja penilaian. Kerjakan satu indikator pada satu waktu: baca ringkasannya, buka tingkat kriteria yang ingin dibandingkan, periksa uraian terhadap sumber PADK, pilih **peringkat sementara**, tulis **justifikasi**, lalu tekan **Simpan & lanjut**. Ini adalah catatan kerja, bukan nilai yang sudah divalidasi regulator.

Gunakan **Cari yang belum lengkap** untuk melanjutkan indikator yang belum selesai. Pilihan **Cari atau pilih indikator lain** menyediakan pencarian nomor, kata kunci, dan filter status tanpa memenuhi layar awal. Jika ingin menambahkan bukti pada indikator yang sama, tekan **Simpan indikator ini**; bagian **Dokumen bukti pendukung** dapat dibuka setelah jawaban tersimpan. Rincian sumber, riwayat, review, simulasi, dan PDF draft disajikan sebagai bagian lanjutan yang bisa dibuka bila diperlukan. Status kertas kerja internal tetap terlihat; dokumen dan skor resmi PADK/OJK tidak dihasilkan secara otomatis.


## Validasi catatan dan navigasi kontrol di Assessment Workspace

Saat memilih hasil selain **Memenuhi**, catatan pemeriksaan wajib berisi sekurangnya 10 karakter (setelah spasi awal dan akhir diabaikan). Pesan kesalahan ditampilkan **langsung di bawah kolom Catatan pemeriksaan**; kolom ditandai merah dan difokuskan jika pengguna mencoba menyimpan catatan yang belum valid. Setelah diperbaiki, penandaan kesalahan hilang secara langsung. Hasil **Memenuhi** tetap memperbolehkan catatan kosong. Validasi server tetap berlaku; tampilan hanya memberi panduan agar pengguna tidak kehilangan konteks akibat harus kembali ke atas halaman.

Pada layar desktop, area **Daftar kontrol** memanjang sampai bagian bawah workspace penilaian (sebelum bagian review internal), sementara isi daftar menggunakan scrollbar sendiri dan navigasinya tetap terlihat ketika layar digulir. Pada layar sempit, layout menjadi satu kolom dan daftar dibatasi tinggi agar editor tetap mudah dijangkau. Tidak ada perubahan pada hak akses, metode penyimpanan, atau hasil penilaian yang sudah tersimpan.


## Ekspor laporan asesmen TI internal

Pada menu **Laporan Asesmen**, pilih asesmen lalu buka laporannya. Tombol **Unduh PDF** menghasilkan kertas kerja untuk pemeriksaan, sementara **Unduh CSV (Excel)** menyediakan data kontrol dan catatan untuk dibuka di Excel atau aplikasi spreadsheet lain. CSV adalah format teks tabular, **bukan file .xlsx**. Unduhan didasarkan pada data tersimpan yang diambil ulang dari server (bukan filter tabel saat ini), memerlukan sesi aktif serta izin `reports:read`, dan tidak memerlukan penilaian 100% atau persetujuan sebelumnya. Sebelum status `approved`, header menyatakan **PRATINJAU INTERNAL**; setelah disetujui reviewer, **FINAL INTERNAL**. Keduanya mencantumkan peringatan bahwa dokumen bukan bukti kepatuhan/pengesahan resmi OJK.

Data laporan (termasuk catatan pemeriksaan) bisa bersifat sensitif. Server mengirim lampiran dengan `Cache-Control: no-store` dan `Content-Disposition: attachment`; file unduhan tetap menjadi tanggung jawab pengguna untuk disimpan di lokasi aman. Ekspor CSV memperlakukan seluruh kolom sebagai teks dan menetralkan awalan rumus yang berisiko mengeksekusi formula pada aplikasi spreadsheet. Status draft/final tidak boleh disamakan dengan hasil penilaian maturitas PADK yang masih menunggu verifikasi sumber.


## PDF laporan profesional V2

Ekspor **Laporan Asesmen TI** kini disajikan sebagai dokumen A4 dengan sampul, identitas lembaga, status pratinjau/final internal, ringkasan eksekutif, distribusi hasil kontrol, rincian jawaban beserta referensi, daftar kontrol yang perlu telaah tindak lanjut, ringkasan keputusan pemeriksa, dan ruang tanda tangan manual yang belum terisi. Kontrol yang tidak memiliki catatan tetap dinyatakan belum diisi; NusaRiksa tidak membuat skor kepatuhan dari persentase pengisian. Pengunduhan CSV untuk Excel tetap tersedia seperti sebelumnya.

PDF **Kertas Kerja PADK** juga menggunakan tampilan profesional A4: halaman identitas, status belum terverifikasi, progres 60/80 indikator, ringkasan lima domain (simulasi internal apabila datanya cukup), justifikasi yang benar-benar tersimpan, inventaris bukti, serta riwayat pemeriksaan draft. Dokumen asli bukti tidak disisipkan otomatis. Status regulator, penyampaian resmi, skor dan pengesahan resmi **tidak** dihasilkan. Penilaian yang belum lengkap menampilkan keterangan bahwa komposit simulasi belum tersedia. Bagian yang belum dikerjakan tidak diisi otomatis.

Nomor halaman dan footer dibentuk oleh PDF renderer A4, bukan membatasi setiap 53 baris teks. Untuk memeriksa kualitas, tinjau PDF hasil data pendek dan panjang; pastikan baris catatan tidak terpotong saat berganti halaman dan laporan tidak mengubah makna status draft/final.
