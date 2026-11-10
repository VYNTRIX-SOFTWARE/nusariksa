-- Built-in operational checklist is an INTERNAL starter template, not an OJK instrument.
-- Existing custom catalogs and their published, immutable versions are never changed.
ALTER TABLE control_catalogs
  ADD COLUMN origin text NOT NULL DEFAULT 'custom'
  CHECK (origin IN ('custom','builtin'));

CREATE FUNCTION ensure_builtin_control_catalog(p_actor uuid) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_institution smallint;
  v_catalog uuid;
  v_version uuid;
BEGIN
  SELECT u.institution_id INTO v_institution
    FROM users u JOIN user_roles ur ON ur.user_id=u.id
    WHERE u.id=p_actor AND u.status='active'
      AND u.password_hash IS NOT NULL AND ur.role='SUPER_ADMIN';
  IF v_institution IS NULL THEN
    RAISE EXCEPTION 'Only an active institution administrator may seed the internal baseline';
  END IF;

  -- Idempotent. If a user previously chose the reserved code, do not overwrite it.
  INSERT INTO control_catalogs (institution_id,code,title,created_by,origin)
  VALUES (v_institution,'NUSARIKSA_BPR_INTERNAL',
    'Baseline Operasional TI BPR/BPRS (Template Internal)',p_actor,'builtin')
  ON CONFLICT (institution_id,code) DO NOTHING
  RETURNING id INTO v_catalog;

  IF v_catalog IS NULL THEN
    SELECT id INTO v_catalog FROM control_catalogs
      WHERE institution_id=v_institution AND code='NUSARIKSA_BPR_INTERNAL'
        AND origin='builtin';
    IF v_catalog IS NULL THEN RETURN NULL; END IF;
    SELECT id INTO v_version FROM control_catalog_versions
      WHERE catalog_id=v_catalog AND version=1 AND status='published';
    RETURN v_version;
  END IF;

  INSERT INTO control_catalog_versions(catalog_id,version,created_by)
    VALUES (v_catalog,1,p_actor) RETURNING id INTO v_version;

  INSERT INTO control_definitions(version_id,control_code,title,description,position)
  SELECT v_version,seed.control_code,seed.title,seed.description,seed.position
  FROM (VALUES
      ('GOV_01', 'Penanggung jawab dan pembagian tugas TI', 'Periksa apakah tanggung jawab pengelolaan TI, keamanan informasi dan pengawasan ditetapkan secara tertulis. Contoh bukti: struktur organisasi, SK penunjukan dan uraian tugas.', 1),
      ('GOV_02', 'Kebijakan dan prosedur operasional TI', 'Periksa keberadaan kebijakan TI serta SOP yang disetujui, disosialisasikan dan ditinjau berkala. Contoh bukti: kebijakan, SOP dan daftar revisi.', 2),
      ('GOV_03', 'Rencana kerja dan anggaran TI', 'Periksa rencana kegiatan, prioritas risiko, kapasitas serta kebutuhan anggaran TI. Contoh bukti: rencana kerja dan persetujuan manajemen.', 3),
      ('GOV_04', 'Evaluasi manajemen atas pengelolaan TI', 'Periksa apakah kinerja TI, insiden dan tindak lanjut risiko dibahas secara periodik oleh manajemen. Contoh bukti: notulen dan daftar tindak lanjut.', 4),
      ('AST_01', 'Inventaris aset dan aplikasi TI', 'Periksa inventaris perangkat, server, aplikasi, lisensi dan penanggung jawab aset yang masih digunakan. Contoh bukti: register inventaris yang diperbarui.', 5),
      ('AST_02', 'Klasifikasi sistem dan informasi penting', 'Identifikasi sistem dan data yang kritis untuk layanan bank beserta pemiliknya. Contoh bukti: daftar sistem kritis dan klasifikasi informasi.', 6),
      ('AST_03', 'Pengelolaan siklus hidup aset TI', 'Periksa proses pengadaan, penyerahan, perawatan, penghapusan dan pemusnahan media aset. Contoh bukti: berita acara serta log pemeliharaan.', 7),
      ('IAM_01', 'Pemberian dan pencabutan hak akses', 'Periksa proses permintaan, persetujuan, perubahan dan pencabutan akses pegawai. Contoh bukti: formulir akses dan daftar akun nonaktif.', 8),
      ('IAM_02', 'Penerapan hak akses minimum', 'Periksa kesesuaian peran pengguna dengan tugas kerja serta pemisahan kewenangan operasional. Contoh bukti: matriks hak akses dan daftar peran.', 9),
      ('IAM_03', 'Pengamanan akun istimewa dan autentikasi', 'Periksa pengendalian akun administrator, kebijakan kata sandi serta autentikasi tambahan jika tersedia. Contoh bukti: pengaturan autentikasi dan catatan akses admin.', 10),
      ('IAM_04', 'Peninjauan berkala hak akses', 'Periksa review akun dan kewenangan secara berkala oleh pemilik proses. Contoh bukti: hasil review dan tindak lanjut pencabutan akses.', 11),
      ('OPS_01', 'Pengendalian perubahan aplikasi dan infrastruktur', 'Periksa dokumentasi permintaan, pengujian, persetujuan dan pelaksanaan perubahan sistem. Contoh bukti: tiket perubahan dan hasil uji.', 12),
      ('OPS_02', 'Pemeliharaan, patch dan kerentanan', 'Periksa inventaris versi sistem, jadwal pembaruan, penilaian kerentanan dan penanganan temuan. Contoh bukti: catatan patch dan hasil pemeriksaan.', 13),
      ('OPS_03', 'Pencatatan log dan pemantauan layanan', 'Periksa log kejadian penting, pemantauan kegagalan layanan, kapasitas, dan tindak lanjut anomali. Contoh bukti: log terpilih dan laporan monitoring.', 14),
      ('OPS_04', 'Penanganan insiden teknologi informasi', 'Periksa prosedur pelaporan, eskalasi, pencatatan, respons dan evaluasi pascainsiden. Contoh bukti: register insiden dan berita acara tindak lanjut.', 15),
      ('DAT_01', 'Kebijakan dan pelaksanaan pencadangan data', 'Periksa cakupan, frekuensi, lokasi dan perlindungan backup untuk sistem penting. Contoh bukti: konfigurasi pekerjaan backup dan hasil monitoring.', 16),
      ('DAT_02', 'Pengujian pemulihan data cadangan', 'Periksa bukti uji restore yang memastikan data dan layanan dapat dipulihkan. Contoh bukti: skenario pengujian, hasil verifikasi dan tindakan perbaikan.', 17),
      ('DAT_03', 'Perlindungan informasi nasabah dan bank', 'Periksa pembatasan akses data, penanganan berkas sensitif dan penyimpanan sesuai klasifikasi. Contoh bukti: SOP, konfigurasi dan daftar akses.', 18),
      ('DAT_04', 'Perlindungan data saat disimpan dan dikirim', 'Periksa pengamanan komunikasi serta media penyimpanan data sensitif sesuai risiko. Contoh bukti: konfigurasi TLS, enkripsi atau kontrol pengganti.', 19),
      ('NET_01', 'Segmentasi jaringan operasional', 'Periksa pemisahan jaringan administrasi, pengguna, server dan akses tamu sesuai risiko. Contoh bukti: diagram jaringan dan aturan firewall.', 20),
      ('NET_02', 'Pengendalian akses jarak jauh', 'Periksa persetujuan, autentikasi, logging, dan pembatasan akses remote pegawai maupun penyedia jasa. Contoh bukti: daftar akun dan konfigurasi akses jarak jauh.', 21),
      ('NET_03', 'Perlindungan konektivitas internet dan perimeter', 'Periksa pengaturan firewall, pembatasan layanan terbuka serta pemantauan koneksi jaringan. Contoh bukti: konfigurasi dan hasil pemeriksaan port.', 22),
      ('BCP_01', 'Rencana keberlangsungan dan pemulihan TI', 'Periksa rencana penanganan gangguan layanan kritis, peran darurat, komunikasi dan prioritas pemulihan. Contoh bukti: dokumen BCP/DRP.', 23),
      ('BCP_02', 'Latihan dan evaluasi pemulihan gangguan', 'Periksa jadwal latihan, hasil uji skenario gangguan dan tindak lanjut kelemahan. Contoh bukti: laporan simulasi dan rencana perbaikan.', 24),
      ('VND_01', 'Pengelolaan penyedia jasa teknologi informasi', 'Periksa penilaian risiko vendor, kontrak, SLA, kewajiban keamanan dan evaluasi kinerja. Contoh bukti: perjanjian layanan dan berita acara evaluasi.', 25),
      ('VND_02', 'Pengendalian akses dan perubahan oleh vendor', 'Periksa otorisasi akses vendor, pemantauan aktivitas, penghapusan akses serta dokumentasi perubahan oleh pihak ketiga. Contoh bukti: log akses dan tiket kerja.', 26)
  ) AS seed(control_code,title,description,position);

  -- Published versions and controls are immutable by existing database triggers.
  UPDATE control_catalog_versions
    SET status='published',published_at=now()
    WHERE id=v_version;
  RETURN v_version;
END;
$$;

-- Backfill the single existing installation. A fresh installation runs bootstrap later.
DO $$
DECLARE
  v_admin uuid;
BEGIN
  SELECT u.id INTO v_admin
    FROM users u JOIN user_roles ur ON ur.user_id=u.id
    WHERE u.status='active' AND u.password_hash IS NOT NULL
      AND ur.role='SUPER_ADMIN'
    ORDER BY u.created_at,u.id LIMIT 1;
  IF v_admin IS NOT NULL THEN
    PERFORM ensure_builtin_control_catalog(v_admin);
  END IF;
END;
$$;
