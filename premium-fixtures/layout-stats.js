(() => {
  // Objective layout evidence read from the laid-out DOM (independent of the composition planner).
  const site = document.getElementById('builderSite'); const sw = site.getBoundingClientRect().width;
  const cs = e => getComputedStyle(e);
    const heroEl = site.querySelector('.site-hero, .site-page-header'); const root = heroEl ? heroEl.parentElement : site;
  const kids = Array.from(root.children).filter(e => /site-section|site-hero|site-footer/.test(e.className));
  const rgb = e => { let el = e; while (el && el !== site.parentElement) { const b = cs(el).backgroundColor; if (b && !/rgba?\(0, 0, 0, 0\)|transparent/.test(b)) return b; el = el.parentElement; } return 'none'; };
  const bgs = kids.map(rgb);
  let changes = 0; for (let i = 1; i < bgs.length; i++) if (bgs[i] !== bgs[i - 1]) changes++;
  const heights = kids.map(e => Math.round(e.getBoundingClientRect().height));
  const fullWidth = kids.filter(e => e.getBoundingClientRect().width >= sw * 0.98 && !/site-hero/.test(e.className)).length;
  // visually framed repeated units: a visible box (>=3 border sides) or a filled panel
  const framed = Array.from(root.querySelectorAll('.feature-card,.faq-item,.sr-icon-tile,.testimonial-card,.process-compact-card,.site-service-card,.pricing-card,.team-card')).filter(e => { const c = cs(e); const sides = ['Top','Right','Bottom','Left'].filter(k => c['border'+k+'Width'] !== '0px' && c['border'+k+'Style'] !== 'none').length; const fill = c.backgroundColor && !/rgba?(0, 0, 0, 0)|transparent/.test(c.backgroundColor); return sides >= 3 || fill; }).length;
  const dividers = kids.filter(e => cs(e).borderTopWidth !== '0px' && cs(e).borderTopStyle !== 'none').length;
  return { sections: kids.length, distinctBackgrounds: new Set(bgs).size, adjacentBackgroundChanges: changes, fullWidthSections: fullWidth, cardFramedElements: framed, sectionsWithTopDivider: dividers, totalHeightPx: Math.round(root.getBoundingClientRect().height), minSectionHeightPx: Math.min(...heights), maxSectionHeightPx: Math.max(...heights), heights };
})()
