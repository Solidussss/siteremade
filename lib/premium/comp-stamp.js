'use strict';
// Turns a page composition plan into data attributes on the ALREADY-RENDERED section elements (same additive technique as the
// existing data-rhythm-position stamping: never a wrapper, so existing CSS that depends on a section's direct children keeps
// working). Two front doors, one plan: DOM (live preview) and HTML strings (purchased export / Workplace).
const { planPageComposition, finalCtaHeadline } = require('./composition');
const { deriveStrategy } = require('./strategy');

function attrString(e) {
  let s = ` data-comp-tone="${e.tone}" data-comp-weight="${e.weight}"`;
  if (e.moment) s += ` data-comp-moment="${e.moment}"`;
  if (e.open) s += ' data-comp-open="1"';
  if (e.layout && e.layout !== 'default') s += ` data-comp-layout="${e.layout}"`;
  if (e.form) s += ' data-comp-form="1"';
  if (e.cta) s += ` data-comp-cta="${e.cta}"`;
  return s;
}
const footerAttrs = f => ` data-comp-tone="${f.tone}" data-comp-footer="${f.layout}"`;

function strategyFor(project) {
  const cd = project.intent && project.intent.creativeDirection;
  return deriveStrategy({ archetype: project.strategy && project.strategy.archetype, categoryKey: project.business && project.business.categoryKey, creativeDirection: cd, claudeStrategy: project.strategy, location: project.source && project.source.location });
}
// sections: the page's section objects (footer entries ignored); hasImage: parallel array of booleans
function planFor(project, sections, hasImage, heroInfo, hasForm) {
  const list = [];
  (sections || []).forEach((s, i) => { if (s && s.type !== 'footer') list.push({ id: s.id, type: s.type, variant: s.variant, hasImage: !!(hasImage && hasImage[i]), hasForm: !!(hasForm && hasForm[i]), copyChars: s.copy && s.copy.body ? String(s.copy.body).length : 0 }); });
  return planPageComposition({ sections: list, strategy: strategyFor(project), palette: project.design && project.design.palette, hero: heroInfo });
}

// ---- string front door (export) --------------------------------------------------------------------------------------
// parts: [{ section, html }] in page order; returns html strings with attributes inserted
function stampParts(project, parts, heroInfo) {
  const secs = parts.map(p => p.section);
  const plan = planFor(project, secs, parts.map(p => /<img[^>]*site-visual-img/.test(p.html)), heroInfo, parts.map(p => /<form[^>]*module-form/.test(p.html)));
  const byId = new Map(plan.sections.map(e => [e.id, e]));
  const html = parts.map(p => { const e = byId.get(p.section.id); return e ? p.html.replace('<div class="site-section ', `<div${attrString(e)} class="site-section `) : p.html; });
  return { html, plan };
}
function stampFooterHtml(html, plan) { return html.replace('<div class="site-section site-footer"', `<div${footerAttrs(plan.footer)} class="site-section site-footer"`); }

// ---- DOM front door (live preview) -----------------------------------------------------------------------------------
function stampDom(root, project, sections, heroInfo) {
  const els = Array.prototype.filter.call(root.children, el => el.classList.contains('site-section') && !el.classList.contains('site-footer'));
  const secs = (sections || []).filter(s => s && s.type !== 'footer');
  const plan = planFor(project, secs, secs.map((s, i) => !!(els[i] && els[i].querySelector('img'))), heroInfo, secs.map((s, i) => !!(els[i] && els[i].querySelector('.module-form'))));
  plan.sections.forEach((e, i) => {
    const el = els[i]; if (!el) return;
    ['tone', 'weight', 'moment', 'open', 'layout', 'form', 'cta'].forEach(k => el.removeAttribute('data-comp-' + k));
    el.dataset.compTone = e.tone; el.dataset.compWeight = e.weight;
    if (e.moment) el.dataset.compMoment = e.moment; if (e.open) el.dataset.compOpen = '1';
    if (e.layout && e.layout !== 'default') el.dataset.compLayout = e.layout; if (e.form) el.dataset.compForm = '1'; if (e.cta) el.dataset.compCta = e.cta;
  });
  const foot = root.querySelector('.site-footer'); if (foot) { foot.dataset.compTone = plan.footer.tone; foot.dataset.compFooter = plan.footer.layout; }
  return plan;
}

module.exports = { attrString, footerAttrs, planFor, stampParts, stampFooterHtml, stampDom, strategyFor, finalCtaHeadline };
