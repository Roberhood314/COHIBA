import {canonical,base64,signingBytes,digest,timing,createAgent} from './poha-browser.mjs';
const $=s=>document.querySelector(s);
async function request(path,body){
  const token=localStorage.getItem('cohiba_human_signal_token');
  if(!token)throw new Error('Đăng nhập tại Human Signal trước khi dùng lab.');
  const response=await fetch('/api/v1/'+path,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Không thể kiểm tra hồ sơ.');return result;
}
async function refresh(){
  $('#refresh').disabled=true;$('#records').replaceChildren();
  try{
    const data=await request('agency');
    $('#status').textContent=`Principal: ${data.principalId||'legacy'} · Public key: ${data.principalKey||'legacy'} · Audience: ${data.audience} · Assurance: ${data.identityAssurance} · ${data.agents.length} agent có chữ ký · ${data.delegations.length} ủy quyền. ${data.executionEnabled?"Authorization đã bật cho service được đăng ký.":"Quyền thực thi chưa bật."}`;
    for(const [type,records] of [['AGENT',data.agents],['DELEGATION',data.delegations]]){
      for(const record of records){
        const box=document.createElement('div');box.className='record';
        const text=document.createElement('p');
        const state=record.revokedAt?'Đã thu hồi':Date.parse(record.payload.expiresAt)<=Date.now()?'Hết hạn':'Còn hiệu lực';
        text.textContent=`${record.payload.name||record.payload.scopes.join(', ')} · ${state} · ${record.id}`;box.append(text);
        if(!record.revokedAt){
          const button=document.createElement('button');button.type='button';button.textContent='Thu hồi';
          button.addEventListener('click',async()=>{button.disabled=true;try{await request('revocations',{type,id:record.id});await refresh();}catch(error){$('#status').textContent=error.message;button.disabled=false;}});box.append(button);
        }
        $('#records').append(box);
      }
    }
  }catch(error){$('#status').textContent=error.message;}finally{$('#refresh').disabled=false;}
}
$('#refresh').addEventListener('click',refresh);
$('#inspect').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;
  try{
    const data=await request('actions/inspect',JSON.parse($('#request').value));
    $('#result').textContent=JSON.stringify(data.result,null,2);
  }catch(error){$('#result').textContent=error.message;}finally{button.disabled=false;}
});
refresh();

$('#signed-register').addEventListener('submit',async event=>{
 event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;
 try{
  const input=JSON.parse($('#signed-input').value),kind=$('#signed-kind').value;
  const wallet=window.solana;if(!wallet?.isPhantom)throw Error('Cài hoặc mở ví Phantom để ký.');
  await wallet.connect();const bytes=wallet.publicKey.toBytes?wallet.publicKey.toBytes():wallet.publicKey.toBuffer();
  if(base64(bytes)!==input.payload.principalKey)throw Error('Ví đang kết nối không khớp principalKey.');
  if(kind==='AGENT_BINDING'&&!input.agentSignature)throw Error('Cần agentSignature từ Agent runtime.');
  const message=new TextEncoder().encode('HS/1/'+kind+'\n'+canonical(input.payload));
  const signed=await wallet.signMessage(message,'utf8'),signature=base64(signed.signature);
  const body=kind==='AGENT_BINDING'?{payload:input.payload,agentSignature:input.agentSignature,principalSignature:signature}:{payload:input.payload,signature};
  $('#signed-result').textContent=JSON.stringify(await request(kind==='AGENT_BINDING'?'agents/register':'delegations',body),null,2);await refresh();
 }catch(error){$('#signed-result').textContent=error.message;}finally{button.disabled=false;}
});

let pilotState=null;
async function walletSigner(principalKey){
 const wallet=window.solana;if(!wallet?.isPhantom)throw Error('Mở ví Phantom để ký.');
 await wallet.connect();const key=wallet.publicKey.toBytes?wallet.publicKey.toBytes():wallet.publicKey.toBuffer();
 if(base64(key)!==principalKey)throw Error('Ví đang mở không khớp ví đã liên kết với hồ sơ.');
 return async(kind,payload)=>base64((await wallet.signMessage(signingBytes(kind,payload),'utf8')).signature);
}
async function pilotService(){
 const response=await fetch('/api/v1/services/draft-board');const data=await response.json();
 if(!response.ok||!data.service.enabled)throw Error('Draft Board chưa được đăng ký.');
 const service=data.service;if(new URL(service.audience).protocol!=='https:')throw Error('Ứng dụng cần HTTPS.');return service;
}
function showPilot(){
 $('#pilot-result').textContent=JSON.stringify(pilotState.input,null,2);
 $('#pilot-open').disabled=false;
 $('#pilot-approve').disabled=!pilotState.approvalRequired||Boolean(pilotState.input.proof.approval);
}
pilotService().then(s=>$('#pilot-policy').textContent=`Ứng dụng: ${s.audience} · Quyền: DRAFT_APP_ACTION · Thời hạn grant: 1 giờ; proof: 1 phút.`).catch(e=>$('#pilot-policy').textContent=e.message);
$('#pilot').addEventListener('submit',async event=>{
 event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;
 pilotState=null;$('#pilot-open').disabled=true;$('#pilot-approve').disabled=true;
 try{
  const owner=await request('agency'),service=await pilotService();
  if(owner.identityAssurance!=='PHONE_VERIFIED')throw Error('Cần xác minh số điện thoại còn hiệu lực và liên kết ví trước khi cấp quyền.');
  const resource=$('#pilot-resource').value,text=$('#pilot-text').value,mode=$('#pilot-mode').value;
  if(!/^draft:[a-zA-Z0-9_-]{1,80}$/.test(resource)||new TextEncoder().encode(text).length>6000)throw Error('Bản nháp hoặc nội dung không hợp lệ.');
  const signHuman=await walletSigner(owner.principalKey),common={principalId:owner.principalId,audience:service.audience};
  let signerKey=owner.principalKey,delegationId='',sign=signHuman;
  if(mode!=='HUMAN'){
   const agent=await createAgent();signerKey=agent.publicKey;sign=agent.sign;
   const binding={...timing(3600000),...common,principalKey:owner.principalKey,agentKey:agent.publicKey,name:'Draft Board · tab hiện tại'};
   $('#pilot-message').textContent='Ví sẽ ký binding rồi ký quyền chỉ tạo bản nháp đã chọn.';
   const b=await request('agents/register',{payload:binding,agentSignature:await agent.sign('AGENT_BINDING',binding),principalSignature:await signHuman('AGENT_BINDING',binding)});
   const grant={...timing(3500000),...common,principalKey:owner.principalKey,agentKey:agent.publicKey,bindingId:b.record.id,scopes:['DRAFT_APP_ACTION'],resource,approvalRequired:mode==='APPROVAL',expiresAt:binding.expiresAt};
   const g=await request('delegations',{payload:grant,signature:await signHuman('DELEGATION',grant)});delegationId=g.record.id;
  }
  const payload={...timing(),...common,performer:mode==='HUMAN'?'HUMAN':'AGENT',signerKey,delegationId,action:'DRAFT_APP_ACTION',resource,payloadHash:await digest(new TextEncoder().encode(text))};
  pilotState={owner,service,approvalRequired:mode==='APPROVAL'||service.requireApproval,input:{resource,text,proof:{payload,signature:await sign('ACTION',payload)}}};
  showPilot();$('#pilot-message').textContent=pilotState.approvalRequired?'Proof đang chờ Human duyệt. Có thể gửi sang Draft Board để xem HUMAN_APPROVAL_REQUIRED, hoặc bấm duyệt.':'Proof đã ký. Mở Draft Board, kiểm tra nội dung và bấm gửi trong vòng 1 phút.';
  await refresh();
 }catch(error){$('#pilot-message').textContent=error.message;}finally{button.disabled=false;}
});
$('#pilot-approve').addEventListener('click',async()=>{
 $('#pilot-approve').disabled=true;
 try{
  if(!pilotState||Date.parse(pilotState.input.proof.payload.expiresAt)<=Date.now())throw Error('Proof hết hạn, hãy tạo hành động mới.');
  const p={...timing(),principalId:pilotState.owner.principalId,principalKey:pilotState.owner.principalKey,audience:pilotState.service.audience,actionDigest:await digest(signingBytes('ACTION',pilotState.input.proof.payload))};
  const sign=await walletSigner(pilotState.owner.principalKey);pilotState.input.proof.approval={payload:p,signature:await sign('APPROVAL',p)};
  showPilot();$('#pilot-message').textContent='Đã ký duyệt đúng hash hành động. Chuyển sang Draft Board để gửi.';
 }catch(error){$('#pilot-message').textContent=error.message;$('#pilot-approve').disabled=false;}
});
$('#pilot-open').addEventListener('click',()=>{
 if(!pilotState||Date.parse(pilotState.input.proof.payload.expiresAt)<=Date.now()){$('#pilot-message').textContent='Proof hết hạn, hãy tạo lại.';return;}
 const origin=pilotState.service.audience,child=window.open(origin,'hs-draft-board');
 if(!child){$('#pilot-message').textContent='Cho phép mở tab Draft Board hoặc sao chép proof bên trên.';return;}
 const listener=event=>{if(event.origin===origin&&event.source===child&&event.data?.type==='HS_DRAFT_READY'){child.postMessage({type:'HS_DRAFT_PROOF',input:pilotState.input},origin);window.removeEventListener('message',listener);}};
 window.addEventListener('message',listener);setTimeout(()=>window.removeEventListener('message',listener),30000);
});

$('#graph-refresh').addEventListener('click',async()=>{
 try{const data=await request('agency/graph');$('#graph-result').textContent=JSON.stringify(data.graph,null,2);}catch(error){$('#graph-result').textContent=error.message;}
});
