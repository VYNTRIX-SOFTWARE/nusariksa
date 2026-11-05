import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PadkCyberError } from '../src/padk-cyber-maturity.js';
import {
  padkRegulatoryPackFingerprint,
  validatePadkRegulatoryPack, reviewPadkRegulatoryPack,
  padkPackReviewChecklist,
} from '../src/padk-regulatory-pack-review.js';

const OFFICIAL_URL='https://ojk.go.id/id/regulasi/Pages/PADK-43-PADK03-2025-Penyelenggaraan-Teknologi-Informasi-oleh-BPR-BPRS.aspx';
const fakePdfHash='ab'.repeat(32);
const description='BPR dan BPR Syariah memiliki kebijakan perlindungan informasi yang terdokumentasi.';
const ranks=()=>Array.from({length:5},(_,index)=>({
  rank:index+1,
  criterion:'Kriteria pengujian berbasis tingkat '+(index+1)+
    ', untuk penilaian teknis secara konsisten.',
  criteriaPage:38+(index%5),
}));

// Every item in this test is intentionally synthetic. This code does not
// generate or ship a "verified" regulator mapping in production.
function fixture(category=1){
  const total=category===1?80:60;
  return {
    schemaVersion:1,reference:'43/PADK.03/2025:LAMPIRAN_IV',
    category,
    source:{
      authority:'OJK',regulation:'43/PADK.03/2025',annex:'IV',
      table:category===1?'TABEL_1':'TABEL_2',
      url:OFFICIAL_URL,pdfSha256:fakePdfHash,
    },
    indicators:Array.from({length:total},(_,index)=>({
      number:index+1,
      domain:['TK','ID','PL','DT','PP'][index%5],
      subdomain:'TEST.INTERNAL',
      title:description+' Nomor '+(index+1),
      tablePage:16+Math.floor(index/5),
      rankCriteria:ranks(),
    })),
  };
}

test('struktur 80/60 lengkap dengan sumber halaman dan kriteria 1–5',()=>{
  for(const category of [1,2]){
    const example=fixture(category);
    const result=validatePadkRegulatoryPack(example);
    assert.equal(result.indicators.length,category===1?80:60);
    assert.equal(result.indicators[0].rankCriteria.length,5);
    assert.equal(result.source.pdfSha256,fakePdfHash);
    const report=padkPackReviewChecklist(example);
    assert.equal(report.indicatorCount,category===1?80:60);
    assert.equal(report.rankCriterionCount,category===1?400:300);
    assert.equal(report.productionEligible,false);
    assert.equal(report.status,'REQUIRES_INDEPENDENT_SOURCE_REVIEW');
    assert.match(report.packSha256,/^[0-9a-f]{64}$/);
  }
});
test('transkripsi tidak dapat lolos bila halaman, nomor, domain, atau teks kriteria bermasalah',()=>{
  const bad=[
    (()=>{const x=fixture();x.indicators[0].tablePage=15;return x;})(),
    (()=>{const x=fixture();x.indicators[0].rankCriteria[0].criteriaPage=81;return x;})(),
    (()=>{const x=fixture();x.indicators[0].rankCriteria.pop();return x;})(),
    (()=>{const x=fixture();x.indicators[0].rankCriteria[0].rank=2;return x;})(),
    (()=>{const x=fixture();x.indicators[0].rankCriteria[0].criterion='TODO';return x;})(),
    (()=>{const x=fixture();x.indicators[0].rankCriteria[0].criterion='uji\nplaceholder';return x;})(),
    (()=>{const x=fixture();x.indicators[0].number=2;return x;})(),
    (()=>{const x=fixture();x.indicators[0].domain='OTHER';return x;})(),
    (()=>{const x=fixture();x.indicators.pop();return x;})(),
    (()=>{const x=fixture();x.source.pdfSha256='bad';return x;})(),
    (()=>{const x=fixture();x.source.table='TABEL_2';return x;})(),
    (()=>{const x=fixture();x.source.url='https://example.org';return x;})(),
    (()=>{const x=fixture();x.indicators[0].title='indikator sintetis bukan sumber';return x;})(),
  ];
  for(const input of bad){
    assert.throws(()=>validatePadkRegulatoryPack(input),PadkCyberError);
  }
});
test('sidik jari stabil pada urutan data berbeda dan berubah jika isi berubah',()=>{
  const initial=fixture();
  const first=padkRegulatoryPackFingerprint(initial);
  const reordered=fixture();
  reordered.indicators.reverse();
  reordered.indicators[0].rankCriteria.reverse();
  assert.equal(padkRegulatoryPackFingerprint(reordered).sha256,first.sha256);
  const changed=fixture();
  changed.indicators[0].title+=' diperbarui';
  assert.notEqual(padkRegulatoryPackFingerprint(changed).sha256,first.sha256);
  const changedSource=fixture();
  changedSource.source.pdfSha256='cd'.repeat(32);
  assert.notEqual(padkRegulatoryPackFingerprint(changedSource).sha256,first.sha256);
});
test('attestasi terikat fingerprint, role berbeda, dan penyusun tidak dapat mengesahkan sendiri',()=>{
  const pack=fixture(2),sha256=padkRegulatoryPackFingerprint(pack).sha256;
  const attestations=[
    {reviewerId:'reviewer.substance@example.test',role:'substance',
      reviewedAt:'2026-11-05',packSha256:sha256},
    {reviewerId:'reviewer.technical@example.test',role:'technical',
      reviewedAt:'2026-11-05',packSha256:sha256},
  ];
  const valid=reviewPadkRegulatoryPack({
    pack,compiledBy:'compiler@example.test',attestations,
  });
  assert.equal(valid.review.level,'DECLARED_DUAL_REVIEW');
  assert.equal(valid.review.approvedForProduction,false);
  assert.equal(valid.review.verifiedByIndependentGitHubReview,false);
  for(const badAttestations of [
    attestations.slice(0,1),
    attestations.map(r=>({...r,reviewerId:'compiler@example.test'})),
    attestations.map(r=>({...r,role:'technical'})),
    attestations.map(r=>({...r,packSha256:'ff'.repeat(32)})),
    attestations.map(r=>({...r,reviewedAt:'2026-02-31'})),
    attestations.map(r=>({...r,reviewerId:'same@example.test'})),
  ]){
    assert.throws(()=>reviewPadkRegulatoryPack({
      pack,compiledBy:'compiler@example.test',attestations:badAttestations,
    }),PadkCyberError);
  }
});
test('invalid object tidak melempar exception internal atau menganggapnya pack valid',()=>{
  for(const value of [null,undefined,{},[],{indicators:[]}]){
    assert.throws(()=>validatePadkRegulatoryPack(value),PadkCyberError);
  }
});
