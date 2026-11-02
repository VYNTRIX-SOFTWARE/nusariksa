import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError, requestJson } from '../../web/assets/session.js';

test('pengajuan dan keputusan review memakai POST dan origin yang sama',async()=>{
  const previousFetch=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async(path,options)=>{
    calls.push({path,options});
    return {ok:true,status:200,json:async()=>({status:'submitted'})};
  };
  try{
    await requestJson('/assessments/assessment-id/submit',{method:'POST'});
    await requestJson('/assessments/assessment-id/review',{
      method:'POST',body:{decision:'request_changes',note:'Bukti belum memadai.'},
    });
    assert.deepEqual(calls.map(x=>[x.path,x.options.method]),[
      ['/assessments/assessment-id/submit','POST'],
      ['/assessments/assessment-id/review','POST'],
    ]);
    assert.ok(calls.every(x=>x.options.credentials==='same-origin'));
    assert.ok(calls.every(x=>x.options.redirect==='error'));
    assert.deepEqual(JSON.parse(calls[1].options.body),{
      decision:'request_changes',note:'Bukti belum memadai.',
    });
  }finally{globalThis.fetch=previousFetch;}
});

test('konflik HTTP 409 tidak diulang otomatis oleh klien API',async()=>{
  const original=globalThis.fetch;
  let count=0;
  globalThis.fetch=async()=>{
    count++;
    return {ok:false,status:409,json:async()=>({error:'Only submitted assessments can be reviewed'})};
  };
  try{
    await assert.rejects(requestJson('/assessments/id/review',{
      method:'POST',body:{decision:'approve',note:''},
    }),e=>e instanceof ApiError&&e.status===409);
    assert.equal(count,1);
  }finally{globalThis.fetch=original;}
});
