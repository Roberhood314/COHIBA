// Operator-only CLI. No public unauthenticated enrollment endpoint.
import fs from 'node:fs';
import {PohaDatabase} from '../lib/poha-postgres.mjs';
const [file]=process.argv.slice(2);if(!file||!process.env.HUMAN_SIGNAL_DATABASE_URL)throw Error('POLICY_FILE_AND_DATABASE_REQUIRED');
const db=new PohaDatabase({connectionString:process.env.HUMAN_SIGNAL_DATABASE_URL});
try{await db.initialize();const policy=JSON.parse(fs.readFileSync(file));await db.enrollService(policy);console.log(JSON.stringify({serviceId:policy.id,enabled:policy.enabled!==false,registered:true}));}finally{await db.close();}
