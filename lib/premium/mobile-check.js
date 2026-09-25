'use strict';
// Real-DOM phone-width validation. The generated site lays itself out with
// CSS container queries on `.builder-site`, so cloning it into an off-screen
// wrapper of phone width triggers the same mobile layout the customer will
// see -- no iframe, no viewport resize. Browser-only (needs `document`).
//
// Measures the things Part 36 lists: hero crop, headline wrapping, nav,
// cards, images, CTA, overflow and spacing. Nothing here is a guess: each
// number is read from the laid-out DOM.

// true if an ancestor between el and the site root clips it (overflow hidden/clip) so it cannot cause horizontal scrolling
function isClipped(el, root, rootRect, width) {
  const win = el.ownerDocument.defaultView;
  for (let p = el.parentElement; p && p !== root.parentElement; p = p.parentElement) {
    const cs = win.getComputedStyle(p);
    if ((/(hidden|clip)/.test(cs.overflowX)) && p.getBoundingClientRect().right - rootRect.left <= width + 2) return true;
  }
  return false;
}

function measureAtWidth(siteEl, width) {
  const doc = siteEl.ownerDocument;
  const wrap = doc.createElement('div');
  // Same frame the customer sees in the mobile preview (.builder-device.mobile sets the site to the phone width and
  // lifts the desktop min-width). Measuring a bare clone would report the desktop min-width, not the phone layout.
  wrap.className = 'builder-device mobile';
  wrap.style.cssText = `position:fixed;left:-100000px;top:0;width:${width + 26}px;min-height:0;visibility:hidden;pointer-events:none;`;
  const clone = siteEl.cloneNode(true);
  clone.removeAttribute('id');
  clone.style.removeProperty('width');
  wrap.appendChild(clone);
  doc.body.appendChild(wrap);
  try {
    const out = { width, overflowX: false, heroHeadlineLines: 0, smallTapTargets: 0, badImageCrops: 0, navOverflow: false, tightSections: 0, cardsPerRowMax: 0 };
    out.overflowX = false;
    // any descendant poking past the right edge
    const cr = clone.getBoundingClientRect();
    let widest = 0;
    const offenders = [];
    clone.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect(); if (r.width <= 0) return;
      const right = r.right - cr.left;
      if (right > width + 2) offenders.push({ el: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''), right: Math.round(right), clipped: isClipped(el, clone, cr, width) });
      if (right > widest) widest = right;
    });
    // Only content a visitor could actually scroll to counts: elements clipped by an ancestor with overflow hidden/clip are not overflow.
    const real = offenders.filter(o => !o.clipped);
    if (real.length) out.overflowX = true; else if (!offenders.length) out.overflowX = clone.scrollWidth > width + 1 ? true : out.overflowX;
    out.widestPx = Math.round(widest);
    out.overflowOffenders = real.slice(0, 4).map(o => o.el + '@' + o.right);
    const h = clone.querySelector('.site-copy h3, .hero-stacked-copy h3, .site-hero h3, .site-hero h1, .site-hero h2');
    if (h) { const cs = doc.defaultView.getComputedStyle(h); const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.15; out.heroHeadlineLines = Math.max(1, Math.round(h.getBoundingClientRect().height / lh)); out.heroHeadlineFontPx = Math.round(parseFloat(cs.fontSize)); }
    clone.querySelectorAll('a, button, .hero-cta-btn').forEach(el => {
      const cs = doc.defaultView.getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const r = el.getBoundingClientRect(); if (r.width === 0) return;
      if (/site-cta|hero-cta|cta-btn|button|btn/i.test(el.className) && r.height < 40) out.smallTapTargets++;
    });
    clone.querySelectorAll('img').forEach(img => {
      const r = img.getBoundingClientRect(); if (!r.width || !r.height || !img.naturalWidth) return;
      const shown = r.width / r.height, natural = img.naturalWidth / img.naturalHeight;
      const loss = 1 - Math.min(shown, natural) / Math.max(shown, natural);
      if (loss > 0.55 && doc.defaultView.getComputedStyle(img).objectFit === 'cover') out.badImageCrops++;
    });
    const nav = clone.querySelector('.site-nav'); if (nav) out.navOverflow = nav.scrollWidth > nav.clientWidth + 2;
    clone.querySelectorAll('.site-section').forEach(s => { const cs = doc.defaultView.getComputedStyle(s); if (parseFloat(cs.paddingLeft) < 14) out.tightSections++; });
    // cards per row: distinct left offsets among sibling cards in the first card grid
    const grid = clone.querySelector('[class*="card-grid"], [class*="-grid"]');
    if (grid) { const lefts = new Set(); Array.from(grid.children).forEach(c => lefts.add(Math.round(c.getBoundingClientRect().left))); out.cardsPerRowMax = lefts.size; }
    return out;
  } finally { wrap.remove(); }
}

// widths: default phone widths. Returns the shape quality-review.js expects.
function measureMobile(siteEl, widths) {
  const ws = (widths && widths.length ? widths : [390, 360]);
  return { measuredAt: new Date().toISOString(), widths: ws.map(w => measureAtWidth(siteEl, w)) };
}

module.exports = { measureMobile, measureAtWidth };
