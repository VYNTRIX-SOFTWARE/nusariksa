-- NusaRiksa internal maturity rubric v1. This is not the PADK/OJK instrument.
-- Seed occurs once for existing institutions and when the first user is activated.
-- All scores/ratings remain blank until a human creates an assessment.
CREATE FUNCTION seed_nusariksa_internal_maturity(
  target_institution smallint, creator uuid
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  model_uuid uuid;
  version_uuid uuid;
  domain_uuid uuid;
  item record;
  rank smallint;
BEGIN
  PERFORM pg_advisory_xact_lock(8472933, target_institution::integer);
  IF EXISTS (SELECT 1 FROM maturity_models
             WHERE institution_id=target_institution AND code='NUSARIKSA_INTERNAL') THEN
    RETURN;
  END IF;

  INSERT INTO maturity_models(institution_id,code,title,methodology_reference,created_by)
  VALUES(target_institution,'NUSARIKSA_INTERNAL','Maturitas Pengelolaan TI Internal NusaRiksa',
    'NusaRiksa Internal Maturity Methodology v1; bukan instrumen resmi PADK atau skor OJK',creator)
  RETURNING id INTO model_uuid;
  INSERT INTO maturity_model_versions(model_id,version,created_by)
  VALUES(model_uuid,1,creator) RETURNING id INTO version_uuid;

  FOR item IN
    SELECT * FROM (VALUES
      (1,'GOV_TI','Tata kelola dan kebijakan TI',
        'kebijakan TI, pembagian tanggung jawab dan persetujuan pengurus'),
      (2,'ACCESS_DATA','Pengendalian akses dan data',
        'hak akses, perlindungan data, pencatatan aktivitas dan peninjauan akses'),
      (3,'OPS_CHANGE','Operasional dan perubahan TI',
        'operasi harian, pengelolaan perubahan, pemeliharaan dan dokumentasi'),
      (4,'RESILIENCE','Ketahanan dan pemulihan layanan',
        'rekam cadang, pemulihan, uji pemulihan dan kelangsungan layanan kritis'),
      (5,'RISK_INCIDENT','Risiko dan insiden TI',
        'identifikasi risiko, pemantauan, respons insiden dan tindak lanjut'),
      (6,'VENDOR_AUDIT','Pengawasan vendor dan audit TI',
        'evaluasi penyedia jasa, pemantauan layanan, audit dan tindak lanjut temuan')
    ) AS domains(position,code,title,focus) ORDER BY position
  LOOP
    INSERT INTO maturity_domains(version_id,code,title,description,position)
    VALUES(version_uuid,item.code,item.title,
      'Rubrik internal; petugas memeriksa kondisi aktual serta bukti untuk: '||item.focus,
      item.position) RETURNING id INTO domain_uuid;
    FOR rank IN 0..5 LOOP
      INSERT INTO maturity_domain_levels(domain_id,level,criterion)
      VALUES(domain_uuid,rank,
        CASE rank
          WHEN 0 THEN 'Belum ditemukan penerapan atau bukti yang dapat diperiksa terkait '||item.focus||'.'
          WHEN 1 THEN 'Aktivitas terkait '||item.focus||' dilakukan secara ad hoc, bergantung individu dan belum terdokumentasi konsisten.'
          WHEN 2 THEN 'Terdapat prosedur atau catatan awal untuk '||item.focus||', tetapi penerapan dan bukti masih parsial.'
          WHEN 3 THEN 'Prosedur '||item.focus||' ditetapkan, dijalankan konsisten, dan didukung bukti aktual yang dapat ditelusuri.'
          WHEN 4 THEN 'Penerapan '||item.focus||' diukur atau dikaji ulang berkala, dengan temuan dan tindakan korektif terdokumentasi.'
          WHEN 5 THEN 'Hasil pengukuran '||item.focus||' menunjukkan perbaikan berkelanjutan yang dapat dibuktikan melalui evaluasi, pengujian, dan tindak lanjut.'
        END
      );
    END LOOP;
  END LOOP;

  INSERT INTO maturity_aggregation_policies(version_id,method,configured_by)
  VALUES(version_uuid,'minimum',creator);
  UPDATE maturity_model_versions
    SET status='published',published_at=now() WHERE id=version_uuid;
END;
$$;

CREATE FUNCTION seed_nusariksa_internal_on_activation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='active' AND NEW.password_hash IS NOT NULL THEN
    PERFORM seed_nusariksa_internal_maturity(NEW.institution_id,NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER users_seed_nusariksa_maturity
AFTER INSERT OR UPDATE OF status,password_hash ON users
FOR EACH ROW EXECUTE FUNCTION seed_nusariksa_internal_on_activation();

-- Backfill installed workspaces on upgrade without altering user-created models.
DO $$
DECLARE account record;
BEGIN
  FOR account IN
    SELECT DISTINCT ON (institution_id) id,institution_id
    FROM users WHERE status='active' AND password_hash IS NOT NULL
    ORDER BY institution_id,created_at,id
  LOOP
    PERFORM seed_nusariksa_internal_maturity(account.institution_id,account.id);
  END LOOP;
END;
$$;
