'use strict';
// DESIGN SITES -- websites made from SiteRemade's premium designs (design-packages/: Beadline, Halcyra, Steady Hand, Nube, Ventricle, Forno Sfacciato, Saltglass, KOVA, Clutch, ONDO, Aldane) by the
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

const MAX_TRIES = 3;
const DESIGNS = ['beadline', 'halcyra', 'steadyhand', 'nube', 'ventricle', 'forno', 'saltglass', 'kova', 'clutch', 'ondo', 'aldane'];
const loaded = {};
function design(name) {
  if (!DESIGNS.includes(name)) return null;
  if (!loaded[name]) {
    const d = loadDesign(path.join(ROOT, 'design', name));
    loaded[name] = { d, spec: JSON.parse(fs.readFileSync(path.join(d.dir, 'brief.json'), 'utf8')) };
  }
  return loaded[name];
}
// the design's own original page (its default content), shown live in the design gallery
const demos = {};
function demoHtml(name) { const p = design(name); if (!p) return null; if (!demos[name]) demos[name] = build(p.d, JSON.parse(fs.readFileSync(path.join(p.d.dir, 'default.json'), 'utf8'))).html; return demos[name]; }
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
function factsIn(text) {
  const out = [];
  let s = String(text).replace(/(\d),(\d{3})\b/g, '$1$2');
  s = s.replace(/\b(\d{1,2})(?::|\.)?(\d{2})?\s*(am|pm)\b/gi, (m, h, mm, ap) => { out.push([String(+h % 12 + (ap.toLowerCase() === 'pm' ? 12 : 0)), String(+h)]); if (mm && mm !== '00') out.push([String(+mm)]); return ' '; });
  s = s.replace(/\b(\d{1,2}):(\d{2})\b/g, (m, h, mm) => { out.push(+h > 12 ? [String(+h), String(+h - 12)] : [String(+h)]); if (mm !== '00') out.push([String(+mm)]); return ' '; });
  for (const n of s.match(/\d+(?:\.\d+)?/g) || []) out.push([String(+n)]);
  return out;
}
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

// the brief's required answers (one missing is a form error, not a question)
function preflight(d, spec, brief) {
  const missing = spec.fields.filter((f) => f.required && !String(brief[f.key] || '').trim()).map((f) => f.label);
  return missing.length ? { error: 'The brief is missing: ' + missing.join(', ') + '.' } : {};
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
      let want = String(brief[key]).trim();
      if (long) { want = shortName(long, o[leaf], (brief._answers && brief._answers.text) || ''); if (!decisions.some((x) => x.startsWith('Shortened'))) decisions.push(`Shortened the name "${long.value}" to "${want}" to fit the design`); }
      const got = o[leaf]; if (typeof got !== 'string' || got.replace(/\*/g, '') !== want) o[leaf] = want;
    }
    return c;
  };
  writer.start(prompt.build(d, brief, spec, { final, longNames: tooLong }));
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
    attempts.push({ n, seconds: +((Date.now() - t0) / 1000).toFixed(1), errors });
    if (!errors.length) {
      const { html } = build(d, draft);
      const decided = decisions.concat(
        Array.isArray(draft._decisions) ? draft._decisions.map(String) : [],
        asked.decided.map((q) => `Decided without asking: ${q}`),
        final ? asked.essential.map((q) => `Went ahead with the owner's answers: ${q}`) : []);
      return { status: 'built', attempts, content: draft, html, confirm: factsCheck(spec, brief, draft).concat(decided.map((v, i) => ({ path: '_decision.' + i, value: v, why: 'decided by the writer' }))) };
    }
    if (n < MAX_TRIES) writer.feedback(prompt.retry(errors));
  }
  return { status: 'failed', attempts, message: `The content still broke the design's rules after ${MAX_TRIES} drafts.` };
}

function kick(db, id, brief, deps) {
  const row = db.designSites.find(id);
  const writer = deps.writer();
  runLoop(row.design, brief, writer, { final: !!brief._answered }).then((r) => {
    db.designSites.update(id, {
      status: r.status, attempts_json: JSON.stringify(r.attempts), usage_json: JSON.stringify({ ...writer.usage, model: writer.name, costUsd: deps.cost ? +deps.cost(writer.usage).toFixed(4) : undefined }),
      questions_json: r.questions ? JSON.stringify(r.questions) : null, confirm_json: r.confirm ? JSON.stringify(r.confirm) : null,
      content_json: r.content ? JSON.stringify(r.content) : null, html: r.html || null, message: r.message || null,
    }, iso());
  }).catch((e) => {
    db.designSites.update(id, { status: 'failed', message: String(e && e.message || e).slice(0, 300), usage_json: JSON.stringify({ ...writer.usage, model: writer.name }) }, iso());
  });
}

function start(db, { accountId, design: name, brief }, deps) {
  const p = design(name);
  if (!p) return { error: 'Unknown design.' };
  const clean = Object.fromEntries(p.spec.fields.map((f) => [f.key, String((brief || {})[f.key] || '').slice(0, 4000)]));
  const pre = preflight(p.d, p.spec, clean);
  if (pre.error) return { error: pre.error };
  const id = newId();
  db.designSites.insert({ id, accountId, design: name, status: 'writing', businessName: clean.businessName, briefJson: JSON.stringify(clean), createdAt: iso() });
  kick(db, id, clean, deps);
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

function publish(db, row, on) {
  if (row.status !== 'built') return { error: 'Only a finished site can be published.' };
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
  };
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

module.exports = { demoHtml, designs, start, answer, publish, view, anthropicWriter, cost, factsIn, runLoop, triage, shortName };
