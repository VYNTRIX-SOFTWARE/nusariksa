import {configureEvidenceKeys,encryptionKeyFor} from './evidence-keyring.js';

const STATE=Object.freeze({pass:'PASS',warn:'WARN',block:'BLOCK'});
const localHost=value=>['localhost','127.0.0.1','[::1]'].includes(value);
const checked=(id,state,note)=>({id,state,note});
function runtime(version){
  const match=/^v?(\d+)\.(\d+)\.(\d+)$/.exec(version??'');
  if(!match)return checked('node',STATE.block,'Versi Node.js tidak dikenali.');
  const [major,minor]=match.slice(1).map(Number);
  return major>=24&&major<27&&(major!==24||minor>=7)
    ?checked('node',STATE.pass,'Versi Node.js sesuai dukungan aplikasi.')
    :checked('node',STATE.block,'Gunakan Node.js versi >=24.7.0 dan <27.');
}
function origin(value){
  if(typeof value!=='string'||!value)
    return checked('app_origin',STATE.block,'APP_ORIGIN belum diatur.');
  try{
    const url=new URL(value);
    if(url.origin!==value||url.username||url.password||url.search||url.hash)
      throw new TypeError('Invalid origin');
    const local=localHost(url.hostname);
    if(url.protocol==='https:'||(url.protocol==='http:'&&local)){
      return checked('app_origin',local?STATE.pass:STATE.warn,
        local?'APP_ORIGIN untuk akses lokal sesuai.':
          'Pastikan HTTPS diakhiri oleh reverse proxy tepercaya dan akses langsung dibatasi.');
    }
  }catch{/* Tidak memaparkan isi origin ke output. */}
  return checked('app_origin',STATE.block,
    'APP_ORIGIN harus origin tunggal: HTTPS atau HTTP khusus loopback.');
}
function database(value){
  if(typeof value!=='string'||!value)
    return checked('database_config',STATE.block,'DATABASE_URL belum diatur.');
  try{
    const u=new URL(value);
    if(!['postgresql:','postgres:'].includes(u.protocol)||!u.hostname||
      !u.pathname||u.pathname==='/')
      throw new TypeError('Invalid database URL');
    if(localHost(u.hostname))
      return checked('database_config',STATE.pass,
        'Koneksi PostgreSQL disiapkan untuk host lokal.');
    if(u.searchParams.get('sslmode')==='verify-full')
      return checked('database_config',STATE.pass,
        'Koneksi PostgreSQL jarak jauh meminta verifikasi sertifikat dan hostname.');
    return checked('database_config',STATE.warn,
      'Koneksi PostgreSQL jarak jauh perlu transport terenkripsi dengan verifikasi sertifikat dan hostname.');
  }catch{/* Tidak menampilkan URL atau informasi autentikasi. */}
  return checked('database_config',STATE.block,'Format DATABASE_URL tidak valid.');
}
function keys(env){
  const configured=configureEvidenceKeys({
    legacyKey:env.EVIDENCE_ENCRYPTION_KEY,
    keysJson:env.EVIDENCE_KEYRING,
    activeId:env.EVIDENCE_ACTIVE_KEY_ID,
  });
  try{
    const writer=encryptionKeyFor(configured);
    const all=Buffer.isBuffer(configured)
      ?[configured]:Object.values(configured?.keys??{});
    if(configured?.legacyKey)all.push(configured.legacyKey);
    if(all.some(key=>key.every(byte=>byte===key[0])))
      return checked('evidence_keys',STATE.block,
        'Kunci bukti terlihat seperti nilai contoh berulang; gunakan kunci acak yang dikelola aman.');
    if(writer.keyId===null)
      return checked('evidence_keys',STATE.warn,
        'Kunci bukti legacy tersedia; rencanakan penggunaan keyring berversi dan backup semua kunci.');
    return checked('evidence_keys',STATE.pass,
      'Konfigurasi kunci bukti untuk unggahan baru valid secara struktur.');
  }catch{
    return checked('evidence_keys',STATE.block,
      'Kunci bukti belum tersedia atau konfigurasinya tidak valid.');
  }
}
function port(value){
  const n=Number(value??3000);
  return /^[0-9]+$/.test(String(value??3000))&&Number.isInteger(n)&&n>0&&n<=65535
    ?checked('port',STATE.pass,'Port aplikasi valid.')
    :checked('port',STATE.block,'PORT harus integer 1 sampai 65535.');
}
function synthetic(value){
  return value==='synthetic'
    ?checked('data_scope',STATE.pass,
      'Operator menyatakan pemeriksaan hanya menggunakan data sintetis.')
    :checked('data_scope',STATE.block,
      'Setel NUSARIKSA_PILOT_DATA_MODE=synthetic hanya untuk lingkungan dengan data uji.');
}
export function summarizePilotChecks(checks,{databaseRequested=false}={}){
  if(checks.some(c=>c.state===STATE.block))return 'BLOCKED';
  if(checks.some(c=>c.state===STATE.warn)||!databaseRequested)return 'REVIEW_REQUIRED';
  return 'PREFLIGHT_CHECKS_PASSED';
}
export function evaluatePilotConfiguration(env,version){
  const checks=[
    runtime(version),origin(env.APP_ORIGIN),database(env.DATABASE_URL),
    port(env.PORT),keys(env),synthetic(env.NUSARIKSA_PILOT_DATA_MODE),
  ];
  return {scope:'PILOT_PREFLIGHT_ONLY',checks,
    overall:summarizePilotChecks(checks),
    note:'Bukan persetujuan Go/No-Go, audit keamanan, atau bukti kesiapan produksi.'};
}
