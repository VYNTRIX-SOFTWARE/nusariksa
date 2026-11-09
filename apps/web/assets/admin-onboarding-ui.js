const $=id=>document.getElementById(id);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const ROLES=new Map([
  ['IT_OFFICER','Petugas pengisi asesmen'],
  ['COMPLIANCE_OFFICER','Petugas kepatuhan dan pengisi'],
  ['REVIEWER','Pemeriksa draft (checker)'],
]);
const text=(tag,content,className)=>{
  const node=document.createElement(tag);
  node.textContent=String(content??'');
  if(className)node.className=className;
  return node;
};
export function validateAdminAccountList(data){
  if(!data||!Array.isArray(data.users)||data.users.length>50)
    throw new TypeError('Daftar akun tidak valid');
  for(const item of data.users){
    if(!UUID.test(item.id)||typeof item.email!=='string'
      ||!['pending','active','disabled'].includes(item.status)
      ||!Array.isArray(item.roles)||item.roles.some(x=>typeof x!=='string'))
      throw new TypeError('Akun tidak valid');
  }
  return data.users;
}
export function validateInviteResult(data){
  if(!data||!UUID.test(data.userId)||!TOKEN.test(data.invitationToken)
    ||typeof data.email!=='string'||!Number.isFinite(Date.parse(data.expiresAt)))
    throw new TypeError('Undangan tidak valid');
  return data;
}
export function createAdminOnboardingUI({api,getPermissions,onAuthFailure}){
  const state={users:[],busy:false,request:0};
  const allowed=()=>getPermissions().includes('users:manage');
  function feedback(message,kind='info'){
    const el=$('admin-onboard-message');
    el.textContent=message??'';el.hidden=!message;el.dataset.kind=kind;
  }
  function conceal(){
    $('admin-invite-token').textContent='';
    $('admin-invite-result').hidden=true;
  }
  function clear(){
    state.request++;state.users=[];state.busy=false;
    conceal();$('admin-invite-form').reset();$('admin-users-list').replaceChildren();
    feedback('');
  }
  function render(){
    $('admin-invite-submit').disabled=state.busy||!allowed();
    $('admin-users-refresh').disabled=state.busy||!allowed();
    const root=$('admin-users-list');root.replaceChildren();
    if(!state.users.length){
      root.append(text('p','Belum ada data akun atau daftar belum dimuat.','workspace-help'));
      return;
    }
    for(const user of state.users){
      const row=text('div','','onboard-user-row');
      const details=text('div','','onboard-user-info');
      details.append(text('strong',user.email),text('p',
        ({pending:'Menunggu aktivasi',active:'Aktif',disabled:'Dinonaktifkan'})[user.status]
        +' · Peran: '+(user.roles.length?user.roles.join(', '):'Belum ditetapkan')));
      row.append(details);
      if(user.status==='active'){
        const actions=text('div','','onboard-user-actions');
        const select=document.createElement('select');
        select.setAttribute('aria-label','Peran baru untuk '+user.email);
        const candidates=[...ROLES].filter(([key])=>!user.roles.includes(key));
        select.add(new Option('Pilih peran…',''));
        for(const [key,label] of candidates)select.add(new Option(label,key));
        const grant=text('button','Berikan peran','button button-outline');
        grant.type='button';grant.disabled=state.busy||!candidates.length;
        grant.addEventListener('click',async()=>{
          if(!allowed()||state.busy||!ROLES.has(select.value))return;
          state.busy=true;feedback('');
          try{
            await api('/users/'+encodeURIComponent(user.id)+'/roles',{
              method:'PATCH',body:{role:select.value,action:'GRANT'},
            });
            feedback('Peran berhasil diberikan kepada '+user.email+'.','success');
            await load({preserveMessage:true});
          }catch(error){
            if(!onAuthFailure(error))feedback(
              'Gagal memberikan peran. Pastikan akun aktif dan peran belum diberikan.','error');
          }finally{state.busy=false;render();}
        });
        actions.append(select,grant);row.append(actions);
      }
      root.append(row);
    }
  }
  async function load({preserveMessage=false}={}){
    if(!allowed())return;
    const request=++state.request;
    if(!preserveMessage)feedback('');
    state.busy=true;
    try{
      const data=validateAdminAccountList(await api('/users'));
      if(request!==state.request)return;
      state.users=data;
    }catch(error){
      if(request===state.request){
        state.users=[];
        if(!onAuthFailure(error))feedback('Gagal memuat akun pengguna.','error');
      }
    }finally{
      if(request===state.request){state.busy=false;render();}
    }
  }
  $('admin-invite-form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!allowed()||state.busy)return;
    const email=$('admin-invite-email').value.trim().toLowerCase();
    conceal();feedback('');
    state.busy=true;render();
    try{
      const created=validateInviteResult(await api('/users',{method:'POST',body:{email}}));
      $('admin-invite-token').textContent=created.invitationToken;
      $('admin-invite-result').hidden=false;
      $('admin-invite-form').reset();
      feedback('Undangan berhasil dibuat. Salin kode sekarang dan kirim melalui saluran aman.','success');
      await load({preserveMessage:true});
    }catch(error){
      if(!onAuthFailure(error))feedback('Gagal mengundang. Periksa alamat email atau duplikasi akun.','error');
    }finally{state.busy=false;render();}
  });
  $('admin-invite-hide').addEventListener('click',conceal);
  $('admin-users-refresh').addEventListener('click',()=>void load());
  render();
  return {load,clear,conceal,sync:render};
}
