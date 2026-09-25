'use strict';
// ONE visual art direction for the whole site, decided BEFORE any image is
// chosen or generated, so every image feels like it belongs to the same
// site. Derived deterministically from the strategy + palette (no model
// call); the pipeline may optionally have a strong model refine it.

const ARCHETYPE_ART = {
  'local-conversion': { photographyStyle: 'commercial documentary photography of real work, finished results and real environments', lighting: 'natural daylight, clear sky or bright window light, no dramatic grading', subjectTreatment: 'finished work and honest detail; people only from behind or at a distance', compositionStyle: 'wide, subject off-centre with clean negative space for a headline', humanPresence: 'minimal and non-identifiable', realismLevel: 'photorealistic, unretouched-looking', contrast: 'medium-high, crisp' },
  'trust-heavy-professional': { photographyStyle: 'calm professional interior and detail photography', lighting: 'soft natural window light', subjectTreatment: 'considered interiors and tools of the trade', compositionStyle: 'balanced, generous negative space', humanPresence: 'minimal, no identifiable people', realismLevel: 'photorealistic', contrast: 'medium' },
  'premium-consultancy': { photographyStyle: 'quiet editorial photography, restrained and architectural', lighting: 'soft directional daylight with gentle shadow', subjectTreatment: 'spaces, objects and texture rather than posed people', compositionStyle: 'minimal, asymmetric, lots of negative space', humanPresence: 'none or fleeting', realismLevel: 'photorealistic, fine-art', contrast: 'medium, low saturation' },
  'service-business': { photographyStyle: 'clean commercial photography of the work and its setting', lighting: 'bright natural light', subjectTreatment: 'work in progress and finished results, people not featured', compositionStyle: 'clear single subject with room for text', humanPresence: 'minimal', realismLevel: 'photorealistic', contrast: 'medium' },
  hospitality: { photographyStyle: 'warm sensory food-and-space photography', lighting: 'warm low ambient light with soft highlights', subjectTreatment: 'plated food, textures and the room set for service', compositionStyle: 'shallow depth of field, intimate crops', humanPresence: 'hands or silhouettes only, no identifiable guests', realismLevel: 'photorealistic', contrast: 'medium, warm' },
  portfolio: { photographyStyle: 'high-craft photography that shows the work itself', lighting: 'controlled studio or clean natural light', subjectTreatment: 'the work is the subject', compositionStyle: 'strong single focal point, generous crop room', humanPresence: 'minimal', realismLevel: 'photorealistic, editorial', contrast: 'high' },
  'editorial-brand': { photographyStyle: 'cinematic editorial photography', lighting: 'directional, moody or golden-hour light', subjectTreatment: 'expressive, art-directed subjects', compositionStyle: 'bold cropping, strong negative space', humanPresence: 'stylised, faces not required', realismLevel: 'photorealistic, stylised', contrast: 'high' },
  'product-led-saas': { photographyStyle: 'abstract brand graphics and calm workspace photography', lighting: 'soft studio light or clean gradient light', subjectTreatment: 'abstract shapes, depth and data-flow metaphors, physical objects', compositionStyle: 'centered or right-weighted with negative space for the headline', humanPresence: 'none', realismLevel: 'clean, rendered or photographic', contrast: 'medium-high' },
  'launch-campaign': { photographyStyle: 'bold product or abstract campaign visuals', lighting: 'dramatic clean studio light', subjectTreatment: 'single strong object or abstract form', compositionStyle: 'centered hero object, high negative space', humanPresence: 'none', realismLevel: 'clean, rendered or photographic', contrast: 'high' },
  'ecommerce-showcase': { photographyStyle: 'clean product photography', lighting: 'soft even studio light with natural shadow', subjectTreatment: 'the product, well lit', compositionStyle: 'product centered or thirds, room for copy', humanPresence: 'hands only', realismLevel: 'photorealistic', contrast: 'medium' },
  'community-nonprofit': { photographyStyle: 'warm documentary photography', lighting: 'natural daylight', subjectTreatment: 'shared activity and place, faces not featured', compositionStyle: 'open, human-scale', humanPresence: 'groups at a distance, non-identifiable', realismLevel: 'photorealistic, candid', contrast: 'medium, warm' },
};

function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return { h: 220, s: 0.3, l: 0.5 };
  const n = parseInt(m[1], 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return { h, s, l };
}
function colorMoodFor(palette) {
  const p = palette || {};
  const main = hexToHsl(p.main), bg = hexToHsl(p.background);
  const warm = main.h < 70 || main.h > 330;
  const temp = main.s < 0.12 ? 'neutral' : warm ? 'warm' : main.h > 170 && main.h < 270 ? 'cool' : 'balanced';
  const tone = bg.l < 0.35 ? 'dark, low-key' : 'light, airy';
  return { temperature: temp, tone, description: `${temp} palette, ${tone}, echoing the brand colour ${p.main || ''}`.trim() };
}

function deriveArtDirection(strategy, palette) {
  const base = ARCHETYPE_ART[(strategy && strategy.archetype)] || ARCHETYPE_ART['service-business'];
  const mood = colorMoodFor(palette);
  const art = Object.assign({ version: 1 }, base, {
    colorMood: mood.description,
    palette: { temperature: mood.temperature, tone: mood.tone },
    // The rules every image on this site must obey so they read as one set.
    imageConsistencyRules: [
      `one photographic style: ${base.photographyStyle}`,
      `one lighting family: ${base.lighting}`,
      `one colour mood: ${mood.description}`,
      `same realism level across all images: ${base.realismLevel}`,
      'no text, lettering, signage, logos or watermarks in any image',
      'no browser windows, website/app UI, dashboards or readable screens in any image (unless a product mockup is explicitly requested)',
      'no identifiable people; no fabricated staff, customers or projects',
    ],
  });
  return art;
}

module.exports = { ARCHETYPE_ART, deriveArtDirection, colorMoodFor, hexToHsl };
