import {trustStateRoot} from './human-signal-core.mjs';
export class CheckpointWorker{
 constructor({database,accounts,readComposite,signer,issuer}){Object.assign(this,{database,accounts,readComposite,signer,issuer});this.status={lastSuccess:null,lastError:null};this.running=false;}
 async run(){
  if(this.running)return;this.running=true;
  try{
   const work=async()=>{
    const composite=this.readComposite();if(composite.storageRecovered)throw Error('TRUST_STATE_UNAVAILABLE');
    const state=trustStateRoot({...composite,...await this.database.snapshot()});
    const checkpoint={...state,createdAt:new Date().toISOString(),anchoredOnSolana:false,...(this.signer?{issuer:this.issuer}:{})};
    await this.database.saveCheckpoint(this.signer?this.signer.sign(checkpoint):checkpoint);
   };
   if(this.accounts)await this.accounts.transaction(work);else await work();
   this.status={lastSuccess:new Date().toISOString(),lastError:null};
  }catch{this.status.lastError='CHECKPOINT_FAILED';}finally{this.running=false;}
 }
 start(){void this.run();this.timer=setInterval(()=>void this.run(),5*60*1000);this.timer.unref();}
 stop(){clearInterval(this.timer);}
}
