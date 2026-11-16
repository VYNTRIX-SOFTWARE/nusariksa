import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {buildPadkReviewWorkpack} from '../../../scripts/padk-review-workpack.js';

const root=new URL('../../../regulations/padk43/cyber/',import.meta.url);
const read=async name=>JSON.parse(await readFile(new URL(name,root),'utf8'));
async function inputs(){
  const [source,mapping,manifest,category1,category2]=await Promise.all([
    read('sources/lampiran-iv-extraction.json'),
    read('review/category2-candidates.json'),
    read('candidates/review-manifest.json'),
    read('candidates/kategori-1.json'),
    read('candidates/kategori-2.json'),
  ]);
  return {source,mapping,manifest,category1,category2};
}

test('satu review workpack memuat 540 sel, 60 crosswalk, 14 kasus, semua PENDING',async()=>{
  const bundle=buildPadkReviewWorkpack(await inputs());
  const {evidence,report,files}=bundle;
  assert.equal(report.status,'HUMAN_REVIEW_PENDING');
  assert.equal(report.sourceRows,540);
  assert.equal(report.sourceExceptions,7);
  assert.equal(report.mappingExceptions,7);
  assert.equal(evidence.sourceCells.length,540);
  assert.equal(evidence.category2Crosswalk.length,60);
  assert.equal(evidence.exceptionDecisions.length,14);
  assert.ok(evidence.sourceCells.every(x=>x.outcome==='PENDING'
    &&x.reviewNote===''&&x.reviewedBy===''));
  assert.ok(evidence.category2Crosswalk.every(x=>x.outcome==='PENDING'
    &&x.rationale===''&&x.reviewerId===''));
  assert.ok(evidence.exceptionDecisions.every(x=>x.outcome==='PENDING'
    &&x.decision===''));
  assert.equal(evidence.sourceAcquisition.origin,'UNVERIFIED');
  assert.deepEqual(evidence.review.attestations,[]);
  assert.deepEqual(evidence.packFingerprints,[]);
  assert.equal(evidence.scoring.roundingDecision,'');
  assert.equal(evidence.scoring.boundaryTestsApproved,false);
  assert.equal(files['source-cells.csv'].split('\n').length,542);
  assert.equal(files['category2-crosswalk.csv'].split('\n').length,62);
  assert.equal(files['exception-decisions.csv'].split('\n').length,16);
  assert.equal(files['rounding-scenarios.json'].includes('approvedRegulatoryPolicy'),true);
  assert.equal(report.candidateFingerprints.length,2);
});

test('seluruh 11 pasangan beda redaksi teridentifikasi dan kasus 29 tetap satu indikator',async()=>{
  const {evidence}=buildPadkReviewWorkpack(await inputs());
  const different=evidence.category2Crosswalk
    .filter(x=>x.redactionComparison==='DIFFERENT_SCOPE_OR_WORDING')
    .map(x=>x.category2Number);
  assert.deepEqual(different,[3,18,19,20,24,26,29,30,32,45,47]);
  const priority=evidence.category2Crosswalk.filter(x=>x.priority==='HIGH')
    .map(x=>x.category2Number);
  assert.deepEqual(priority,[3,18,19,20,24,29,32]);
  assert.deepEqual(evidence.category2Crosswalk[28].aspects,[32,35]);
  assert.equal(evidence.category2Crosswalk[28].combinedRankRule,'');
  assert.equal(evidence.category2Crosswalk.filter(x=>x.category2Number===29).length,1);
});

test('workpack menolak penyesuaian jumlah atau SHA sumber tanpa merusak sumber',async()=>{
  for(const change of [
    x=>x.source.records.pop(),
    x=>x.mapping.candidateMappings.pop(),
    x=>x.category2.indicators.pop(),
    x=>x.manifest.sourcePdfSha256='f'.repeat(64),
  ]){
    const inputsCopy=structuredClone(await inputs());
    change(inputsCopy);
    assert.throws(()=>buildPadkReviewWorkpack(inputsCopy),/Review workpack dibatalkan/);
  }
});

test('CLI tidak menulis file review tanpa PDF sumber dan output privat eksplisit',()=>{
  const script=new URL('../../../scripts/padk-review-workpack.js',import.meta.url);
  const result=spawnSync(process.execPath,[script.pathname],{encoding:'utf8'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/--source-pdf dan --output-dir wajib/);
});
