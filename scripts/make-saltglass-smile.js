// One-time: makes the Saltglass hero photos (the same smile before and after whitening) with OpenAI.
// Run from the repo root: railway run -s siterename node scripts/make-saltglass-smile.js <out dir>
// (railway run supplies OPENAI_API_KEY from the service; it is never printed or saved.)
const fs = require('fs');
const path = require('path');

const out = process.argv[2] || '.';
const key = process.env.OPENAI_API_KEY;
if (!key) { console.error('OPENAI_API_KEY is not set (run it through: railway run -s siterename ...)'); process.exit(1); }

const SHOT = 'Professional cosmetic dental photograph, tight landscape crop of a broad natural smile: lips and both rows of teeth fill the frame, ' +
  'no nose or eyes. Soft clinical ring-light, true-to-life skin texture, sharp focus on the front teeth, shallow depth of field, ' +
  'dark teal-grey background at the edges. Photoreal, no text, no watermark.';

async function call(url, body, isForm) {
  const r = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${key}`, ...(isForm ? {} : { 'content-type': 'application/json' }) }, body: isForm ? body : JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j.error || j).slice(0, 300)}`);
  return Buffer.from(j.data[0].b64_json, 'base64');
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const after = await call('https://api.openai.com/v1/images/generations', {
    model: 'gpt-image-1', size: '1536x1024', quality: 'high',
    prompt: `${SHOT} The teeth are healthy, even and bright natural white (shade BL2) - clean, not fake or glowing.`,
  });
  fs.writeFileSync(path.join(out, 'after.png'), after);
  console.log('after.png done');

  const form = new FormData();
  form.append('model', 'gpt-image-1');
  form.append('size', '1536x1024');
  form.append('quality', 'high');
  form.append('input_fidelity', 'high');
  form.append('image', new Blob([after], { type: 'image/png' }), 'after.png');
  form.append('prompt', 'Change ONLY the colour of the teeth: make them a natural stained yellow-beige, dental shade A3.5, ' +
    'as before whitening (coffee and tea staining, a little darker near the gums). Keep the same person, lips, skin, framing, light and background exactly.');
  const before = await call('https://api.openai.com/v1/images/edits', form, true);
  fs.writeFileSync(path.join(out, 'before.png'), before);
  console.log('before.png done');
})().catch((e) => { console.error(e.message); process.exit(1); });
