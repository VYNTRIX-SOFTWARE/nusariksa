import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {inspectPadkCandidatePacks} from '../src/padk-regulatory-candidates.js';
import {validatePadkRegulatoryPack,reviewPadkRegulatoryPack}
  from '../src/padk-regulatory-pack-review.js';

const source=path=>new URL('../../../regulations/padk43/cyber/'+path,import.meta.url);
const read=async path=>JSON.parse(await readFile(source(path),'utf8'));

test('dua candidate regulatory pack lengkap tanpa mengklaim lolos review',async()=>{
  const result=await inspectPadkCandidatePacks();
  assert.equal(result.status,'ASSEMBLED_PENDING_SUBSTANCE_AND_TECHNICAL_REVIEW');
  assert.equal(result.sourceRows,540);
  assert.equal(result.uniqueSourceCriteria,400);
  assert.equal(result.totalCriterionPlacements,700);
  assert.deepEqual(result.categories.map(x=>[x.category,x.indicators,x.criterionPlacements]),
    [[1,80,400],[2,60,300]]);
  assert.deepEqual(result.flaggedSourceCriteriaParameterNumbers,[2,20,21,22,27,28,29]);
  assert.deepEqual(result.category2MappingReviewNumbers,[3,18,19,20,24,29,32]);
  assert.deepEqual(result.category2MultiAspect29,[32,35]);
  assert.equal(result.sourceExtractionReviewed,false);
  assert.equal(result.crosswalkApproved,false);
  assert.equal(result.independentReviewCompleted,false);
  assert.equal(result.productionEligible,false);
  assert.match(result.categories[0].packSha256,/^[a-f0-9]{64}$/);
  assert.notEqual(result.categories[0].packSha256,result.categories[1].packSha256);
});

test('pack memakai redaksi sumber penuh, bukan workingSummary yang diparafrase',async()=>{
  const [a,b]=await Promise.all([read('candidates/kategori-1.json'),
    read('candidates/kategori-2.json')]);
  for(const pack of [a,b]){
    const reviewed=validatePadkRegulatoryPack(pack);
    assert.equal(reviewed.indicators.length,pack.category===1?80:60);
    assert.equal(reviewed.indicators.reduce((n,x)=>n+x.rankCriteria.length,0),
      pack.category===1?400:300);
    for(const ind of reviewed.indicators){
      assert.equal(ind.rankCriteria.length,5);
      assert.deepEqual(ind.rankCriteria.map(x=>x.rank),[1,2,3,4,5]);
      assert.match(ind.title,/\S.+/);
      assert.ok(ind.tablePage>=16&&ind.tablePage<=37);
      assert.ok(ind.rankCriteria.every(x=>x.criteriaPage>=38&&x.criteriaPage<=80));
    }
  }
  assert.match(a.indicators[0].title,/wewenang dan tanggung jawab Direksi/);
  assert.match(b.indicators[28].title,/phishing/i);
  // Kategori 2 nomor 29 tetap satu indikator dengan lima kriteria kandidat;
  // dua aspek yang belum diputuskan diungkap oleh manifest terpisah.
  assert.equal(b.indicators[28].number,29);
  const manifest=await read('candidates/review-manifest.json');
  assert.deepEqual(manifest.multiAspectC2Indicator29.aspectTable3Numbers,[32,35]);
  assert.equal(manifest.multiAspectC2Indicator29.officialCombinedRankRuleAvailable,false);
});

test('pack yang telah dirakit tetap tidak bisa mengaku approved tanpa review',async()=>{
  const pack=await read('candidates/kategori-1.json');
  assert.throws(()=>reviewPadkRegulatoryPack({
    pack,compiledBy:'pengembang',attestations:[],
  }),/review|penyusun|terpisah|paket/i);
  const altered=structuredClone(pack);
  altered.indicators[0].subdomain='x-invalid';
  assert.throws(()=>validatePadkRegulatoryPack(altered));
  const tooLong=structuredClone(pack);
  tooLong.indicators[0].subdomain='X'.repeat(65);
  assert.throws(()=>validatePadkRegulatoryPack(tooLong));
});

test('CLI menunjukkan penuntasan struktur tanpa meluluskan release gate',async()=>{
  const cli=new URL('../../../scripts/check-padk-regulatory-candidates.js',import.meta.url);
  const result=spawnSync(process.execPath,[cli.pathname],{encoding:'utf8',timeout:20000});
  assert.equal(result.status,0,result.stderr);
  const info=JSON.parse(result.stdout);
  assert.equal(info.totalCriterionPlacements,700);
  assert.equal(info.productionEligible,false);
  assert.match(result.stderr,/BELUM selesai/);
});

test('aplikasi membedakan pack kandidat lengkap dari validasi resmi',async()=>{
  const html=await readFile(new URL('../../../apps/web/index.html',import.meta.url),'utf8');
  assert.match(html,/Data kandidat instrumen telah disusun lengkap/);
  assert.match(html,/700 penempatan kriteria/);
  assert.match(html,/Transkripsi 540 baris dan dua paket kandidat sudah tersedia/);
  assert.match(html,/Skor resmi dan laporan OJK belum tersedia/);
});
