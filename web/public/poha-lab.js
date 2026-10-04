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

function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
const base64=bytes=>btoa(String.fromCharCode(...bytes));
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
