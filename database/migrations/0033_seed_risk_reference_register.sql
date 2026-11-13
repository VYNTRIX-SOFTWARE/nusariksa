-- Reusable NusaRiksa risk scenarios: factual ratings and institution findings are never seeded.
CREATE TABLE ti_risk_reference_catalog (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  group_name text NOT NULL,
  title text NOT NULL,
  scenario text NOT NULL,
  review_guidance text NOT NULL,
  control_options text NOT NULL,
  version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO ti_risk_reference_catalog(code,group_name,title,scenario,review_guidance,control_options,version)
VALUES
  ('CBS_GANGGUAN','Layanan core banking','Gangguan layanan core banking','Gangguan aplikasi atau infrastruktur core banking berpotensi menghentikan transaksi dan layanan nasabah.','Tinjau histori downtime, ketergantungan aplikasi dan jalur eskalasi.','Evaluasi monitoring layanan, prosedur insiden, dan uji failover.','1.0'),
  ('CBS_DATA','Layanan core banking','Kerusakan atau inkonsistensi database CBS','Kerusakan data atau kegagalan sinkronisasi database CBS berpotensi mengganggu integritas transaksi dan laporan bank.','Periksa rekonsiliasi transaksi, kontrol perubahan data dan hasil verifikasi konsistensi.','Pertimbangkan backup yang teruji, validasi data dan rekonsiliasi berkala.','1.0'),
  ('CBS_INTEGRASI','Layanan core banking','Kegagalan integrasi sistem transaksi','Gangguan pertukaran data antara CBS dan aplikasi pendukung berpotensi menyebabkan transaksi tertunda atau data tidak konsisten.','Periksa log pertukaran, transaksi gagal dan proses penanganan selisih.','Gunakan antrean retry terkendali, idempotency dan rekonsiliasi.','1.0'),
  ('BACKUP_GAGAL','Backup dan pemulihan','Kegagalan proses backup','Backup tidak berhasil atau media salinan tidak tersedia saat diperlukan sehingga pemulihan layanan dan data terhambat.','Periksa jadwal backup, log hasil, retensi dan lokasi salinan.','Pantau keberhasilan backup dan uji pemulihan salinan terpisah.','1.0'),
  ('RESTORE_UJI','Backup dan pemulihan','Pemulihan data belum teruji','Prosedur restore belum diuji secara memadai sehingga durasi dan keberhasilan pemulihan layanan kritis tidak diketahui.','Periksa berita acara uji restore dan pencapaian RTO/RPO internal.','Susun jadwal restore drill dan tindak lanjut kegagalan pengujian.','1.0'),
  ('RANSOMWARE','Keamanan siber','Serangan ransomware pada perangkat TI','Malware dapat mengenkripsi atau menghambat akses data serta layanan TI penting dan memengaruhi kelangsungan operasional.','Periksa cakupan endpoint, patch, hak akses dan kesiapan pemulihan.','Evaluasi segmentasi, endpoint protection dan backup terisolasi.','1.0'),
  ('AKSES_TIDAK_SAH','Keamanan siber','Akses tidak sah ke sistem bank','Akun atau hak akses yang tidak sesuai dapat disalahgunakan untuk melihat, mengubah, atau mengambil data sensitif.','Periksa review hak akses, akun bersama dan akses istimewa.','Terapkan least privilege, MFA dan review akses periodik.','1.0'),
  ('PHISHING','Keamanan siber','Pengambilalihan akun akibat phishing','Pengguna dapat menyerahkan kredensial melalui pesan palsu sehingga akun dan layanan internal berisiko disalahgunakan.','Periksa laporan percobaan phishing dan perlindungan akun.','Lakukan edukasi, pelaporan phishing dan MFA.','1.0'),
  ('KEBOCORAN_DATA','Data dan privasi','Kebocoran data nasabah atau operasional','Kesalahan konfigurasi, pengiriman, atau pengendalian akses berpotensi membuat data rahasia terekspos tanpa izin.','Periksa alur pertukaran data, daftar akses dan klasifikasi informasi.','Evaluasi kontrol akses, enkripsi, pembatasan ekspor dan audit log.','1.0'),
  ('PERANGKAT_HILANG','Data dan privasi','Kehilangan perangkat kerja berisi data bank','Perangkat yang hilang atau dicuri dapat mengakibatkan akses tidak sah apabila penyimpanan dan akses tidak dilindungi.','Periksa inventaris perangkat dan kebijakan penyimpanan data lokal.','Gunakan enkripsi perangkat, penguncian layar dan prosedur pelaporan kehilangan.','1.0'),
  ('JARINGAN_PUTUS','Infrastruktur','Gangguan koneksi jaringan atau internet','Terputusnya jalur jaringan atau koneksi antar-kantor berpotensi menghambat penggunaan sistem dan layanan transaksi.','Periksa titik kegagalan koneksi, status router dan histori gangguan.','Pertimbangkan link cadangan, monitoring jaringan dan prosedur kontingensi.','1.0'),
  ('LISTRIK','Infrastruktur','Gangguan listrik pada layanan kritis','Pemadaman atau kegagalan UPS dapat menyebabkan perangkat penting berhenti dan memicu kerusakan atau kehilangan data.','Periksa kapasitas UPS, hasil pengujian dan riwayat pemadaman.','Lakukan pemeliharaan UPS, uji genset dan prosedur shutdown aman.','1.0'),
  ('PATCH_TERTUNDA','Infrastruktur','Pembaruan keamanan sistem tertunda','Kerentanan yang tidak ditangani pada server atau endpoint dapat dimanfaatkan untuk mengganggu layanan atau mengambil data.','Periksa inventaris versi, kerentanan terbuka dan persetujuan pengecualian.','Kelola patch berkala, pengujian perubahan dan mitigasi sementara.','1.0'),
  ('VENDOR_LAYANAN','Penyedia jasa TI','Gangguan layanan penyedia TI','Kegagalan layanan atau dukungan vendor dapat menghambat operasional dan memperpanjang pemulihan layanan yang bergantung padanya.','Periksa kontrak, SLA dan catatan eskalasi gangguan penyedia.','Pantau SLA, lakukan evaluasi vendor dan siapkan prosedur alternatif.','1.0'),
  ('VENDOR_AKSES','Penyedia jasa TI','Akses vendor tidak terkendali','Akses jarak jauh penyedia jasa yang tidak dibatasi atau diawasi dapat meningkatkan risiko perubahan sistem dan kebocoran data.','Periksa akun remote vendor, masa berlaku dan rekaman aktivitas.','Batasi remote access, terapkan MFA serta pencatatan sesi.','1.0'),
  ('KOLEKSI_SYNC','Aplikasi lapangan','Kegagalan sinkronisasi transaksi lapangan','Gangguan komunikasi aplikasi petugas lapangan dengan sistem pusat berpotensi menimbulkan keterlambatan atau selisih data transaksi.','Periksa ketertelusuran transaksi offline, antrean sinkronisasi dan rekonsiliasi.','Terapkan identitas transaksi unik, audit trail dan rekonsiliasi harian.','1.0'),
  ('PERUBAHAN_SISTEM','Perubahan dan operasional','Perubahan sistem tanpa pengujian memadai','Perubahan konfigurasi atau aplikasi yang tidak diuji berpotensi mengganggu proses transaksi dan pelaporan.','Periksa persetujuan perubahan, uji regresi dan prosedur rollback.','Gunakan change approval, staging, dan rollback teruji.','1.0'),
  ('PENGELOLAAN_AKUN','Akses dan identitas','Akun pegawai yang tidak segera dinonaktifkan','Akun personel yang sudah tidak berwenang tetapi masih aktif dapat menyebabkan akses tidak sah terhadap aplikasi dan data bank.','Periksa daftar pegawai mutasi/keluar dan waktu pencabutan akun.','Integrasikan offboarding dengan pencabutan akses serta review akun.','1.0'),
  ('MFA_LEMAH','Akses dan identitas','Akses penting tanpa autentikasi kuat','Akun dengan hak istimewa tanpa perlindungan autentikasi yang memadai berpotensi disalahgunakan ketika kredensial bocor.','Periksa cakupan MFA pada admin, VPN dan akses vendor.','Aktifkan MFA berbasis risiko dan pembatasan akses istimewa.','1.0'),
  ('STORAGE_PENUH','Infrastruktur','Kapasitas storage layanan kritis habis','Kapasitas penyimpanan yang tidak terpantau dapat menyebabkan kegagalan transaksi, log, backup, atau layanan aplikasi.','Periksa tren kapasitas, threshold alarm dan kapasitas backup.','Pasang alert kapasitas, kuota dan prosedur ekspansi tervalidasi.','1.0'),
  ('LOG_TIDAK_ADA','Audit dan pemantauan','Aktivitas sistem tidak dapat ditelusuri','Log audit yang tidak tersedia atau tidak terlindungi menghambat deteksi dan investigasi perubahan atau akses tidak sah.','Periksa cakupan log aktivitas, retensi dan hak ubah log.','Simpan log secara terpusat, terbatas, dan dapat diaudit.','1.0'),
  ('KESALAHAN_OPERATOR','Operasional dan SDM','Kesalahan operasional pada sistem penting','Kesalahan input, prosedur, atau perubahan oleh petugas dapat menyebabkan gangguan layanan dan ketidakakuratan data.','Periksa SOP, pembatasan peran dan histori koreksi transaksi.','Gunakan maker-checker, validasi input dan pelatihan operasional.','1.0'),
  ('PENYEDIA_DARURAT','Penyedia jasa TI','Ketergantungan pada satu penyedia layanan','Konsentrasi dukungan pada satu penyedia dapat memperpanjang pemulihan ketika penyedia tidak tersedia atau kontraknya berakhir.','Periksa ketergantungan personel vendor dan klausul exit strategy.','Siapkan dokumentasi teknis, kontak eskalasi dan rencana transisi.','1.0'),
  ('KEJADIAN_FISIK','Kelangsungan layanan','Kerusakan ruang server akibat kejadian fisik','Banjir, kebakaran, atau gangguan lingkungan ruang server dapat merusak aset dan menghentikan layanan TI.','Periksa pengendalian lingkungan, proteksi fisik dan lokasi DR.','Evaluasi deteksi kebakaran, tata kelola akses fisik dan site cadangan.','1.0');

-- Institutional intake is an unassessed starting register, distinct from real scored risks.
CREATE TABLE ti_risk_reference_register (
  institution_id smallint NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  reference_code text NOT NULL REFERENCES ti_risk_reference_catalog(code) ON DELETE RESTRICT,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','not_applicable','adopted')),
  adopted_risk_id uuid,
  reviewed_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(institution_id,reference_code),
  UNIQUE(institution_id,adopted_risk_id),
  FOREIGN KEY(institution_id,adopted_risk_id)
    REFERENCES ti_risks(institution_id,id) ON DELETE RESTRICT,
  CHECK (
    (state='pending' AND adopted_risk_id IS NULL AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (state='not_applicable' AND adopted_risk_id IS NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    OR (state='adopted' AND adopted_risk_id IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);
CREATE INDEX ti_risk_reference_register_state_idx
  ON ti_risk_reference_register(institution_id,state,reference_code);

CREATE FUNCTION add_risk_reference_register_for_institution(target_institution smallint)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO ti_risk_reference_register(institution_id,reference_code)
    SELECT target_institution,code FROM ti_risk_reference_catalog
    ON CONFLICT(institution_id,reference_code) DO NOTHING;
END;
$$;

CREATE FUNCTION seed_risk_references_on_institution_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM add_risk_reference_register_for_institution(NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER institutions_seed_risk_reference_register
AFTER INSERT ON institutions FOR EACH ROW
EXECUTE FUNCTION seed_risk_references_on_institution_insert();

-- Existing installations receive the same starter register upon upgrade.
DO $$
DECLARE i record;
BEGIN
  FOR i IN SELECT id FROM institutions LOOP
    PERFORM add_risk_reference_register_for_institution(i.id);
  END LOOP;
END;
$$;
