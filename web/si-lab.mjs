const button=document.querySelector('#run'),status=document.querySelector('#run-status'),results=document.querySelector('#results');
let worker;
button.addEventListener('click',async()=>{
 button.disabled=true;status.textContent='Loading public fixtures and verifying in a local Worker…';results.replaceChildren();
 try{
  const response=await fetch('/hs2-vectors.json',{cache:'no-store'});if(!response.ok)throw Error('Fixtures unavailable');const report=await response.json();
  worker?.terminate();worker=new Worker(new URL('./si-lab-worker.mjs',import.meta.url),{type:'module'});
  const timer=setTimeout(()=>{worker.terminate();button.disabled=false;status.textContent='Verification timed out. No authorization was issued.';},30000);
  worker.onerror=()=>{clearTimeout(timer);worker.terminate();button.disabled=false;status.textContent='Worker failed. No authorization was issued.';};
  worker.onmessage=({data})=>{
   clearTimeout(timer);button.disabled=false;worker.terminate();
   if(data.error){status.textContent='Verification failed: '+data.error;return;}
   for(const row of data.rows){const tr=document.createElement('tr');for(const text of [row.name,row.passed?'PASS':'FAIL',row.verdict,row.milliseconds+' ms']){const td=document.createElement('td');td.textContent=text;tr.append(td);}tr.title=row.reason;tr.className=row.passed?'passed':'failed';results.append(tr);}
   status.textContent=(data.ok?'All checks behaved as expected. ':'One or more checks failed. ')+data.totalMilliseconds+' ms measured in your browser. Signature size: '+data.signatureBytes.toLocaleString()+' bytes per SLH-DSA signature. Execution authorized: false.';
  };
  worker.postMessage(report);
 }catch(e){button.disabled=false;status.textContent=String(e.message)+'. No authorization was issued.';}
});
