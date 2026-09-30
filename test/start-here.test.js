'use strict';
// START-HERE.md: the beginner's launch guide in every purchased website export (lib/start-here.js), compiled through
// the REAL export compiler from projects built by the REAL client -- a static Business site (its form switched off),
// a server-required Business site (the default: it has a form) and a Creative page.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { loadClient, premiumProviderStatus, buildProject } = require('./helpers/load-client');
const projectStore = require('../lib/project-store');

process.env.SITEREMADE_BACKEND = 'local';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-start-here-'));
process.env.SITEREMADE_ASSET_STORE_DIR = path.join(TMP, 'assets');
const { getDatabaseAdapter } = require('../lib/adapters/database-adapter');
const { compileExport } = require('../lib/export-compiler');
const db = getDatabaseAdapter(':memory:');
test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const TEXT = 'Petal & Stem is a florist in Portland making wedding flowers, bouquets and same-day delivery.';
let n = 0;
function businessState({ forms }) {
  const c = loadClient();
  const { proj } = buildProject(c, TEXT, { providerStatus: premiumProviderStatus() });
  if (!forms) proj.pages.forEach(p => p.sections.forEach(s => { if (s.module) s.module.enabled = false; }));
  const saved = projectStore.validateDirectionsState({ directions: [JSON.parse(JSON.stringify(proj))], activeDirectionIndex: 0 }).normalized;
  projectStore.internalizeAssets(db, saved);
  return saved;
}
function exportWith(compiler, state, opts = {}) {
  const workDir = path.join(TMP, 'export-' + (n++));
  const r = compiler(db, { project: { id: 'proj_starthere00000000000', revision: 1, directionsState: JSON.parse(JSON.stringify(state)) }, directionIndex: 0, workDir, hostingChoice: opts.hostingChoice || null, purchaseDate: '2026-09-29T00:00:00.000Z' });
  const read = f => fs.readFileSync(path.join(workDir, f), 'utf8');
  return { r, workDir, files: fs.readdirSync(workDir).sort(), read };
}
const STATIC = businessState({ forms: false });
const SERVER = businessState({ forms: true });

// E: no fabricated universal DNS values -- no IP addresses, record-type tables, nameservers or TTLs
function assertNoInventedDns(guide) {
  assert.ok(!/\b\d{1,3}(\.\d{1,3}){3}\b/.test(guide), 'no IP address');
  assert.ok(!/\b(A record|AAAA|CNAME|TXT record|nameservers?|ns\d\.|TTL)\b/i.test(guide), 'no record types or nameserver values');
  assert.match(guide, /Copy the records exactly as your hosting company shows them/);
}
// words a beginner should not meet unexplained, and things this guide must never ask of them
function assertBeginnerSafe(guide0) {
  const guide = guide0.replace(/^- Deploy Site$/m, ''); // a dashboard button name customers look for, not an instruction
  for (const word of ['deploy ', 'runtime', 'repository', 'terminal', 'command line', 'npm', 'GitHub', 'git ', 'propagation', 'SSH', 'FTP', 'environment variable', 'HTML/CSS']) assert.ok(!guide.toLowerCase().includes(word.toLowerCase()), `no "${word.trim()}"`);
  assert.ok(guide.split('\n').length < 170, 'short: a guide, not a manual');
}

test('A/C/E/F. a static website gets START-HERE.md: beginner steps, no Node.js, no invented DNS, SiteRemade → My Websites', () => {
  const { r, files, read } = exportWith(compileExport, STATIC);
  assert.equal(r.runtimeType, 'static');
  assert.ok(files.includes('START-HERE.md'));
  const g = read('START-HERE.md');
  assert.ok(g.startsWith('# START HERE\n\nYou bought a complete website from SiteRemade. These files are your website.\n\nThis guide shows you how to put it online. You do not need coding experience.\n'));
  assert.match(g, /a standard website\. Most web hosting companies can host it/);
  for (const step of ['Step 1 — Choose where to host your website', 'Step 2 — Open your hosting dashboard', 'Step 3 — Upload your website', 'Step 4 — Connect your domain', 'Step 5 — Wait a little', 'Step 6 — Test your website']) assert.ok(g.includes('## ' + step), step);
  assert.ok(!/node/i.test(g), 'a static guide never mentions Node.js or a server command');
  assert.match(g, /do not:\n\n- upload only index\.html/);
  assert.match(g, /If those work, your website is live\./);
  assert.match(g, /SiteRemade → My Websites/);
  assert.match(g, /You do not need to edit the code in this folder unless you want to\./);
  assert.match(g, /## Using Hostinger, Bluehost, or GoDaddy\?[\s\S]*upload an HTML website/);
  assertNoInventedDns(g); assertBeginnerSafe(g);
  assert.equal(JSON.parse(read('export-manifest.json')).ownerGuide, 'START-HERE.md');
});

test('B/D/E/F. a server-required website gets START-HERE.md that says it needs Node.js hosting and gives node server.js', () => {
  const { r, files, read } = exportWith(compileExport, SERVER);
  assert.equal(r.runtimeType, 'server_required');
  assert.ok(files.includes('START-HERE.md') && files.includes('server.js') && files.includes('package.json'));
  const g = read('START-HERE.md');
  assert.match(g, /Forms need a kind of hosting called \*\*Node\.js hosting\*\*/);
  assert.match(g, /a contact form/, 'names the feature that needs it');
  assert.match(g, /```\nnode server\.js\n```/);
  assert.match(g, /start command\*\*\. That is the instruction that starts your website/);
  assert.match(g, /the answers are in \*\*README\.md\*\*/);
  assert.match(g, /check that your plan includes it before you start/, 'never implies a basic File Manager plan is enough');
  assert.ok(!/usually have a \*\*File Manager\*\* or \*\*Website\*\* area where you can upload a standard website/.test(g));
  assert.match(g, /your form works/);
  assert.match(g, /saved in your hosting account/, 'says honestly where form messages go by default');
  assert.match(g, /SiteRemade → My Websites/);
  assertNoInventedDns(g); assertBeginnerSafe(g);
  assert.ok(!/SUBMISSION_|PORT|HMAC|webhook/.test(g), 'the server configuration stays in README.md');
});

test('the host picked at checkout is mentioned, and a static-only pick is flagged for a server-required site', () => {
  assert.match(exportWith(compileExport, STATIC, { hostingChoice: { provider: 'hostinger' } }).read('START-HERE.md'), /At checkout you picked \*\*Hostinger\*\*\. You can use it, or any other host\./);
  assert.match(exportWith(compileExport, SERVER, { hostingChoice: { provider: 'godaddy' } }).read('START-HERE.md'), /At checkout you picked \*\*GoDaddy\*\*\. Before you start, check that your GoDaddy plan supports Node\.js/);
  assert.ok(!/At checkout/.test(exportWith(compileExport, STATIC, { hostingChoice: { provider: 'self' } }).read('START-HERE.md')));
});

test('G/H. README.md and HANDOFF.md send a non-technical owner to START-HERE.md first', () => {
  for (const state of [STATIC, SERVER]) {
    const { read } = exportWith(compileExport, state);
    assert.match(read('README.md').split('\n').slice(0, 4).join('\n'), /Website owner\?\*\* If you just want to put your website online, open \*\*START-HERE\.md\*\* first\./);
    assert.match(read('HANDOFF.md').split('\n').slice(0, 4).join('\n'), /Just want to put your website online\?\*\* Open \*\*START-HERE\.md\*\* first\./);
    assert.ok(!/## Step 1/.test(read('README.md')) && !/## Step 1/.test(read('HANDOFF.md')), 'the guide itself is not duplicated');
  }
});

test('Creative exports get the same beginner guide (a standard website), and their README points to it', () => {
  const c = loadClient();
  const { understandBrief } = require('../lib/creative/understand');
  const { direct } = require('../lib/creative/director');
  const u = understandBrief('A website about toilet paper — make it grand and a bit absurd');
  const plan = direct({ understanding: u, research: { page: { title: 'Toilet paper', url: 'https://en.wikipedia.org/wiki/Toilet_paper', description: 'x', extract: 'Toilet paper is a tissue paper product.', category: 'object', retrieved: '2026-09-28' }, facts: [{ id: 'f1', text: 'Toilet paper is a tissue paper product used for cleaning.', section: 'Overview' }] }, assets: [] });
  const state = { directions: [{ mode: 'creative', meta: { id: 'c1' }, pages: [{ id: 'creative', label: 'Creative page', sections: [] }], creative: { brief: 'toilet paper', understanding: u, assets: [], plan } }], activeDirectionIndex: 0 };
  const { files, read } = exportWith(compileExport, projectStore.validateDirectionsState(state).normalized);
  assert.ok(files.includes('START-HERE.md'));
  const g = read('START-HERE.md');
  assert.match(g, /a standard website/); assert.ok(!/node/i.test(g));
  assert.match(g, /ATTRIBUTION\.md lists the picture and text credits/);
  assertNoInventedDns(g); assertBeginnerSafe(g);
  assert.match(read('README.md'), /open \*\*START-HERE\.md\*\* first/);
  assert.equal(JSON.parse(read('export-manifest.json')).ownerGuide, 'START-HERE.md');
  void c;
});

test('I. everything else in the export is exactly what it was before START-HERE.md existed', () => {
  // the export compiler as it was before this change, run on the same projects
  const base = path.join(__dirname, '..', 'lib', '.baseline-export-compiler-starthere.js');
  const src = execSync('git show 34cf143:lib/export-compiler.js', { cwd: path.join(__dirname, '..') }).toString();
  fs.writeFileSync(base, src);
  try {
    const old = require(base).compileExport;
    const norm = s => s.replace(/"(exportTimestamp|purchaseDate)": "[^"]*"/g, '"$1": "*"');
    for (const state of [STATIC, SERVER]) {
      const a = exportWith(old, state), b = exportWith(compileExport, state);
      assert.deepEqual(b.files.filter(f => f !== 'START-HERE.md'), a.files, 'the same files, plus START-HERE.md');
      for (const f of a.files.filter(x => !['README.md', 'HANDOFF.md', 'export-manifest.json'].includes(x))) {
        if (fs.statSync(path.join(a.workDir, f)).isDirectory()) continue;
        assert.ok(fs.readFileSync(path.join(a.workDir, f)).equals(fs.readFileSync(path.join(b.workDir, f))), `${f} byte-identical`);
      }
      // README/HANDOFF: only the pointer lines (and HANDOFF's domain line, which used to send owners to README) changed
      const strip = s => s.replace(/> \*\*Website owner\?\*\*[^\n]*\n\n/, '').replace(/> \*\*Just want to put your website online\?\*\*[^\n]*\n\n/, '').replace('START-HERE.md (Step 4) shows you how.', 'see README.md for the technical basics.');
      assert.equal(strip(b.read('README.md')), a.read('README.md'));
      assert.equal(strip(b.read('HANDOFF.md')), a.read('HANDOFF.md'));
      const ma = JSON.parse(norm(a.read('export-manifest.json'))), mb = JSON.parse(norm(b.read('export-manifest.json')));
      assert.equal(mb.ownerGuide, 'START-HERE.md'); delete mb.ownerGuide;
      assert.deepEqual(mb, ma, 'the manifest only gains ownerGuide');
    }
  } finally { fs.rmSync(base, { force: true }); }
});
