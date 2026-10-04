import {backupJsonDirectory,restoreJsonDirectory} from '../lib/durable-json.mjs';
const [mode,source,destination]=process.argv.slice(2);
if(!source || !destination || !['backup','restore'].includes(mode))throw Error('Usage: node scripts/storage-backup.mjs backup|restore source destination');
console.log(JSON.stringify({mode,files:mode==='backup'?backupJsonDirectory(source,destination):restoreJsonDirectory(source,destination)}));
