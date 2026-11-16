// Decision support ONLY. PADK Lampiran IV states two-decimal score bands
// without a tie-breaking rule for raw composites with more than two decimals.
// Never use this module as an official scoring engine.
const BANDS=[
  {rank:1,max:180,label:'Sangat Memadai'},
  {rank:2,max:260,label:'Memadai'},
  {rank:3,max:340,label:'Cukup Memadai'},
  {rank:4,max:420,label:'Kurang Memadai'},
  {rank:5,max:500,label:'Tidak Memadai'},
];
const POLICIES=['HALF_UP_2DP','HALF_EVEN_2DP','TRUNCATE_2DP'];

export function exactCompositeFraction(decimal){
  if(typeof decimal!=='string'||!/^(?:[1-4](?:\.\d{1,12})?|5(?:\.0{1,12})?)$/.test(decimal))
    throw new TypeError('Komposit harus string desimal 1–5 (maksimal 12 digit fraksi)');
  const [whole,fraction='']=decimal.split('.');
  const denominator=10n**BigInt(fraction.length);
  const numerator=BigInt(whole)*denominator+BigInt(fraction||'0');
  return {numerator,denominator};
}
function toRank(ticks){
  const item=BANDS.find(b=>ticks<=BigInt(b.max));
  if(!item)throw new TypeError('Komposit tidak berada pada rentang 1–5');
  return {rank:item.rank,label:item.label,display:(Number(ticks)/100).toFixed(2)};
}
export function inspectPadkRounding(decimal){
  const {numerator,denominator}=exactCompositeFraction(decimal);
  const scaled=numerator*100n;
  const quotient=scaled/denominator,remainder=scaled%denominator;
  const results=POLICIES.map(policy=>{
    let extra=0n;
    if(policy==='HALF_UP_2DP'&&2n*remainder>=denominator)extra=1n;
    if(policy==='HALF_EVEN_2DP'&&(2n*remainder>denominator
      ||(2n*remainder===denominator&&quotient%2n===1n)))extra=1n;
    const outcome=toRank(quotient+extra);
    return {policy,...outcome};
  });
  return {
    rawComposite:decimal,
    methods:results,
    sameRankAcrossPolicies:results.every(x=>x.rank===results[0].rank),
    requiresPolicyDecision:results.some(x=>x.rank!==results[0].rank),
    approvedRegulatoryPolicy:false,
    status:'ROUNDING_POLICY_REVIEW_REQUIRED',
    note:'Simulasi ketahanan terhadap kebijakan pembulatan, bukan keputusan peringkat resmi OJK.',
  };
}
export function padkRoundingDecisionExamples(){
  return ['1.8000','1.8049','1.805','1.8051','2.600','2.6049','2.605',
    '2.6051','3.400','3.405','4.200','4.205','5.000'].map(inspectPadkRounding);
}
