import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { runReviewDemo } from './human-signal-review-demo.mjs';

const root = path.resolve(import.meta.dirname, '..');
process.chdir(root);
const output = path.join(root, 'operations/evidence/human-signal-review');
fs.mkdirSync(output, { recursive: true });
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const index = JSON.parse(fs.readFileSync('audit/human-signal-review/claims.json'));
const tests = [...new Set(index.claims.flatMap(claim => claim.tests))].sort();
for (const file of tests) {
  if (!/^test\/[a-z0-9-]+\.test\.mjs$/.test(file) || !fs.existsSync(file)) {
    throw new Error(`INVALID_EVIDENCE_TEST: ${file}`);
  }
}
const sources = git('ls-files', '-z').split('\0').filter(Boolean)
  .filter(file => !file.startsWith('operations/evidence/') && !file.endsWith('security-evidence.json'))
  .sort().map(file => ({ path: file, sha256: hash(fs.readFileSync(file)) }));
const sourceText = JSON.stringify(sources, null, 2) + '\n';
fs.writeFileSync(path.join(output, 'source-files.json'), sourceText);
const demo = runReviewDemo();
const demoText = JSON.stringify(demo, null, 2) + '\n';
fs.writeFileSync(path.join(output, 'demo.json'), demoText);
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...tests],
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 120000 });
const tap = result.stdout || '';
fs.writeFileSync(path.join(output, 'tests.tap'), tap);
fs.writeFileSync(path.join(output, 'tests.stderr.txt'), result.stderr || '');
const totals = Object.fromEntries(['tests', 'pass', 'fail', 'skipped', 'cancelled', 'todo']
  .map(key => [key, Number(tap.match(new RegExp(`^# ${key} (\\d+)$`, 'm'))?.[1] ?? -1)]));
const passed = result.status === 0 && totals.tests > 0 && totals.pass === totals.tests
  && ['fail', 'skipped', 'cancelled', 'todo'].every(key => totals[key] === 0);
const manifest = { version: 'HS_REVIEW_EVIDENCE_1', status: 'PRE-AUDIT',
  scope: 'FOCUSED_OFFLINE_REVIEW_NOT_FULL_PRODUCTION_SUITE',
  commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'),
  trackedWorktreeDirty: Boolean(git('status', '--porcelain', '--untracked-files=no')),
  untrackedFilesPresent: Boolean(git('ls-files', '--others', '--exclude-standard')),
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  generatedAt: new Date().toISOString(), sourceManifestSha256: hash(sourceText),
  demoSha256: hash(demoText), tapSha256: hash(tap), claimsSha256: hash(fs.readFileSync('audit/human-signal-review/claims.json')),
  tests: { files: tests, ...totals, exitCode: result.status, error: result.error?.message || null },
  passed, independentAudit: false, fullProductionSuite: false, openGates: index.openGates };
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));
if (!passed) { console.error(tap, result.stderr || ''); process.exitCode = 1; }
