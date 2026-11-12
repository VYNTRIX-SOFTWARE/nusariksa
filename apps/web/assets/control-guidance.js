// Read-only guidance for NusaRiksa's immutable 26-control INTERNAL baseline.
// Editorial prompts map to related POJK provisions; they are not verbatim legal text.
// UI uses POJK 34/2025 and PADK 43/2025 as baseline assessment standards.
export const POJK_34_SOURCE='https://www.ojk.go.id/id/regulasi/Pages/POJK-34-Tahun-2025-Penyelenggaraan-Teknologi-Informasi-oleh-Bank-Perekonomian-Rakyat-dan-Bank-Perekonomian-Rakyat-Syariah.aspx';
export const PADK_43_SOURCE='https://ojk.go.id/id/regulasi/Pages/PADK-43-PADK03-2025-Penyelenggaraan-Teknologi-Informasi-oleh-BPR-BPRS.aspx';
export const BUILTIN_CATALOG_CODE='NUSARIKSA_BPR_INTERNAL';
export const REFERENCED_CATALOG_CODE='NUSARIKSA_TI_REFERENSI';
const ENTRIES=[
  [
    "GOV_01",
    "Siapa yang ditunjuk mengelola dan mengawasi TI, dan apakah tugas serta independensinya terdokumentasi?",
    [
      "SK penugasan atau struktur organisasi TI",
      "Uraian tugas dan garis pelaporan"
    ],
    "Pasal 3 dan Pasal 7",
    "Kebutuhan satuan kerja/fungsi berbeda menurut layanan digital dan kompleksitas bank."
  ],
  [
    "GOV_02",
    "Apakah kebijakan dan SOP TI disahkan, berlaku untuk operasional, dan ditinjau ulang secara berkala?",
    [
      "Kebijakan/SOP TI yang disetujui",
      "Catatan sosialisasi, evaluasi dan revisi SOP"
    ],
    "Pasal 4 huruf b dan Pasal 6",
    "Cakupan minimum SOP termasuk operasional, jaringan, keamanan, DRP, audit dan vendor."
  ],
  [
    "GOV_03",
    "Apakah rencana pengembangan/pengadaan TI terkait kebutuhan bisnis dan mendapat persetujuan?",
    [
      "Rencana kerja dan anggaran TI",
      "Dokumen pengadaan atau persetujuan Direksi"
    ],
    "Pasal 2 ayat (3) dan Pasal 4 huruf a",
    "Sesuaikan skala usaha dan kompleksitas, bukan memaksakan investasi seragam."
  ],
  [
    "GOV_04",
    "Apakah Direksi/Komisaris memantau kinerja penyelenggaraan TI dan tindak lanjutnya?",
    [
      "Notulen evaluasi atau laporan kinerja TI",
      "Register tindak lanjut beserta penanggung jawab"
    ],
    "Pasal 4 huruf c dan Pasal 5",
    "Bukti diskusi manajemen dan tindakan perbaikan lebih penting daripada format laporan."
  ],
  [
    "AST_01",
    "Apakah aset, aplikasi inti, jaringan dan perangkat TI yang aktif diinventaris serta diketahui pemiliknya?",
    [
      "Inventaris aset dan aplikasi aktif",
      "Daftar penanggung jawab atau pemilik sistem"
    ],
    "Pasal 23 ayat (2) huruf a",
    "Inventaris adalah langkah operasional untuk mengidentifikasi aset; bukan kutipan template wajib."
  ],
  [
    "AST_02",
    "Apakah aplikasi serta data kritikal bank telah ditetapkan untuk pengendalian dan pemulihan?",
    [
      "Daftar layanan/aplikasi kritikal",
      "Klasifikasi informasi dan analisis dampak bisnis"
    ],
    "Pasal 16 ayat (3), Pasal 23 ayat (2) huruf a dan Pasal 35",
    "Penetapan kekritisan dipakai untuk menentukan prioritas pemulihan."
  ],
  [
    "AST_03",
    "Apakah serah-terima, pemeliharaan dan penghapusan aset dilaksanakan secara terkendali?",
    [
      "Berita acara perpindahan dan penghapusan aset",
      "Log pemeliharaan dan prosedur pemusnahan media"
    ],
    "Pasal 15 ayat (1)–(2) dan Pasal 23 ayat (2) huruf b",
    "Ini panduan praktis pengamanan aset; tidak semua langkah merupakan bunyi literal pasal."
  ],
  [
    "IAM_01",
    "Apakah hak akses diberikan dengan persetujuan dan dicabut saat petugas pindah tugas atau berhenti?",
    [
      "Form permintaan/persetujuan akses",
      "Daftar akun aktif/nonaktif atau log pencabutan"
    ],
    "Pasal 15 ayat (3)",
    "Jangan mengunggah kata sandi, token aktif, atau data pribadi tanpa redaksi."
  ],
  [
    "IAM_02",
    "Apakah hak pengguna teller, admin CBS dan fungsi lain mengikuti tugas serta pembatasan yang disetujui?",
    [
      "Matriks kewenangan pengguna sistem",
      "Hasil pemeriksaan hak akses berbasis jabatan"
    ],
    "Pasal 7 ayat (6) dan Pasal 15 ayat (3)",
    "Pastikan pemisahan fungsi penyelenggara TI dari fungsi yang tidak boleh digabung."
  ],
  [
    "IAM_03",
    "Apakah akun administrator dibatasi, diautentikasi secara memadai, dan aktivitasnya dapat ditinjau?",
    [
      "Daftar akun privilese yang telah disamarkan",
      "Kebijakan autentikasi dan catatan login admin"
    ],
    "Pasal 15 ayat (1) dan ayat (3)",
    "MFA merupakan contoh kontrol berbasis risiko; jangan mengklaim pasal memerintahkan MFA untuk semua akun."
  ],
  [
    "IAM_04",
    "Apakah hak akses pengguna ditinjau ulang dan temuan ketidaksesuaian ditindaklanjuti?",
    [
      "Hasil review daftar akses",
      "Bukti koreksi atau pencabutan akses berlebih"
    ],
    "Pasal 14 dan Pasal 15 ayat (3)",
    "Tentukan interval review sesuai risiko dan kebijakan internal bank."
  ],
  [
    "OPS_01",
    "Apakah perubahan aplikasi/CBS, server atau jaringan diuji dan disetujui sebelum digunakan?",
    [
      "Tiket perubahan, uji dan persetujuan",
      "Rencana rollback atau berita acara implementasi"
    ],
    "Pasal 6 ayat (2) huruf b–c dan Pasal 14",
    "Checklist ini merupakan contoh kontrol untuk memenuhi pengelolaan operasional TI."
  ],
  [
    "OPS_02",
    "Apakah patch dan kerentanan sistem dicatat serta ditangani berdasarkan prioritas risiko?",
    [
      "Daftar versi dan jadwal patch",
      "Hasil pemeriksaan kerentanan beserta tindak lanjut"
    ],
    "Pasal 14 dan Pasal 23 ayat (2) huruf a–b",
    "Jangan unggah data akses sensitif atau detail eksploitasi yang tidak perlu."
  ],
  [
    "OPS_03",
    "Apakah aktivitas layanan, sistem inti dan kejadian keamanan dipantau serta tersedia log relevan?",
    [
      "Ringkasan log layanan yang telah disamarkan",
      "Laporan monitoring dan tindak lanjut gangguan"
    ],
    "Pasal 23 ayat (2) huruf c dan Pasal 31 huruf e",
    "Pasal 31 secara khusus mengatur kemampuan log aktivitas Aplikasi Inti Perbankan."
  ],
  [
    "OPS_04",
    "Apakah insiden TI/siber memiliki alur deteksi, respons, eskalasi dan pencatatan pemulihan?",
    [
      "Prosedur penanganan insiden dan kontak eskalasi",
      "Register insiden serta laporan penanganan"
    ],
    "Pasal 23 ayat (2) huruf c–d",
    "Bedakan insiden operasional biasa dengan insiden yang memenuhi kriteria pelaporan regulasi."
  ],
  [
    "DAT_01",
    "Apakah data aktivitas bank direkam cadang setiap akhir hari dan status backup ditinjau?",
    [
      "Jadwal backup akhir hari dan log hasil",
      "Kebijakan penyimpanan dan perlindungan cadangan"
    ],
    "Pasal 18 ayat (1)–(3)",
    "POJK menyebut rekam cadang seluruh data aktivitas pada akhir hari. Periksa cakupan sebenarnya."
  ],
  [
    "DAT_02",
    "Apakah pemulihan dari backup pernah diuji dan hasilnya membuktikan data dapat dibuka?",
    [
      "Berita acara uji restore dan pemeriksaan data",
      "Hasil tindakan korektif dari uji pemulihan"
    ],
    "Pasal 16 ayat (2)–(4) dan Pasal 18",
    "Uji DRP kritikal: sedikitnya 1 kali/2 tahun bagi layanan digital, 1 kali/3 tahun bagi lainnya; cek konteksnya."
  ],
  [
    "DAT_03",
    "Apakah data pribadi/nasabah dikelola dan diakses menurut kebijakan serta prinsip perlindungan data?",
    [
      "Kebijakan klasifikasi/pengelolaan data",
      "Catatan akses dan prosedur perlindungan data pribadi"
    ],
    "Pasal 35 dan Pasal 36",
    "Redaksi/anonimkan contoh; jangan pernah mengunggah data nasabah asli hanya untuk mengisi template."
  ],
  [
    "DAT_04",
    "Apakah komunikasi dan penyimpanan data penting terlindungi sesuai risiko dan klasifikasi?",
    [
      "Ringkasan pengaturan transport/enkripsi tanpa secret",
      "SOP pengelolaan media/akses data sensitif"
    ],
    "Pasal 15 ayat (1)–(2) dan Pasal 36",
    "TLS atau enkripsi tertentu adalah contoh implementasi, bukan mandat teknis tunggal di pasal ini."
  ],
  [
    "NET_01",
    "Apakah jaringan pengguna, server inti dan akses tamu dipisahkan sesuai hasil penilaian risiko?",
    [
      "Diagram zona jaringan yang disanitasi",
      "Ringkasan aturan akses antar-zona tanpa kredensial"
    ],
    "Pasal 15 ayat (1) dan Pasal 23 ayat (2) huruf b",
    "Segmentasi jaringan adalah salah satu kontrol berbasis risiko, bukan pengaturan topologi baku dari POJK."
  ],
  [
    "NET_02",
    "Apakah akses remote petugas/vendor memiliki otorisasi, batasan, dan log yang bisa ditinjau?",
    [
      "Daftar akses remote yang disamarkan",
      "Prosedur persetujuan dan contoh log sesi"
    ],
    "Pasal 15 ayat (3) dan Pasal 27 ayat (2)",
    "Jika vendor mengakses data bank, evaluasi juga kewajiban pengawasan dan kerahasiaan."
  ],
  [
    "NET_03",
    "Apakah firewall dan layanan internet terbuka dikendalikan serta anomali jaringan dipantau?",
    [
      "Ringkasan kebijakan firewall dan port terbuka",
      "Laporan monitoring atau peninjauan konfigurasi"
    ],
    "Pasal 15 ayat (1) dan Pasal 23 ayat (2) huruf b–c",
    "Rincian IP publik/konfigurasi sensitif sebaiknya disamarkan pada dokumen bukti."
  ],
  [
    "BCP_01",
    "Apakah tersedia DRP yang menjelaskan prioritas pemulihan, tanggung jawab, dan komunikasi saat gangguan?",
    [
      "DRP disetujui serta daftar layanan kritikal",
      "Rencana pemulihan dan daftar penanggung jawab"
    ],
    "Pasal 16 ayat (1)–(2)",
    "Kewajiban Pusat Pemulihan Bencana memiliki kondisi khusus: Pasal 17, termasuk layanan digital atau modal inti ≥ Rp50 miliar."
  ],
  [
    "BCP_02",
    "Apakah DRP sudah diuji bersama pengguna TI dan direvisi sesuai hasil pengujian?",
    [
      "Jadwal dan laporan uji DRP",
      "Catatan peserta uji dan tinjauan DRP"
    ],
    "Pasal 16 ayat (3)–(4)",
    "Frekuensi uji dan tinjau paling sedikit 1 kali/2 tahun untuk layanan digital; 1 kali/3 tahun untuk lainnya."
  ],
  [
    "VND_01",
    "Apakah vendor TI dipilih, diikat kontrak/SLA, dan dipantau berdasarkan risiko serta manfaat?",
    [
      "Kontrak/SLA dan due diligence vendor",
      "Evaluasi kinerja serta daftar tindak lanjut vendor"
    ],
    "Pasal 27 ayat (2)–(5)",
    "Periksa kewajiban badan hukum berkedudukan di Indonesia serta ketentuan khusus BPRS jika relevan."
  ],
  [
    "VND_02",
    "Apakah akses vendor, perubahan, subkontrak, pemulihan dan penghentian layanan dikendalikan?",
    [
      "Persetujuan akses/tiket perubahan vendor",
      "Kontrak dengan kontrol keamanan, DRP, subkontrak dan exit clause"
    ],
    "Pasal 27 ayat (2) huruf g dan ayat (3)",
    "Penerapan subkontrak memerlukan persetujuan tertulis; penilaian tetap berdasarkan kondisi kontrak dan operasional bank."
  ]
];
const GUIDE=Object.freeze(Object.fromEntries(ENTRIES.map(([code,question,evidence,reference,caution])=>[
  code,Object.freeze({code,question,evidence:Object.freeze([...evidence]),reference,caution}),
])));
export const GUIDANCE_CODES=Object.freeze(Object.keys(GUIDE));
export function guideForControl(catalogCode,controlCode){
  return (catalogCode===BUILTIN_CATALOG_CODE||catalogCode===REFERENCED_CATALOG_CODE)
    &&typeof controlCode==='string'&&Object.hasOwn(GUIDE,controlCode)
    ?GUIDE[controlCode]:null;
}
// Never put presumed findings or a compliant rating into a draft.
export function composeObservedNote({condition,evidence,followUp}={}){
  const clean=(v)=>typeof v==='string'?v.trim():null;
  const state=clean(condition),proof=clean(evidence),next=clean(followUp);
  if(!state||state.length<10||!proof||proof.length<5||next===null
    ||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test([state,proof,next].join(' ')))
    throw new TypeError('Isi temuan aktual dan bukti yang sudah diperiksa.');
  const text='Kondisi aktual: '+state+'\nBukti diperiksa: '+proof+
    (next?'\nTindak lanjut: '+next:'');
  if(text.length>2000)throw new RangeError('Catatan melebihi batas 2.000 karakter.');
  return text;
}
