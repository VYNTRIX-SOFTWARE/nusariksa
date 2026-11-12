-- Katalog terpisah dengan rujukan pasal terkait, tanpa mengubah katalog lama.
-- Kontrol adalah interpretasi operasional internal, bukan kutipan pasal secara literal.
CREATE FUNCTION ensure_referenced_control_catalog(p_actor uuid) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
 v_institution smallint;
 v_legacy uuid;
 v_catalog uuid;
 v_origin text;
 v_version uuid;
 v_status text;
 v_count integer;
BEGIN
 SELECT u.institution_id INTO v_institution
 FROM users u JOIN user_roles ur ON ur.user_id=u.id
 WHERE u.id=p_actor AND u.status='active' AND u.password_hash IS NOT NULL
 AND ur.role='SUPER_ADMIN';
 IF v_institution IS NULL THEN
  RAISE EXCEPTION 'Only an active institution administrator may seed the referenced baseline';
 END IF;
 PERFORM pg_advisory_xact_lock(8472933,v_institution::integer);
 v_legacy:=ensure_builtin_control_catalog(p_actor);
 IF v_legacy IS NULL OR
    (SELECT count(*) FROM control_definitions WHERE version_id=v_legacy)<>26 THEN
  RAISE EXCEPTION 'Legacy baseline is unavailable or incomplete';
 END IF;
 INSERT INTO control_catalogs(institution_id,code,title,created_by,origin)
 VALUES(v_institution,'NUSARIKSA_TI_REFERENSI',
  'Checklist Operasional TI BPR/BPRS - Acuan POJK 34/2025 (Internal)',p_actor,'builtin')
 ON CONFLICT (institution_id,code) DO NOTHING RETURNING id INTO v_catalog;
 IF v_catalog IS NULL THEN
  SELECT id,origin INTO v_catalog,v_origin FROM control_catalogs
  WHERE institution_id=v_institution AND code='NUSARIKSA_TI_REFERENSI';
  IF v_catalog IS NULL OR v_origin<>'builtin' THEN
   RAISE EXCEPTION 'Referenced baseline code is already reserved';
  END IF;
 END IF;
 SELECT id,status INTO v_version,v_status FROM control_catalog_versions
 WHERE catalog_id=v_catalog AND version=1;
 IF v_version IS NOT NULL THEN
  SELECT count(*)::integer INTO v_count FROM control_definitions
  WHERE version_id=v_version AND source_document='POJK Nomor 34 Tahun 2025'
  AND source_section IS NOT NULL;
  IF v_status<>'published' OR v_count<>26 THEN
   RAISE EXCEPTION 'Referenced baseline exists but is not valid';
  END IF;
  RETURN v_version;
 END IF;
 INSERT INTO control_catalog_versions(catalog_id,version,created_by)
 VALUES(v_catalog,1,p_actor) RETURNING id INTO v_version;
 INSERT INTO control_definitions(
  version_id,control_code,title,description,source_document,source_section,position)
 SELECT v_version,d.control_code,d.title,d.description,'POJK Nomor 34 Tahun 2025',
 CASE d.control_code
      WHEN 'GOV_01' THEN 'Pasal 3 dan Pasal 7'
      WHEN 'GOV_02' THEN 'Pasal 4 huruf b dan Pasal 6'
      WHEN 'GOV_03' THEN 'Pasal 2 ayat (3) dan Pasal 4 huruf a'
      WHEN 'GOV_04' THEN 'Pasal 4 huruf c dan Pasal 5'
      WHEN 'AST_01' THEN 'Pasal 23 ayat (2) huruf a'
      WHEN 'AST_02' THEN 'Pasal 16 ayat (3), Pasal 23 ayat (2) huruf a dan Pasal 35'
      WHEN 'AST_03' THEN 'Pasal 15 ayat (1)–(2) dan Pasal 23 ayat (2) huruf b'
      WHEN 'IAM_01' THEN 'Pasal 15 ayat (3)'
      WHEN 'IAM_02' THEN 'Pasal 7 ayat (6) dan Pasal 15 ayat (3)'
      WHEN 'IAM_03' THEN 'Pasal 15 ayat (1) dan ayat (3)'
      WHEN 'IAM_04' THEN 'Pasal 14 dan Pasal 15 ayat (3)'
      WHEN 'OPS_01' THEN 'Pasal 6 ayat (2) huruf b–c dan Pasal 14'
      WHEN 'OPS_02' THEN 'Pasal 14 dan Pasal 23 ayat (2) huruf a–b'
      WHEN 'OPS_03' THEN 'Pasal 23 ayat (2) huruf c dan Pasal 31 huruf e'
      WHEN 'OPS_04' THEN 'Pasal 23 ayat (2) huruf c–d'
      WHEN 'DAT_01' THEN 'Pasal 18 ayat (1)–(3)'
      WHEN 'DAT_02' THEN 'Pasal 16 ayat (2)–(4) dan Pasal 18'
      WHEN 'DAT_03' THEN 'Pasal 35 dan Pasal 36'
      WHEN 'DAT_04' THEN 'Pasal 15 ayat (1)–(2) dan Pasal 36'
      WHEN 'NET_01' THEN 'Pasal 15 ayat (1) dan Pasal 23 ayat (2) huruf b'
      WHEN 'NET_02' THEN 'Pasal 15 ayat (3) dan Pasal 27 ayat (2)'
      WHEN 'NET_03' THEN 'Pasal 15 ayat (1) dan Pasal 23 ayat (2) huruf b–c'
      WHEN 'BCP_01' THEN 'Pasal 16 ayat (1)–(2)'
      WHEN 'BCP_02' THEN 'Pasal 16 ayat (3)–(4)'
      WHEN 'VND_01' THEN 'Pasal 27 ayat (2)–(5)'
      WHEN 'VND_02' THEN 'Pasal 27 ayat (2) huruf g dan ayat (3)'
  ELSE NULL
 END,d.position
 FROM control_definitions d WHERE d.version_id=v_legacy ORDER BY d.position;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 IF v_count<>26 THEN RAISE EXCEPTION 'Expected exactly 26 referenced controls'; END IF;
 UPDATE control_catalog_versions SET status='published',published_at=now()
 WHERE id=v_version;
 RETURN v_version;
END;
$$;

-- Instalasi lama: backfill hanya untuk bank dengan SUPER_ADMIN aktif.
DO $$
DECLARE item record; v_admin uuid;
BEGIN
 FOR item IN SELECT DISTINCT c.institution_id FROM control_catalogs c
  WHERE c.code='NUSARIKSA_BPR_INTERNAL' AND c.origin='builtin'
 LOOP
  SELECT u.id INTO v_admin FROM users u JOIN user_roles ur ON ur.user_id=u.id
  WHERE u.institution_id=item.institution_id AND u.status='active'
    AND u.password_hash IS NOT NULL AND ur.role='SUPER_ADMIN'
  ORDER BY u.created_at,u.id LIMIT 1;
  IF v_admin IS NOT NULL THEN
   PERFORM ensure_referenced_control_catalog(v_admin);
  END IF;
 END LOOP;
END;
$$;
