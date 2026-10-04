fetch('/health').then(r=>r.json()).then(x=>document.querySelector('#service').textContent=`Service: ${x.serviceId} · Audience: ${location.origin}. Hãy ký action cho đúng audience này.`).catch(()=>document.querySelector('#service').textContent='Ứng dụng chưa sẵn sàng.');
document.querySelector('#draft').addEventListener('submit',async event=>{
 event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;
 try{const response=await fetch('/drafts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({resource:document.querySelector('#resource').value,text:document.querySelector('#text').value,proof:JSON.parse(document.querySelector('#proof').value)})});document.querySelector('#result').textContent=JSON.stringify(await response.json(),null,2);}catch(error){document.querySelector('#result').textContent=error.message;}finally{button.disabled=false;}
});

fetch('/health').then(r=>r.json()).then(service=>{
 const origin=service.humanSignalOrigin;
 const link=document.createElement('a');link.href=origin+'/poha-lab.html';link.textContent='Tạo proof tại Human Signal bằng ví của bạn';link.target='_blank';document.querySelector('#service').after(link);
 window.addEventListener('message',event=>{
  if(event.origin!==origin||event.source!==window.opener||event.data?.type!=='HS_DRAFT_PROOF')return;
  const input=event.data.input;if(typeof input?.text!=='string'||typeof input.resource!=='string'||!input.proof?.payload)return;
  document.querySelector('#resource').value=input.resource;document.querySelector('#text').value=input.text;document.querySelector('#proof').value=JSON.stringify(input.proof,null,2);
  document.querySelector('#result').textContent='Đã nhận proof. Kiểm tra nội dung rồi bấm gửi; chỉ kết quả xác minh từ server mới cấp quyền lưu.';
 });
 if(window.opener)window.opener.postMessage({type:'HS_DRAFT_READY'},origin);
}).catch(()=>{});
