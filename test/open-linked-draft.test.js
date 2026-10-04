'use strict';
// SAVED DRAFTS: the client app's "Continue in the builder" on a saved draft lands on the builder with ?project=<id>
// (through the sign-in handoff). Once the account is known, that exact project opens -- a Creative draft in the Creative
// studio, ready to edit and save -- and the id leaves the address bar. Also the studio on a phone: the page first, at
// phone size, and no dead end when a page's included research runs are used up. REAL PROVIDER SPEND: $0 (nothing is generated).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');

test('L1. signing in opens the linked project, through the one loader that sends Creative projects to the studio', () => {
  assert.match(src, /async function onSignedIn\(\) \{[\s\S]{0,200}openLinkedProject\(\);\s*\}/);
  const fn = src.slice(src.indexOf('function openLinkedProject()'), src.indexOf('function openLinkedProject()') + 500);
  assert.match(fn, /history\.replaceState/, 'the id leaves the address bar');
  assert.match(fn, /loadSelectedOwnedProjectById\(m\[1\]\)/);
  assert.match(src, /async function loadSelectedOwnedProjectById\(id\) \{[\s\S]{0,300}if \(isCreativeProjectState\(serverProject\.directionsState\)\) \{ openInCreativeStudio\(serverProject\); return; \}/);
});

test('L2. only a plain project id is taken from the address', () => {
  const re = new RegExp(src.match(/const m = \/(.+?)\/\.exec\(window\.location\.search\)/)[1]);
  assert.equal(re.exec('?project=proj_t0U-j4sIunEkuPjMbOrXUZY2')[1], 'proj_t0U-j4sIunEkuPjMbOrXUZY2');
  assert.equal(re.exec('?creative=1&project=proj_a&x=1')[1], 'proj_a');
  ['?project=../x', '?project=a%22%3E', '?project=' + 'a'.repeat(81), '?myproject=a', '?studio=creative'].forEach(q => assert.equal(re.exec(q), null, q));
});

// ON A PHONE: a page dropped mid-generation and reloaded can use up its included research runs -- never a dead end
test('L3. used-up research runs offer the saved page and a fresh start that is priced first', () => {
  const studio = fs.readFileSync(path.join(__dirname, '..', 'creative.js'), 'utf8');
  assert.match(studio, /if \(r\.data && r\.data\.researchUsedUp\) \{[^\n]*return usedUp\(\); \}/);
  const fn = studio.slice(studio.indexOf('function usedUp()'), studio.indexOf('function fail(msg)'));
  assert.match(fn, /localStorage\.getItem\(POINTER\)[\s\S]*loadProject\(r\.data\.project\)/, 'the saved page opens');
  assert.match(fn, /localStorage\.removeItem\(JOB\); \} catch \(e\) \{[^}]*\} S\.jobId = null; create\(\);/, 'a fresh start forgets the job and goes through create() (the asks and the quote)');
});

test('L4. on a phone the preview starts at phone size and the page comes before the editor', () => {
  const studio = fs.readFileSync(path.join(__dirname, '..', 'creative.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'creative-studio.css'), 'utf8');
  assert.match(studio, /device: narrowScreen\(\) \? 'phone' : 'desktop'/);
  const phone = css.slice(css.indexOf('@media (max-width:860px){'));
  assert.match(phone, /\.cs-body\{\s*display:flex;\s*flex-direction:column;/);
  assert.match(phone, /\.cs-body:has\(\.cs-viewport:not\(\[hidden\]\)\) \.cs-stage\{order:-1\}/);
  assert.match(css, /\.cs-jump\{display:none\}/, 'the jump button is phone-only');
});
