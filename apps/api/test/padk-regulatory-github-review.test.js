import assert from 'node:assert/strict';
import {test} from 'node:test';
import {verifyIndependentPadkGithubReview as verify} from '../src/padk-regulatory-github-review.js';

const headSha='a'.repeat(40),mergeSha='b'.repeat(40),treeSha='c'.repeat(40);
const REPO='VYNTRIX-SOFTWARE/nusariksa';
const PACKS=['regulations/padk43/cyber/packs/kategori-1.json',
  'regulations/padk43/cyber/packs/kategori-2.json'];

function fixture(){
  const attestations=[
    {role:'substance',reviewerId:'reviewer-one',reviewedAt:'2026-11-16'},
    {role:'technical',reviewerId:'reviewer-two',reviewedAt:'2026-11-16'},
  ];
  const data={
    pr:{state:'closed',merged:true,draft:false,base:{ref:'main',repo:{full_name:REPO}},
      head:{sha:headSha,repo:{full_name:REPO}},merge_commit_sha:mergeSha,
      user:{login:'compiler'}},
    commits:{[headSha]:{tree:{sha:treeSha}},[mergeSha]:{tree:{sha:treeSha}}},
    files:PACKS.map(filename=>({filename,status:'added'})),
    reviews:attestations.map((x,i)=>({id:i+1,user:{login:x.reviewerId},
      state:'APPROVED',commit_id:headSha,submitted_at:'2026-11-16T10:00:00Z'})),
  };
  const reviewedPacks=[1,2].map((n)=>({sha256:String(n).repeat(64),review:{
    compiledBy:'compiler',attestations:attestations.map(x=>({role:x.role,
      reviewerId:x.reviewerId,reviewedAt:x.reviewedAt,packSha256:String(n).repeat(64)})),
  }}));
  const evidence={review:{compiledBy:'compiler',attestations}};
  const request=async url=>{
    const path=new URL(url).pathname;
    let result;
    if(path.endsWith('/pulls/123'))result=data.pr;
    else if(path.includes('/git/commits/'))result=data.commits[path.split('/').at(-1)];
    else if(path.endsWith('/pulls/123/files'))result=data.files;
    else if(path.endsWith('/pulls/123/reviews'))result=data.reviews;
    else throw Error('Unexpected URL '+url);
    return {ok:true,status:200,json:async()=>structuredClone(result)};
  };
  return {data,args:{evidence,reviewedPacks,prNumber:123,
    currentCommitSha:mergeSha,token:'TEST_TOKEN_NEVER_REAL',request}};
}

test('dua approval GitHub terikat PR merge, tree, dan kedua pack',async()=>{
  const result=await verify(fixture().args);
  assert.equal(result.independentGitHubReviewVerified,true);
  assert.equal(result.reviewSource,'GITHUB_API_LIVE');
  assert.equal(result.verifiedPackFiles,2);
  assert.equal(result.mergedCommitSha,mergeSha);
});

test('approval palsu, basi, dibatalkan, dan perubahan tree ditolak',async()=>{
  const cases=[
    x=>x.args.token='',
    x=>x.args.currentCommitSha='d'.repeat(40),
    x=>x.data.pr.merged=false,
    x=>x.data.pr.draft=true,
    x=>x.data.pr.base.ref='development',
    x=>x.data.pr.user.login='other-author',
    x=>x.data.commits[mergeSha].tree.sha='d'.repeat(40),
    x=>x.data.files.pop(),
    x=>x.data.reviews.pop(),
    x=>x.data.reviews[0].commit_id='e'.repeat(40),
    x=>x.data.reviews[1].state='DISMISSED',
    x=>x.data.reviews[0].submitted_at='2026-11-15T10:00:00Z',
    x=>x.args.evidence.review.attestations[0].reviewerId='compiler',
    x=>x.args.reviewedPacks[1].review.attestations[0].reviewerId='other-reviewer',
    x=>x.args.reviewedPacks[1].review.attestations[0].reviewedAt='2026-11-15',
  ];
  for(const mutation of cases){
    const testData=fixture();mutation(testData);
    await assert.rejects(()=>verify(testData.args),/GitHub review gate ditolak/);
  }
});

test('review CHANGES_REQUESTED yang lebih baru membatalkan approval',async()=>{
  const x=fixture();
  x.data.reviews.push({id:9,user:{login:'reviewer-one'},
    state:'CHANGES_REQUESTED',commit_id:headSha,
    submitted_at:'2026-11-16T11:00:00Z'});
  await assert.rejects(()=>verify(x.args),/approval independen/);
});

test('GitHub API gagal tertutup tanpa membocorkan token',async()=>{
  const x=fixture();
  x.args.request=async()=>({ok:false,status:403});
  await assert.rejects(()=>verify(x.args),err=>
    /HTTP 403/.test(err.message)&&!err.message.includes(x.args.token));
});

test('review 100 item tetap dipaginasi, bukan dipotong',async()=>{
  const x=fixture(),original=x.args.request;
  const fillers=Array.from({length:98},(_,i)=>({id:100+i,user:{login:'irrelevant-'+i},
    state:'COMMENTED',commit_id:headSha,submitted_at:'2026-11-16T09:00:00Z'}));
  x.args.request=async url=>{
    if(url.includes('/reviews?per_page=100&page=1'))return {ok:true,status:200,
      json:async()=>[...fillers,...x.data.reviews]};
    if(url.includes('/reviews?per_page=100&page=2'))return {ok:true,status:200,
      json:async()=>[]};
    return original(url);
  };
  assert.equal((await verify(x.args)).independentGitHubReviewVerified,true);
});
