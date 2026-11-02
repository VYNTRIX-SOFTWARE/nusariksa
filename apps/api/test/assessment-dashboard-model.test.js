import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  validAssessments, yearsForAssessments, withinYear, summarizeAssessments,
  filterAssessments, attentionAssessments, ownWork, STATUS_LABELS,
} from '../../web/assets/assessment-model.js';

const rows = [
  {id:'a',title:'Asesmen A',status:'draft',period_start:'2026-07-01',period_end:'2026-12-31',
    owner_user_id:'maker',created_at:'2026-11-01T03:00:00.000Z'},
  {id:'b',title:'Asesmen B',status:'in_progress',period_start:'2026-01-01',period_end:'2027-06-30',
    owner_user_id:'maker',created_at:'2026-11-02T03:00:00.000Z'},
  {id:'c',title:'Review Teknologi',status:'submitted',period_start:'2027-01-01',period_end:'2027-12-31',
    owner_user_id:'another',created_at:'2026-10-01T03:00:00.000Z'},
  {id:'d',title:'Perbaikan Kontrol',status:'changes_requested',period_start:'2026-01-01',period_end:'2026-03-31',
    owner_user_id:'maker',created_at:'2026-10-02T03:00:00.000Z'},
  {id:'e',title:'Asesmen Disetujui',status:'approved',period_start:'2026-01-01',period_end:'2026-06-30',
    owner_user_id:'another',created_at:'2026-09-02T03:00:00.000Z'},
];

test('ringkasan memakai data yang diambil, bukan skor kepatuhan',()=>{
  const all=summarizeAssessments(rows);
  assert.equal(all.total,5);
  assert.equal(all.counts.submitted,1);
  assert.equal(all.counts.changes_requested,1);
  assert.equal(all.counts.approved,1);
  assert.ok(!('score' in all));
  assert.deepEqual(summarizeAssessments(rows,'2027'),{
    total:2,counts:{draft:0,in_progress:1,submitted:1,changes_requested:0,approved:0},
  });
});

test('filter periode mempertahankan rentang lintas tahun',()=>{
  assert.deepEqual(yearsForAssessments(rows),['2027','2026']);
  assert.equal(withinYear(rows[1],'2027'),true);
  assert.equal(withinYear(rows[1],'2026'),true);
  assert.equal(withinYear(rows[2],'2026'),false);
  assert.equal(withinYear(rows[0],'garbage'),false);
  assert.equal(withinYear(rows[0],'all'),true);
});

test('search, status dan sorting hanya mengubah daftar tampilan',()=>{
  assert.deepEqual(filterAssessments(rows,{search:'asesmen',status:'draft'}).map(x=>x.id),['a']);
  assert.deepEqual(filterAssessments(rows,{year:'2027',status:'submitted'}).map(x=>x.id),['c']);
  assert.deepEqual(filterAssessments(rows,{sort:'newest'}).map(x=>x.id),['b','a','d','c','e']);
  assert.deepEqual(filterAssessments(rows,{sort:'oldest'}).map(x=>x.id),['e','c','d','a','b']);
  assert.deepEqual(filterAssessments(rows,{sort:'title'}).map(x=>x.title),[
    'Asesmen A','Asesmen B','Asesmen Disetujui','Perbaikan Kontrol','Review Teknologi',
  ]);
  assert.equal(rows.length,5);
});

test('perhatian tidak diperlakukan sebagai antrean reviewer yang ditugaskan',()=>{
  assert.deepEqual(attentionAssessments(rows).map(x=>x.id),['d','c','b']);
  assert.deepEqual(ownWork(rows,'maker').map(x=>x.id),['b','a','d']);
  assert.deepEqual(ownWork(rows,'another'),[]);
  assert.deepEqual(ownWork(rows,null),[]);
});

test('data API invalid tidak menghasilkan metrik fiktif',()=>{
  assert.deepEqual(validAssessments(null),[]);
  assert.deepEqual(validAssessments([null,{},false,{id:'x',title:4,status:'draft'}]),[]);
  assert.equal(summarizeAssessments(null).total,0);
  assert.equal(STATUS_LABELS.submitted,'Menunggu review');
});
