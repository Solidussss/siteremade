'use strict';
// DESIGN SITES -- websites made from SiteRemade's premium designs (design-packages/: Beadline, Halcyra, Steady Hand, Nube, Ventricle, Forno Sfacciato, Saltglass, KOVA, Clutch, ONDO, Aldane, Lintel & Key) by the
// brief-to-site flow. The owner fills in a short brief; the AI writer drafts the content for the design; the design's
// checker answers; the writer fixes what it said (up to 3 drafts); the page is built from the design's template.
//
// The brief is the source of truth; the design is a visual reference (design-packages/prompt.js). Where the design
// shows something the brief contradicts (a 72-hour winding demo for a 42-hour watch, a dual-time section on a
// three-hand watch) the writer adapts it through the design's own options -- switches, numbers, colours -- and lists
// what it decided. Those decisions and the facts the brief didn't give are shown for review once the page is built
// (confirm_json). The business name stays exactly as the owner typed it.
//
// The writer stops only for essential business facts: a selling price, a legal statement, what a real transaction
// needs (question kinds price | legal | transaction), or a business name too long for the design. Anything else it
// asks is decided by the writer instead of asked. All questions come in ONE round (needs_owner, questions_json); the
// answers start the final run (brief._answered), which never asks again, so a site can't loop back to the owner.
//
// A run takes about a minute, so it is a background job: start() answers at once with status 'writing', the page
// polls view(). One process; a restart marks an interrupted run failed (the owner runs it again).
//
//   designs()                         -> the designs and their brief questions
//   start(db, { accountId, design, brief }, deps)   -> row (writing; then built | needs_owner | failed)
//   answer(db, row, text, deps)       -> row (writing): the owner's answers are added to the brief; the final run
//   publish(db, row, on)              -> row: public at /s/<id> (or private again)
//   view(row)                         -> what the owner's page shows
//   deps: { writer(): { start(prompt), feedback(text), next(), usage, name } }
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..', 'design-packages');
const { loadDesign, validate, build, expand } = require(path.join(ROOT, 'engine', 'engine.js'));
const prompt = require(path.join(ROOT, 'prompt.js'));
const reality = require('./reality');
const editor = require('./design-editor');
const designAsk = require('./design-ask');

const MAX_TRIES = 3;
const DESIGNS = ['beadline', 'halcyra', 'steadyhand', 'nube', 'ventricle', 'forno', 'saltglass', 'kova', 'clutch', 'ondo', 'aldane', 'lintel', 'keel', 'plait', 'ochre', 'larder', 'halden', 'sereine', 'fettle', 'brisk', 'verge', 'camber', 'northlight', 'stillwater', 'axis', 'scruff', 'proof', 'petal', 'inkwell', 'lacquer', 'hearth', 'gather', 'plumb', 'compass', 'drape', 'primer'];
// the owner's own description from Create Website (or typed here): the writer reads it with the rest of the brief
const ABOUT_FIELD = { key: 'about', label: 'About the business', type: 'textarea', help: 'In your own words: what it is, who it is for, anything the other answers miss.' };
// asked on every design's brief (REALISM_ENGINE.md): a real business shows only facts it gave or confirmed; a concept
// may invent details and says on the page that it is a demonstration. Unanswered (older sites) = real.
const KIND_FIELD = { key: 'businessKind', label: 'Is this a real business?', type: 'choice', options: [['real', 'Yes, a real business'], ['concept', 'No, a concept or demo']],
  help: 'A real business shows only the facts you give (you confirm anything else before it goes live). A concept may invent details and says so on the page.' };
const kindOf = (brief) => (brief && brief.businessKind === 'concept' ? 'concept' : 'real');
const loaded = {};
function design(name) {
  if (!DESIGNS.includes(name)) return null;
  if (!loaded[name]) {
    const d = loadDesign(path.join(ROOT, 'design', name));
    const spec = JSON.parse(fs.readFileSync(path.join(d.dir, 'brief.json'), 'utf8'));
    // (a design whose own brief already has an "about" field -- compass's "About you" -- keeps its own: a second field
    // with the same key made the browser read both as one empty value, so every brief for it failed)
    spec.fields = spec.fields.concat(spec.fields.some((f) => f.key === 'about') ? [KIND_FIELD] : [ABOUT_FIELD, KIND_FIELD]);
    loaded[name] = { d, spec };
  }
  return loaded[name];
}
// the page's words and numbers, one entry per field (what the realism audit reads)
function contentEntries(content) {
  const out = [];
  (function walk(o, p) {
    if (Array.isArray(o)) o.forEach((x, i) => walk(x, p + '.' + i));
    else if (o && typeof o === 'object') { for (const [k, v] of Object.entries(o)) if (!k.startsWith('_') && !(p === '' && k === 'theme')) walk(v, p ? p + '.' + k : k); }
    else if (typeof o === 'string') { if (!/^#[0-9a-f]{6}$/i.test(o)) out.push({ path: p, text: o }); }
    else if (typeof o === 'number') out.push({ path: p, value: o });
  })(content, '');
  return out;
}
// what a claim is, in the owner's words: its row's own label ("Lug to lug"), else the field's path made readable
// ("movement turns") -- so "45" reads "Lug to lug: 45"
function labelFor(content, p) {
  const ks = String(p).split('.'), leaf = ks.pop();
  let o = content; for (const k of ks) o = o && o[k];
  const own = o && typeof o === 'object' && ['label', 'name', 'title', 'n'].map((k) => o[k]).find((v) => typeof v === 'string' && v && v !== o[leaf]);
  // (a row's name and which of its values: "A new patio, rate")
  const words = (k) => k.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  if (own) return String(own).replace(/\*/g, '') + (['value', 'v', 'text', 'label', 'name', 'n'].includes(leaf) || /^\d+$/.test(leaf) ? '' : ', ' + words(leaf));
  return ks.filter((k) => !/^\d+$/.test(k)).concat(/^\d+$/.test(leaf) ? [] : [leaf]).slice(-2).join(' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}
// the reality model of a site's brief, with the owner's earlier confirmations, and its page audited against it
function realityOf(name, brief, content, html) {
  const { spec } = design(name);
  const model = reality.fromBrief({ kind: kindOf(brief), fields: spec.fields, brief });
  for (const c of (content && content._reality && content._reality.confirmed) || []) reality.confirmClaims(model, [c], c.by, c.at);
  const items = content ? reality.audit(model, contentEntries(content), { assumed: content._assumed || [] }) : [];
  const check = reality.publishCheck(model, items, { html });
  for (const b of check.blocking) {
    if (!content || b.path === 'footer') continue;
    const v = expand(content, b.path)[0]?.[1];
    // a claim inside a sentence is shown in its sentence; a bare value with what it is ("Lug to lug: 45")
    if (typeof v === 'string' && v.replace(/\*/g, '').trim() !== b.text) { const t = v.replace(/\*/g, ''), i = t.indexOf(b.text); b.context = (i > 60 ? '…' + t.slice(t.lastIndexOf(' ', i - 50) + 1) : t).slice(0, 140); }
    else if (/(^|\.)closed\.\d+$/.test(b.path) && /^[0-6]$/.test(String(v))) { b.label = 'Closed every'; b.text = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][v]; }
    else b.label = labelFor(content, b.path);
  }
  return { model, items, check };
}
// The review list: the facts check (facts not in the brief, the writer's assumptions) with each one's status from the
// audit, any other claim the audit found, then the writer's decisions.
function reviewList(spec, brief, content, model, items, decided) {
  const open = items.filter((i) => i.status === 'proposed' || i.status === 'illustrative');
  const base = factsCheck(spec, brief, content).map((c) => {
    const here = items.filter((i) => i.path === c.path), it = here.find((i) => open.includes(i));
    // a claim the owner confirmed (by confirming it, or by typing it in the editor) reads as confirmed
    const status = it ? it.status : here.length ? here[0].status : model.kind === 'concept' ? 'illustrative' : 'proposed';
    return Object.assign(c, { status, material: !!(it && it.material) });
  });
  const extra = open.filter((i) => !base.some((c) => c.path === i.path)).filter((i, k, a) => a.findIndex((x) => x.path === i.path) === k)
    .map((i) => ({ path: i.path, value: i.text, why: `${i.kind} not in the brief`, status: i.status, material: i.material }));
  return base.concat(extra, decided.map((v, k) => ({ path: '_decision.' + k, value: v, why: 'decided by the writer' })));
}
// the design's own original page (its default content), shown live in the design gallery
const demos = {};
// a design's demo: its example, with the demo's real photos when it has a set (lib/demo-photos.js) -- set.photos as
// [{ slot, url, mask }], set.camera, set.key (changes when the set does, so the cached page follows it)
function demoHtml(name, set = null) {
  const p = design(name); if (!p) return null;
  const key = name + '|' + (set && set.key || '');
  if (!demos[key]) {
    const c = JSON.parse(fs.readFileSync(path.join(p.d.dir, 'default.json'), 'utf8')), opt = p.d.schema.optional || {};
    if (set && set.photos && set.photos.some((x) => x.slot === 'main')) {
      if (p.d.manifest.photoHero) {
        c.photos = {}; for (const x of set.photos) { c.photos[x.slot] = x.url; if (x.mask) c.photos[x.slot + 'Mask'] = x.mask; }
        if (set.camera) c.photos.camera = set.camera;
        if (set.video) c.photos.video = set.video;
      } else if (opt['hero.photo']) {
        const map = { before: 'hero.before', second: 'hero.photo2', third: 'hero.photo3', main: 'hero.photo' };
        for (const x of set.photos) if (opt[map[x.slot]]) c.hero[map[x.slot].slice(5)] = x.url;
      }
    }
    for (const k of Object.keys(demos)) if (k.startsWith(name + '|') && k !== key) delete demos[k];
    demos[key] = build(p.d, c).html;
  }
  return demos[key];
}
function designs() { return DESIGNS.map((name) => { const { spec } = design(name); return { design: name, title: spec.title, fields: spec.fields }; }); }

const iso = () => new Date().toISOString();
const newId = () => 'ds_' + crypto.randomBytes(9).toString('base64url');
const json = (s, dflt) => { try { return s ? JSON.parse(s) : dflt; } catch (e) { return dflt; } };

function parseJson(text) {
  const i = text.indexOf('{'), j = text.lastIndexOf('}');
  if (i < 0 || j < i) throw new Error('the answer contained no JSON object');
  return JSON.parse(text.slice(i, j + 1));
}
// facts in a text, each as the ways it may be written ("18:00" matches "6pm"; "£1,150" is 1150)
const factsIn = reality.extract.numbersIn;
function factsCheck(spec, brief, content) {
  const known = new Set(factsIn(Object.values(brief).map((v) => (v && typeof v === 'object' ? v.text || '' : v)).join(' \n ')).flat());
  const out = [];
  for (const pat of spec.facts) for (const [p, v] of expand(content, pat)) {
    if (v == null) continue;
    const missing = factsIn(v).filter((alts) => !alts.some((n) => known.has(n))).map((alts) => alts[0]);
    if (missing.length) out.push({ path: p, value: v, why: `${missing.join(', ')} is not in the brief` });
  }
  const assumed = [...new Set((content._assumed || []).map((p) => String(p).replace(/\[(\d+|\*)\]/g, '.$1')))];
  for (const p of assumed) if (!out.some((o) => o.path === p)) out.push({ path: p, value: expand(content, p).map(([, v]) => v).join(', '), why: 'the writer marked it as an assumption' });
  return out;
}

// What a brief needs before writing starts (2026-10-22): one sentence about the business, or its name -- nothing
// else. The owner describes it in their own words ("my Calgary barbershop called Fade Society, black and gold"); the
// writer takes the name, place, colours and services from that, and anything the page shows that the owner didn't
// give is listed for review and, on a real business, can't go live until the owner confirms it (the reality check
// at publish). The design's other questions are optional: the owner can add them now or later.
function preflight(d, spec, brief) {
  const said = ['about', 'businessName'].some((k) => String(brief[k] || '').trim());
  return said ? {} : { error: 'Describe the business in a sentence first (its name, what it does, where).' };
}

// The questions a writer may stop for (see the top). Anything else it asked, or a question without one of these
// kinds, is not put to the owner: the writer decides it, and it is listed with the decisions for review.
const ESSENTIAL = new Set(['price', 'legal', 'transaction']);
const MAX_QUESTIONS = 5;
function triage(draft) {
  const raw = [].concat(Array.isArray(draft && draft._questions) ? draft._questions : [], Array.isArray(draft && draft._blocked) ? draft._blocked : []);
  const essential = [], decided = [];
  for (const q of raw) {
    const text = String(typeof q === 'string' ? q : (q && q.question) || '').trim();
    if (!text) continue;
    const kind = q && typeof q === 'object' ? String(q.kind || '').toLowerCase() : '';
    (ESSENTIAL.has(kind) ? essential : decided).push(text);
  }
  return { essential: [...new Set(essential)].slice(0, MAX_QUESTIONS), decided };
}
// pinned names (the business name) longer than the design can show
function longNames(d, spec, brief) {
  return Object.entries(spec.pinned || {}).map(([p, key]) => ({ path: p, key, value: String(brief[key] || '').trim(), limit: (d.schema.text[p] || [0, Infinity])[1] }))
    .filter((x) => [...x.value].length > x.limit);
}
const nameQuestion = (spec, x) => `Your ${(spec.fields.find((f) => f.key === x.key) || { label: 'name' }).label.toLowerCase()} "${x.value}" is ${[...x.value].length} characters; this design fits up to ${x.limit}. Which shorter name do you trade under?`;
// After the one round, a name that still doesn't fit: the writer's shorter form when every word of it is the owner's
// (from the name or their answers), else the longest run of whole words from the start that fits.
const WORDS = /[\p{L}\p{N}&']+(?:[.-][\p{L}\p{N}&']+)*/gu; // (a sentence's full stop is not part of the word)
function shortName(x, written, answers) {
  const known = new Set((x.value + ' ' + answers).toLowerCase().match(WORDS) || []);
  const w = String(written || '').replace(/\*/g, '').trim();
  if (w && [...w].length <= x.limit && (w.toLowerCase().match(WORDS) || []).every((t) => known.has(t))) return w;
  let out = '';
  for (const t of x.value.split(/\s+/)) { const next = out ? out + ' ' + t : t; if ([...next].length > x.limit) break; out = next; }
  return out || [...x.value].slice(0, x.limit).join('').trim();
}

// final: the owner has answered the one round of questions, so this run never stops to ask
async function runLoop(name, brief, writer, { final = false } = {}) {
  const { d, spec } = design(name);
  const tooLong = longNames(d, spec, brief);
  const pinned = Object.entries(spec.pinned || {});
  const decisions = [];
  const pin = (c) => {
    for (const [p, key] of pinned) {
      const ks = p.split('.'); let o = c; for (const k of ks.slice(0, -1)) o = o[k] = o[k] || {};
      const leaf = ks[ks.length - 1], long = tooLong.find((x) => x.path === p);
      let want = String(brief[key] || '').trim();
      if (!want) continue; // (no name in the brief's own field: the writer took it from the description)
      if (long) { want = shortName(long, o[leaf], (brief._answers && brief._answers.text) || ''); if (!decisions.some((x) => x.startsWith('Shortened'))) decisions.push(`Shortened the name "${long.value}" to "${want}" to fit the design`); }
      const got = o[leaf]; if (typeof got !== 'string' || got.replace(/\*/g, '') !== want) o[leaf] = want;
    }
    return c;
  };
  const model = reality.fromBrief({ kind: kindOf(brief), fields: spec.fields, brief });
  writer.start(prompt.build(d, brief, spec, { final, longNames: tooLong, reality: reality.writerBrief(model) }));
  const attempts = [];
  for (let n = 1; n <= MAX_TRIES; n++) {
    const t0 = Date.now();
    const text = await writer.next();
    let errors, draft = null, asked = { essential: [], decided: [] };
    try { draft = parseJson(text); asked = triage(draft); } catch (e) { errors = ['the answer was not valid JSON: ' + e.message]; }
    // the one round: the essential questions and a name that doesn't fit, all asked together
    if (draft && !final) {
      const questions = tooLong.map((x) => nameQuestion(spec, x)).concat(asked.essential);
      if (questions.length) { attempts.push({ n, seconds: +((Date.now() - t0) / 1000).toFixed(1), errors: [] }); return { status: 'needs_owner', attempts, questions }; }
    }
    if (draft) { pin(draft); errors = validate(d, draft).errors; }
    // a concept business says on the page that it is a demonstration (checked on the built page, like any rule)
    let html = null;
    if (draft && !errors.length) {
      html = build(d, draft).html;
      if (model.kind === 'concept' && !reality.publishCheck(model, [], { html }).ok) errors = ['footer.fine: this business is a concept, so the page must say so plainly (e.g. "<name> is a made-up business for a concept site.")'];
    }
    attempts.push({ n, seconds: +((Date.now() - t0) / 1000).toFixed(1), errors });
    if (!errors.length) {
      const decided = decisions.concat(
        Array.isArray(draft._decisions) ? draft._decisions.map(String) : [],
        asked.decided.map((q) => `Decided without asking: ${q}`),
        final ? asked.essential.map((q) => `Went ahead with the owner's answers: ${q}`) : []);
      draft._reality = { v: 1, kind: model.kind, industry: model.industry && model.industry.id, confirmed: [] };
      const items = reality.audit(model, contentEntries(draft), { assumed: draft._assumed || [] });
      return { status: 'built', attempts, content: draft, html, confirm: reviewList(spec, brief, draft, model, items, decided) };
    }
    if (n < MAX_TRIES) writer.feedback(prompt.retry(errors));
  }
  return { status: 'failed', attempts, message: `The content still broke the design's rules after ${MAX_TRIES} drafts.` };
}

function kick(db, id, brief, deps) {
  const row = db.designSites.find(id);
  const writer = deps.writer();
  // deps.settle (a customer's paid generation): 'commit' once the work is done (built, or waiting on the one round of
  // answers -- the answered run is part of the same generation), 'release' when it failed
  const settle = (how) => { try { if (deps.settle) deps.settle(how, writer.usage, deps.cost ? deps.cost(writer.usage) : 0); } catch (e) { /* the site's state is what matters here */ } };
  runLoop(row.design, brief, writer, { final: !!brief._answered }).then((r) => {
    // (a name the writer took from the description becomes the project's name)
    const spec = design(row.design).spec, named = Object.entries(spec.pinned || {}).find(([, key]) => key === 'businessName');
    const fromPage = !brief.businessName && r.content && named ? String(expand(r.content, named[0])[0]?.[1] || '').replace(/\*/g, '').trim() : '';
    db.designSites.update(id, {
      ...(fromPage ? { business_name: fromPage } : {}),
      status: r.status, attempts_json: JSON.stringify(r.attempts), usage_json: JSON.stringify({ ...writer.usage, model: writer.name, costUsd: deps.cost ? +deps.cost(writer.usage).toFixed(4) : undefined }),
      questions_json: r.questions ? JSON.stringify(r.questions) : null, confirm_json: r.confirm ? JSON.stringify(r.confirm) : null,
      content_json: r.content ? JSON.stringify(r.content) : null, html: r.html || null, message: r.message || null,
    }, iso());
    settle(r.status === 'failed' ? 'release' : 'commit');
  }).catch((e) => {
    db.designSites.update(id, { status: 'failed', message: String(e && e.message || e).slice(0, 300), usage_json: JSON.stringify({ ...writer.usage, model: writer.name }) }, iso());
    settle('release');
  });
}

function start(db, { accountId, design: name, brief }, deps) {
  const p = design(name);
  if (!p) return { error: 'Unknown design.' };
  const clean = Object.fromEntries(p.spec.fields.map((f) => [f.key, String((brief || {})[f.key] || '').slice(0, 4000)]));
  clean.businessKind = kindOf(clean);
  const pre = preflight(p.d, p.spec, clean);
  if (pre.error) return { error: pre.error };
  const id = newId();
  db.designSites.insert({ id, accountId, design: name, status: 'writing', businessName: clean.businessName, briefJson: JSON.stringify(clean), createdAt: iso() });
  kick(db, id, clean, deps);
  return { row: db.designSites.find(id) };
}

// Done for you, without the AI: the design's own example, under the business's name, ready for the owner to edit field
// by field (and add the business's photos). Free: nothing is written by a model, so there is nothing to pay for.
function startFromExample(db, { accountId, design: name, businessName }) {
  const p = design(name);
  if (!p) return { error: 'Unknown design.' };
  const biz = String(businessName || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (biz.length < 2) return { error: 'Give the business a name first.' };
  const content = JSON.parse(fs.readFileSync(path.join(p.d.dir, 'default.json'), 'utf8'));
  const namePaths = Object.entries(p.spec.pinned || {}).filter(([, key]) => key === 'businessName').map(([pth]) => pth);
  const example = namePaths.length ? String(expand(content, namePaths[0])[0]?.[1] || '').replace(/\*/g, '').trim() : '';
  for (const pth of namePaths) {
    const max = (p.d.schema.text[pth] || [0, Infinity])[1];
    if ([...biz].length > max) return { error: `"${biz}" is longer than this design can show (${max} characters).` };
    for (const [cp] of expand(content, pth)) { const ks = cp.split('.'), last = ks.pop(); ks.reduce((a, k) => a[k], content)[last] = biz; }
  }
  // the example's own name anywhere else in the words (a wordmark, a footer line), where the business's name fits
  // (also its short form: "Steady Hand" for "Steady Hand Barbers"), longest first
  const words = example.split(/\s+/).filter(Boolean), forms = [example];
  if (words.length > 1) forms.push(words.slice(0, -1).join(' '));
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (example && example !== biz) {
    const re = new RegExp(forms.map(esc).join('|'), 'gi');
    for (const [pat, [, max]] of Object.entries(p.d.schema.text || {})) for (const [cp, v] of expand(content, pat)) {
      if (typeof v !== 'string') continue;
      const next = v.replace(re, (m) => (m === m.toUpperCase() && m !== m.toLowerCase() ? biz.toUpperCase() : biz));
      if (next === v || [...next.replace(/\*/g, '')].length > max) continue;
      // kept only where the design still passes its rules (a phone nav row has only so much room)
      const ks = cp.split('.'), last = ks.pop(), owner = ks.reduce((a, k) => a[k], content);
      owner[last] = next; if (validate(p.d, content).errors.length) owner[last] = v;
    }
  }
  // a real business's site doesn't say it's made up
  const fine = p.d.schema.text && p.d.schema.text['footer.fine'];
  if (fine && content.footer && /made-up|concept|demonstration|fictional/i.test(String(content.footer.fine || ''))) {
    const line = `© ${new Date().getFullYear()} ${biz}.`;
    if ([...line].length >= fine[0] && [...line].length <= fine[1]) content.footer.fine = line;
  }
  const errors = validate(p.d, content).errors;
  if (errors.length) return { error: 'The name doesn’t fit this design.', errors };
  const brief = { businessName: biz, about: '', businessKind: 'real', _fromExample: true };
  const id = newId();
  db.designSites.insert({ id, accountId, design: name, status: 'built', businessName: biz, briefJson: JSON.stringify(brief), createdAt: iso() });
  db.designSites.update(id, { content_json: JSON.stringify(content), html: build(p.d, content).html, message: 'From the design’s example: change the words, prices and photos to the business’s own before it goes live.' }, iso());
  return { row: db.designSites.find(id) };
}

// The owner's answers to the one round of questions: added to the brief, and the final run starts. It never asks
// again (brief._answered), so a site can't loop back to the owner.
function answer(db, row, text, deps) {
  const brief = json(row.brief_json, {});
  const t = String(text || '').trim().slice(0, 4000);
  if (!t) return { error: 'Write your answers first.' };
  if (row.message === 'name') brief.businessName = t; // (a name question from before the single round)
  else brief._answers = { questions: json(row.questions_json, []), text: t }; // (the prompt shows them to the writer)
  brief._answered = true;
  db.designSites.update(row.id, { status: 'writing', brief_json: JSON.stringify(brief), business_name: brief.businessName, questions_json: null, message: null }, iso());
  kick(db, row.id, brief, deps);
  return { row: db.designSites.find(row.id) };
}

// Going live: a real business's material claims that the owner has not confirmed (a price, a specification, a
// guarantee the writer proposed) are listed, and published only once the owner confirms them (confirm: true) -- the
// confirmation is recorded with who and when. A concept must say on the page that it is a demonstration.
function publish(db, row, on, { confirm = false, by = 'owner' } = {}) {
  if (row.status !== 'built') return { error: 'Only a finished site can be published.' };
  if (on) {
    const brief = json(row.brief_json, {}), content = json(row.content_json, {});
    const r = realityOf(row.design, brief, content, row.html);
    if (!r.check.ok) {
      if (r.model.kind === 'concept' || !confirm) return { error: r.model.kind === 'concept' ? 'This concept site does not say it is a demonstration.' : 'Confirm these before the site goes live.', blocking: r.check.blocking };
      const at = iso();
      content._reality = Object.assign({ v: 1, kind: r.model.kind, confirmed: [] }, content._reality);
      content._reality.confirmed = (content._reality.confirmed || []).concat(r.check.blocking.map((b) => ({ path: b.path, text: b.text, kind: b.kind, by, at })));
      db.designSites.update(row.id, { content_json: JSON.stringify(content) }, at);
    }
  }
  db.designSites.update(row.id, { published_at: on ? iso() : null }, iso());
  return { row: db.designSites.find(row.id) };
}

function view(row) {
  const p = design(row.design);
  const content = json(row.content_json, null);
  return {
    id: row.id, design: row.design, status: row.status, businessName: row.business_name, message: row.message === 'name' ? null : row.message,
    brief: json(row.brief_json, {}), questions: json(row.questions_json, []), confirm: json(row.confirm_json, []), attempts: json(row.attempts_json, []), usage: json(row.usage_json, null),
    publishedAt: row.published_at, publicPath: row.published_at ? '/s/' + row.id : null, createdAt: row.created_at, updatedAt: row.updated_at,
    readBack: content && p ? (p.spec.readBack || []).map((r) => ({ label: r.label, value: expand(content, r.path)[0]?.[1], fields: r.fields, format: r.format })) : [],
    reality: row.status === 'built' && content && p ? realityView(row, content) : null,
  };
}
// what the review page shows: real or concept, the industry, how the page's claims stand, what blocks going live
function realityView(row, content) {
  const r = realityOf(row.design, json(row.brief_json, {}), content, row.html);
  const counts = { confirmed: 0, derived: 0, proposed: 0, illustrative: 0 };
  for (const it of r.items) counts[it.status]++;
  return { kind: r.model.kind, industry: r.model.industry && r.model.industry.label, counts, blocking: r.check.blocking, confirmed: (content._reality && content._reality.confirmed) || [] };
}

// the live writer: Claude through SiteRemade's own server key (paid-providers decides whether it may be used)
function anthropicWriter(key, model = 'claude-sonnet-5-5') {
  const messages = []; let system = [];
  const usage = { calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  return {
    name: model, usage,
    start(p) { system = [{ type: 'text', text: p.system, cache_control: { type: 'ephemeral' } }]; messages.push({ role: 'user', content: [{ type: 'text', text: p.user, cache_control: { type: 'ephemeral' } }] }); },
    feedback(text) { messages.push({ role: 'user', content: text }); },
    async next() {
      if (!key) throw new Error('The AI writer is not configured on this server.');
      let r, tries = 0;
      for (;;) {
        r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model, max_tokens: 16000, system, messages }) });
        if ((r.status === 429 || r.status === 529 || r.status >= 500) && tries++ < 3) { await new Promise((ok) => setTimeout(ok, 5000 * tries)); continue; }
        break;
      }
      if (!r.ok) throw new Error(`AI writer error ${r.status}`);
      const j = await r.json();
      usage.calls++; usage.input += j.usage.input_tokens || 0; usage.output += j.usage.output_tokens || 0;
      usage.cacheWrite += j.usage.cache_creation_input_tokens || 0; usage.cacheRead += j.usage.cache_read_input_tokens || 0;
      if (j.stop_reason === 'max_tokens') throw new Error('the AI answer was cut off');
      const text = j.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      messages.push({ role: 'assistant', content: text });
      return text;
    },
  };
}
// estimated cost (USD) at $3 / $15 per million input / output tokens; cache writes 1.25x, cache reads 0.1x
const cost = (u) => (u.input * 3 + u.cacheWrite * 3.75 + u.cacheRead * 0.3 + u.output * 15) / 1e6;

// ---- the website editor (lib/design-editor.js) -------------------------------------------------------------------
// What the owner may change on a built site, read from the design's own rules, grouped as the content is.
function editorView(row) {
  const p = design(row.design), content = json(row.content_json, null);
  if (!p || !content) return null;
  return Object.assign(editor.fields(p.d, p.spec, content), { revisions: json(row.revisions_json, []).length });
}
// A change goes through the same checker as generation; the page is rebuilt from the changed content; on a real
// business, what the owner typed counts as confirmed by them (recorded like any confirmation); the previous version
// is kept for undo.
// via 'ask': a plan the AI made from the owner's request (lib/design-ask.js) and the owner then applied. The owner
// chose to apply it, but they didn't type its values, so facts in it stay as proposals for them to confirm (a price
// the AI picked is not a price the owner gave). rename: the business name, which the plain editor keeps locked.
function edit(db, row, { changes = [], ops = [], rename = null, via = 'editor' } = {}, by = 'owner') {
  if (row.status !== 'built') return { error: 'Only a finished site can be edited.' };
  const p = design(row.design), before = json(row.content_json, {});
  let brief = json(row.brief_json, {});
  let next, changed;
  try { ({ content: next, changed } = editor.apply(p.d, p.spec, before, { changes, ops, system: via === 'director' })); } catch (e) { return { error: e.message, errors: e.errors || [e.message] }; }
  const name = typeof rename === 'string' ? rename.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  if (name && name !== brief.businessName) {
    const pinned = Object.entries(p.spec.pinned || {}).filter(([, key]) => key === 'businessName').map(([path]) => path);
    for (const path of pinned) {
      const max = (p.d.schema.text[path] || [0, Infinity])[1];
      if ([...name].length > max) return { error: `"${name}" is longer than this design can show (${max} characters).`, errors: [`${path}: at most ${max} characters`] };
      const ks = path.split('.'), last = ks.pop(); ks.reduce((a, k) => a[k], next)[last] = name; changed.push(path);
    }
    brief = Object.assign({}, brief, { businessName: name });
  }
  if (!changed.length) return { row };
  const errors = validate(p.d, next).errors;
  const html = errors.length ? null : build(p.d, next).html;
  const model = reality.fromBrief({ kind: kindOf(brief), fields: p.spec.fields, brief });
  if (html && model.kind === 'concept' && !reality.publishCheck(model, [], { html }).ok) errors.push('footer.fine: this business is a concept, so the page must still say so');
  if (errors.length) return { error: 'That change breaks the design’s rules.', errors };
  const at = iso();
  next._reality = Object.assign({ v: 1, kind: model.kind, confirmed: [] }, next._reality);
  if (model.kind === 'real' && via !== 'ask') {
    const r = realityOf(row.design, brief, next, html);
    const typed = r.items.filter((i) => i.status === 'proposed' && changed.some((c) => i.path === c || i.path.startsWith(c + '.')));
    next._reality.confirmed = (next._reality.confirmed || []).concat(typed.map((i) => ({ path: i.path, text: i.text, kind: i.kind, by, at, edited: true })));
  }
  const r = realityOf(row.design, brief, next, html);
  const decided = json(row.confirm_json, []).filter((c) => c.why === 'decided by the writer').map((c) => c.value);
  // (each saved version keeps what it replaced, and the brief too when the name changed, so undo puts both back)
  const revisions = json(row.revisions_json, []).concat([{ at, by, via, content_json: row.content_json, ...(name ? { brief_json: row.brief_json } : {}) }]).slice(-20);
  db.designSites.update(row.id, { content_json: JSON.stringify(next), html, confirm_json: JSON.stringify(reviewList(p.spec, brief, next, r.model, r.items, decided)), revisions_json: JSON.stringify(revisions),
    ...(name ? { brief_json: JSON.stringify(brief), business_name: name } : {}) }, at);
  return { row: db.designSites.find(row.id), changed };
}
function undo(db, row) {
  const revisions = json(row.revisions_json, []);
  if (row.status !== 'built' || !revisions.length) return { error: 'Nothing to undo.' };
  const p = design(row.design), last = revisions.pop(), brief = json(last.brief_json || row.brief_json, {}), content = json(last.content_json, {});
  const html = build(p.d, content).html, r = realityOf(row.design, brief, content, html);
  const decided = json(row.confirm_json, []).filter((c) => c.why === 'decided by the writer').map((c) => c.value);
  db.designSites.update(row.id, { content_json: last.content_json, html, confirm_json: JSON.stringify(reviewList(p.spec, brief, content, r.model, r.items, decided)), revisions_json: JSON.stringify(revisions),
    ...(last.brief_json ? { brief_json: last.brief_json, business_name: brief.businessName || null } : {}) }, iso());
  return { row: db.designSites.find(row.id) };
}

// "Ask for a change": the owner's request turned into an editor plan (lib/design-ask.js). Nothing is saved here.
async function ask(row, request, writer) {
  if (row.status !== 'built') return { ok: false, message: 'Only a finished site can be changed.' };
  const p = design(row.design);
  const r = await designAsk.plan(p.d, p.spec, json(row.content_json, {}), request, writer);
  return Object.assign(r, { usage: Object.assign({}, writer.usage, { model: writer.name }) });
}

module.exports = { designFor: design, demoHtml, designs, start, startFromExample, answer, publish, view, anthropicWriter, cost, factsIn, runLoop, triage, shortName, contentEntries, editorView, edit, undo, ask };
