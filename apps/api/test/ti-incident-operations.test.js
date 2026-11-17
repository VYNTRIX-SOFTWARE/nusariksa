import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  encodeIncidentRegisterCsv,incidentCsvField,IncidentReportError,
} from '../src/ti-incident-operations.js';
import {validateIncidentOperationsOverview}
  from '../../web/assets/ti-incidents-ui.js';

test('CSV register mencegah formula injection dan menjaga quoting lintas perangkat',()=>{
  for(const formula of ['=1+1',' +SUM(A1:A2)','-2+3','@SUM(1,2)','\t=HYPERLINK("x")']){
    const field=incidentCsvField(formula);
    assert.ok(field.startsWith('"\''));
    assert.ok(field.includes("'"));
  }
  assert.equal(incidentCsvField('a,"b"'),'"a,""b"""');
  const csv=encodeIncidentRegisterCsv([{
    id:'11111111-1111-4111-8111-111111111111',
    incident_code:'INC-001',title:'=HYPERLINK("https://example.invalid")',
    category:'data',severity:'high',status:'reported',
    detected_at:new Date('2026-11-17T07:00:00.000Z'),resolved_at:null,
    closed_at:null,pic:'Unit TI',asset_code:'SRV-01',
    risk_code:null,description:'Ditemukan kendala',impact_summary:'',
    containment_action:'',root_cause:'',resolution:'',
  }]);
  const decoded=csv.toString('utf8');
  assert.ok(decoded.startsWith('\uFEFF"ID","Kode","Judul"'));
  assert.ok(decoded.includes("'=HYPERLINK("));
  assert.ok(decoded.includes('2026-11-17T07:00:00.000Z'));
  assert.ok(!decoded.includes('undefined'));
  assert.ok(decoded.endsWith('\r\n'));
  assert.throws(()=>encodeIncidentRegisterCsv(Array(5001).fill({})),TypeError);
});
test('overview insiden menolak angka yang tidak konsisten',()=>{
  const summary={
    kind:'INTERNAL_OPERATIONAL_OVERVIEW',regulatoryAssessment:false,
    totalActive:2,archived:1,unresolved:1,highCriticalUnresolved:1,
    oldestUnresolvedAt:'2026-11-16T10:00:00.000Z',
    statuses:{reported:1,investigating:0,contained:0,resolved:1,closed:0},
    severities:{low:0,medium:1,high:1,critical:0},
  };
  assert.deepEqual(validateIncidentOperationsOverview(summary),summary);
  for(const changes of [
    {totalActive:3},{unresolved:0},{highCriticalUnresolved:2},
    {oldestUnresolvedAt:null},{regulatoryAssessment:true},
    {kind:'REGULATORY_SCORE'},
    {statuses:{...summary.statuses,reported:-1}},
  ])assert.throws(()=>validateIncidentOperationsOverview({...summary,...changes}),TypeError);
});
