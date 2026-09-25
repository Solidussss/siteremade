'use strict';
// Semantic review + repair (V3). Two layers over one shared BUSINESS_GROUNDING:
//   1. deterministic guards/checks (free, always run): wrong-business sections and words, invented trust signals,
//      internal planner text shown to customers, CTA/nav vocabulary, thin secondary pages, off-subject image prompts
//   2. ONE whole-site critique by the strong model (small, budgeted) that sees every page, section, CTA and image prompt
//      together and proposes at most a handful of targeted fixes with customer-ready replacement text.
// Repairs are surgical: remove/replace/rewrite exactly the flagged item; the site is never regenerated.

const { wordMatch, RULES } = require('./grounding');
const { SECTION_VARIANTS } = require('./vocab');

const SEMANTIC_CATEGORIES = ['BUSINESS_CONSISTENCY', 'CROSS_PAGE_CONSISTENCY', 'FACTUAL_GROUNDING', 'CTA_CONSISTENCY', 'IMAGE_SUBJECT_RELEVANCE',
  'SECONDARY_PAGE_DEPTH', 'COPY_SPECIFICITY', 'INVENTED_TRUST_SIGNALS', 'WRONG_BUSINESS_CONCEPTS', 'PAGE_PURPOSE_CLARITY'];

// Builder instructions that leak into customer-facing text ("Establish who is behind the business...").
const INTERNAL_PATTERNS = [
  /^\s*(remove|reduce|establish|show|explain|demonstrate|highlight|clarify|convey|reassure|address|answer|introduce|position|build|drive|encourage|prompt|give|help|let) (friction|who|how|what|why|the|your|trust|objections?|visitors?|people|users?|customers?)\b/i,
  /\b(the visitor|visitors? (should|can|will|need)|this (section|page) (should|will|exists|is meant)|the goal of (this|the)|call[- ]to[- ]action|primary cta|make starting easy|remove friction)\b/i,
  /^\s*(who is behind|why (they|you) can be trusted)\b/i,
];
// Invented social proof and trust phrases that are never allowed without supplied data.
const FAKE_PROOF = [/\bverified (customer|buyer|purchase)\b/i, /\bregular guest\b/i, /\b(local|private|happy|satisfied) (customer|client)s?\b(?=\s*$)/i, /\bfive[- ]star\b/i, /\b(customers?|clients?|guests?) (say|said|love|rave)\b/i, /\b(already )?ordered (a )?(second|again)\b/i, /\bfast,? tracked shipping\b/i, /\bfree (shipping|returns)\b/i, /\bbest[- ]?sellers?\b/i, /\btrusted by\b/i];
const GENERIC = [/\belevate your\b/i, /\bwhere (quality|innovation|excellence) meets\b/i, /\bunlock (your|the) (full )?potential\b/i, /\bseamless(ly)?\b/i, /\bcutting[- ]edge\b/i, /\bworld[- ]class\b/i, /\bsolutions? tailored\b/i, /\bnext level\b/i, /\bstate[- ]of[- ]the[- ]art\b/i, /\bfocused on doing the job right\b/i, /\bwithout the busywork\b/i, /\bcomes? to life\b/i];

const CTA_SENTENCE = /^[A-Za-z][A-Za-z '&-]{1,40}$/;
const ROLE_OF_PAGE = label => { const l = String(label || '').toLowerCase(); if (/about|story|who we|our (approach|philosophy)/.test(l)) return 'about'; if (/contact|visit|find us|get in touch|location|hours/.test(l)) return 'contact'; if (/shop|product|collection|store|catalog|menu|services?|work|pricing|plans?/.test(l)) return 'catalog'; return 'other'; };
const RENAME = { retail: { menu: 'Shop', services: 'Shop', pricing: 'Shop', reservations: 'Visit', reserve: 'Visit', booking: 'Contact', 'book now': 'Contact' }, saas: { menu: 'Product', shop: 'Product', reservations: 'Contact' }, hospitality: { pricing: 'Menu', plans: 'Menu' } };

function eachString(direction, fn) {
  const c = direction.copy || {};
  ['kicker', 'headline', 'sub', 'cta'].forEach(k => { if (typeof c[k] === 'string') fn({ kind: 'hero', id: 'hero', field: k }, c[k]); });
  (direction.pages || []).forEach(p => {
    if (typeof p.label === 'string') fn({ kind: 'page', id: p.slug || 'home', field: 'label' }, p.label);
    if (typeof p.purpose === 'string' && p.purpose) fn({ kind: 'page', id: p.slug || 'home', field: 'purpose' }, p.purpose);
    (p.sections || []).forEach(s => {
      const cp = s.copy || {};
      Object.keys(cp).forEach(k => { if (typeof cp[k] === 'string') fn({ kind: 'section', id: s.id, field: k, type: s.type, page: p.slug || 'home' }, cp[k]); });
    });
  });
}
const CTA_FIELDS = new Set(['cta', 'ctaLabel']);
const forbiddenHit = (text, g) => (g.forbiddenWords || []).find(w => wordMatch(text, w)) || null;
const briefHit = text => INTERNAL_PATTERNS.some(re => re.test(text));
const fakeProofHit = (text, g) => FAKE_PROOF.find(re => re.test(text) && !(re.source && re.test(g.verifiedFacts && g.verifiedFacts.description || ''))) || null;

// Would this replacement text be acceptable on the site? (used for critic-supplied fixes)
function validateCustomerText(text, g, field) {
  const t = String(text || '').trim(); const p = [];
  if (!t) p.push('empty'); if (t.length > 240) p.push('too long');
  if (briefHit(t)) p.push('internal wording'); const fw = forbiddenHit(t, g); if (fw) p.push('wrong-business word: ' + fw);
  if (FAKE_PROOF.some(re => re.test(t))) p.push('invented proof'); if (GENERIC.some(re => re.test(t))) p.push('generic filler');
  if (CTA_FIELDS.has(field) && !CTA_SENTENCE.test(t)) p.push('not a button label');
  if (CTA_FIELDS.has(field) && g && g.cta) { try { if (g.cta.forbid && new RegExp(g.cta.forbid, 'i').test(t)) p.push('button belongs to another business'); else if (g.cta.allow && !new RegExp(g.cta.allow, 'i').test(t)) p.push('button does not fit this business'); } catch (_) { /* bad pattern: skip */ } }
  return p;
}

// ---- deterministic checks -----------------------------------------------------------------------------------------------------
function checkSemantics(direction, g, ctx) {
  const c = ctx || {}; const defects = []; const add = d => defects.push(Object.assign({ severity: 2, target: { kind: 'site', id: null }, source: 'deterministic' }, d));
  const rules = RULES[g.family] || RULES.other;
  const pages = direction.pages || [];
  const allSections = []; pages.forEach(p => (p.sections || []).forEach(s => allSections.push({ page: p, section: s })));

  // archetype vs family: the planner/analysis picked a different kind of business
  const arch = direction.strategy && direction.strategy.archetype;
  if (arch && arch !== g.archetype) add({ category: 'BUSINESS_CONSISTENCY', code: 'archetype_conflicts_with_business', severity: 3, detail: `${arch} vs ${g.archetype}`, repair: { kind: 'set_archetype', value: g.archetype } });

  allSections.forEach(({ page, section: s }) => {
    if (g.forbiddenSections.includes(s.type)) add({ category: 'WRONG_BUSINESS_CONCEPTS', code: 'section_wrong_for_business', severity: 3, detail: `${s.type} on a ${g.family} site`, target: { kind: 'section', id: s.id }, repair: { kind: 'remove_section', targetId: s.id } });
    if ((s.type === 'testimonial' || s.type === 'testimonialsGrid') && g.testimonialAvailability !== 'supplied') add({ category: 'INVENTED_TRUST_SIGNALS', code: 'testimonials_without_source', severity: 3, detail: 'no testimonials were supplied', target: { kind: 'section', id: s.id }, repair: { kind: 'remove_section', targetId: s.id } });
    if (s.type === 'team' && g.teamAvailability !== 'supplied') add({ category: 'FACTUAL_GROUNDING', code: 'team_without_data', severity: 3, detail: 'no team information was supplied', target: { kind: 'section', id: s.id }, repair: { kind: 'remove_section', targetId: s.id } });
    if (s.type === 'pricing' && !g.forbiddenSections.includes('pricing') && g.pricingModel === 'none-supplied') add({ category: 'FACTUAL_GROUNDING', code: 'pricing_tiers_invented', severity: 3, detail: 'pricing tiers with no supplied pricing', target: { kind: 'section', id: s.id }, repair: { kind: 'remove_section', targetId: s.id } });
  });
  // a "Pricing"/"Plans" page when no pricing was supplied is an invented offer, even if the tier section itself is gone
  pages.forEach((p, i) => {
    if (i === 0 || !/^\s*(pricing|plans?( (&|and) pricing)?|packages)\s*$/i.test(String(p.label || ''))) return;
    if (g.pricingModel === 'none-supplied' || g.forbiddenSections.includes('pricing')) add({ category: 'FACTUAL_GROUNDING', code: 'pricing_page_without_pricing', severity: 3, detail: p.label, target: { kind: 'page', id: p.slug }, repair: { kind: 'remove_page', slug: p.slug } });
  });
  // strings
  const ctaLabels = new Set();
  eachString(direction, (where, text) => {
    const isCta = CTA_FIELDS.has(where.field);
    if (isCta) {
      ctaLabels.add(text.trim().toLowerCase());
      if (rules.cta.forbid.test(text) || (!g.newArrivalsJustified && /new arrivals/i.test(text)) || (rules.cta.allow && !rules.cta.allow.test(text))) add({ category: 'CTA_CONSISTENCY', code: 'cta_wrong_for_business', severity: 2, detail: text, target: where, repair: { kind: 'set_text', where, value: g.primaryCTA } });
      return;
    }
    if (where.field === 'label') {
      const key = text.trim().toLowerCase(); const map = RENAME[g.family] || {};
      if (map[key]) add({ category: 'CROSS_PAGE_CONSISTENCY', code: 'nav_label_wrong_for_business', severity: 2, detail: text, target: where, repair: { kind: 'set_text', where, value: map[key] } });
      else { const fw = forbiddenHit(text, g); if (fw) add({ category: 'CROSS_PAGE_CONSISTENCY', code: 'nav_label_wrong_for_business', severity: 2, detail: text, target: where }); }
      return;
    }
    if (briefHit(text)) add({ category: where.field === 'purpose' ? 'PAGE_PURPOSE_CLARITY' : 'COPY_SPECIFICITY', code: 'internal_text_on_site', severity: 3, detail: text.slice(0, 90), target: where, repair: { kind: 'clear_text', where } });
    else if (FAKE_PROOF.some(re => re.test(text))) add({ category: 'INVENTED_TRUST_SIGNALS', code: 'invented_proof_phrase', severity: 3, detail: text.slice(0, 90), target: where, repair: { kind: 'clear_text', where } });
    else { const fw = forbiddenHit(text, g); if (fw) add({ category: 'WRONG_BUSINESS_CONCEPTS', code: 'wrong_business_word', severity: 3, detail: `"${fw}" in: ${text.slice(0, 80)}`, target: where, repair: { kind: 'clear_text', where } }); else if (GENERIC.some(re => re.test(text))) add({ category: 'COPY_SPECIFICITY', code: 'generic_copy', severity: 1, detail: text.slice(0, 90), target: where }); }
  });
  if (ctaLabels.size > 3) add({ category: 'CTA_CONSISTENCY', code: 'too_many_cta_labels', severity: 1, detail: [...ctaLabels].join(' | ') });

  // secondary pages: intentionally minimal is fine, a title over one thin section is not
  pages.forEach((p, i) => {
    if (i === 0) return;
    const real = (p.sections || []).filter(s => s.type !== 'footer');
    const role = ROLE_OF_PAGE(p.label);
    if (real.length <= 1 && (role === 'about' || role === 'contact')) add({ category: 'SECONDARY_PAGE_DEPTH', code: 'thin_secondary_page', severity: 2, detail: `${p.label}: ${real.length} section(s)`, target: { kind: 'page', id: p.slug }, repair: { kind: 'enrich_page', slug: p.slug, role } });
  });
  // images: prompts must describe this business's subject
  (direction.imagePlan || []).forEach(e => {
    if (e.sourceType !== 'generated' || !e.prompt) return;
    const bad = (g.imageryAvoid || []).find(w => wordMatch(String(e.prompt).split(/\.\s*(Photograph or graphic only|Abstract graphic only)/)[0], w));
    if (bad) add({ category: 'IMAGE_SUBJECT_RELEVANCE', code: 'image_prompt_off_subject', severity: 2, detail: `${e.slot}: mentions "${bad}"`, target: { kind: 'image', id: e.slot }, repair: { kind: 'rewrite_image_prompt', slot: e.slot } });
  });
  return defects;
}

// ---- deterministic repairs -----------------------------------------------------------------------------------------------------
const clone = o => JSON.parse(JSON.stringify(o));
function setAt(direction, where, value) {
  if (where.kind === 'hero') { direction.copy = direction.copy || {}; if (value === null) delete direction.copy[where.field]; else direction.copy[where.field] = value; return true; }
  if (where.kind === 'page') { const p = (direction.pages || []).find(x => (x.slug || 'home') === where.id); if (!p) return false; p[where.field] = value === null ? '' : value; return true; }
  if (where.kind === 'section') { for (const p of (direction.pages || [])) { const s = (p.sections || []).find(x => x.id === where.id); if (s) { s.copy = Object.assign({}, s.copy); if (value === null) delete s.copy[where.field]; else s.copy[where.field] = value; return true; } } }
  return false;
}
function newId(prefix) { return `${prefix}-${Date.now().toString(36)}${Math.random().toString(16).slice(2, 7)}`; }
const RECIPES = { about: ['about', 'ctaBanner'], contact: ['contact'] };
function enrichPage(direction, slug, role, g) {
  const p = (direction.pages || []).find(x => (x.slug || 'home') === slug); if (!p) return false;
  const have = new Set((p.sections || []).map(s => s.type)); let added = false;
  (RECIPES[role] || []).forEach(t => {
    if (have.has(t) || g.forbiddenSections.includes(t)) return;
    const v = SECTION_VARIANTS[t] ? SECTION_VARIANTS[t][0] : undefined;
    p.sections.push({ id: newId(t), type: t, variant: v, copy: null, intent: 'convert', headlineRole: 'declarative' }); added = true;
  });
  return added;
}
// Applies every deterministic repair (defects carry their own repair). Returns changes for logging.
function applyRepairs(direction, defects, g) {
  const d = clone(direction); const changes = [];
  const seen = new Set();
  defects.forEach(x => {
    const r = x.repair; if (!r) return; const key = JSON.stringify(r); if (seen.has(key)) return; seen.add(key);
    if (r.kind === 'remove_section') {
      for (const p of (d.pages || [])) { const i = (p.sections || []).findIndex(s => s.id === r.targetId); if (i !== -1 && (p.sections.length > 1 || (d.pages[0] !== p && d.pages.length > 1))) { p.sections.splice(i, 1); changes.push({ code: x.code, kind: r.kind, target: r.targetId, category: x.category }); break; } }
    } else if (r.kind === 'set_text' && r.where) { if (setAt(d, r.where, r.value)) changes.push({ code: x.code, kind: r.kind, target: r.where.id, category: x.category }); }
    else if (r.kind === 'clear_text' && r.where) { if (setAt(d, r.where, null)) changes.push({ code: x.code, kind: r.kind, target: r.where.id, category: x.category }); }
    else if (r.kind === 'remove_page') { const i = (d.pages || []).findIndex((p, k) => k > 0 && (p.slug || '') === (r.slug || '')); if (i > 0) { d.pages.splice(i, 1); changes.push({ code: x.code, kind: r.kind, target: r.slug, category: x.category }); } }
    else if (r.kind === 'set_archetype') { d.strategy = Object.assign({}, d.strategy, { archetype: r.value }); changes.push({ code: x.code, kind: r.kind, target: 'archetype', category: x.category }); }
    else if (r.kind === 'enrich_page') { if (enrichPage(d, r.slug, r.role, g)) changes.push({ code: x.code, kind: r.kind, target: r.slug, category: x.category }); }
    else if (r.kind === 'rewrite_image_prompt') { const e = (d.imagePlan || []).find(z => z.slot === r.slot); if (e) { e.promptNeedsRewrite = true; changes.push({ code: x.code, kind: r.kind, target: r.slot, category: x.category, note: 'flagged; image already generated' }); } }
    else if (r.kind === 'apply_fix_text' && r.where && r.fixText) { if (!validateCustomerText(r.fixText, g, r.where.field).length && setAt(d, r.where, r.fixText)) changes.push({ code: x.code, kind: r.kind, target: r.where.id, category: x.category }); }
  });
  // a page whose every section was removed must not stay in the nav
  d.pages = (d.pages || []).filter((p, i) => i === 0 || (p.sections || []).length);
  return { direction: d, changes };
}

// ---- whole-site critique (one strong-model call) ----------------------------------------------------------------------------------
const CRITERIA = [
  'BUSINESS_CONSISTENCY: does every page and section describe the SAME kind of business as the grounding says?',
  'CROSS_PAGE_CONSISTENCY: do page names, nav labels, tone, CTAs and terminology agree across pages?',
  'FACTUAL_GROUNDING: is any fact (product, price, place, policy, staff, history) asserted that is not in the description?',
  'CTA_CONSISTENCY: does every button label fit this business and one primary action?',
  'IMAGE_SUBJECT_RELEVANCE: does every image prompt depict this business\'s actual subject, and agree with the others?',
  'SECONDARY_PAGE_DEPTH: does each non-home page have enough grounded substance for its purpose (without inventing)?',
  'COPY_SPECIFICITY: is any copy generic filler, or a builder instruction shown as if it were customer copy?',
  'INVENTED_TRUST_SIGNALS: testimonials, ratings, awards, years, guarantees, "verified" claims, customer counts?',
  'WRONG_BUSINESS_CONCEPTS: words or sections from a different kind of business (menu/reserve/guest on a store, plan tiers on a store, shop language on software)?',
  'PAGE_PURPOSE_CLARITY: is each page\'s purpose clear to a customer?',
];
const CRITIC_TOOL = {
  name: 'report_semantic_defects', description: 'Report up to 8 concrete defects across the WHOLE site. Empty list if none. Fix text must be customer-ready and must not invent facts.',
  input_schema: { type: 'object', additionalProperties: false, required: ['defects'], properties: { defects: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['category', 'code', 'severity', 'evidence'], properties: {
    category: { type: 'string', enum: SEMANTIC_CATEGORIES }, code: { type: 'string', maxLength: 60 }, severity: { type: 'integer', enum: [1, 2, 3] },
    where: { type: 'string', enum: ['hero', 'page', 'section', 'image', 'site'] }, targetId: { type: 'string', maxLength: 90, description: 'section id, page slug (empty string for Home), or image slot' },
    field: { type: 'string', enum: ['kicker', 'headline', 'sub', 'cta', 'label', 'purpose', 'body', 'ctaLabel'] },
    evidence: { type: 'string', maxLength: 240 }, fixKind: { type: 'string', enum: ['remove_section', 'apply_fix_text', 'none'] }, fixText: { type: 'string', maxLength: 220 } } } } } },
};
function dumpSite(direction) {
  const L = []; const c = direction.copy || {};
  L.push(`HERO: kicker="${c.kicker || ''}" headline="${c.headline || ''}" sub="${c.sub || ''}" cta="${c.cta || ''}"`);
  (direction.pages || []).forEach((p, i) => {
    L.push(`PAGE ${i === 0 ? 'Home' : p.label} (slug="${p.slug || ''}") purpose="${p.purpose || ''}"`);
    (p.sections || []).forEach(s => { const cp = s.copy || {}; L.push(`  - ${s.type} id=${s.id} ${Object.keys(cp).filter(k => typeof cp[k] === 'string').map(k => `${k}="${cp[k].slice(0, 120)}"`).join(' ')}`); });
  });
  (direction.imagePlan || []).forEach(e => { if (e.prompt) L.push(`IMAGE ${e.slot} [${e.sourceType}]: ${String(e.prompt).slice(0, 170)}`); });
  return L.join('\n').slice(0, 7000);
}
function buildSemanticCritique(direction, g, remainingNote) {
  const grounding = [`Business: ${g.businessType} (${g.family}); sells: ${g.salesModel}; location: ${g.location || 'not supplied'}`,
    `Customer wrote: "${g.verifiedFacts.description}"`, `Primary action: ${g.primaryCTA}. Pricing supplied: ${g.pricingModel !== 'none-supplied'}. Testimonials supplied: ${g.testimonialAvailability === 'supplied'}. Team info supplied: ${g.teamAvailability === 'supplied'}.`,
    `NOT supplied (must not be asserted): ${g.unsupportedFacts.join('; ')}`, `Words that belong to a different kind of business: ${g.forbiddenWords.join(', ')}`,
    g.imagerySubjects ? `Image subjects should be: ${g.imagerySubjects.hero}` : ''].filter(Boolean).join('\n');
  return { system: 'You review a generated small-business website against the customer\'s own description. Judge the WHOLE site together. Report only concrete, checkable defects with evidence; propose customer-ready replacement text only when it invents nothing. Do not give an overall opinion.',
    user: `GROUNDING\n${grounding}\n\nCRITERIA\n- ${CRITERIA.join('\n- ')}\n\nWHOLE SITE\n${dumpSite(direction)}${remainingNote ? '\n\n' + remainingNote : ''}` };
}
function parseSemanticCritique(input, direction, g) {
  if (!input || !Array.isArray(input.defects)) return [];
  const out = [];
  input.defects.slice(0, 8).forEach(d => {
    if (!d || !SEMANTIC_CATEGORIES.includes(d.category)) return;
    const defect = { category: d.category, code: String(d.code || 'critic_defect').slice(0, 60), severity: [1, 2, 3].includes(d.severity) ? d.severity : 1, detail: String(d.evidence || '').slice(0, 240), source: 'semantic_critique', target: { kind: d.where || 'site', id: d.targetId || null } };
    if (d.fixKind === 'remove_section' && d.where === 'section' && d.targetId) defect.repair = { kind: 'remove_section', targetId: d.targetId };
    else if (d.fixKind === 'apply_fix_text' && d.fixText && d.field) {
      const kind = d.where === 'hero' ? 'hero' : d.where === 'page' ? 'page' : d.where === 'section' ? 'section' : null;
      if (kind) defect.repair = { kind: 'apply_fix_text', where: { kind, id: kind === 'hero' ? 'hero' : (d.targetId || (kind === 'page' ? 'home' : '')), field: d.field }, fixText: String(d.fixText) };
    }
    out.push(defect);
  });
  return out;
}

function summarizeSemantic(defects) {
  const categories = {}; SEMANTIC_CATEGORIES.forEach(c => { const ds = defects.filter(d => d.category === c && d.severity > 0); categories[c] = ds.some(d => d.severity >= 3) ? 'FAIL' : ds.length ? 'NEEDS_REPAIR' : 'PASS'; });
  return categories;
}

module.exports = { SEMANTIC_CATEGORIES, INTERNAL_PATTERNS, FAKE_PROOF, GENERIC, eachString, checkSemantics, applyRepairs, validateCustomerText, buildSemanticCritique, parseSemanticCritique, CRITIC_TOOL, summarizeSemantic, dumpSite, briefHit, ROLE_OF_PAGE };
