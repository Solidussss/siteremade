'use strict';
// THE CINEMATIC SOURCE -- what a premium cinematic clip (Higgsfield, lib/media/premium-media.js) starts from. Shared by
// the studio (creative-core.js) and the server, so both read one rule.
//
//   image    the owner's own upload, exactly as it has always worked (lib/creative/premium-source.js decides which)
//   model3d  the page's own interactive 3D model (creative.threeD -- the GLB its 3D job stored): SiteRemade renders ONE
//            controlled still of it (the 3D engine's still(): lib/three-d/runtime-src.js -- a fixed three-quarter view,
//            the product centred at a fixed size, studio light, a plain neutral background, RENDER below) and that still
//            is the picture the provider animates. Higgsfield's image-to-video models take a picture (image_url) and
//            nothing else -- no video, no 3D file -- so the camera move is asked for in words (PROMPT_3D). The model is
//            never made again: the still is drawn from the stored GLB.
// A clip made from the 3D model joins the page exactly where an image clip would: on the photo the model was made from.
const SOURCES = ['image', 'model3d'];
// the still: landscape like the clip, opaque (a provider animates a whole picture), big enough for full-screen video
const RENDER = { width: 1920, height: 1080, mime: 'image/png', maxBytes: 12 * 1024 * 1024, background: '#eef0f2', azimuth: -32, elevation: 9, fill: 0.62, lighting: 'studio' };
const PROMPT_3D = 'a slow, subtle orbit around the product with a slight camera push-in; the product stays centred and keeps exactly its shape, proportions, materials, colours and label details; clean studio light on a plain neutral background';
const MESSAGES = {
  unavailable: 'Generate an interactive 3D model first.',
  available: 'Use your generated 3D product as the cinematic motion source.',
  // (base Creative -- 6 credits -- never uses Higgsfield: the source applies only to the cinematic modes)
  inactive: 'Creative never uses Higgsfield. Choose Creative + Cinematic Hero or Creative Showcase to use a cinematic source.',
};
const clean = v => (v === 'model3d' ? 'model3d' : 'image');
// the model a 3D source uses: the page's first stored 3D model made from one of the owner's own uploads
// threeD: creative.threeD; assets: the page's pictures -> the model record, or null
function modelFor(threeD, assets) {
  const list = threeD && Array.isArray(threeD.assets) ? threeD.assets : [];
  const byId = new Map((Array.isArray(assets) ? assets : []).filter(a => a && a.id).map(a => [a.id, a]));
  return list.find(m => m && typeof m.id === 'string' && (m.assetRef || m.dataUrl) && byId.has(m.sourceAssetId) && byId.get(m.sourceAssetId).origin === 'upload' && !byId.get(m.sourceAssetId).removed) || null;
}
// what a rendered still must be (the server checks the file itself: its own header, not what the studio says)
// measured: { mime, width, height, bytes } -> '' (fine) or why not
function renderProblem(measured) {
  const m = measured || {};
  if (m.mime !== RENDER.mime) return 'the 3D render is not a PNG';
  if (m.width !== RENDER.width || m.height !== RENDER.height) return `the 3D render is not ${RENDER.width}x${RENDER.height}`;
  if (!(m.bytes > 0) || m.bytes > RENDER.maxBytes) return 'the 3D render is empty or too large';
  return '';
}

module.exports = { SOURCES, RENDER, PROMPT_3D, MESSAGES, clean, modelFor, renderProblem };
