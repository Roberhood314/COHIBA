import {evaluateEvolutionGate,CRYPTO_AGILITY_POLICY} from "../lib/evolution-policy.mjs";

const probes=[
  {name:"safe patch",input:{tags:["performance"],testsPassed:true,securityPassed:true,rollbackDefined:true},expect:true},
  {name:"mainnet",input:{tags:["mainnet"],testsPassed:true,securityPassed:true,rollbackDefined:true},expect:false},
  {name:"economics",input:{tags:["economics"],testsPassed:true,securityPassed:true,rollbackDefined:true},expect:false},
  {name:"secret change",input:{tags:["security"],testsPassed:true,securityPassed:true,rollbackDefined:true,changesSecrets:true},expect:false}
];

const results=probes.map(p=>({name:p.name,ok:evaluateEvolutionGate(p.input).automaticEligible===p.expect}));
results.push({
  name:"crypto policy rejects secrecy-as-security",
  ok:CRYPTO_AGILITY_POLICY.requirements.some(x=>x.includes("no proprietary secrecy"))
});
const failed=results.filter(x=>!x.ok);
console.log(JSON.stringify({ok:failed.length===0,results,failed},null,2));
if(failed.length) process.exit(1);
