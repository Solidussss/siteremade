'use strict';
// MOCK answers for the "Update My Website" redesign planner (submit_website_redesign), for tests only
// (test/helpers/run-server.js). They read the site context the server really sent -- page ids, section ids, the
// business's own offerings -- and answer like a planner would for each kind of request. They say nothing about
// design quality; they exercise classification, validation, fact rules, preservation, the meaningful-change check,
// saving, preview and export.
//   MOCK_REDESIGN = premium | editorial | creative | hero | noop | invent | drop-form | malformed; unset: chosen from
//   the owner's request (autoMode below)
const pick = (current, options) => options.find(o => o !== current) || options[0];

function contextOf(body) {
  const text = [].concat(...(body.messages || []).map(m => (Array.isArray(m.content) ? m.content.map(c => c.text || '') : [String(m.content)]))).join('\n');
  const i = text.indexOf('The current website:\n');
  try { return { text, ctx: JSON.parse(text.slice(i + 'The current website:\n'.length)) }; } catch (e) { return { text, ctx: null }; }
}

// every page, its non-form sections reordered and re-laid-out, its copy rewritten from the owner's own words
function revisePages(ctx, { onlyHome, words }) {
  const offerings = (ctx.business && ctx.business.offerings) || [];
  return ctx.pages.filter(p => !onlyHome || p.isHome).map(p => {
    const forms = p.sections.filter(s => s.form);
    const rest = p.sections.filter(s => !s.form).reverse();
    const sections = rest.concat(forms).map((s, i) => {
      const other = { services: ['described', 'numbered'], about: ['split', 'statement'], gallery: ['featured', 'grid'], features: ['list', 'grid'], ctaBanner: ['accent', 'plain'], editorialFeature: ['image-left', 'image-right', 'full'] }[s.type];
      return {
        ref: s.id, type: s.type, variant: other ? pick(s.variant, other) : undefined, intent: i === 0 ? 'introduce' : 'explain', headlineRole: i % 2 ? 'editorial' : 'declarative',
        ...(s.type === 'editorialFeature' ? { mediaComposition: pick(s.mediaComposition, ['OVERSIZED_IMAGE', 'VERTICAL_EDITORIAL']) } : {}),
        headline: offerings[i % Math.max(1, offerings.length)] ? `${offerings[i % offerings.length]}, ${words}` : `${p.label}, ${words}`,
      };
    });
    return { pageId: p.id, label: p.label, sections };
  });
}

// Without MOCK_REDESIGN the mock answers the kind of request it was sent (so one test server can play every case).
function autoMode(text) {
  const r = (/The owner's request \(verbatim\): "([^"]*)"/.exec(text) || [])[1] || '';
  if (/as it is|unchanged/i.test(r)) return 'noop';
  if (/credib|proof|trust/i.test(r)) return 'invent';
  if (/simpl|minimal/i.test(r)) return 'drop-form';
  if (/gibberish/i.test(r)) return 'malformed';
  if (/hero/i.test(r)) return 'hero';
  if (/editorial/i.test(r)) return 'editorial';
  if (/premium|luxur|high-end/i.test(r)) return 'premium';
  if (/creative|generic/i.test(r)) return 'creative';
  return 'premium';
}
function redesign(body, env) {
  const { ctx, text } = contextOf(body);
  const mode = env.MOCK_REDESIGN || autoMode(text);
  if (mode === 'malformed' || !ctx) return { interpretation: 'x', design: { hero: 'not-a-layout', typography: 42 }, creativeDirection: 'nope', hero: [], pages: 'all of them' };
  const d = ctx.design || {};
  const name = (ctx.business && ctx.business.name) || 'the studio';
  const offerings = (ctx.business && ctx.business.offerings) || [];
  const sb = ctx.hero && ctx.hero.storyboard;
  if (mode === 'noop') return { interpretation: 'keep it', design: Object.assign({}, d), creativeDirection: Object.assign({}, ctx.creativeDirection || {}), hero: { headline: ctx.hero.headline } };
  if (mode === 'premium') return {
    interpretation: 'Quieter, more considered and more expensive-feeling: serif type, more air, fewer boxes, a darker luxurious treatment.',
    design: Object.assign({}, d, { typography: pick(d.typography, ['serif-editorial', 'classic-serif-mix']), spacing: pick(d.spacing, ['generous', 'airy']), colorBehavior: pick(d.colorBehavior, ['dark-luxury-metallic', 'high-contrast-mono-accent']), cardDensity: pick(d.cardDensity, ['airy', 'mixed']), card: pick(d.card, ['outline-ghost', 'flat']), typographyScale: pick(d.typographyScale, ['display', 'standard']), contentWidth: pick(d.contentWidth, ['wide', 'contained']), cta: pick(d.cta, ['outline-ghost', 'underline-link']) }),
    typeSystem: { typography: 'editorial-contrast', spacing: 'airy' },
    motionIntensity: 'SUBTLE',
    creativeDirection: { concept: 'private-client-luxury', visualMood: 'quiet-luxury', pageRhythm: 'steady-editorial', avoid: ['generic-cards'] },
    hero: { headline: offerings.length >= 2 ? `${offerings[0]} and ${offerings[1]}, by ${name}` : `${name}, considered`, sub: offerings.length ? `${offerings.join(', ')}.` : undefined, ...(sb ? { storyboardComposition: pick(sb.composition, ['arch-cluster', 'fan']), storyboardTone: 'dark' } : {}) },
    pages: revisePages(ctx, { onlyHome: false, words: 'considered' }),
  };
  if (mode === 'editorial') return {
    interpretation: 'A magazine-like homepage: serif display type, an editorial rhythm, image-led features.',
    design: Object.assign({}, d, { sectionRhythm: pick(d.sectionRhythm, ['editorial', 'feature-band']), typographyScale: pick(d.typographyScale, ['display', 'standard']), headingWidth: pick(d.headingWidth, ['narrow', 'wide']), pattern: pick(d.pattern, ['story-first', 'standard']), typography: pick(d.typography, ['serif-editorial', 'classic-serif-mix']) }),
    typeSystem: { typography: 'editorial-contrast' },
    creativeDirection: { narrativeStrategy: 'editorial', pageRhythm: 'steady-editorial', signatureMotif: 'editorial-image-rail' },
    hero: { headline: offerings.length ? `${offerings[0]}, in pictures and words` : `${name}, in pictures and words` },
    // a homepage request: the other pages returned here must be ignored by the server
    pages: revisePages(ctx, { onlyHome: false, words: 'told properly' }),
  };
  if (mode === 'creative') return {
    interpretation: 'Less template, more point of view: an expressive rhythm, collage imagery, asymmetric layouts.',
    design: Object.assign({}, d, { imagery: pick(d.imagery, ['creative-collage', 'editorial-bold']), sectionRhythm: pick(d.sectionRhythm, ['alternating', 'feature-band']), sectionAlignment: pick(d.sectionAlignment, ['split', 'center']), cardShape: pick(d.cardShape, ['pill', 'square']), splitRatio: pick(d.splitRatio, ['media-heavy', 'text-heavy']), imageDominance: pick(d.imageDominance, ['dominant', 'balanced']) }),
    creativeDirection: { concept: 'expressive-creative-technology', visualMood: 'expressive', signatureMotif: 'staggered-mosaic', pageRhythm: 'expressive-alternating', avoid: ['generic-cards', 'rounded-cards'] },
    hero: { kicker: name.slice(0, 30) },
    pages: revisePages(ctx, { onlyHome: false, words: 'seen differently' }).slice(0, 2),
  };
  if (mode === 'hero') return {
    interpretation: 'A new opening: a different composition and a sharper headline.',
    design: Object.assign({}, d, sb ? {} : { hero: pick(d.hero, ['poster', 'centered-oversized', 'quiet-luxury']) }, { splitRatio: pick(d.splitRatio, ['media-heavy', 'even']) }),
    creativeDirection: { heroStrategy: pick((ctx.creativeDirection || {}).heroStrategy, ['editorial', 'image-dominant']) },
    hero: Object.assign({ headline: offerings.length ? `${offerings[0]}, made by ${name}` : `Made by ${name}` }, sb ? { storyboardComposition: pick(sb.composition, ['fan', 'arch-cluster']), storyboardTone: sb.tone === 'dark' ? 'light' : 'dark' } : {}),
    // a hero request: these must be ignored
    pages: revisePages(ctx, { onlyHome: true, words: 'should not appear' }),
  };
  if (mode === 'invent') {
    const home = ctx.pages[0];
    return {
      interpretation: 'Premium, with proof.',
      design: Object.assign({}, d, { typography: pick(d.typography, ['serif-editorial']), spacing: pick(d.spacing, ['generous', 'airy']), colorBehavior: pick(d.colorBehavior, ['dark-luxury-metallic', 'high-contrast-mono-accent']), typographyScale: pick(d.typographyScale, ['display', 'standard']) }),
      typeSystem: { typography: 'editorial-contrast', spacing: 'airy' },
      creativeDirection: { visualMood: 'quiet-luxury' },
      hero: { headline: `Award-winning ${name}, trusted by 2,000 clients since 1998`, sub: 'Rated 5 stars. Call 555-0100 or email hello@invented.example.' },
      // invented proof everywhere -- plus a real reorder, so the parts that ARE allowed still make a redesign
      pages: [{ pageId: home.id, sections: [
        { type: 'testimonialsGrid', headline: 'What our clients say' },
        { type: 'team', headline: 'Meet our 12 experts' },
        ...home.sections.slice().reverse().map(s => ({ ref: s.id, type: s.type, body: 'Our certified team offers a 100% satisfaction guarantee.' })),
      ] }],
    };
  }
  if (mode === 'drop-form') return {
    interpretation: 'Simpler pages.',
    design: Object.assign({}, d, { typography: pick(d.typography, ['serif-editorial']), spacing: pick(d.spacing, ['generous', 'airy']), colorBehavior: pick(d.colorBehavior, ['dark-luxury-metallic', 'high-contrast-mono-accent']), cardDensity: pick(d.cardDensity, ['mixed', 'compact']) }),
    typeSystem: { typography: 'editorial-contrast', spacing: 'airy' },
    creativeDirection: { visualMood: 'restrained' },
    hero: {},
    // every page returned WITHOUT its form sections
    pages: ctx.pages.map(p => ({ pageId: p.id, sections: p.sections.filter(s => !s.form).reverse().map(s => ({ ref: s.id, type: s.type })) })).filter(p => p.sections.length),
  };
  return {};
}

function respond(body, env) {
  const { text, ctx } = contextOf(body);
  const input = redesign(body, env);
  return {
    log: { tool: 'submit_website_redesign', pagesInContext: ctx ? ctx.pages.length : 0, sectionsInContext: ctx ? ctx.pages.reduce((n, p) => n + p.sections.length, 0) : 0, imageBytesSent: /data:image\//.test(text), promptBytes: text.length },
    body: { model: 'mock-redesign-planner', usage: { input_tokens: 9000, output_tokens: 3000 }, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'r1', name: 'submit_website_redesign', input }] },
  };
}
module.exports = { respond };
