import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedHumanSignalOrigins,requireHumanSignalOrigin} from '../lib/human-signal-origin.mjs';
const origins=allowedHumanSignalOrigins({canonical:'https://cohibameme.site',publicBase:'https://cohiba-web-live-production.up.railway.app',railwayDomain:'cohiba-web-live-production.up.railway.app'});
test('canonical account origin stays allowed when public base is Railway',()=>{
 for(const origin of origins)assert.doesNotThrow(()=>requireHumanSignalOrigin({method:'POST',headers:{origin}},origins));
 for(const origin of ['https://evil.example','https://cohibameme.site.evil.example','null','https://cohibameme.site/path',''])assert.throws(()=>requireHumanSignalOrigin({method:'POST',headers:{origin}},origins),/ORIGIN_INVALID/);
});
test('same-origin browser GET without Origin uses verified referrer and Fetch Metadata',()=>{
 assert.doesNotThrow(()=>requireHumanSignalOrigin({method:'GET',headers:{referer:'https://cohibameme.site/poha-lab.html','sec-fetch-site':'same-origin'}},origins));
 for(const headers of [{referer:'https://evil.example','sec-fetch-site':'same-origin'},{referer:'https://cohibameme.site','sec-fetch-site':'cross-site'},{referer:'https://cohibameme.site'},{origin:'null',referer:'https://cohibameme.site','sec-fetch-site':'same-origin'}])assert.throws(()=>requireHumanSignalOrigin({method:'GET',headers},origins),/ORIGIN_INVALID/);
});

test('deployment can explicitly allow its verified service domain',()=>{
 const configured=allowedHumanSignalOrigins({canonical:'https://cohibameme.site',publicBase:'https://cohibameme.site',extraOrigins:['https://cohiba-web-live-production.up.railway.app']});
 assert.doesNotThrow(()=>requireHumanSignalOrigin({method:'POST',headers:{origin:'https://cohiba-web-live-production.up.railway.app'}},configured));
 assert.throws(()=>requireHumanSignalOrigin({method:'POST',headers:{origin:'https://unregistered.up.railway.app'}},configured),/ORIGIN_INVALID/);
});
