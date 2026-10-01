import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const server=read("web-server.mjs");
const staged=read("scripts/create-token-staged.ts");
const revoke=read("scripts/revoke-authorities.ts");

const checks=[
  ["mainnet disabled unless explicit env gate",server.includes('process.env.ALLOW_MAINNET!=="true"')||server.includes('process.env.ALLOW_MAINNET!=="true"')],
  ["mainnet create path checks ALLOW_MAINNET",server.includes('process.env.ALLOW_MAINNET!=="true"')||server.includes('process.env.ALLOW_MAINNET!=="true"')],
  ["launch API requires separate key",server.includes("requireMainnetLaunchKey(req)")],
  ["owner approval gate present",server.includes('COHIBA_MAINNET_OWNER_APPROVAL!=="APPROVE MAINNET COHIBA"')],
  ["mainnet API checks owner approval",server.includes("requireOwnerMainnetApproval();")],
  ["launch API requires exact origin",server.includes("requireMainnetOrigin(req)")],
  ["launch path rate limited",server.includes("enforceLaunchRateLimit(req)")],
  ["API globally rate limited",server.includes("rateLimitApi(req)")],
  ["request body bounded",server.includes("REQUEST_TOO_LARGE")],
  ["immutable metadata requested",server.includes("isMutable:false")],
  ["post-revoke supply verified",server.includes("POST_REVOKE_SUPPLY_VERIFY_FAILED")],
  ["mint authority null verified",server.includes("MINT_AUTHORITY_REVOKE_FAILED")],
  ["freeze authority null verified",server.includes("FREEZE_AUTHORITY_REVOKE_FAILED")],
  ["corrupt Mainnet record fails closed",server.includes("MAINNET_LAUNCH_RECORD_CORRUPT")],
  ["auto-launch exact arming phrase",server.includes('AUTO_MAINNET_LAUNCH!=="I_UNDERSTAND_MAINNET_COHIBA"')],
  ["staged CLI Mainnet disabled",staged.includes("MAINNET_STAGED_CLI_DISABLED")],
  ["revoke CLI Mainnet disabled",revoke.includes("MAINNET_REVOKE_CLI_DISABLED")],
  ["irreversible revoke confirmation",revoke.includes('CONFIRM_IRREVERSIBLE_REVOKE!=="I_UNDERSTAND"')],
  ["legacy create CLI Mainnet disabled",read("scripts/create-token.ts").includes("MAINNET_LEGACY_CLI_DISABLED")],
  ["auto-sweep Mainnet disabled",read("scripts/auto-sweep.ts").includes("MAINNET_AUTO_SWEEP_DISABLED")],
  ["devnet mint API explicit gate",server.includes('ALLOW_DEVNET_MINT_API!=="true"')]
];

const sensitivePatterns=[
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:seed phrase|mnemonic)\s*[:=]\s*["'][a-z]+(?:\s+[a-z]+){11,23}["']/i
];
const files=["web-server.mjs","README.md","scripts/create-token-staged.ts","scripts/revoke-authorities.ts","web/public/project-data.json"];
for(const file of files){
  const content=read(file);
  for(const pattern of sensitivePatterns){
    checks.push([`no embedded private credential pattern in ${file}`,!pattern.test(content)]);
  }
}

const failed=checks.filter(([,ok])=>!ok);
console.log(JSON.stringify({
  ok:failed.length===0,
  checks:checks.map(([name,ok])=>({name,ok})),
  failed:failed.map(([name])=>name)
},null,2));
if(failed.length) process.exit(1);
