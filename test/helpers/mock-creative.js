'use strict';
// MOCK Creative provider answers for local tests (test/helpers/run-server.js). They exercise the
// plumbing -- understanding, direction, validation, repair, fallback, saving, export -- and are
// labelled as mocks: the model name is "mock-creative-*", which the server turns into
// direction.source = 'mock' and the studio shows as "MOCKED plan". They say nothing about creative
// quality. MOCK_CREATIVE = ok (default) | repair (first plan invalid, repair valid) | invalid | error
//   | claims (the claim check always finds the "Closer" heading unsupported: repair, then it is taken out)
//   | curate-none (the picture check finds nothing showing the subject)
function payload(body) {
  const text = [].concat(...(body.messages || []).map(m => (Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content) }]))).filter(c => c.type === 'text').map(c => c.text).join('\n');
  const i = text.indexOf('{'); let data = {}; try { data = JSON.parse(text.slice(i, text.lastIndexOf('}') + 1)); } catch (e) { data = {}; }
  return { text, data };
}
function understanding(body) {
  const { text } = payload(body); const brief = (/BRIEF:\n([^\n]*)/.exec(text) || [])[1] || '';
  const personal = /\bmy (goldfish|dog|cat|grandad|grandma)\s+(\w+)/i.exec(brief);
  if (/imaginary|invented|made-up/i.test(brief)) return { identity: { name: brief.replace(/^an?\s+/i, '').slice(0, 60), kind: 'invented', what: 'an invented idea', confidence: 'high' }, research: { scope: 'none', wikipediaTitles: [], commonsQueries: [] }, tone: { register: 'playful', words: [], fromBrief: false }, audience: 'anyone', motifs: ['cats', 'crowns'], uncertainty: [] };
  if (personal) return { identity: { name: personal[2], kind: 'personal', what: `the owner's ${personal[1]}`, confidence: 'high', ownerSubject: { name: personal[2], type: personal[1] } }, research: { scope: 'general-topic', wikipediaTitles: [personal[1][0].toUpperCase() + personal[1].slice(1)], commonsQueries: [] }, tone: { register: 'tender', words: ['warm'], fromBrief: false }, audience: 'family', motifs: ['water', 'light'], uncertainty: [] };
  if (/\bzelda\b/i.test(brief) && !/game|franchise|princess|breath|ocarina/i.test(brief)) return { identity: { name: 'Zelda', kind: 'fictional', what: 'unclear', confidence: 'low' }, clarify: { needed: true, question: 'Which Zelda?', options: [{ label: 'The Legend of Zelda (series)', wikipediaTitle: 'The Legend of Zelda', description: 'the game franchise' }, { label: 'Princess Zelda', wikipediaTitle: 'Princess Zelda', description: 'the character' }] }, research: { scope: 'subject', wikipediaTitles: [], commonsQueries: [] }, tone: { register: 'cinematic' }, motifs: [] };
  const subject = brief.replace(/^(a|an)\s+(website|page|site)\s+(about|for)\s+/i, '').split(/[,.—–-]/)[0].trim() || 'Subject';
  return { identity: { name: subject, kind: 'recognizable', what: `the everyday ${subject}`, confidence: 'high' }, research: { scope: 'subject', wikipediaTitles: [subject.replace(/^./, c => c.toUpperCase())], commonsQueries: [`${subject} white background`] }, tone: { register: /absurd|grand/i.test(brief) ? 'extravagant' : 'editorial', words: [], fromBrief: /absurd|grand/i.test(brief) }, audience: 'general', motifs: ['spotlight', 'stage'], uncertainty: [] };
}
function plan(body, attempt) {
  const { data } = payload(body); const assets = data.assets || []; const facts = data.facts || [];
  const free = assets.find(a => a.transparent) || null; const photo = assets.find(a => !a.transparent) || null;
  const name = (data.understanding && data.understanding.identity && data.understanding.identity.name) || 'The subject';
  const focal = free ? { kind: 'image', role: 'focal', asset: free.id, box: { d: [54, 10, 40, 82], m: [10, 4, 80, 92] }, entrance: { kind: 'descend', delay: 0.3, dur: 1.4 }, loop: { kind: 'float', amp: 1.2, period: 9 }, scroll: { kind: 'parallax', amount: 0.4 }, treatment: 'shadow' }
    : photo ? { kind: 'image', role: 'focal', asset: photo.id, box: { d: [52, 12, 42, 76], m: [8, 6, 84, 88] }, mask: 'arch', fit: 'cover', entrance: { kind: 'unveil' }, loop: { kind: 'drift', amp: 0.8, period: 14 } }
      : { kind: 'shape', role: 'focal', shape: { form: 'circle', fill: 'accent' }, box: { d: [56, 16, 34, 58], m: [22, 10, 56, 60] }, entrance: { kind: 'pop' }, loop: { kind: 'breathe' } };
  const cited = facts.filter(f => f.text.length <= 240).slice(0, 3).map((f, i) => ({ label: String(i + 1), text: f.text, kind: 'sourced', cite: f.id }));
  const scenes = [
    { id: 'arrival', name: 'Arrival', purpose: 'Introduce the subject as the star', height: 'screen', layers: [focal, { kind: 'shape', role: 'support', shape: { form: 'ring', fill: 'glow' }, box: { d: [60, 6, 30, 48], m: [50, 0, 46, 40] }, opacity: 0.4, loop: { kind: 'spin', period: 30 } }], text: { kicker: 'A mock direction', heading: name, body: 'This plan was produced by the test provider, not a real model.', kind: 'imagined', region: 'left', size: 'display' }, cta: 'Begin' },
    { id: 'reveal', name: 'The reveal', purpose: 'Scroll-scrubbed close-up', link: 'follows the subject closer', height: 'tall', pin: true, camera: 'push-in', background: 'deep', layers: [Object.assign({}, focal, { box: { d: [30, 8, 40, 84], m: [10, 6, 80, 88] }, scroll: { kind: 'zoom-in', amount: 0.5 }, loop: { kind: 'none' } }), { kind: 'word', role: 'texture', word: { text: name.slice(0, 12).toUpperCase(), style: 'outline' }, box: { d: [-10, 30, 120, 40], m: [-10, 30, 120, 30] }, opacity: 0.35, scroll: { kind: 'pass-through', amount: 0.6 } }], text: { heading: 'Closer', items: cited, list: 'numbered', region: 'right', size: 'large' } },
    { id: 'rest', name: 'Rest', purpose: 'A quiet ending', link: 'lets the page settle', height: 'short', background: 'invert', layers: [{ kind: 'shape', role: 'focal', shape: { form: 'line', fill: 'accent' }, box: { d: [20, 48, 60, 4], m: [10, 48, 80, 4] }, entrance: { kind: 'unveil' } }], text: { heading: 'The end of the mock.', kind: 'imagined', region: 'center', size: 'medium' } },
  ];
  if (attempt === 'invalid') { scenes[0].layers[0] = { kind: 'image', role: 'focal', asset: 'does-not-exist', box: { d: [50, 10, 40, 80], m: [10, 10, 80, 80] } }; scenes[0].text.heading = ''; }
  return {
    identity: { name, kind: (data.understanding && data.understanding.identity && data.understanding.identity.kind) || 'recognizable' },
    concept: { title: 'Mock Stage', logline: `A mock three-scene direction for ${name}, used only to test the plumbing.`, why: 'test' },
    palette: { bg: '#15120f', bg2: '#2b231b', ink: '#f6efe3', muted: '#bfb2a0', accent: '#d8b46a', glow: '#fff1cf' },
    type: { display: 'didone', scale: 'monumental', case: 'normal' }, atmosphere: { backdrop: 'spotlight', light: 'spot', particles: 'dust', density: 0.4 }, motion: { tempo: 'measured', signature: 'the subject descends' }, thread: { kind: 'line' },
    assetNotes: assets.map(a => ({ asset: a.id, depicts: `mock: ${a.title || a.id}`, matches: 'unsure' })), wants: [{ description: 'a cut-out of the subject', asset: free ? free.id : '', fallback: free ? '' : 'a drawn circle' }], limitations: free ? [] : ['no cut-out available'],
    scenes,
  };
}
function respond(body, env, counters) {
  const tool = body.tool_choice && body.tool_choice.name; const mode = env.MOCK_CREATIVE || 'ok';
  const usage = { input_tokens: 5200, output_tokens: 2400, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  if (mode === 'error') return { status: 529, body: { error: { message: 'mock: overloaded' } } };
  if (tool === 'submit_creative_understanding') return { status: 200, body: { model: 'mock-creative-understand', usage: { input_tokens: 900, output_tokens: 300 }, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'u1', name: tool, input: understanding(body) }] } };
  if (tool === 'submit_creative_curation') {
    // no vision here: every candidate is called the subject (labelled as a mock), the first MAX are selected
    const text = payload(body).text; const ids = [...text.matchAll(/Candidate (c\d+):/g)].map(m => m[1]); const max = +((/MAX: (\d+)/.exec(text) || [])[1] || 6);
    // curate-none: nothing found shows the subject (the missing-imagery gate)
    const none = mode === 'curate-none';
    const input = { candidates: ids.map(id => ({ id, role: none ? 'unrelated' : 'subject', identity: none ? 'other' : 'exact', depicts: 'mock: not looked at', issues: [], separable: false, quality: 2 })), selection: none ? [] : ids.slice(0, max), coverage: none ? 'none' : 'partial', missing: ['mock: no real picture check was made'], note: 'mock curation' };
    return { status: 200, body: { model: 'mock-creative-curate', usage: { input_tokens: 2500, output_tokens: 600 }, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'k1', name: tool, input }] } };
  }
  if (tool === 'submit_creative_claims') {
    // claims modes: claims (the "Closer" heading is unsupported) | claims-missing (the first answer skips half the
    // lines) | claims-noevidence ("supported" with no evidence) | claims-conflict (a line answered twice, differently)
    // | claims-error (the checker fails) | claims-junk (verdicts for refs that were never asked)
    counters.claims = (counters.claims || 0) + 1;
    if (mode === 'claims-error') return { status: 500, body: { error: { message: 'mock: checker down' } } };
    const data = payload(body).data; const ev = (data.facts && data.facts[0] && data.facts[0].id) || 'owner';
    let lines = (data.lines || []).map(l => ({ ref: l.ref, verdict: mode === 'claims' && /\.heading$/.test(l.ref) && l.text === 'Closer' ? 'unsupported' : 'supported', evidence: mode === 'claims-noevidence' ? [] : [ev], claim: 'Closer' }));
    if (mode === 'claims-missing' && counters.claims === 1) lines = lines.filter((_, i) => i % 2 === 0);
    if (mode === 'claims-conflict' && lines[1]) lines.push(Object.assign({}, lines[1], { verdict: 'unsupported', claim: 'conflict' }));
    if (mode === 'claims-junk') lines = [{ ref: 'sX.heading', verdict: 'supported', evidence: [ev] }];
    return { status: 200, body: { model: 'mock-creative-claims', usage: { input_tokens: 1500, output_tokens: 200 }, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `c${counters.claims}`, name: tool, input: { lines } }] } };
  }
  counters.plans = (counters.plans || 0) + 1;
  const bad = mode === 'invalid' || (mode === 'repair' && counters.plans % 2 === 1);
  return { status: 200, body: { model: 'mock-creative-director', usage, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `p${counters.plans}`, name: tool, input: plan(body, bad ? 'invalid' : 'ok') }] } };
}
module.exports = { respond };
