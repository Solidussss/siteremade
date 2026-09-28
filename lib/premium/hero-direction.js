'use strict';
// HERO DIRECTION -- the art-directed, moving hero.
//
// Chooses HOW the hero presents a business from what the business is and what
// the visitor is there to do, then renders it as a short, seamless camera move
// over ONE generated still (the image provider makes stills, not video):
//
//   PRODUCT_CLOSEUP  a product brand leads with the product itself, close and
//                    dramatic, the range (flavours/variants) listed beside it;
//                    the camera pushes in slowly.
//   FINISHED_WORK    a trade/outdoor/property business opens on the finished
//                    result -- the yard, the roof, the kitchen -- full-bleed,
//                    with its services along the bottom; the camera pans.
//   ATMOSPHERE       a venue (cafe, restaurant, studio) is about the room: a
//                    tall frame plus a close detail crop of the same shot,
//                    moving against each other (layered parallax).
//   CARE             an appointment/advice business (clinic, coach, advisor)
//                    is calm and human: a soft arched frame, a slow breathing
//                    zoom, what they treat/offer as a short checklist.
//   INTERFACE        software shows the product: a screen floating at an angle
//                    with its key capabilities drifting around it.
//   STATEMENT        no hero image available (none funded, generation off):
//                    oversized type over a slowly moving light field, the
//                    offerings on a gentle ticker -- still alive, never an empty
//                    photo box.
//
// Pure (no I/O, no model calls, no randomness), shared by the live preview
// (script.js, via the premium-core.js bundle), the static export
// (lib/site-render.js) and the tests -- so the preview and the purchased site
// render the SAME markup. Independent of the PREMIUM_GENERATION_V1 flag.
//
// Motion itself is CSS (styles.css, "HERO DIRECTION"): transform/opacity only,
// seamless `alternate` loops, a one-shot intro that ends on the loop's first
// frame, and a hard stop under prefers-reduced-motion.

const TREATMENTS = {
  PRODUCT_CLOSEUP: { layout: 'cinema-product', camera: 'push' },
  FINISHED_WORK: { layout: 'cinema-panorama', camera: 'pan' },
  ATMOSPHERE: { layout: 'cinema-layered', camera: 'parallax' },
  CARE: { layout: 'cinema-portrait', camera: 'breathe' },
  INTERFACE: { layout: 'cinema-interface', camera: 'float' },
  STATEMENT: { layout: 'cinema-statement', camera: 'lightfield' },
};
const TREATMENT_KEYS = Object.keys(TREATMENTS);
const CINEMA_LAYOUTS = TREATMENT_KEYS.map(k => TREATMENTS[k].layout);
const CAMERAS = ['push', 'pan', 'parallax', 'breathe', 'float', 'lightfield'];

const CATEGORY_TREATMENT = {
  retail: 'PRODUCT_CLOSEUP',
  fashion: 'ATMOSPHERE',
  hospitality: 'ATMOSPHERE',
  creative: 'ATMOSPHERE',
  landscaping: 'FINISHED_WORK', roofing: 'FINISHED_WORK', renovation: 'FINISHED_WORK', painting: 'FINISHED_WORK',
  plumbing: 'FINISHED_WORK', electrical: 'FINISHED_WORK', cleaning: 'FINISHED_WORK', automotive: 'FINISHED_WORK',
  realestate: 'FINISHED_WORK', nonprofit: 'FINISHED_WORK',
  wellness: 'CARE', fitness: 'CARE', professional: 'CARE', finance: 'CARE', education: 'CARE',
  tech: 'INTERFACE',
};
const ARCHETYPE_TREATMENT = { 'ecommerce-showcase': 'PRODUCT_CLOSEUP', 'product-led-saas': 'INTERFACE', hospitality: 'ATMOSPHERE', 'local-conversion': 'FINISHED_WORK' };
const PRODUCT_WORDS = /\b(drink|drinks|beverage|soda|juice|energy drink|sparkling|kombucha|snack|snacks|sauce|chocolate|candle|candles|skincare|serum|serums|cleanser|moisturi[sz]er|cosmetics?|supplement|gear|bottle|cans?|jar|product|products)\b/i;
const SERVICE_WORDS = /\b(install\w*|repair\w*|renovat\w*|build\w*|construct\w*|landscap\w*|clean\w*|contractor|crew)\b/i;
const CARE_WORDS = /\b(clinic|therapy|therapist|physio\w*|coach\w*|advis\w*|consult\w*|tutor\w*|counsel\w*|practice)\b/i;

// What the visitor is there to do shapes the camera as much as the category:
// a product is examined (push in), a finished place is explored (pan), a
// venue is felt (layers drifting), a care business reassures (breathing).
function chooseTreatment(ctx) {
  const c = ctx || {};
  const text = String(c.text || '');
  if (c.categoryKey === 'other' || !CATEGORY_TREATMENT[c.categoryKey]) {
    if (ARCHETYPE_TREATMENT[c.archetype]) return ARCHETYPE_TREATMENT[c.archetype];
    if (PRODUCT_WORDS.test(text)) return 'PRODUCT_CLOSEUP';
    if (CARE_WORDS.test(text)) return 'CARE';
    if (SERVICE_WORDS.test(text)) return 'FINISHED_WORK';
    return 'CARE';
  }
  // A retail business that sells an experience/venue rather than a boxed
  // product (a bookshop cafe, a boutique salon) still reads better as a room.
  if (c.categoryKey === 'retail' && !PRODUCT_WORDS.test(text) && /\b(shop floor|showroom|boutique space|visit us|in-store experience)\b/i.test(text)) return 'ATMOSPHERE';
  return CATEGORY_TREATMENT[c.categoryKey];
}

// Stored once at generation time on project.design.heroDirection (plain JSON,
// saved and exported with the project). `baseHero` records the hero layout it
// was directed over: if the owner later picks a different hero layout
// themselves, the direction steps aside (see activeDirection).
function directHero(ctx) {
  const c = ctx || {};
  const treatment = chooseTreatment(c);
  const t = TREATMENTS[treatment];
  return {
    v: 1, treatment, layout: t.layout, camera: t.camera,
    strength: c.motion === 'expressive' ? 'full' : 'gentle',
    baseHero: typeof c.hero === 'string' ? c.hero : null,
  };
}
function validDirection(d) {
  return !!(d && typeof d === 'object' && TREATMENTS[d.treatment] && CINEMA_LAYOUTS.includes(d.layout) && CAMERAS.includes(d.camera));
}
function activeDirection(project) {
  if (!project || !project.design || (project.meta && project.meta.isDemoShell)) return null;
  const d = project.design.heroDirection;
  if (!validDirection(d)) return null;
  const hero = project.design.dimensions && project.design.dimensions.hero;
  if (d.baseHero && hero && d.baseHero !== hero) return null;
  return d;
}
// Whether the directed hero shows an image at all. An unfunded hero (the
// reconciler stamped a text-only `heroDisplayVariant`) falls back to STATEMENT.
function heroShowsImage(project) {
  const d = activeDirection(project);
  if (!d) return null; // not directed -- caller keeps its own rule
  return d.layout !== 'cinema-statement' && !(project.design.dimensions && project.design.dimensions.heroDisplayVariant);
}
function layoutFor(project) {
  const d = activeDirection(project);
  if (!d) return null;
  return heroShowsImage(project) ? d.layout : 'cinema-statement';
}

// ---- hero image prompt ---------------------------------------------------------------------------------------
const FINISHED_OUTCOMES = {
  landscaping: 'a finished backyard -- natural stone patio, layered planting beds and a fresh green lawn',
  roofing: 'a family home with a crisp, newly finished roof',
  renovation: 'a freshly renovated kitchen and living space, finished and styled',
  painting: 'a freshly painted home, crisp walls and clean trim',
  plumbing: 'a finished modern bathroom with new fixtures',
  electrical: 'a finished home interior glowing with new lighting',
  cleaning: 'a spotless, sunlit living room after a deep clean',
  automotive: 'a freshly detailed car with a mirror-like finish',
  realestate: 'a beautiful home exterior at dusk, windows glowing',
  nonprofit: 'the community work in progress, volunteers seen from behind',
};
function careMoment(categoryKey, text) {
  const t = String(text || '');
  if (/\bphysio\w*|rehab\w*|chiropract\w*/i.test(t)) return 'a physiotherapist guiding a patient through a gentle knee stretch, hands and posture in frame, faces out of frame';
  if (/\bmassage\b/i.test(t)) return 'a calm massage treatment in progress, faces out of frame';
  if (/\b(salon|barber|hair)\b/i.test(t)) return 'a stylist finishing a cut, hands and tools in frame, faces out of frame';
  if (categoryKey === 'fitness') return 'a coach guiding a client through a lift in a bright training space, faces out of frame';
  if (categoryKey === 'education') return 'a tutor and student working through notes at a bright table, hands in frame, faces out of frame';
  if (categoryKey === 'professional' || categoryKey === 'finance') return 'a working session across a clean table -- documents, a laptop and two people\'s hands mid-conversation, faces out of frame';
  return 'a treatment in progress in a calm, light-filled room, hands in frame, faces out of frame';
}
const CAMERA_FRAMING = {
  push: 'Composed for a slow cinematic push-in: subject filling the right half, clean dark negative space on the left for a headline, extra margin on every edge.',
  pan: 'Wide panoramic composition for a slow sideways camera pan: the scene continues past both edges, horizon on the upper third, calm lower-left area for a headline.',
  parallax: 'Layered depth for a drifting camera: sharp foreground detail, softly blurred room behind, extra margin top and bottom.',
  breathe: 'Calm, centred composition with room around the subject for a gentle slow zoom.',
  float: 'Generous dark margin around the screen for floating motion.',
  lightfield: '',
};
const possessive = n => (/s$/i.test(n) ? n + "'" : n + "'s");
const clip = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1).replace(/\s+\S*$/, '') : String(s || ''));

// Deterministic hero prompt for a directed hero. `c`: { treatment, categoryKey,
// text, name, subject ("Fizzwell's sparkling energy drink"), offerings[], place,
// accent ("deep orange") }. Always names the business, never a hex colour,
// <= 600 characters (the client-side cap the other prompts respect).
function heroPrompt(c) {
  const p = c || {};
  const t = TREATMENTS[p.treatment] ? p.treatment : 'CARE';
  const subject = clip(p.subject || p.name || 'the business', 90);
  const place = p.place ? `, ${clip(p.place, 40)}` : '';
  const offers = (p.offerings || []).slice(0, 3).map(o => String(o).toLowerCase());
  const accent = p.accent || 'warm';
  let shot;
  if (t === 'PRODUCT_CLOSEUP') {
    const drink = /\b(drink|beverage|soda|juice|sparkling|kombucha|energy)\b/i.test(p.text || '');
    shot = `A dramatic close-up hero photograph of ${subject}${drink ? ', ice-cold with fine condensation' : ', tactile texture and glossy highlights'}${offers.length ? `, styled with ${offers.join(', ')} cues around it` : ''}, strong rim light on a ${accent} backdrop, premium advertising photography`;
  } else if (t === 'FINISHED_WORK') {
    shot = `A wide establishing photograph of ${p.name ? `${possessive(clip(p.name, 50))} work: ` : ''}${FINISHED_OUTCOMES[p.categoryKey] || `the finished work of ${subject}`}${place}, golden-hour light, real and lived-in, documentary quality`;
  } else if (t === 'ATMOSPHERE') {
    const detail = offers[0] ? `${offers[0]} in sharp focus` : 'one telling detail in sharp focus';
    shot = `The atmosphere of ${subject}${place}: ${detail} in the foreground, the warm room softly blurred behind, natural light, candid editorial photography`;
  } else if (t === 'CARE') {
    shot = `A calm, light-filled moment at ${p.name ? clip(p.name, 50) : subject}${place}: ${careMoment(p.categoryKey, p.text)}, soft daylight, quiet neutral palette with a touch of ${accent}`;
  } else if (t === 'INTERFACE') {
    shot = `The ${subject} interface on a floating screen at a slight angle, one crisp key screen, ${accent} glow on a dark backdrop, polished product render`;
  } else {
    shot = `${subject}, one clear focal point`;
  }
  const tail = ' No text, no logos, no watermarks.';
  const framing = CAMERA_FRAMING[TREATMENTS[t].camera];
  let out = `${shot}. ${framing}${tail}`;
  if (out.length > 600) out = `${clip(shot, 600 - tail.length - 2)}.${tail}`;
  return out;
}
// A planner-written hero prompt keeps its subject; only the camera framing is
// added (the planner never knew the hero would move). Capped at the server's
// 1200-character prompt limit.
function framePlannedPrompt(prompt, direction) {
  const base = String(prompt || '').trim();
  const framing = direction && CAMERA_FRAMING[direction.camera];
  if (!base || !framing || base.includes(framing)) return base;
  return clip(`${base.replace(/[.\s]+$/, '')}. ${framing}`, 1200);
}

// ---- markup --------------------------------------------------------------------------------------------------
function esc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// The one hero renderer both sides call. Fields ending in Html are already
// escaped/rendered by the caller (its own copy, CTA button and visual slot);
// plain strings are escaped here.
//   { layout, camera, strength, kickerHtml, headlineHtml, subHtml, ctaHtml,
//     visualHtml, offerings[], name, place }
function renderCinemaHero(o) {
  const layout = CINEMA_LAYOUTS.includes(o.layout) ? o.layout : 'cinema-statement';
  const camera = CAMERAS.includes(o.camera) ? o.camera : 'lightfield';
  const attrs = `class="site-hero hero-cinema hero-${layout}" data-cinema="${layout}" data-camera="${layout === 'cinema-statement' ? 'lightfield' : camera}" data-camera-strength="${o.strength === 'full' ? 'full' : 'gentle'}"`;
  const items = (o.offerings || []).filter(Boolean).slice(0, 5).map(esc);
  const place = o.place ? esc(o.place) : '';
  const name = esc(o.name || '');
  const copy = (extra) => `<div class="cinema-copy"><p class="cinema-kicker">${o.kickerHtml || ''}</p><h3>${o.headlineHtml || ''}</h3><p class="cinema-sub">${o.subHtml || ''}</p><div class="site-actions">${o.ctaHtml || ''}</div>${extra || ''}</div>`;
  const cam = (cls) => `<div class="cinema-cam${cls ? ' ' + cls : ''}">${o.visualHtml || ''}</div>`;
  switch (layout) {
    case 'cinema-product':
      return `<div ${attrs}>
        <div class="cinema-stage" aria-hidden="true"><span class="cinema-glow"></span></div>
        <div class="cinema-media">${cam()}<span class="cinema-sweep" aria-hidden="true"></span></div>
        ${copy(items.length ? `<ul class="cinema-chips" aria-label="The range">${items.map(i => `<li><span class="cinema-chip-dot" aria-hidden="true"></span>${i}</li>`).join('')}</ul>` : '')}
      </div>`;
    case 'cinema-panorama':
      return `<div ${attrs}>
        <div class="cinema-media">${cam()}<span class="cinema-scrim" aria-hidden="true"></span><span class="cinema-light" aria-hidden="true"></span></div>
        ${copy()}
        ${items.length ? `<div class="cinema-strip">${place ? `<span class="cinema-strip-place">${place}</span>` : ''}<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul></div>` : ''}
      </div>`;
    case 'cinema-layered':
      return `<div ${attrs}>
        ${copy(items.length ? `<p class="cinema-note">${items.join(' <span aria-hidden="true">·</span> ')}</p>` : '')}
        <div class="cinema-media">
          <div class="cinema-frame cinema-frame-main">${cam()}</div>
          <div class="cinema-frame cinema-frame-detail" aria-hidden="true">${cam('cinema-cam-detail')}</div>
          ${name ? `<span class="cinema-tag" aria-hidden="true">${name}${place ? ` · ${place}` : ''}</span>` : ''}
        </div>
      </div>`;
    case 'cinema-portrait':
      return `<div ${attrs}>
        ${copy(items.length ? `<ul class="cinema-checks">${items.slice(0, 4).map(i => `<li><span class="cinema-check" aria-hidden="true"></span>${i}</li>`).join('')}</ul>` : '')}
        <div class="cinema-media"><span class="cinema-halo" aria-hidden="true"></span><div class="cinema-arch">${cam()}</div></div>
      </div>`;
    case 'cinema-interface':
      return `<div ${attrs}>
        ${copy()}
        <div class="cinema-media">
          <div class="cinema-device"><div class="cinema-device-bar" aria-hidden="true"><span></span><span></span><span></span></div><div class="cinema-device-screen">${cam()}</div></div>
          ${items.slice(0, 3).map((i, n) => `<div class="cinema-float cinema-float-${n + 1}"><span class="cinema-float-dot" aria-hidden="true"></span>${i}</div>`).join('')}
        </div>
      </div>`;
    default: {
      const ticker = items.length ? `<div class="cinema-ticker" aria-hidden="true"><div class="cinema-ticker-track">${[0, 1].map(() => `<span>${items.join('</span><span>')}</span>`).join('')}</div></div>` : '';
      return `<div ${attrs}>
        <div class="cinema-field" aria-hidden="true"><span class="cinema-orb cinema-orb-a"></span><span class="cinema-orb cinema-orb-b"></span><span class="cinema-orb cinema-orb-c"></span></div>
        ${copy()}
        ${ticker}
      </div>`;
    }
  }
}

module.exports = {
  TREATMENTS, TREATMENT_KEYS, CINEMA_LAYOUTS, CAMERAS, CATEGORY_TREATMENT, FINISHED_OUTCOMES, CAMERA_FRAMING,
  chooseTreatment, directHero, validDirection, activeDirection, heroShowsImage, layoutFor,
  heroPrompt, framePlannedPrompt, renderCinemaHero,
};
