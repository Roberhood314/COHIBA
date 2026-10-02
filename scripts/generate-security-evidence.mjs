import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root=process.cwd();
const files=[
  "web-server.mjs","package.json","package-lock.json",
  "docs/WHITEPAPER.md","docs/VERIFICATION_SPEC.md","docs/THREAT_MODEL.md",
  "docs/SECURITY_CONTROL_MATRIX.md","SECURITY.md",
  "scripts/create-token-staged.ts","scripts/revoke-authorities.ts",
  "lib/launch-invariants.mjs","test/launch-invariants.test.mjs",
  "operations/BACKUP_RESTORE_STANDARD.md","operations/INCIDENT_TABLETOP_RECORD.md",
  "treasury/MULTISIG_ACTIVATION_PACKET.md","launch/LIQUIDITY_READINESS_PLAN.md",
  "release/PRE_MAINNET_EVIDENCE_BUNDLE.md"
].filter(p=>fs.existsSync(path.join(root,p)));

const sha256=p=>crypto.createHash("sha256").update(fs.readFileSync(path.join(root,p))).digest("hex");
const commit=process.env.RAILWAY_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null;
const manifest={
  schemaVersion:"1.0",
  project:"COHIBA",
  symbol:"COH",
  generatedAt:new Date().toISOString(),
  sourceCommit:commit,
  mainnetSafetyPolicy:"Mainnet remains disabled until explicit final owner approval.",
  verificationModel:"Exact fixed supply + destination balance + immutable metadata + mint/freeze authority revocation.",
  artifacts:files.map(file=>({file,sha256:sha256(file)}))
};
fs.mkdirSync(path.join(root,"web/public"),{recursive:true});
fs.writeFileSync(path.join(root,"web/public/security-evidence.json"),JSON.stringify(manifest,null,2)+"\n");
console.log(JSON.stringify(manifest,null,2));
