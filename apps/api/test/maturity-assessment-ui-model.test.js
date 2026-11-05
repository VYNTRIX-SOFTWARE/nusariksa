import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  canReadMaturityAssessments,canCreateMaturityAssessments,canRateMaturityAssessment,
  validMaturityAssessments,validMaturityDetail,ratingPayload,
} from '../../web/assets/maturity-assessment-model.js';

const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
const c='33333333-3333-4333-8333-333333333333';
const base={
  id:a,ownerUserId:b,model:{code:'MAT_TI',title:'Metodologi',
    version:2,methodologyReference:'Metodologi internal'},
  summary:{method:'minimum',complete:false,overallLevel:null,totalDomains:2,
    assessedDomains:1,unassessedDomains:1},
  domains:[
    {id:b,code:'GOV_01',title:'Tata Kelola',level:0,revision:1,
      criteria:Array.from({length:6},(_,level)=>({level,criterion:'Level '+level}))},
    {id:c,code:'SEC_01',title:'Keamanan TI',level:null,revision:0,
      criteria:Array.from({length:6},(_,level)=>({level,criterion:'Level '+level}))},
  ],
};

test('akses tulis membutuhkan izin dan kepemilikan asesmen',()=>{
  assert.equal(canReadMaturityAssessments(['assessments:read']),true);
  assert.equal(canReadMaturityAssessments(['reports:read']),false);
  assert.equal(canCreateMaturityAssessments(['assessments:write']),false);
  assert.equal(canRateMaturityAssessment(
    ['assessments:read','assessments:write'],b,b),true);
  assert.equal(canRateMaturityAssessment(
    ['assessments:read','assessments:write'],c,b),false);
});

test('model detail mengenali Level 0, tetapi tidak mengarang skor jika belum lengkap',()=>{
  const detail=validMaturityDetail(structuredClone(base),a);
  assert.equal(detail.domains[0].level,0);
  assert.equal(detail.summary.overallLevel,null);
  assert.equal(validMaturityAssessments({assessments:[{
    id:a,model_version_id:b,title:'Asesmen',model_code:'MAT_TI',
  }]}).length,1);
  assert.throws(()=>validMaturityAssessments({assessments:[{id:'bad'}]}),TypeError);
  assert.throws(()=>validMaturityDetail({...base,id:b},a),TypeError);
  assert.throws(()=>validMaturityDetail({...base,
    summary:{...base.summary,assessedDomains:2}},a),TypeError);
  assert.throws(()=>validMaturityDetail({...base,
    summary:{...base.summary,overallLevel:4}},a),TypeError);
  assert.throws(()=>validMaturityDetail({...base,
    domains:[{...base.domains[0],criteria:[]},base.domains[1]]},a),TypeError);
});

test('payload rating mempertahankan angka nol dan menangkal revisi tidak valid',()=>{
  const req={level:'0',justification:'Kriteria level ini sudah diperiksa.',
    evidenceId:'',expectedRevision:0};
  assert.deepEqual(ratingPayload(req),{
    level:0,justification:req.justification,evidenceId:null,expectedRevision:0,
  });
  const invalid=[
    {...req,level:''},{...req,level:6},{...req,level:'abc'},
    {...req,expectedRevision:-1},{...req,evidenceId:'not-a-uuid'},
    {...req,justification:'x'}, {...req,level:2.2},
  ];
  for(const value of invalid)assert.throws(()=>ratingPayload(value),TypeError);
});
