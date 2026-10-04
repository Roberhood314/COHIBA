import crypto from 'node:crypto';
export class DatabaseRateLimiter {
 constructor(pool,{limit=60,windowMs=60000}={}){this.pool=pool;this.limit=limit;this.windowMs=windowMs;this.lastCleanup=0;}
 async allow(identity){
  const now=Date.now(),window=Math.floor(now/this.windowMs),key=crypto.createHash('sha256').update(String(identity)).digest('hex');
  const r=await this.pool.query('INSERT INTO hs_rate_windows(key,window_id,count) VALUES($1,$2,1) ON CONFLICT(key,window_id) DO UPDATE SET count=hs_rate_windows.count+1 WHERE hs_rate_windows.count<$3 RETURNING count',[key,window,this.limit]);
  if(now-this.lastCleanup>60000){this.lastCleanup=now;await this.pool.query('DELETE FROM hs_rate_windows WHERE window_id<$1',[window-2]);}
  return r.rows.length>0;
 }
}
