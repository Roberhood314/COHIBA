import {createAgent,base64,canonical} from './poha-browser.mjs';
import {prepareDisclosure,syntheticRequest} from './disclosure-browser.mjs';
const $=id=>document.getElementById(id);let state=null,busy=false;
async function api(path,body){
 const token=localStorage.getItem('cohiba_human_signal_token');if(!token)throw Error('Đăng nhập Human Signal trước khi thử.');
 const r=await fetch('/api/v1/'+path,{method:body===undefined?'GET':'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const d=await r.json();if(!r.ok)throw Error(d.error||'Không thể xác minh.');return d;
}
const selection=()=>({ageBand:$('age').value,activityBand:$('activity').value,dietaryNeeds:$('diet').value});
function preview(){if(state)state.revoke();state=null;$('preview').textContent=canonical(syntheticRequest(selection()));buttons();}
function buttons(){for(const id of ['age','activity','diet','create'])$(id).disabled=busy;$('execute').disabled=busy||!state;$('approve').disabled=busy||!state||$('diet').value==='omit';$('revoke').disabled=busy||!state;}
async function run(fn){if(busy)return;busy=true;buttons();try{await fn();}catch(e){$('status').textContent=e.message;}finally{busy=false;buttons();}}
preview();$('selection').addEventListener('change',preview);
$('selection').addEventListener('submit',e=>{e.preventDefault();run(async()=>{
 if(state)state.revoke();state=null;
 const values=selection(),owner=await api('agency'),discovery=await api('disclosure/pilot');
 if(owner.identityAssurance!=='PHONE_VERIFIED')throw Error('Cần xác minh điện thoại còn hiệu lực và liên kết ví.');
 const wallet=window.solana;if(!wallet?.isPhantom)throw Error('Mở ví Phantom để ký quyền.');
 const signOwner=async bytes=>{await wallet.connect();const key=wallet.publicKey.toBytes?wallet.publicKey.toBytes():wallet.publicKey.toBuffer();if(base64(key)!==owner.principalKey)throw Error('Ví không khớp hồ sơ.');return base64((await wallet.signMessage(bytes,'utf8')).signature);};
 $('status').textContent='Đang ký 3 quyền bằng ví. Kiểm tra từng nội dung trước khi duyệt.';
 state=await prepareDisclosure({selection:values,owner,audience:discovery.service.audience,agent:await createAgent(),signOwner,register:api});
 $('status').textContent=values.dietaryNeeds==='omit'?'Đã ký. Bấm xác minh và chạy mock trong 1 phút.':'Đã ký. Dữ liệu ăn uống cần ký duyệt riêng trước khi chạy.';$('result').textContent='';
});});
$('approve').addEventListener('click',()=>run(async()=>{
 const owner=state.snapshot().owner,wallet=window.solana;
 await state.approve(async bytes=>{await wallet.connect();const key=wallet.publicKey.toBytes?wallet.publicKey.toBytes():wallet.publicKey.toBuffer();if(base64(key)!==owner.principalKey)throw Error('Ví không khớp hồ sơ.');return base64((await wallet.signMessage(bytes,'utf8')).signature);});
 $('status').textContent='Đã ký duyệt nội dung và hành động PoHA. Bấm chạy trước khi proof hết hạn.';
}));
$('execute').addEventListener('click',()=>run(async()=>{
 const result=await state.execute(request=>api('disclosure/pilot',request));$('result').textContent=JSON.stringify(result,null,2);$('status').textContent=result.sent?'Mock đã chạy; không gửi dữ liệu tới AI bên ngoài.':'Chưa gửi: '+(result.reason||result.actorClass);if(result.sent)state=null;
}));
$('revoke').addEventListener('click',()=>run(async()=>{
 const id=state.snapshot().request.proof.payload.delegationId;state.revoke();state=null;
 await api('revocations',{type:'DELEGATION',id});$('status').textContent='Đã thu hồi delegation trên backend và khóa luồng local.';
}));
