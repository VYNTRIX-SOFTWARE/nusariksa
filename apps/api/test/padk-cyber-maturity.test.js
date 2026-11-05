import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PadkCyberError, PADK_CYBER_DOMAINS, padkCyberFramework,
  validatePadkCyberManifest, previewPadkCompositeRank,
  previewPadkCyberMaturity,
} from '../src/padk-cyber-maturity.js';

// Synthetic test fixture ONLY. The repository does not ship parameter text
// or category-to-domain mappings that claim to reproduce Lampiran IV.
function syntheticManifest(category) {
  const total = category === 1 ? 80 : 60;
  return {
    reference: '43/PADK.03/2025:LAMPIRAN_IV',
    category,
    indicators: Array.from({ length: total }, (_, index) => ({
      number: index + 1,
      domain: PADK_CYBER_DOMAINS[index % 5].code,
      subdomain: 'TEST.SYNTH',
      title: 'Indikator sintetis untuk pengujian nomor ' + (index + 1),
    })),
  };
}
const ranks = (manifest, rank) =>
  manifest.indicators.map(item => ({ number: item.number, rank }));

test('metadata sumber, jumlah indikator, bobot, dan peringkat tidak tertukar', () => {
  const framework = padkCyberFramework();
  assert.equal(framework.regulation, '43/PADK.03/2025');
  assert.equal(framework.annex, 'IV');
  assert.deepEqual(framework.categoryIndicatorCounts, { '1': 80, '2': 60 });
  assert.equal(framework.domains.length, 5);
  assert.deepEqual(framework.domains.map(x => x.weightPercent), [25,15,25,15,20]);
  assert.equal(framework.ranks[0].label, 'Sangat Memadai');
  assert.equal(framework.ranks[4].label, 'Tidak Memadai');
  assert.equal(framework.readyForRegulatoryUse, false);
  assert.equal(framework.domains.reduce((sum, x) => sum + x.weightPercent, 0), 100);
});

test('kategori 1 dan 2 wajib memiliki pemetaan ordinal lengkap dan lima domain', () => {
  for (const category of [1,2]) {
    const manifest = syntheticManifest(category);
    assert.equal(validatePadkCyberManifest(manifest).indicators.length, category===1?80:60);
    assert.throws(() => validatePadkCyberManifest({
      ...manifest, indicators: manifest.indicators.slice(1),
    }), PadkCyberError);
    assert.throws(() => validatePadkCyberManifest({
      ...manifest, indicators: [
        ...manifest.indicators.slice(0,-1), { ...manifest.indicators[0] },
      ],
    }), PadkCyberError);
    assert.throws(() => validatePadkCyberManifest({
      ...manifest, indicators: manifest.indicators.map(p => ({ ...p, domain: 'TK' })),
    }), PadkCyberError);
    assert.throws(() => validatePadkCyberManifest({
      ...manifest, indicators: manifest.indicators.map(p => ({ ...p, title: '<script>' })),
    }), PadkCyberError);
  }
  assert.throws(() => validatePadkCyberManifest(syntheticManifest(3)), PadkCyberError);
});

test('seluruh indikator peringkat 1 menghasilkan skor 1.00 (terbaik), bukan level 5', () => {
  const manifest = syntheticManifest(1);
  const result = previewPadkCyberMaturity({ manifest, ratings: ranks(manifest,1) });
  assert.equal(result.complete, true);
  assert.equal(result.requiredIndicators,80);
  assert.equal(result.ratedIndicators,80);
  assert.equal(result.compositePreview.valueTwoDecimals,'1.00');
  assert.equal(result.compositePreview.rank,1);
  assert.equal(result.compositePreview.label,'Sangat Memadai');
  assert.equal(result.domains.length,5);
  assert.equal(result.domains.reduce((sum,d)=>sum+d.weightPercent,0),100);
  assert.equal(result.mappingVerified,false);
  assert.equal(result.regulatoryResult,false);
  assert.equal(result.status,'PREVIEW_UNVERIFIED');
  assert.match(result.manifestSha256,/^[a-f0-9]{64}$/);
});

test('seluruh indikator peringkat 5 menghasilkan skor 5.00 (terburuk)', () => {
  const manifest = syntheticManifest(2);
  const result = previewPadkCyberMaturity({ manifest, ratings: ranks(manifest,5) });
  assert.equal(result.requiredIndicators,60);
  assert.equal(result.compositePreview.rank,5);
  assert.equal(result.compositePreview.valueTwoDecimals,'5.00');
  assert.equal(result.compositePreview.label,'Tidak Memadai');
});

test('domain dihitung dari rerata peringkat indikator dan bobot tetap', () => {
  const manifest = syntheticManifest(1);
  const ratings = ranks(manifest,1).map(x=>({
    ...x, rank: manifest.indicators[x.number - 1].domain==='TK' ? 3 : 1,
  }));
  const result = previewPadkCyberMaturity({manifest,ratings});
  const governance = result.domains.find(x=>x.code==='TK');
  assert.equal(governance.averageRank,3);
  assert.equal(governance.contribution,0.75);
  assert.equal(result.compositePreview.valueTwoDecimals,'1.50');
  assert.equal(result.compositePreview.rank,1);
});

test('pratinjau parsial tidak menghasilkan nilai komposit, peringkat, atau domain parsial', () => {
  const manifest = syntheticManifest(1);
  const ratings = ranks(manifest,1).filter(x=>x.number!==1);
  const result=previewPadkCyberMaturity({manifest,ratings});
  assert.equal(result.complete,false);
  assert.equal(result.compositeRaw,null);
  assert.equal(result.compositePreview,null);
  assert.deepEqual(result.missingNumbers,[1]);
  const governance=result.domains.find(x=>x.code==='TK');
  assert.equal(governance.complete,false);
  assert.equal(governance.averageRank,null);
  assert.equal(governance.contribution,null);
  assert.equal(result.domains.filter(x=>x.complete).length,4);
});

test('peringkat harus integer 1–5, tanpa duplikasi, nomor asing atau bentuk lain', () => {
  const manifest=syntheticManifest(2);
  const base=ranks(manifest,2);
  const bad=[
    [...base.slice(0,-1),{number:60,rank:0}],
    [...base.slice(0,-1),{number:60,rank:6}],
    [...base.slice(0,-1),{number:60,rank:'2'}],
    [...base.slice(0,-1),{number:60,rank:2.4}],
    [...base.slice(0,-1),{number:1,rank:2}],
    [...base.slice(0,-1),{number:61,rank:2}],
    [...base.slice(0,-1),{number:60,rank:2,verified:true}],
  ];
  for(const ratings of bad)assert.throws(
    ()=>previewPadkCyberMaturity({manifest,ratings}), PadkCyberError);
  assert.throws(()=>previewPadkCyberMaturity({manifest,ratings:base,official:true}),
    PadkCyberError);
});

test('ambang peringkat dan pembulatan dua desimal adalah kebijakan pratinjau eksplisit',()=>{
  for(const [input,rank,label] of [
    [1,1,'1.00'],[1.8,1,'1.80'],[1.805,2,'1.81'],
    [2.6,2,'2.60'],[2.605,3,'2.61'],[3.4,3,'3.40'],
    [3.405,4,'3.41'],[4.2,4,'4.20'],[4.205,5,'4.21'],[5,5,'5.00'],
  ]){
    const outcome=previewPadkCompositeRank(input);
    assert.equal(outcome.rank,rank);
    assert.equal(outcome.valueTwoDecimals,label);
  }
  for(const x of [0,6,NaN,Infinity,null,'1.5'])
    assert.throws(()=>previewPadkCompositeRank(x),PadkCyberError);
});

test('sidik jari manifest stabil untuk susunan input berbeda',()=>{
  const manifest=syntheticManifest(2);
  const first=previewPadkCyberMaturity({manifest,ratings:[]});
  const reordered=previewPadkCyberMaturity({
    manifest:{...manifest,indicators:[...manifest.indicators].reverse()},ratings:[],
  });
  assert.equal(first.manifestSha256,reordered.manifestSha256);
});
