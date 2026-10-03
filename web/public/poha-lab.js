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
    $('#status').textContent=`Audience: ${data.audience} · Assurance: ${data.identityAssurance} · ${data.agents.length} agent có chữ ký · ${data.delegations.length} ủy quyền. Quyền thực thi chưa bật.`;
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
