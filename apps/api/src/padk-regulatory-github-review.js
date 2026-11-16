const REPOSITORY='VYNTRIX-SOFTWARE/nusariksa';
const API='https://api.github.com/repos/'+REPOSITORY;
const COMMIT=/^[0-9a-f]{40}$/i;
const EXPECTED_PACKS=new Set([
  'regulations/padk43/cyber/packs/kategori-1.json',
  'regulations/padk43/cyber/packs/kategori-2.json',
]);

function reject(message){throw new TypeError('GitHub review gate ditolak: '+message);}
const nonblank=x=>typeof x==='string'&&x.trim().length>0;
const same=(a,b)=>nonblank(a)&&nonblank(b)&&a.toLowerCase()===b.toLowerCase();

async function apiGet(path,token,request){
  let response;
  try{
    response=await request(API+path,{
      method:'GET',headers:{
        Accept:'application/vnd.github+json',
        Authorization:'Bearer '+token,
        'X-GitHub-Api-Version':'2022-11-28',
        'User-Agent':'NusaRiksa-release-review-gate',
      },signal:AbortSignal.timeout(15000),
    });
  }catch{reject('GitHub API tidak dapat dijangkau');}
  if(!response?.ok)reject('GitHub API menolak permintaan (HTTP '+(response?.status??'?')+')');
  try{return await response.json();}catch{reject('Respons GitHub API bukan JSON yang valid');}
}

async function paged(path,token,request){
  const all=[];
  for(let page=1;page<=20;page++){
    const separator=path.includes('?')?'&':'?';
    const items=await apiGet(path+separator+'per_page=100&page='+page,token,request);
    if(!Array.isArray(items)||items.length>100)reject('Daftar review/file tidak valid');
    all.push(...items);
    if(items.length<100)return all;
  }
  reject('Daftar review/file melebihi batas verifikasi; tidak boleh dipotong diam-diam');
}

function latestDecision(reviews,login){
  const relevant=reviews.filter(x=>same(x?.user?.login,login)&&
    ['APPROVED','CHANGES_REQUESTED','DISMISSED'].includes(x?.state))
    .sort((a,b)=>{
      const time=Date.parse(a.submitted_at)-Date.parse(b.submitted_at);
      return time || a.id-b.id;
    });
  return relevant.at(-1);
}

/**
 * Proof is obtained over HTTPS directly from GitHub, never from hand-authored
 * reviewer metadata. This verifies GitHub approval, not the accuracy of PDF
 * transcription or the actual depth of human review.
 */
export async function verifyIndependentPadkGithubReview({
  evidence,reviewedPacks,prNumber,currentCommitSha,token,request=fetch,
}){
  if(!Number.isSafeInteger(prNumber)||prNumber<1||!COMMIT.test(currentCommitSha??''))
    reject('nomor PR atau SHA commit tidak valid');
  if(!nonblank(token))reject('GITHUB_TOKEN wajib untuk verifikasi live');
  const review=evidence?.review;
  if(!review||!nonblank(review.compiledBy)||!Array.isArray(review.attestations)
    ||review.attestations.length!==2||!Array.isArray(reviewedPacks)
    ||reviewedPacks.length!==2)reject('metadata review dan dua pack wajib tersedia');
  const byRole=new Map(review.attestations.map(x=>[x.role,x]));
  if(byRole.size!==2||!byRole.has('substance')||!byRole.has('technical'))
    reject('review substansi dan teknis wajib berbeda');
  const substance=byRole.get('substance'),technical=byRole.get('technical');
  if(!nonblank(substance.reviewerId)||!nonblank(technical.reviewerId)
    ||same(substance.reviewerId,technical.reviewerId)
    ||same(substance.reviewerId,review.compiledBy)
    ||same(technical.reviewerId,review.compiledBy))
    reject('identitas reviewer tidak independen');
  for(const item of reviewedPacks){
    const declaration=item?.review;
    if(!same(declaration?.compiledBy,review.compiledBy)
      ||!Array.isArray(declaration?.attestations)||declaration.attestations.length!==2)
      reject('penyusun/attestasi tiap pack berbeda dari evidence');
    for(const entry of declaration.attestations){
      const declared=byRole.get(entry?.role);
      if(!same(entry?.reviewerId,declared?.reviewerId)
        ||entry.reviewedAt!==declared.reviewedAt
        ||entry.packSha256!==item.sha256)
        reject('attestasi tiap pack tidak sejalan dengan hasil review');
    }
  }
  const pr=await apiGet('/pulls/'+prNumber,token,request);
  if(pr?.state!=='closed'||pr?.merged!==true||pr?.draft===true
    ||pr.base?.ref!=='main'||pr.base?.repo?.full_name!==REPOSITORY
    ||pr.head?.repo?.full_name!==REPOSITORY
    ||!same(pr.user?.login,review.compiledBy)
    ||!COMMIT.test(pr.head?.sha??'')
    ||!same(pr.merge_commit_sha,currentCommitSha))
    reject('PR harus sudah merged ke main, disusun oleh compiler, dan identik dengan checkout release');
  const [head,merged,files,reviews]=await Promise.all([
    apiGet('/git/commits/'+pr.head.sha,token,request),
    apiGet('/git/commits/'+currentCommitSha,token,request),
    paged('/pulls/'+prNumber+'/files',token,request),
    paged('/pulls/'+prNumber+'/reviews',token,request),
  ]);
  if(!COMMIT.test(head?.tree?.sha??'')||head.tree.sha!==merged?.tree?.sha)
    reject('tree PR yang di-review berbeda dari tree commit hasil squash');
  const changed=new Set(files.filter(x=>['added','modified','renamed'].includes(x.status))
    .map(x=>x.filename));
  if([...EXPECTED_PACKS].some(x=>!changed.has(x)))
    reject('dua regulatory pack final wajib termasuk dalam PR yang di-review');
  for(const entry of [substance,technical]){
    const decision=latestDecision(reviews,entry.reviewerId);
    if(decision?.state!=='APPROVED'||decision.commit_id!==pr.head.sha
      ||!nonblank(decision.submitted_at)
      ||Number.isNaN(Date.parse(decision.submitted_at))
      ||decision.submitted_at.slice(0,10)!==entry.reviewedAt
      ||same(decision.user?.login,pr.user.login))
      reject('approval independen tidak sah untuk '+entry.role);
  }
  return {
    independentGitHubReviewVerified:true,
    reviewSource:'GITHUB_API_LIVE',
    prNumber,reviewedHeadSha:pr.head.sha,mergedCommitSha:currentCommitSha,
    verifiedPackFiles:2,
    reviewerRoles:['substance','technical'],
    note:'Approval GitHub diverifikasi; isi PDF dan keputusan substansi tetap bergantung pada review manusia.',
  };
}
