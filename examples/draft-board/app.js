fetch('/health').then(r=>r.json()).then(x=>document.querySelector('#service').textContent=`Service: ${x.serviceId} · Audience: ${location.origin}. Hãy ký action cho đúng audience này.`).catch(()=>document.querySelector('#service').textContent='Ứng dụng chưa sẵn sàng.');
document.querySelector('#draft').addEventListener('submit',async event=>{
 event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;
 try{const response=await fetch('/drafts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({resource:document.querySelector('#resource').value,text:document.querySelector('#text').value,proof:JSON.parse(document.querySelector('#proof').value)})});document.querySelector('#result').textContent=JSON.stringify(await response.json(),null,2);}catch(error){document.querySelector('#result').textContent=error.message;}finally{button.disabled=false;}
});
