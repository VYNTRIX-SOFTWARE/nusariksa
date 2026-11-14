import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PADK_CYBER_DOMAINS, PADK_COMPOSITE_BANDS,
  padkCyberFramework,previewPadkCompositeRank} from '../src/padk-cyber-maturity.js';
import {validatePadkPreparation} from '../src/padk-preparations.js';
import {suggestPadkAnnualPreparation} from '../../web/assets/padk-preparation-ui.js';

const read=async path=>readFile(new URL('../../../'+path,import.meta.url),'utf8');
const json=async path=>JSON.parse(await read(path));

test('acuan PADK memisahkan ketentuan normatif dari instrumen draft',async()=>{
  const framework=padkCyberFramework();
  assert.deepEqual(framework.categoryIndicatorCounts,{'1':80,'2':60});
  assert.deepEqual(PADK_CYBER_DOMAINS.map(x=>[x.code,x.weightPercent]),[
    ['TK',25],['ID',15],['PL',25],['DT',15],['PP',20],
  ]);
  assert.equal(PADK_CYBER_DOMAINS.reduce((sum,x)=>sum+x.weightPercent,0),100);
  assert.deepEqual(framework.ranks.map(x=>x.rank),[1,2,3,4,5]);
  assert.equal(framework.ranks[0].label,'Sangat Memadai');
  assert.equal(framework.ranks[4].label,'Tidak Memadai');
  assert.equal(framework.readyForRegulatoryUse,false);
  assert.deepEqual(PADK_COMPOSITE_BANDS.map(x=>x.maxHundredths),[180,260,340,420,500]);
  assert.deepEqual([1.80,1.81,2.60,2.61,3.40,3.41,4.20,4.21,5.0]
    .map(x=>previewPadkCompositeRank(x).rank),[1,2,2,3,3,4,4,5,5]);

  for(const [category,total] of [[1,80],[2,60]]){
    const source=await json('regulations/padk43/cyber/drafts/kategori-'+category+'.json');
    assert.equal(source.category,category);
    assert.equal(source.status,'DRAFT_UNVERIFIED');
    assert.equal(source.source.verifiedAgainstOfficialPdf,false);
    assert.equal(source.source.pdfSha256,null);
    assert.equal(source.items.length,total);
    assert.ok(source.items.every((item,i)=>item.number===i+1
      &&item.reviewStatus==='NEEDS_SOURCE_REVIEW'&&item.rankCriteria.length===0));
  }
});

test('saran periode tahunan tidak menyamar sebagai validasi posisi resmi',()=>{
  const annual=suggestPadkAnnualPreparation(new Date('2026-11-14T10:00:00Z'));
  assert.equal(annual.periodEnd,'2026-12-31');
  assert.equal(annual.periodStart,'2026-01-01');
  assert.deepEqual(validatePadkPreparation({
    title:'Penilaian Keamanan Siber 2026',
    category:2,periodStart:'2026-01-01',periodEnd:'2026-12-31',
  }),{
    title:'Penilaian Keamanan Siber 2026',
    category:2,periodStart:'2026-01-01',periodEnd:'2026-12-31',
  });
  assert.equal(validatePadkPreparation({
    title:'Penginian Penilaian Keamanan Siber',
    category:1,periodStart:'2027-01-01',periodEnd:'2027-06-30',
  }).periodEnd,'2027-06-30');
  assert.throws(()=>validatePadkPreparation({
    title:'Penilaian Tidak Valid',category:3,
    periodStart:'2026-01-01',periodEnd:'2026-12-31',
  }));
});

test('informasi pelaporan tidak mencampur maturitas, insiden dan pengiriman APOLO',async()=>{
  const page=await read('apps/web/index.html');
  const matrix=await read('docs/MATRIKS-KETENTUAN-PENILAIAN-KEAMANAN-SIBER.md');
  const guide=await read('docs/PADK.md');
  const userGuide=await read('docs/PANDUAN-PENGGUNA.md');
  assert.match(page,/id="pdk-regulatory-guidance"/);
  assert.match(page,/Kategori 1[^<]*80 indikator/);
  assert.match(page,/Kategori 2[^<]*60 indikator/);
  assert.match(page,/pertama kali untuk posisi Desember 2026/);
  assert.match(page,/tidak otomatis menjadi laporan bulanan atau pengiriman berkala melalui APOLO/);
  assert.match(page,/OJK\. Bukan|OJK\. Penilaian|diminta OJK/);
  assert.match(matrix,/POJK 34\/2025 Pasal 24 ayat \(1\)–\(3\)/);
  assert.match(matrix,/PADK Lampiran IV Bab III bagian B angka 1/);
  assert.match(matrix,/24 jam/);
  assert.match(matrix,/7 hari kerja/);
  assert.match(matrix,/DRAFT_UNVERIFIED/);
  assert.match(matrix,/belum (?:terverifikasi|diverifikasi)/i);
  assert.match(guide,/matriks ketentuan penilaian keamanan siber/);
  assert.match(userGuide,/matriks ketentuan keamanan siber/);
  assert.doesNotMatch(matrix,/wajib mengunggah hasil maturitas secara bulanan|skor resmi telah tersedia/);
});
