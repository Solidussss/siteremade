'use strict';
// MOCK Creative provider answers for local tests (test/helpers/run-server.js). They exercise the
// plumbing -- understanding, direction, validation, repair, fallback, saving, export -- and are
// labelled as mocks: the model name is "mock-creative-*", which the server turns into
// direction.source = 'mock' and the studio shows as "MOCKED plan". They say nothing about creative
// quality. MOCK_CREATIVE = ok (default) | repair (first plan invalid, repair valid) | invalid | error
//   | claims (the claim check always finds the "Closer" heading unsupported: repair, then it is taken out)
//   | curate-none (the picture check finds nothing showing the subject)
// The continuity pass: MOCK_CONTINUITY = ok | error | junk | reset; its critic: MOCK_CRITIC = ok | none | error.
// A revision ("Update My Website", the request carries `revise`) comes back visibly revised -- a new concept, palette,
// type, tempo and an extra scene -- unless MOCK_CREATIVE_REVISE=same (the page comes back as it was).
function payload(body) {
  const text = [].concat(...(body.messages || []).map(m => (Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content) }]))).filter(c => c.type === 'text').map(c => c.text).join('\n');
  const i = text.indexOf('{'); let data = {}; try { data = JSON.parse(text.slice(i, text.lastIndexOf('}') + 1)); } catch (e) { data = {}; }
  return { text, data };
}
function understanding(body) {
  const { text } = payload(body); const brief = (/BRIEF:\n([^\n]*)/.exec(text) || [])[1] || '';
  const personal = /\bmy (goldfish|dog|cat|grandad|grandma)\s+(\w+)/i.exec(brief);
  if (/imaginary|invented|made-up/i.test(brief)) return { identity: { name: brief.replace(/^an?\s+/i, '').slice(0, 60), kind: 'invented', what: 'an invented idea', confidence: 'high' }, research: { scope: 'none', wikipediaTitles: [] }, tone: { register: 'playful', words: [], fromBrief: false }, audience: 'anyone', motifs: ['cats', 'crowns'], uncertainty: [] };
  if (personal) return { identity: { name: personal[2], kind: 'personal', what: `the owner's ${personal[1]}`, confidence: 'high', ownerSubject: { name: personal[2], type: personal[1] } }, research: { scope: 'general-topic', wikipediaTitles: [personal[1][0].toUpperCase() + personal[1].slice(1)] }, tone: { register: 'tender', words: ['warm'], fromBrief: false }, audience: 'family', motifs: ['water', 'light'], uncertainty: [] };
  if (/\bzelda\b/i.test(brief) && !/game|franchise|princess|breath|ocarina/i.test(brief)) return { identity: { name: 'Zelda', kind: 'fictional', what: 'unclear', confidence: 'low' }, clarify: { needed: true, question: 'Which Zelda?', options: [{ label: 'The Legend of Zelda (series)', wikipediaTitle: 'The Legend of Zelda', description: 'the game franchise' }, { label: 'Princess Zelda', wikipediaTitle: 'Princess Zelda', description: 'the character' }] }, research: { scope: 'subject', wikipediaTitles: [] }, tone: { register: 'cinematic' }, motifs: [] };
  const subject = brief.replace(/^(a|an)\s+(website|page|site)\s+(about|for)\s+/i, '').split(/[,.—–-]/)[0].trim() || 'Subject';
  return { identity: { name: subject, kind: 'recognizable', what: `the everyday ${subject}`, confidence: 'high' }, research: { scope: 'subject', wikipediaTitles: [subject.replace(/^./, c => c.toUpperCase())] }, tone: { register: /absurd|grand/i.test(brief) ? 'extravagant' : 'editorial', words: [], fromBrief: /absurd|grand/i.test(brief) }, audience: 'general', motifs: ['spotlight', 'stage'], uncertainty: [] };
}
// MOCK_DIRECTOR=follow: a mock that behaves like an instructed director -- one scene per artDirection scene, each built
// around the picture the visual plan assigned it, its scene.visual filled first and its words written from what that
// picture shows (keyword rules, labelled mock). Used by the browser QA of the asset-first pipeline; says nothing about
// a real model's quality.
const COPY = [
  [/close|detail/i, 'Built to fly', 'Up close: the same machine that makes the jump -- every panel, every wheel.', 'detail', 'the kart, up close'],
  [/airborne|jump|air|flying/i, 'Launch. Hang time. Land it.', 'Off the ramp and into the air -- every jump ends in a landing that counts.', 'momentum', 'airborne, mid-jump'],
  [/lineup|grid|starting|rivals/i, 'Meet the grid', 'Every rival lined up, engines hot, waiting for the lights.', 'roster', 'the starting grid'],
  [/item|box|power/i, 'Chaos in a box', 'Grab the box, roll the dice, turn the race on its head.', 'detail', 'the item box, up close'],
  [/sunset|track|race|racing/i, 'Into the sunset', 'The last lap burns orange -- the track runs out before the light does.', 'celebrate', 'the track at sunset'],
];
function followPlan(data, name) {
  const scenesIn = (data.artDirection && data.artDirection.scenes) || []; const inv = data.assets || [];
  const scenes = scenesIn.map((x, i) => {
    const pic = x.picture; const ids = pic ? [pic.asset].concat(pic.also || []) : [];
    const shows = (pic && pic.shows) || ((inv.find(a => a.id === (pic && pic.asset)) || {}).title) || '';
    const c = COPY.find(([re]) => re.test(shows)) || [null, shows ? shows.replace(/^./, s => s.toUpperCase()) : 'The next chapter', 'Another angle on the same race.', 'celebrate', shows || 'the subject'];
    const layers = ids.filter(id => inv.some(a => a.id === id)).map((id, k) => ({ kind: 'image', role: k ? 'support' : 'focal', asset: id, box: { d: [50, 10, 42, 78], m: [8, 6, 84, 64] } }));
    return { id: i ? `scene-${i + 1}` : 'opening', name: i ? c[1] : 'Opening', purpose: `built around ${shows || 'the subject'}`, height: 'screen', layout: x.layout, choreo: x.choreo, handoff: x.handoff, layers,
      visual: pic ? { asset: pic.asset, subject: shows, moment: c[4], intent: i ? c[3] : 'introduce', relation: pic.relation } : undefined,
      text: i ? { kicker: shows.slice(0, 40), heading: c[1], body: c[2], kind: 'imagined', region: 'left', size: 'large' } : { kicker: 'Mock direction', heading: name, body: c[2], kind: 'imagined', region: 'left', size: 'display' }, ...(i ? {} : { cta: 'Start the race' }) };
  });
  return { identity: { name, kind: (data.understanding && data.understanding.identity && data.understanding.identity.kind) || 'recognizable' }, concept: { title: `${name}, in motion`, logline: `A mock direction for ${name} that follows its pictures.`, why: 'test' },
    palette: { bg: '#0d1020', bg2: '#171b33', ink: '#f4f2ee', muted: '#b9b5ad', accent: '#ffb629', glow: '#fff3d6' }, type: { display: 'grotesk', scale: 'monumental', case: 'upper' }, atmosphere: { backdrop: 'gradient', light: 'none', particles: 'none', density: 0.2 }, motion: { tempo: 'lively', signature: 'the race carries through' }, thread: { kind: 'none' },
    assetNotes: inv.map(a => ({ asset: a.id, depicts: `mock: ${a.title || a.id}`, matches: 'yes' })), wants: [], limitations: [], scenes };
}
function plan(body, attempt, env) {
  const { data } = payload(body); const assets = data.assets || []; const facts = data.facts || [];
  if (env && env.MOCK_DIRECTOR === 'follow' && data.artDirection && (data.artDirection.scenes || []).length >= 2 && attempt !== 'invalid') return followPlan(data, (data.understanding && data.understanding.identity && data.understanding.identity.name) || 'The subject');
  const free = assets.find(a => a.transparent) || null; const photo = assets.find(a => !a.transparent) || null;
  const name = (data.understanding && data.understanding.identity && data.understanding.identity.name) || 'The subject';
  const focal = free ? { kind: 'image', role: 'focal', asset: free.id, box: { d: [54, 10, 40, 82], m: [10, 4, 80, 92] }, entrance: { kind: 'descend', delay: 0.3, dur: 1.4 }, loop: { kind: 'float', amp: 1.2, period: 9 }, scroll: { kind: 'parallax', amount: 0.4 }, treatment: 'shadow' }
    : photo ? { kind: 'image', role: 'focal', asset: photo.id, box: { d: [52, 12, 42, 76], m: [8, 6, 84, 88] }, mask: 'arch', fit: 'cover', entrance: { kind: 'unveil' }, loop: { kind: 'drift', amp: 0.8, period: 14 } }
      : { kind: 'shape', role: 'focal', shape: { form: 'circle', fill: 'accent' }, box: { d: [56, 16, 34, 58], m: [22, 10, 56, 60] }, entrance: { kind: 'pop' }, loop: { kind: 'breathe' } };
  // a revision comes back changed -- unless it was asked to keep the page as it is (MOCK_CREATIVE_REVISE=same, or said so)
  const revised = !!(data.revise && !(env && env.MOCK_CREATIVE_REVISE === 'same') && !/as it is|unchanged/i.test(data.revise.ownerRequest || ''));
  const cited = facts.filter(f => f.text.length <= 240).slice(0, 3).map((f, i) => ({ label: String(i + 1), text: f.text, kind: 'sourced', cite: f.id }));
  const scenes = [
    { id: 'arrival', name: 'Arrival', purpose: 'Introduce the subject as the star', height: 'screen', layers: [focal, { kind: 'shape', role: 'support', shape: { form: 'ring', fill: 'glow' }, box: { d: [60, 6, 30, 48], m: [50, 0, 46, 40] }, opacity: 0.4, loop: { kind: 'spin', period: 30 } }], text: { kicker: 'A mock direction', heading: name, body: 'This plan was produced by the test provider, not a real model.', kind: 'imagined', region: 'left', size: 'display' }, cta: 'Begin' },
    { id: 'reveal', name: 'The reveal', purpose: 'Scroll-scrubbed close-up', link: 'follows the subject closer', height: 'tall', pin: true, camera: 'push-in', background: 'deep', layers: [Object.assign({}, focal, { box: { d: [30, 8, 40, 84], m: [10, 6, 80, 88] }, scroll: { kind: 'zoom-in', amount: 0.5 }, loop: { kind: 'none' } }), { kind: 'word', role: 'texture', word: { text: name.slice(0, 12).toUpperCase(), style: 'outline' }, box: { d: [-10, 30, 120, 40], m: [-10, 30, 120, 30] }, opacity: 0.35, scroll: { kind: 'pass-through', amount: 0.6 } }], text: { heading: 'Closer', items: cited, list: 'numbered', region: 'right', size: 'large' } },
    { id: 'rest', name: 'Rest', purpose: 'A quiet ending', link: 'lets the page settle', height: 'short', background: 'invert', layers: [{ kind: 'shape', role: 'focal', shape: { form: 'line', fill: 'accent' }, box: { d: [20, 48, 60, 4], m: [10, 48, 80, 4] }, entrance: { kind: 'unveil' } }], text: { heading: 'The end of the mock.', kind: 'imagined', region: 'center', size: 'medium' } },
  ];
  if (revised) {
    scenes.splice(1, 0, { id: 'detail', name: 'Detail', purpose: 'A closer look, added by the revision', link: 'moves in closer', height: 'tall', background: 'tint', layers: [{ kind: 'shape', role: 'focal', shape: { form: 'circle', fill: 'accent' }, box: { d: [20, 20, 40, 60], m: [10, 10, 80, 60] }, entrance: { kind: 'pop' } }], text: { heading: 'Closer still.', kind: 'imagined', region: 'right', size: 'large' } });
    scenes.reverse(); scenes.unshift(scenes.pop());
  }
  if (attempt === 'invalid') { scenes[0].layers[0] = { kind: 'image', role: 'focal', asset: 'does-not-exist', box: { d: [50, 10, 40, 80], m: [10, 10, 80, 80] } }; scenes[0].text.heading = ''; }
  return {
    identity: { name, kind: (data.understanding && data.understanding.identity && data.understanding.identity.kind) || 'recognizable' },
    ...(revised ? {
      concept: { title: 'Mock Stage, revised', logline: `A revised mock direction for ${name}, used only to test the plumbing.`, why: 'test revision' },
      palette: { bg: '#f4efe6', bg2: '#e6dccb', ink: '#1d1a16', muted: '#6d6456', accent: '#b0412e', glow: '#ffe2c4' },
      type: { display: 'grotesk', scale: 'large', case: 'upper' }, atmosphere: { backdrop: 'paper', light: 'sun', particles: 'none', density: 0.2 }, motion: { tempo: 'lively', signature: 'the page snaps between scenes' }, thread: { kind: 'ribbon' },
    } : {
      concept: { title: 'Mock Stage', logline: `A mock three-scene direction for ${name}, used only to test the plumbing.`, why: 'test' },
      palette: { bg: '#15120f', bg2: '#2b231b', ink: '#f6efe3', muted: '#bfb2a0', accent: '#d8b46a', glow: '#fff1cf' },
      type: { display: 'didone', scale: 'monumental', case: 'normal' }, atmosphere: { backdrop: 'spotlight', light: 'spot', particles: 'dust', density: 0.4 }, motion: { tempo: 'measured', signature: 'the subject descends' }, thread: { kind: 'line' },
    }),
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
  if (tool === 'submit_creative_continuity') {
    // the continuity pass (labelled mock). MOCK_CONTINUITY = ok (default: every seam overlaps a little more, the hero
    // video settles into its still frame) | error (the call fails) | junk (nothing usable) | reset (asks for a hard cut
    // into scene 2, which the critic must catch)
    counters.continuity = (counters.continuity || 0) + 1; const cm = env.MOCK_CONTINUITY || 'ok';
    if (cm === 'error') return { status: 500, body: { error: { message: 'mock: choreography down' } } };
    const data = payload(body).data; const contracts = (data.contracts || []).map(k => ({ at: k.at, family: k.family, intent: k.intent, carriedActor: k.carriedActor, overlap: { from: Math.max(-0.6, Math.min(-0.15, (k.overlap ? k.overlap.from : -0.4) - 0.05)), to: k.overlap ? k.overlap.to : 0 }, depth: k.depth, mask: k.mask, background: k.background, typography: k.typography, camera: k.camera }));
    if (cm === 'reset' && contracts[0]) Object.assign(contracts[0], { family: 'cut', intent: 'reset' });
    const input = cm === 'junk' ? { contracts: [{ at: 99, family: 'teleport' }], hero: { end: 'explode' } } : { contracts, hero: { end: 'static-frame' }, spatialUseful: [1] };
    return { status: 200, body: { model: 'mock-creative-continuity', usage: { input_tokens: 4200, output_tokens: 800 }, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `ct${counters.continuity}`, name: tool, input }] } };
  }
  if (tool === 'submit_creative_continuity_fixes') {
    // the critic (labelled mock). MOCK_CRITIC = ok (default: fixes exactly what the rules found) | none | error
    counters.critic = (counters.critic || 0) + 1; const km = env.MOCK_CRITIC || 'ok';
    if (km === 'error') return { status: 500, body: { error: { message: 'mock: critic down' } } };
    const found = payload(body).data.found || [];
    const fixes = km === 'none' ? [] : found.slice(0, 6).map(f => (f.code === 'competing-motion' ? { at: f.at, code: f.code, calm: true } : f.code === 'dead-gap' ? { at: f.at, code: f.code, overlap: { from: -0.5, to: 0.05 } } : { at: f.at, code: f.code, family: 'color-bleed', intent: f.code === 'duplicate-motion' || f.code === 'no-rest' ? 'rest' : 'continue' }));
    return { status: 200, body: { model: 'mock-creative-critic', usage: { input_tokens: 2100, output_tokens: 160 }, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `cc${counters.critic}`, name: tool, input: { fixes } }] } };
  }
  counters.plans = (counters.plans || 0) + 1;
  const bad = mode === 'invalid' || (mode === 'repair' && counters.plans % 2 === 1);
  return { status: 200, body: { model: 'mock-creative-director', usage, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `p${counters.plans}`, name: tool, input: plan(body, bad ? 'invalid' : 'ok', env) }] } };
}
module.exports = { respond, plan };
