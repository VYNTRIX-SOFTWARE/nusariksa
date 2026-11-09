// Intentionally synthetic CI-only seed. Never import bank data here.
import {createPool} from '../apps/api/src/database.js';
import {createCatalogInTransaction,addControlInTransaction,
  publishVersionInTransaction,assignCatalogInTransaction} from '../apps/api/src/control-catalogs.js';
import {createAssessmentInTransaction,startAssessmentInTransaction} from '../apps/api/src/assessments.js';
import {uploadEvidenceInTransaction} from '../apps/api/src/assessment-evidence.js';
import {createPadkPreparationInTransaction} from '../apps/api/src/padk-preparations.js';
import {savePadkIndicatorNoteInTransaction} from '../apps/api/src/padk-preparation-indicators.js';
import {uploadPadkEvidenceInTransaction} from '../apps/api/src/padk-evidence.js';
import {configureEvidenceKeys} from '../apps/api/src/evidence-keyring.js';

if(process.env.NUSARIKSA_CI_RECOVERY_FIXTURE!=='1')throw new Error('CI fixture guard missing');
const keyring=configureEvidenceKeys({
  legacyKey:process.env.EVIDENCE_ENCRYPTION_KEY,
  keysJson:process.env.EVIDENCE_KEYRING,
  activeId:process.env.EVIDENCE_ACTIVE_KEY_ID,
});
if(!keyring?.keys||!keyring.legacyKey)throw new Error('Synthetic CI keys missing');

const pool=createPool();
const db=await pool.connect();
try{
  await db.query('BEGIN');
  const institution=await db.query("INSERT INTO institutions(name,kind) VALUES('Recovery Fixture BPR','BPR') RETURNING id");
  const user=await db.query(
    "INSERT INTO users(email,status,password_hash) VALUES ('recovery-fixture@example.test','active','test-only-hash') RETURNING id");
  const actorId=user.rows[0].id;
  await db.query("INSERT INTO user_roles(user_id,role) VALUES ($1,'IT_OFFICER')",[actorId]);
  const catalog=await createCatalogInTransaction(db,{
    actorId,code:'RECOVERY_TEST',title:'Synthetic recovery controls'});
  const versionId=catalog.currentVersion.id;
  const control=await addControlInTransaction(db,{
    actorId,versionId,code:'BACKUP',title:'Encrypted evidence backup test'});
  await publishVersionInTransaction(db,{actorId,versionId});
  const assessment=await createAssessmentInTransaction(db,{
    actorId,title:'Recovery test',periodStart:'2026-01-01',periodEnd:'2026-12-31'});
  await assignCatalogInTransaction(db,{actorId,assessmentId:assessment.id,versionId});
  await startAssessmentInTransaction(db,{actorId,id:assessment.id});
  const payload={fileName:'synthetic.pdf',mediaType:'application/pdf',
    contentBase64:Buffer.from('%PDF-1.4\nSYNTHETIC RECOVERY FILE\n%%EOF').toString('base64')};
  await uploadEvidenceInTransaction(db,{actorId,assessmentId:assessment.id,
    controlId:control.id,...payload,key:keyring});
  const prep=await createPadkPreparationInTransaction(db,{
    actorId,title:'PADK recovery synthetic test',category:2,
    periodStart:'2026-01-01',periodEnd:'2026-12-31'});
  await savePadkIndicatorNoteInTransaction(db,{
    actorId,id:prep.id,number:1,preparationNotes:'SOP synthetic recovery',
    evidencePlan:'Bukti restore test',expectedRevision:0});
  await uploadPadkEvidenceInTransaction(db,{actorId,id:prep.id,
    number:1,...payload,key:keyring.legacyKey});
  await uploadPadkEvidenceInTransaction(db,{actorId,id:prep.id,
    number:1,...payload,key:keyring});
  await db.query('COMMIT');
  console.log('Synthetic recovery fixtures created');
}catch{
  await db.query('ROLLBACK');throw new Error('Synthetic recovery fixture failed');
}finally{db.release();await pool.end();}
