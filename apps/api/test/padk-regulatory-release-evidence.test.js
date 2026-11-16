import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {validatePadkReleaseEvidence} from '../src/padk-regulatory-release-evidence.js';
import {padkRegulatoryPackFingerprint} from '../src/padk-regulatory-pack-review.js';

const root=new URL('../../../regulations/padk43/cyber/',import.meta.url);
const load=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
const SOURCE_ANOMALIES=[2,20,21,22,27,28,29];
const MAPPING_ANOMALIES=[3,18,19,20,24,29,32];

// Entirely synthetic attestations exist only in test memory; none is a real
// reviewer decision. Successful schema validation is not independent approval.
async function fixtures(){
  const [source,one,two,mapping]=await Promise.all([
    load('sources/lampiran-iv-extraction.json'),load('candidates/kategori-1.json'),
    load('candidates/kategori-2.json'),load('review/category2-candidates.json'),
  ]);
  const packs=[one,two];
  const evidence={
    schemaVersion:1,reference:'43/PADK.03/2025:LAMPIRAN_IV',
    sourcePdfSha256:source.sourcePdfSha256,
    sourceAcquisition:{origin:'OFFICIAL_OJK_DOWNLOAD',
      documentUrl:'https://ojk.go.id/regulasi/synthetic-fixture.pdf',
      downloadedAt:'2026-11-16T10:00:00+07:00',pdfSha256:source.sourcePdfSha256},
    review:{compiledBy:'test-compiler',attestations:[
      {role:'substance',reviewerId:'test-substance',reviewedAt:'2026-11-16'},
      {role:'technical',reviewerId:'test-technical',reviewedAt:'2026-11-16'},
    ]},
    sourceCells:source.records.map(record=>({id:record.id,
      physicalPdfPages:record.physicalPdfPages,outcome:'MATCH',
      reviewNote:'Keputusan simulasi fixture; bukan pemeriksaan manusia'})),
    category2Crosswalk:mapping.candidateMappings.map(row=>({
      category2Number:row.category2Number,table3Number:row.table3CandidateNumber,
      outcome:'APPROVED',rationale:'Keputusan fiktif hanya untuk uji validator',
    })),
    exceptionDecisions:[
      ...SOURCE_ANOMALIES.map(number=>({type:'SOURCE',number,
        outcome:'RESOLVED',decision:'Simulasi penanganan anomali dokumen sumber',physicalPdfPages:[167]})),
      ...MAPPING_ANOMALIES.map(number=>({type:'MAPPING',number,
        outcome:'RESOLVED',decision:'Simulasi penanganan risiko pemetaan',physicalPdfPages:[151]})),
    ],
    scoring:{weights:[25,15,25,15,20],bestRank:1,worstRank:5,
      roundingDecision:'Keputusan simulasi pembulatan untuk fixture saja',
      roundingEvidence:'Referensi fixture internal, bukan naskah OJK',
      boundaryTestsApproved:true},
    packFingerprints:packs.map(pack=>({category:pack.category,
      sha256:padkRegulatoryPackFingerprint(pack).sha256})),
  };
  const special=evidence.category2Crosswalk[28];
  special.aspects=[32,35];
  special.combinedRankRule='Contoh metode agregasi tidak untuk penggunaan produksi';
  special.ruleImplementationReference='Contoh rujukan implementasi pada fixture';
  return {source,packs,mapping:mapping.candidateMappings,evidence};
}

test('kontrak bukti akhir lengkap, tetapi tidak mengklaim approval GitHub',async()=>{
  const input=await fixtures();
  const result=validatePadkReleaseEvidence(input);
  assert.equal(result.sourceCells,540);
  assert.equal(result.crosswalkDecisions,60);
  assert.equal(result.exceptionDecisions,14);
  assert.equal(result.independentGitHubReviewVerified,false);
});

test('gerbang ditutup untuk sumber, pemetaan, pengecualian, skor, dan reviewer yang belum beres',async()=>{
  const input=await fixtures();
  const cases=[
    e=>e.sourceCells.pop(),
    e=>e.sourceCells[0].outcome='PENDING',
    e=>e.sourceCells[0].physicalPdfPages=[999],
    e=>e.category2Crosswalk.pop(),
    e=>e.category2Crosswalk[28].aspects=[35],
    e=>e.category2Crosswalk[28].combinedRankRule='',
    e=>e.exceptionDecisions[0].outcome='PENDING',
    e=>e.scoring.roundingEvidence='',
    e=>e.scoring.boundaryTestsApproved=false,
    e=>e.review.attestations[1].reviewerId='test-substance',
    e=>e.packFingerprints[0].sha256='f'.repeat(64),
    e=>e.sourceAcquisition.origin='COPY_NOT_VERIFIED',
  ];
  for(const mutate of cases){
    const evidence=structuredClone(input.evidence);
    mutate(evidence);
    assert.throws(()=>validatePadkReleaseEvidence({...input,evidence}),
      /Rilis regulatori ditolak/);
  }
});

test('perubahan teks final terhadap transkripsi sumber ditolak walau metadata tetap cocok',async()=>{
  const input=await fixtures();
  const packs=structuredClone(input.packs);
  packs[0].indicators[0].title+=' berubah';
  input.evidence.packFingerprints[0].sha256=padkRegulatoryPackFingerprint(packs[0]).sha256;
  assert.throws(()=>validatePadkReleaseEvidence({...input,packs}),
    /redaksi parameter/);
});

test('CLI rilis menolak tanpa PDF dan berkas bukti review privat',()=>{
  const script=new URL('../../../scripts/check-padk-regulatory-packs.js',import.meta.url);
  const result=spawnSync(process.execPath,[script.pathname,'--release'],
    {encoding:'utf8',timeout:20000});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/--source-pdf/);
  assert.match(result.stderr,/--evidence-file/);
  assert.match(result.stderr,/--review-pr/);
});
