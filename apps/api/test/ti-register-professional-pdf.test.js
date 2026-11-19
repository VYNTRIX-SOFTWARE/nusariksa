import assert from 'node:assert/strict';
import {test} from 'node:test';
import {REGISTER_EXPORTS} from '../src/ti-register-exports.js';
import {makeOperationalRegisterPdf} from '../src/ti-register-professional-pdf.js';

const snapshot=(type,rows=[])=>({
  type,institution:{name:'BPR Contoh Pengujian',kind:'BPR'},
  columns:REGISTER_EXPORTS[type].columns,rows,
  scope:'all',generatedAt:'2026-11-19T12:00:00.000Z',
});

test('PDF register menyajikan sembilan jenis data tanpa mengklaim pengesahan OJK',()=>{
  for(const type of Object.keys(REGISTER_EXPORTS)){
    const pdf=makeOperationalRegisterPdf(snapshot(type));
    assert.ok(Buffer.isBuffer(pdf));
    const body=pdf.toString('latin1');
    assert.ok(body.startsWith('%PDF-1.4'),type);
    assert.match(body,/LAPORAN REGISTER TI/);
    assert.match(body,/BPR Contoh Pengujian/);
    assert.match(body,/Seluruh catatan tersimpan/);
    assert.match(body,/BUKAN LAPORAN RESMI OJK/);
    assert.match(body,/Belum ada catatan/);
    assert.match(body,/Halaman 1 \/ /);
    assert.doesNotMatch(body,/FINAL INTERNAL|DISETUJUI OJK/);
  }
});

test('PDF register risiko mencetak seluruh data aktual dan mengamankan karakter PDF',()=>{
  const first={
    risk_code:'RSK-2026-000001',title:'Gangguan layanan (CBS) \\ utama',
    scenario:'=HYPERLINK("external") tidak boleh menjadi fungsi PDF',
    likelihood:4,impact:5,residual_likelihood:null,residual_impact:null,
    mitigation:'Pemulihan harus diverifikasi secara nyata.',pic:'Petugas TI',
    due_date:new Date('2027-01-31T00:00:00Z'),status:'open',note:'',
    archived_at:null,
  };
  const last={...first,risk_code:'RSK-2026-000065',
    title:'Catatan penutup panjang '.repeat(20),
    note:'Catatan faktual yang disimpan oleh petugas '.repeat(20),
    archived_at:new Date('2026-11-19T12:00:00Z')};
  const rows=[first,...Array.from({length:63},(_,i)=>({
    ...first,risk_code:'RSK-2026-'+String(i+2).padStart(6,'0'),
    title:'Risiko nomor '+(i+2),note:'Rincian register TI '.repeat(16),
  })),last];
  const pdf=makeOperationalRegisterPdf(snapshot('risks',rows));
  const body=pdf.toString('latin1');
  assert.match(body,/RSK-2026-000001/);
  assert.match(body,/RSK-2026-000065/);
  assert.match(body,/Gangguan layanan/);
  assert.ok(body.includes(String.raw`\(CBS\)`));
  assert.match(body,/HYPERLINK/);
  assert.match(body,/DIARSIPKAN/);
  assert.match(body,/BUKAN LAPORAN RESMI OJK/);
  assert.ok([...body.matchAll(/\/Type \/Page \/Parent /g)].length>5);
  const xref=/startxref\n(\d+)\n%%EOF/.exec(body);
  assert.ok(xref);
  assert.equal(body.slice(Number(xref[1]),Number(xref[1])+4),'xref');
  assert.ok(pdf.byteLength<3*1024*1024);
});

test('laporan menolak tipe, identitas, atau daftar melebihi batas',()=>{
  assert.throws(()=>makeOperationalRegisterPdf({}),TypeError);
  assert.throws(()=>makeOperationalRegisterPdf({...snapshot('risks'),scope:'filtered'}),TypeError);
  assert.throws(()=>makeOperationalRegisterPdf({...snapshot('risks'),institution:{}}),TypeError);
  assert.throws(()=>makeOperationalRegisterPdf({...snapshot('risks'),type:'unknown'}),TypeError);
  assert.throws(()=>makeOperationalRegisterPdf({
    ...snapshot('risks'),rows:Array.from({length:501},()=>({risk_code:'RSK'})),
  }),TypeError);
});
