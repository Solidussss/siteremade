'use strict';
// THE REALISM ENGINE (lib/reality, REALISM_ENGINE.md): the Business Reality Model and its confidence classes, the
// industry modules, the claim extractor, the page audit and the publish check. Pure; no network, no model.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const R = require('../lib/reality');
const M = R.model;
const { deriveGrounding } = require('../lib/premium/grounding');

const FIELDS = [{ key: 'businessName' }, { key: 'watch' }, { key: 'options' }, { key: 'reserve' }];
const MERIDIAN = {
  businessName: 'Meridian 38',
  watch: 'Meridian 38, calibre MW-42: a hand-wound three-hand watch (no date, no second time zone). 38 mm steel case, 11 mm thick, water resistant to 100 m, 42-hour power reserve, 17 jewels, 4 Hz.',
  options: 'Cases: brushed steel $1,850 (6 weeks), black DLC steel $2,150 (8 weeks), bronze $2,400 (10 weeks). Straps: black rubber included, navy canvas +$60.',
  reserve: 'A $300 deposit holds a build slot.',
};
const entriesOf = (o) => { const out = []; (function walk(x, p) { if (Array.isArray(x)) x.forEach((y, i) => walk(y, p + '.' + i)); else if (x && typeof x === 'object') { for (const [k, v] of Object.entries(x)) if (!k.startsWith('_') && k !== 'theme') walk(v, p ? p + '.' + k : k); } else if (typeof x === 'string') out.push({ path: p, text: x }); else if (typeof x === 'number') out.push({ path: p, value: x }); })(o, ''); return out; };

test('model: four confidence classes, and nothing becomes confirmed without the owner', () => {
  const m = M.create({ kind: 'real' });
  M.set(m, 'offerings.prices.0', '$100', { status: 'confirmed', source: 'owner' });
  assert.throws(() => M.set(m, 'x', 1, { status: 'confirmed', source: 'writer' }), /cannot come from "writer"/, 'a writer cannot confirm');
  assert.throws(() => M.set(m, 'x', 1, { status: 'illustrative', source: 'writer' }), /concept business only/, 'illustrative is for concepts');
  assert.throws(() => M.set(m, 'x', 1, { status: 'derived', source: 'derived' }), /names what it was derived from/);
  assert.throws(() => M.set(m, 'x', 1, { status: 'guessed', source: 'writer' }), /unknown status/);
  // a weaker fact never replaces what the owner said
  M.set(m, 'offerings.prices.0', '$90', { status: 'proposed', source: 'writer' });
  assert.equal(M.value(m, 'offerings.prices.0'), '$100');
  // propose() is proposed for a real business, illustrative for a concept
  assert.equal(M.propose(m, 'operations.leadTime', '6 weeks').status, 'proposed');
  assert.equal(M.propose(M.create({ kind: 'concept' }), 'operations.leadTime', '6 weeks').status, 'illustrative');

  // promotion: only confirm(), which records who and when; anything else is reported
  const before = JSON.parse(JSON.stringify(m));
  const silent = JSON.parse(JSON.stringify(m)); silent.facts['operations.leadTime'].status = 'confirmed';
  assert.deepEqual(M.checkTransition(before, silent), [{ path: 'operations.leadTime', from: 'proposed', to: 'confirmed' }]);
  const rewritten = JSON.parse(JSON.stringify(m)); rewritten.facts['offerings.prices.0'].value = '$120';
  assert.deepEqual(M.checkTransition(before, rewritten), [{ path: 'offerings.prices.0', from: 'confirmed', to: 'changed' }]);
  assert.deepEqual(M.confirm(m, ['operations.leadTime'], 'account:1', '2026-10-12T00:00:00.000Z'), ['operations.leadTime']);
  assert.deepEqual(M.get(m, 'operations.leadTime'), { value: '6 weeks', status: 'confirmed', source: 'owner', confirmedBy: 'account:1', at: '2026-10-12T00:00:00.000Z', was: 'proposed' });
  assert.deepEqual(M.checkTransition(before, m), [], 'a recorded confirmation is not a silent promotion');
  assert.throws(() => M.confirm(m, ['x'], ''), /who confirmed/);
  assert.deepEqual(M.summary(m).counts, { confirmed: 2, derived: 0, proposed: 0, illustrative: 0 });
});

test('industries: a common foundation with specialised modules, detected from the owner\'s words', () => {
  const cases = [
    ['A hand-wound watch with a 42-hour power reserve', 'watch'],
    ['Old-school barbershop in Leeds: skin fades and hot towel shaves', 'appointments'],
    ['Booking software for barbers and salons', 'software'],
    ['A wood-fired pizzeria and bar in Naples', 'hospitality'],
    ['Roofing contractor: metal roofs and shingle repairs', 'trades'],
    ['Decorative concrete: stamped patios and polished floors', 'trades'],
    ['A skincare brand: serum and moisturiser for sensitive skin', 'product'],
    ['A small law firm for tenants', 'professional'],
    ['Boutique pilates studio with reformer classes', 'fitness'],
    ['A charity running community food programmes', 'nonprofit'],
    ['We do things', 'other'],
  ];
  for (const [t, id] of cases) assert.equal(R.industries.detect(t).id, id, t);
  // different businesses get different structures and different material claims
  const keys = (id) => Object.keys(R.industries.byId(id).offerings).concat(Object.keys(R.industries.byId(id).operations)).join(',');
  const shapes = ['watch', 'appointments', 'software', 'hospitality', 'trades'].map(keys);
  assert.equal(new Set(shapes).size, 5, 'five industries, five structures');
  assert.ok(R.industries.byId('watch').offerings.straps && R.industries.byId('trades').operations.serviceArea && R.industries.byId('software').offerings.plans && R.industries.byId('hospitality').offerings.menu && R.industries.byId('appointments').offerings.services);
  assert.ok(R.industries.byId('trades').imagery.avoid.some((a) => /asphalt for decorative concrete/.test(a)));
  assert.ok(R.industries.byId('watch').consistent.some((c) => /black DLC case is black DLC in every view/.test(c)));
  for (const mod of R.industries.MODULES.concat([R.industries.OTHER])) for (const k of ['offerings', 'operations', 'material', 'phrases', 'consistent', 'imagery', 'demos', 'derive']) assert.ok(mod[k] != null, `${mod.id}.${k}`);
});

test('extract: material claims in page text', () => {
  const kinds = (t, mod) => R.extract.claimsIn(t, mod).map((c) => `${c.kind}:${c.match}`);
  assert.deepEqual(kinds('From $1,850, or $60, then $40.'), ['price:$1,850', 'price:$60', 'price:$40'], 'no trailing comma');
  const rc = kinds('Rated 4.9 stars by 500+ happy customers.');
  assert.ok(rc.some((x) => x.startsWith('review:')) && rc.includes('customerCount:500+ happy customers'), rc.join(' | '));
  for (const [t, k] of [['ISO 9001 certified', 'certification'], ['a lifetime warranty', 'guarantee'], ['Founded in 1998', 'founded'], ['12 Market Street', 'address'], ['Ships in 3 weeks', 'availability'], ['Our refund policy', 'legal'], ['award-winning', 'award'], ['hello@kestrel.co', 'contact'], ['open 7am', 'hours'], ['11 mm thick', 'specification']]) {
    assert.ok(R.extract.claimsIn(t).some((c) => c.kind === k), `${t} -> ${k}: ${JSON.stringify(R.extract.claimsIn(t))}`);
  }
  assert.ok(kinds('Swiss made, COSC certified', R.industries.byId('watch')).some((x) => x.startsWith('origin:')));
  assert.ok(kinds('SOC 2 audited', R.industries.byId('software')).some((x) => x.startsWith('compliance:')));
  assert.ok(kinds('Every pizza can be gluten-free', R.industries.byId('hospitality')).some((x) => x.startsWith('dietary:')));
  assert.deepEqual(R.extract.claimsIn('A calm studio with good light.'), [], 'mood is not a claim');
});

test('fromBrief: the owner\'s words become confirmed facts; calculations from them are derived', () => {
  const m = R.fromBrief({ kind: 'real', fields: FIELDS, brief: MERIDIAN });
  assert.equal(m.industry.id, 'watch');
  const f = (p) => M.get(m, p);
  assert.deepEqual([f('offerings.specs.powerReserve').value, f('offerings.specs.powerReserve').status, f('offerings.specs.powerReserve').source], [42, 'confirmed', 'owner']);
  assert.equal(f('offerings.complications.secondTimeZone').value, false, '"no second time zone" is read as a fact');
  assert.deepEqual([f('offerings.specs.vph').value, f('offerings.specs.vph').status, f('offerings.specs.vph').from], [28800, 'derived', ['offerings.specs.frequencyHz']]);
  assert.equal(f('offerings.specs.hoursPerTurn'), null, 'no turns in the brief, so no hours per turn');
  const withTurns = R.fromBrief({ kind: 'real', fields: FIELDS, brief: { ...MERIDIAN, watch: MERIDIAN.watch + ' Fully wound in 30 turns.' } });
  assert.deepEqual([M.value(withTurns, 'offerings.specs.hoursPerTurn'), M.get(withTurns, 'offerings.specs.hoursPerTurn').status], [1.4, 'derived']);
  assert.deepEqual(M.value(m, 'offerings.pricing.range'), [60, 2400]);
  assert.ok(Object.values(m.facts).every((x) => x.status === 'confirmed' || x.status === 'derived'), 'a brief holds no proposals');
});

test('audit: each claim on the page is confirmed, derived, proposed or illustrative -- and material or not', () => {
  const content = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'design-sites', 'meridian-38.json'), 'utf8'));
  const m = R.fromBrief({ kind: 'real', fields: FIELDS, brief: MERIDIAN });
  const items = R.audit(m, entriesOf(content), { assumed: content._assumed });
  const at = (p) => items.filter((i) => i.path === p);
  assert.ok(at('configure.cases.0.price').every((i) => i.status === 'confirmed'), 'the brief\'s prices');
  assert.ok(at('hero.pills.2').some((i) => i.status === 'derived' && /28,800/.test(i.text)), '28,800 vph worked out from 4 Hz');
  assert.deepEqual(at('movement.turns').map((i) => [i.status, i.material, i.flagged]), [['proposed', true, true]], 'the writer\'s 30 turns: proposed, and it said so');
  assert.ok(at('specs.rows.1.mm').some((i) => i.status === 'proposed' && i.text === '10.8'), 'a thickness the brief contradicts (11 mm) is not confirmed');
  assert.ok(!items.some((i) => i.path === 'specs.body' && i.status === 'proposed'), 'general knowledge (a ligne is 2.26 mm) is not a claim about the business');
  // the same page for a concept business: what is not in the brief is illustrative
  const c = R.fromBrief({ kind: 'concept', fields: FIELDS, brief: MERIDIAN });
  assert.ok(R.audit(c, entriesOf(content), { assumed: content._assumed }).filter((i) => i.path === 'movement.turns').every((i) => i.status === 'illustrative'));
  // a phrase claim is confirmed only when the owner wrote it
  const cosc = R.fromBrief({ kind: 'real', fields: FIELDS, brief: { ...MERIDIAN, watch: MERIDIAN.watch + ' COSC certified.' } });
  assert.equal(R.audit(cosc, [{ path: 'hero.lede', text: 'COSC certified to -4/+6 s a day.' }]).find((i) => i.kind === 'chronometer').status, 'confirmed');
  assert.equal(R.audit(m, [{ path: 'hero.lede', text: 'COSC certified to -4/+6 s a day.' }]).find((i) => i.kind === 'chronometer').status, 'proposed');
});

test('publishCheck: a real business publishes material claims only once confirmed; a concept says it is one', () => {
  const m = R.fromBrief({ kind: 'real', fields: FIELDS, brief: MERIDIAN });
  const items = R.audit(m, [{ path: 'reviews.0', text: 'Rated 4.9 stars by 1,200 owners.' }, { path: 'hero.lede', text: 'From $1,850.' }]);
  const check = R.publishCheck(m, items);
  assert.equal(check.ok, false);
  assert.deepEqual(check.blocking.map((b) => b.kind).sort(), ['customerCount', 'review']);
  assert.ok(!check.blocking.some((b) => b.path === 'hero.lede'), 'the brief\'s own price is not held back');
  const before = JSON.parse(JSON.stringify(m));
  R.confirmClaims(m, check.blocking, 'account:1');
  assert.ok(R.publishCheck(m, R.audit(m, [{ path: 'reviews.0', text: 'Rated 4.9 stars by 1,200 owners.' }])).ok, 'confirmed by the owner, it may go live');
  assert.deepEqual(M.checkTransition(before, m), [], 'and the confirmation is recorded, not silent');
  assert.ok(Object.values(m.facts).filter((f) => f.confirmedBy).length >= 2);

  const concept = R.fromBrief({ kind: 'concept', fields: FIELDS, brief: MERIDIAN });
  assert.equal(R.publishCheck(concept, [], { html: '<footer><p>© Meridian 2026</p></footer>' }).ok, false);
  assert.equal(R.publishCheck(concept, [], { html: '<footer><p>Meridian is a made-up business for a concept site.</p></footer>' }).ok, true);
  assert.equal(R.publishCheck(concept, [], { html: '<script>"concept"</script><p>© Meridian</p>' }).ok, false, 'the notice must be visible text');
});

test('writerBrief: what the writer is told about a real business and a concept', () => {
  const real = R.writerBrief(R.fromBrief({ kind: 'real', fields: FIELDS, brief: MERIDIAN })).join('\n');
  assert.match(real, /REAL business/); assert.match(real, /PROPOSED and cannot be published until the owner confirms it/);
  assert.match(real, /never "made-up" or "concept"/); assert.match(real, /Watchmaker/); assert.match(real, /powerReserve = 42 \(confirmed\)/);
  assert.match(real, /vph = 28800 \(derived from offerings\.specs\.frequencyHz\)/);
  const concept = R.writerBrief(R.fromBrief({ kind: 'concept', fields: FIELDS, brief: MERIDIAN })).join('\n');
  assert.match(concept, /CONCEPT business/); assert.match(concept, /ILLUSTRATIVE/); assert.match(concept, /made up for a concept site/);
});

test('adapters: the Business grounding and Creative facts in the same model (read only)', () => {
  const g = deriveGrounding({ description: 'Decorative concrete contractor: stamped patios and polished garage floors.', location: 'Austin, Texas', categoryKey: 'renovation' });
  const b = R.fromGrounding(g);
  assert.equal(b.industry.id, 'trades'); assert.equal(M.value(b, 'identity.location'), 'Austin');
  assert.ok(b.unsupported.includes('customer testimonials'));
  const items = R.audit(b, [{ path: 'hero', text: 'Trusted by 2,000 homeowners, with a lifetime warranty.' }]);
  assert.ok(items.every((i) => i.status === 'proposed' && i.material), 'the Business generator\'s own unsupported claims are what the audit flags');
  const c = R.fromCreative({ facts: [{ id: 'f1', text: 'The Polaroid SX-70 was introduced in 1972.' }], supplied: ['My dad bought one in 1974.'], subject: 'Polaroid SX-70 camera' });
  assert.equal(M.get(c, 'research.f1').source, 'research'); assert.equal(M.get(c, 'brief.supplied.0').source, 'owner');
  assert.equal(R.audit(c, [{ path: 's1', text: 'Since 1972.' }])[0].status, 'confirmed');
});
