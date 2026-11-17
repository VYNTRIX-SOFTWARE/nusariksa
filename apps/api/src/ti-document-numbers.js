const DOCUMENT_TYPES=Object.freeze({
  asset:{prefix:'AST',table:'ti_assets',column:'asset_code'},
  incident:{prefix:'INC',table:'ti_incidents',column:'incident_code'},
});
export function formatTiDocumentNumber(kind,year,number){
  const def=DOCUMENT_TYPES[kind];
  if(!def||!Number.isSafeInteger(year)||year<2000||year>9999
    ||!Number.isSafeInteger(number)||number<1||number>999999)
    throw new TypeError('Nomor dokumen TI tidak valid');
  return def.prefix+'-'+year+'-'+String(number).padStart(6,'0');
}
/**
 * Must be called inside the same transaction as INSERT of the record.
 * Institution/year/type-scoped sequence is atomic under concurrent writers.
 */
export async function nextTiDocumentNumber(db,{actorId,kind}){
  const def=DOCUMENT_TYPES[kind];
  if(!def)throw new TypeError('Jenis nomor dokumen tidak valid');
  const result=await db.query(
    "WITH actor AS (SELECT institution_id FROM users WHERE id=$1 "+
    "AND status='active' AND password_hash IS NOT NULL), "+
    "now_year AS (SELECT EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Jakarta')::int AS y), "+
    "initial AS (SELECT actor.institution_id,now_year.y,coalesce(max("+
    // Codes from legacy/manual rows matching this exact format are considered.
    "CASE WHEN regexp_match(code,'^"+def.prefix+"-[0-9]{4}-[0-9]{6}$') IS NOT NULL "+
    "AND substring(code FROM 5 FOR 4)::int=now_year.y "+
    "THEN substring(code FROM 10 FOR 6)::int ELSE 0 END),0) AS n "+
    "FROM actor CROSS JOIN now_year LEFT JOIN "+
    (kind==='asset'?"ti_assets":"ti_incidents")+
    " legacy ON legacy.institution_id=actor.institution_id "+
    "CROSS JOIN LATERAL (SELECT legacy."+(kind==='asset'?'asset_code':'incident_code')+
    " AS code) v GROUP BY actor.institution_id,now_year.y) "+
    "INSERT INTO ti_document_number_counters(institution_id,document_kind,document_year,last_number) "+
    "SELECT institution_id,$2,y,n+1 FROM initial "+
    "ON CONFLICT(institution_id,document_kind,document_year) DO UPDATE "+
    "SET last_number=ti_document_number_counters.last_number+1 "+
    "RETURNING document_year,last_number",
    [actorId,kind],
  );
  if(result.rowCount!==1)throw new Error('Tidak dapat mengalokasikan nomor dokumen');
  return formatTiDocumentNumber(kind,Number(result.rows[0].document_year),
    Number(result.rows[0].last_number));
}
