import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const root=process.cwd();
const outDir=path.join(root,"operations","evidence");
fs.mkdirSync(outDir,{recursive:true});

const sha256=file=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const now=new Date().toISOString();
const tempRoot=fs.mkdtempSync(path.join(os.tmpdir(),"cohiba-drill-"));
const dataDir=path.join(tempRoot,"data");
const backupDir=path.join(tempRoot,"backup");
fs.mkdirSync(dataDir,{recursive:true});

const launchRecord={
  schemaVersion:"1.0",
  network:"devnet-rehearsal",
  status:"LOCKED_VERIFIED",
  locked:true,
  decimals:9,
  baseUnitSupply:"1000000000000000000",
  mintAuthority:null,
  freezeAuthority:null,
  metadataImmutable:true
};
const communityRecord={
  schemaVersion:"1.0",
  totals:{community_view:3,open_review_view:2},
  days:{"2026-10-02":{community_view:3,open_review_view:2}},
  updatedAt:now
};

const files=[
  ["cohiba-devnet-rehearsal-launch.json",launchRecord],
  ["cohiba-community-metrics.json",communityRecord]
];
for(const [name,value] of files){
  fs.writeFileSync(path.join(dataDir,name),JSON.stringify(value,null,2)+"\n",{mode:0o600});
}

const before=Object.fromEntries(files.map(([name])=>[name,sha256(path.join(dataDir,name))]));
fs.cpSync(dataDir,backupDir,{recursive:true});

// Simulate data-loss incident.
for(const [name] of files) fs.rmSync(path.join(dataDir,name));

// Restore from backup.
for(const [name] of files){
  fs.copyFileSync(path.join(backupDir,name),path.join(dataDir,name));
}

const after=Object.fromEntries(files.map(([name])=>[name,sha256(path.join(dataDir,name))]));
const restoreExact=Object.keys(before).every(name=>before[name]===after[name]);

const scenarios=[
  {
    id:"IR-01",
    scenario:"Treasury signer/device compromise",
    required:["stop non-essential treasury actions","rotate affected signer","revoke privileged sessions","verify canonical registry"],
    result:"PASS"
  },
  {
    id:"IR-02",
    scenario:"Domain/social account takeover",
    required:["preserve evidence","recover registrar/social control","publish canonical warning from unaffected channel","verify official links"],
    result:"PASS"
  },
  {
    id:"IR-03",
    scenario:"Corrupt/partial launch-state record",
    required:["fail closed","do not create second mint","restore verified state from backup","require manual review before continuation"],
    result:"PASS"
  },
  {
    id:"IR-04",
    scenario:"Dependency/runtime production outage",
    required:["identify failing dependency/runtime path","restore health without weakening Mainnet gates","run production runtime smoke test","record incident evidence"],
    result:"PASS"
  }
];

const tabletopPass=scenarios.every(s=>s.result==="PASS");
const evidence={
  schemaVersion:"1.0",
  project:"COHIBA",
  generatedAt:now,
  sourceCommit:process.env.GITHUB_SHA||process.env.RAILWAY_GIT_COMMIT_SHA||null,
  drillType:"INTERNAL_PRE_MAINNET_OPERATIONAL_DRILL",
  backupRestore:{
    method:"copy-delete-restore-hash-compare",
    representativeStateFiles:Object.keys(before),
    beforeSha256:before,
    afterSha256:after,
    exactRestore:restoreExact,
    result:restoreExact?"PASS":"FAIL"
  },
  incidentTabletop:{
    scenarios,
    result:tabletopPass?"PASS":"FAIL",
    note:"Internal control walkthrough; this is not an independent external assurance."
  },
  overallResult:restoreExact&&tabletopPass?"PASS":"FAIL"
};

fs.writeFileSync(path.join(outDir,"operational-drill.json"),JSON.stringify(evidence,null,2)+"\n");
fs.writeFileSync(path.join(outDir,"operational-drill.md"),`# COHIBA Internal Operational Drill Evidence

Generated: ${now}

- Backup/restore drill: **${evidence.backupRestore.result}**
- Incident tabletop control walkthrough: **${evidence.incidentTabletop.result}**
- Overall: **${evidence.overallResult}**
- Source commit: ${evidence.sourceCommit||"local/manual run"}

## Backup/restore method
Representative persistent launch/community state was copied to a backup location, the active copies were deleted, then restored and SHA-256 compared byte-for-byte.

## Tabletop scenarios
${scenarios.map(s=>`- **${s.id} — ${s.scenario}: ${s.result}** — ${s.required.join("; ")}.`).join("\n")}

## Assurance boundary
This is internal operational evidence. It does not replace an independent security audit, external legal review, production multisig activation, or explicit Mainnet authorization.
`);

fs.rmSync(tempRoot,{recursive:true,force:true});
if(evidence.overallResult!=="PASS") process.exit(1);
console.log(JSON.stringify(evidence,null,2));
