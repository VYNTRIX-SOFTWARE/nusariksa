import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError, requestJson } from '../../web/assets/session.js';

test('PUT penilaian mengirim expectedRevision ke origin yang sama dan tidak melakukan retry',async()=>{
  const original=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async(path,options)=>{
    calls.push({path,options});
    return {ok:true,status:200,json:async()=>({revision:3})};
  };
  try{
    const result=await requestJson('/assessments/assessment-id/results/control-id',{
      method:'PUT',
      body:{rating:'non_compliant',note:'Belum terdapat dokumen pengendalian.',expectedRevision:2},
    });
    assert.equal(result.revision,3);
    assert.equal(calls.length,1);
    assert.equal(calls[0].path,'/assessments/assessment-id/results/control-id');
    assert.equal(calls[0].options.method,'PUT');
    assert.equal(calls[0].options.credentials,'same-origin');
    assert.equal(calls[0].options.redirect,'error');
    assert.deepEqual(JSON.parse(calls[0].options.body),{
      rating:'non_compliant',note:'Belum terdapat dokumen pengendalian.',expectedRevision:2,
    });
  }finally{globalThis.fetch=original;}
});

test('HTTP 409 konflik revisi diangkat tanpa mencoba mengulang penulisan',async()=>{
  const original=globalThis.fetch;
  let calls=0;
  globalThis.fetch=async()=>{
    calls++;
    return {ok:false,status:409,json:async()=>({error:'Assessment result revision conflict'})};
  };
  try{
    await assert.rejects(requestJson('/assessments/id/results/control',{method:'PUT',
      body:{rating:'compliant',note:'',expectedRevision:1},
    }),error=>error instanceof ApiError&&error.status===409);
    assert.equal(calls,1);
  }finally{globalThis.fetch=original;}
});
