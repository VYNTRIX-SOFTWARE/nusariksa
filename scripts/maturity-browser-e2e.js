// Chromium E2E for the single-tenant internal maturity maker-checker workflow.
// No browser-testing dependency: use Chrome DevTools Protocol on Node 24.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer as createNetServer} from 'node:net';
import {createPool} from '../apps/api/src/database.js';
import {runMigrations} from '../apps/api/src/migrations.js';
import {hashPassword} from '../apps/api/src/passwords.js';
import {createServer} from '../apps/api/src/server.js';
import {
  createMaturityModelInTransaction,addMaturityDomainInTransaction,
  setMaturityLevelInTransaction,publishMaturityVersionInTransaction,
} from '../apps/api/src/maturity-models.js';
import {
  setMaturityPolicyInTransaction,createMaturityAssessmentInTransaction,
  rateMaturityDomainInTransaction,getMaturityAssessmentInTransaction,
  listMaturityAssessments,listMaturityDomainHistory,
} from '../apps/api/src/maturity-assessments.js';
import {
  submitMaturityAssessmentInTransaction,reviewMaturityAssessmentInTransaction,
  listMaturityReviewHistory,listPendingMaturityReviews,
} from '../apps/api/src/maturity-assessment-reviews.js';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const waitFor=async(action,label,timeout=14000)=>{
  const until=Date.now()+timeout;
  let last=null;
  while(Date.now()<until){
    try{const result=await action();if(result)return result;}catch(error){last=error;}
    await delay(90);
  }
  throw new Error('Timeout: '+label+(last?' ('+last.message+')':''));
};
async function openPort(){
  const net=createNetServer();
  net.listen(0,'127.0.0.1');await once(net,'listening');
  const port=net.address().port;
  net.close();await once(net,'close');
  return port;
}
function chromePath(){
  for(const candidate of [process.env.CHROME_BIN,'google-chrome-stable','google-chrome','chromium','chromium-browser']){
    if(!candidate)continue;
    const found=spawnSync('which',[candidate],{encoding:'utf8'});
    if(found.status===0)return found.stdout.trim();
  }
  throw new Error('Chromium tidak ditemukan. Set CHROME_BIN atau pasang Chrome.');
}
class Cdp {
  constructor(socket){
    this.socket=socket;this.sequence=0;this.pending=new Map();this.errors=[];
    socket.addEventListener('message',event=>{
      let packet;
      try{packet=JSON.parse(event.data);}catch{return;}
      if(packet.method==='Runtime.consoleAPICalled'&&packet.params?.type==='error')
        this.errors.push(packet.params.args?.map(x=>x.description??x.value??'').join(' ')??'unknown error');
      if(!packet.id)return;
      const pending=this.pending.get(packet.id);
      if(!pending)return;
      clearTimeout(pending.timer);this.pending.delete(packet.id);
      if(packet.error)pending.reject(new Error(packet.error.message));
      else pending.resolve(packet.result);
    });
    socket.addEventListener('close',()=>{
      for(const pending of this.pending.values()){
        clearTimeout(pending.timer);pending.reject(new Error('Browser connection closed'));
      }
      this.pending.clear();
    });
  }
  command(method,params={}){
    const id=++this.sequence;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        this.pending.delete(id);reject(new Error('CDP timeout: '+method));
      },14000);
      this.pending.set(id,{resolve,reject,timer});
      this.socket.send(JSON.stringify({id,method,params}));
    });
  }
  async evaluate(expression){
    const response=await this.command('Runtime.evaluate',{
      expression,returnByValue:true,awaitPromise:true,userGesture:true,
    });
    if(response.exceptionDetails)
      throw new Error(response.exceptionDetails.text);
    return response.result?.value;
  }
  async until(expression,label){
    return waitFor(()=>this.evaluate(expression),label);
  }
  close(){this.socket.close();}
}
async function launchChromium(){
  const profile=await mkdtemp(join(tmpdir(),'nusariksa-chromium-'));
  const child=spawn(chromePath(),[
    '--headless=new','--no-sandbox','--disable-dev-shm-usage',
    '--disable-gpu','--no-first-run','--no-default-browser-check',
    '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank',
  ],{stdio:['ignore','ignore','pipe']});
  let stderr='';
  child.stderr.on('data',buf=>{stderr=(stderr+buf.toString()).slice(-2000);});
  try{
    const port=await waitFor(async()=>{
      const contents=await readFile(join(profile,'DevToolsActivePort'),'utf8');
      const value=Number(contents.split('\n')[0]);
      return Number.isSafeInteger(value)&&value>0?value:null;
    },'Chromium DevToolsActivePort');
    const target=await waitFor(async()=>{
      const response=await fetch('http://127.0.0.1:'+port+'/json/list');
      const pages=await response.json();
      return pages.find(page=>page.type==='page'&&page.webSocketDebuggerUrl);
    },'Chromium page');
    const ws=new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{
      ws.addEventListener('open',resolve,{once:true});
      ws.addEventListener('error',reject,{once:true});
    });
    const cdp=new Cdp(ws);
    await cdp.command('Page.enable');
    await cdp.command('Runtime.enable');
    return {cdp,child,profile};
  }catch(error){
    child.kill('SIGKILL');
    throw new Error(error.message+'\n'+stderr);
  }
}
async function stopChromium(browser){
  if(!browser)return;
  browser.cdp.close();
  const stopped=browser.child.exitCode!==null;
  if(!stopped){
    const exit=once(browser.child,'exit').catch(()=>null);
    browser.child.kill('SIGTERM');
    await Promise.race([exit,delay(2500)]);
    if(browser.child.exitCode===null)browser.child.kill('SIGKILL');
  }
  await delay(100);
  await rm(browser.profile,{recursive:true,force:true}).catch(()=>{});
}
async function seed(db){
  await db.query("INSERT INTO institutions(name,kind) VALUES('Bank Uji Browser','BPR')");
  const password='LocalE2eTestOnly_2026';
  const hashed=await hashPassword(password);
  const result=await db.query(
    "INSERT INTO users(email,status,password_hash) VALUES "+
    "('browser-maker@example.test','active',$1),"+
    "('browser-reviewer@example.test','active',$1),"+
    "('browser-viewer@example.test','active',$1) RETURNING id,email",[hashed],
  );
  const users=Object.fromEntries(result.rows.map(u=>[u.email.split('@')[0].split('-')[1],u.id]));
  await db.query(
    "INSERT INTO user_roles(user_id,role) VALUES "+
    "($1,'IT_OFFICER'),($2,'REVIEWER'),($3,'VIEWER')",
    [users.maker,users.reviewer,users.viewer],
  );
  const model=await createMaturityModelInTransaction(db,{
    actorId:users.maker,code:'BROWSER_MAT',title:'Maturitas internal browser',
    methodologyReference:'Rubrik internal untuk E2E tanpa klaim OJK',
  });
  const versionId=model.currentVersion.id;
  const domains=[];
  for(const [code,title] of [['GOV_E2E','Tata Kelola TI'],['SEC_E2E','Keamanan TI']]){
    const domain=await addMaturityDomainInTransaction(db,{
      actorId:users.maker,versionId,code,title,
    });
    domains.push(domain.id);
    for(let level=0;level<=5;level++)
      await setMaturityLevelInTransaction(db,{
        actorId:users.maker,domainId:domain.id,level,
        criterion:'Kriteria uji browser pada Level '+level+' untuk domain '+code+'.',
      });
  }
  await setMaturityPolicyInTransaction(db,{
    actorId:users.maker,versionId,method:'minimum',
  });
  await publishMaturityVersionInTransaction(db,{actorId:users.maker,versionId});
  const assessment=await createMaturityAssessmentInTransaction(db,{
    actorId:users.maker,modelVersionId:versionId,title:'Uji maker checker browser',
    periodStart:'2026-01-01',periodEnd:'2026-12-31',
  });
  for(const [index,domainId] of domains.entries())
    await rateMaturityDomainInTransaction(db,{
      actorId:users.maker,assessmentId:assessment.id,domainId,
      level:index+1,expectedRevision:0,
      justification:'Hasil awal diperiksa melalui browser dengan data uji internal.',
    });
  return {password,assessmentId:assessment.id,domains};
}
async function runBrowser(base,db,fixture){
  const browser=await launchChromium();
  const c=browser.cdp;
  const evalJs=js=>c.evaluate(js);
  const until=(js,label)=>c.until(js,label);
  async function login(role){
    await until("document.getElementById('login-screen') && !document.getElementById('login-screen').hidden",'login screen');
    await evalJs("document.getElementById('login-email').value='browser-"+role+"@example.test';"+
      "document.getElementById('login-password').value="+JSON.stringify(fixture.password)+";"+
      "document.getElementById('login-form').requestSubmit()");
    await until("document.getElementById('app-screen') && !document.getElementById('app-screen').hidden",'app after '+role+' login');
  }
  async function openMaturity(){
    try{
      await until("document.getElementById('maturity-assessments-menu') && !document.getElementById('maturity-assessments-menu').hidden",'maturity navigation');
    }catch(error){
      const diagnostic=await evalJs("(async()=>({loginVisible:!document.getElementById('login-screen').hidden,appVisible:!document.getElementById('app-screen').hidden,notice:document.getElementById('app-notice').textContent,loginError:document.getElementById('login-error').textContent,permissions:await fetch('/auth/permissions').then(async r=>({status:r.status,body:await r.text()})),assessments:await fetch('/assessments').then(async r=>({status:r.status,body:await r.text()})),missing:['ma-review-form','ma-review-queue-panel','ma-review-state','ma-review-queue','ma-submit','ma-review-history'].filter(id=>!document.getElementById(id)),menuHidden:document.getElementById('maturity-assessments-menu')?.hidden}))()");
      throw new Error(error.message+' | browser: '+JSON.stringify(diagnostic)+' | console: '+c.errors.join(' | '));
    }
    await evalJs("document.getElementById('maturity-assessments-menu').click()");
    try{
      await until("document.getElementById('ma-detail') && !document.getElementById('ma-detail').hidden",'maturity details');
    }catch(error){
      const info=await evalJs("(async()=>({pageHidden:document.getElementById('page-maturity-assessments').hidden,message:document.getElementById('ma-message').textContent,selected:document.getElementById('ma-assessment-select').value,options:[...document.getElementById('ma-assessment-select').options].map(x=>x.textContent),list:await fetch('/maturity-assessments').then(async r=>({status:r.status,body:await r.text()})),detail:await fetch('/maturity-assessments/'+document.getElementById('ma-assessment-select').value).then(async r=>({status:r.status,body:await r.text()}))}))()");
      throw new Error(error.message+' | maturity: '+JSON.stringify(info));
    }
  }
  async function logout(){
    await evalJs("document.getElementById('logout-button').click()");
    await until("document.getElementById('login-screen') && !document.getElementById('login-screen').hidden",'logout');
  }
  try{
    await c.command('Page.navigate',{url:base+'/'});
    await login('maker');
    await openMaturity();
    assert.equal(await evalJs("document.getElementById('ma-submit').hidden"),false);
    assert.equal(await evalJs("document.getElementById('ma-review-form').hidden"),true);
    await evalJs("window.confirm=()=>true;document.getElementById('ma-submit').click()");
    await until("document.getElementById('ma-review-state').textContent.includes('Menunggu review')",'submitted in maker UI');
    assert.equal(await evalJs("document.getElementById('ma-rating-form').hidden"),true);
    await logout();

    await login('reviewer');
    await openMaturity();
    await until("Boolean(document.querySelector('#ma-review-queue [data-ma-review-id]'))",'review queue item');
    await evalJs("document.querySelector('#ma-review-queue [data-ma-review-id]').click()");
    await until("!document.getElementById('ma-review-form').hidden",'review form');
    assert.equal(await evalJs("document.getElementById('ma-submit').hidden"),true);
    await evalJs("window.__e2eReviewSubmitted=0;document.getElementById('ma-review-form').addEventListener('submit',()=>window.__e2eReviewSubmitted++,{capture:true});");
    await evalJs("window.confirm=()=>true;"+
      "document.getElementById('ma-review-decision').value='request_changes';"+
      "document.getElementById('ma-review-note').value='Perjelas justifikasi domain pertama sebelum approval.';"+
      "document.getElementById('ma-review-form').requestSubmit()");
    try{
      await until("document.getElementById('ma-review-state').textContent.includes('Perlu perbaikan')",'changes requested');
    }catch(error){
      const browserState=await evalJs("({message:document.getElementById('ma-message').textContent,reviewState:document.getElementById('ma-review-state').textContent,decision:document.getElementById('ma-review-decision').value,note:document.getElementById('ma-review-note').value,formHidden:document.getElementById('ma-review-form').hidden,formValid:document.getElementById('ma-review-form').checkValidity(),invalid:[...document.getElementById('ma-review-form').elements].filter(x=>x.validity&&!x.validity.valid).map(x=>({id:x.id,reason:x.validationMessage})),buttonDisabled:document.getElementById('ma-review-save').disabled,submitEvents:window.__e2eReviewSubmitted})");
      const dbState=await db.query('SELECT status,submission_cycle FROM maturity_assessment_review_state WHERE assessment_id=$1',[fixture.assessmentId]);
      throw new Error(error.message+' | browser: '+JSON.stringify(browserState)+' | db: '+JSON.stringify(dbState.rows)+' | console: '+c.errors.join(' | '));
    }
    await logout();

    await login('maker');
    await openMaturity();
    assert.equal(await evalJs("document.getElementById('ma-rating-form').hidden"),false);
    await evalJs("document.getElementById('ma-rating-level').value='2';"+
      "document.getElementById('ma-rating-justification').value='Revisi berdasarkan catatan reviewer dan rubrik internal.';"+
      "document.getElementById('ma-rating-justification').dispatchEvent(new Event('input',{bubbles:true}));"+
      "document.getElementById('ma-rating-form').requestSubmit()");
    await until("document.getElementById('ma-message').textContent.includes('berhasil disimpan')",'rating revised');
    await until("!document.getElementById('ma-submit').hidden",'resubmit available');
    await evalJs("window.confirm=()=>true;document.getElementById('ma-submit').click()");
    await until("document.getElementById('ma-review-state').textContent.includes('Menunggu review')",'resubmitted in maker UI');
    await logout();

    await login('reviewer');
    await openMaturity();
    await until("Boolean(document.querySelector('#ma-review-queue [data-ma-review-id]'))",'second review queue item');
    await evalJs("document.querySelector('#ma-review-queue [data-ma-review-id]').click()");
    await until("!document.getElementById('ma-review-form').hidden",'second review form');
    await evalJs("window.confirm=()=>true;"+
      "document.getElementById('ma-review-decision').value='approve';"+
      "document.getElementById('ma-review-note').value='Penilaian sesuai rubrik internal.';"+
      "document.getElementById('ma-review-form').requestSubmit()");
    await until("document.getElementById('ma-review-state').textContent.includes('Disetujui internal')",'approved in reviewer UI');
    assert.equal(await evalJs("document.getElementById('ma-review-form').hidden"),true);
    const events=await db.query(
      'SELECT action,submission_cycle FROM maturity_assessment_review_events '+
      'WHERE assessment_id=$1 ORDER BY id',[fixture.assessmentId],
    );
    assert.deepEqual(events.rows.map(e=>e.action),
      ['SUBMITTED','CHANGES_REQUESTED','SUBMITTED','APPROVED']);
    assert.deepEqual(events.rows.map(e=>e.submission_cycle),[1,1,2,2]);
    const saved=await db.query(
      'SELECT status FROM maturity_assessment_review_state WHERE assessment_id=$1',
      [fixture.assessmentId],
    );
    assert.equal(saved.rows[0].status,'approved');
    await logout();

    await login('viewer');
    await openMaturity();
    assert.equal(await evalJs("document.getElementById('ma-review-queue-panel').hidden"),true);
    assert.equal(await evalJs("document.getElementById('ma-rating-form').hidden"),true);
    assert.equal(await evalJs("document.getElementById('ma-review-form').hidden"),true);
    assert.equal(await evalJs("document.getElementById('ma-submit').hidden"),true);
    console.log('Browser E2E PASS: maker → review → revisi → resubmit → approve → viewer read-only');
  }finally{
    await stopChromium(browser);
  }
}
async function main(){
  if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL wajib untuk browser E2E.');
  const pool=createPool();
  let client,server;
  try{
    await runMigrations(pool);
    client=await pool.connect();
    await client.query('BEGIN');
    const fixture=await seed(client);
    const port=await openPort();
    const origin='http://localhost:'+port;
    server=createServer({
      authDb:client,appOrigin:origin,
      maturityAssessmentHandlers:{
        create:(db,args)=>createMaturityAssessmentInTransaction(db,args),
        list:(db,args)=>listMaturityAssessments(db,args),
        detail:(db,args)=>getMaturityAssessmentInTransaction(db,args),
        rate:(db,args)=>rateMaturityDomainInTransaction(db,args),
        history:(db,args)=>listMaturityDomainHistory(db,args),
        submit:(db,args)=>submitMaturityAssessmentInTransaction(db,args),
        review:(db,args)=>reviewMaturityAssessmentInTransaction(db,args),
        reviews:(db,args)=>listMaturityReviewHistory(db,args),
        queue:(db,args)=>listPendingMaturityReviews(db,args),
      },
    });
    server.listen(port,'127.0.0.1');await once(server,'listening');
    await runBrowser(origin,client,fixture);
  }finally{
    if(server){server.close();await once(server,'close');}
    if(client){await client.query('ROLLBACK').catch(()=>{});client.release();}
    await pool.end();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
