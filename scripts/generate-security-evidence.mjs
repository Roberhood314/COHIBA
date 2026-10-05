import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {humanSignalReleaseReadiness} from '../lib/human-signal-release.mjs';

const root=process.cwd();
const files=[
  "web-server.mjs","package.json","package-lock.json",
  "lib/sovereignty-inference.mjs","lib/sovereign-quorum.mjs","lib/sovereign-continuity.mjs",
  "lib/human-signal-core-v1-alpha.mjs","lib/poha-postgres.mjs",
  "test/sovereign-continuity.test.mjs","scripts/sovereignty-drill.mjs",
  "docs/SOVEREIGNTY_INFERENCE_AND_CONTINUITY.md",
  "docs/WHITEPAPER.md","docs/VERIFICATION_SPEC.md","docs/THREAT_MODEL.md",
  "docs/SECURITY_CONTROL_MATRIX.md","SECURITY.md",
  "scripts/create-token-staged.ts","scripts/revoke-authorities.ts",
  "lib/launch-invariants.mjs","test/launch-invariants.test.mjs",
  "operations/BACKUP_RESTORE_STANDARD.md","operations/INCIDENT_TABLETOP_RECORD.md",
  "treasury/MULTISIG_ACTIVATION_PACKET.md","launch/LIQUIDITY_READINESS_PLAN.md",
  "release/PRE_MAINNET_EVIDENCE_BUNDLE.md",
  "release/human-signal-gates.json","lib/human-signal-release.mjs",
  "packages/authority-verifier/index.mjs","packages/authority-verifier/issuer.mjs",
  "packages/authority-verifier/postgres-adapter.mjs",
  "docs/protocol/ISSUER_TRUST_AND_PRIVACY.md","docs/protocol/POHA_EXTERNAL_VERIFIER_V1.md",
  "audit/HUMAN_SIGNAL_AUDIT_SCOPE.md","operations/HUMAN_SIGNAL_ISSUER_RUNBOOK.md",
  "security/HUMAN_SIGNAL_PUBLIC_TESTING.md","examples/independent-verifier/vectors.json",
  "examples/agent-control/gateway.mjs","examples/agent-control/README.md","test/agent-control.test.mjs",
  "examples/agent-control/isolation-lab.mjs","examples/agent-control/adversary.mjs",
  "examples/agent-control/ISOLATION_LAB.md","test/agent-isolation.test.mjs"
].filter(p=>fs.existsSync(path.join(root,p)));

const sha256=p=>crypto.createHash("sha256").update(fs.readFileSync(path.join(root,p))).digest("hex");
const commit=process.env.RAILWAY_GIT_COMMIT_SHA||process.env.GITHUB_SHA||null;
const manifest={
  schemaVersion:"1.0",
  project:"COHIBA",
  symbol:"COH",
  generatedAt:new Date().toISOString(),
  sourceCommit:commit,
  humanSignal:humanSignalReleaseReadiness(JSON.parse(fs.readFileSync(path.join(root,'release/human-signal-gates.json'),'utf8')),commit),
  mainnetSafetyPolicy:"Mainnet remains disabled until explicit final owner approval.",
  verificationModel:"Exact fixed supply + destination balance + immutable metadata + mint/freeze authority revocation.",
  artifacts:files.map(file=>({file,sha256:sha256(file)}))
};
fs.mkdirSync(path.join(root,"web/public"),{recursive:true});
fs.writeFileSync(path.join(root,"web/public/security-evidence.json"),JSON.stringify(manifest,null,2)+"\n");
console.log(JSON.stringify(manifest,null,2));
