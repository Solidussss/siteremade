'use strict';
// BESPOKE (v5) -- a conversation with Claude that can include images (the business's photos, the page's screenshots).
// Same shape as lib/design-sites.js anthropicWriter: start(), say(), usage; tests pass a scripted stand-in.
//   const c = claude(key); c.start(system); const text = await c.say([text('...'), image(path)]);
const fs = require('fs');
const path = require('path');

const text = (t) => ({ type: 'text', text: String(t) });
function image(file) {
  const ext = path.extname(file).toLowerCase();
  const media = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return { type: 'image', source: { type: 'base64', media_type: media, data: fs.readFileSync(file).toString('base64') } };
}

function claude(key, { model = 'claude-sonnet-5-5', maxTokens = 32000 } = {}) {
  let system = []; const messages = [];
  const usage = { calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  return {
    name: model, usage,
    start(s) { system = [{ type: 'text', text: s, cache_control: { type: 'ephemeral' } }]; messages.length = 0; },
    async say(content) {
      if (!key) throw new Error('The AI is not configured on this server (ANTHROPIC_API_KEY).');
      messages.push({ role: 'user', content: Array.isArray(content) ? content : [text(content)] });
      let r, tries = 0;
      for (;;) {
        r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }) });
        if ((r.status === 429 || r.status === 529 || r.status >= 500) && tries++ < 3) { await new Promise((ok) => setTimeout(ok, 5000 * tries)); continue; }
        break;
      }
      if (!r.ok) throw new Error(`AI error ${r.status}: ${(await r.text()).slice(0, 300)}`);
      const j = await r.json();
      usage.calls++; usage.input += j.usage.input_tokens || 0; usage.output += j.usage.output_tokens || 0;
      usage.cacheWrite += j.usage.cache_creation_input_tokens || 0; usage.cacheRead += j.usage.cache_read_input_tokens || 0;
      if (j.stop_reason === 'max_tokens') throw new Error('the AI answer was cut off');
      const out = j.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      // images are only needed once: later turns keep the words, not the pixels (keeps every turn cheap)
      for (const m of messages) if (m.role === 'user' && Array.isArray(m.content)) m.content = m.content.map((b) => (b.type === 'image' ? text('[image shown earlier]') : b));
      messages.push({ role: 'assistant', content: out });
      return out;
    },
  };
}
// USD at $3 / $15 per million input / output tokens; cache writes 1.25x, cache reads 0.1x (as lib/design-sites.js)
const cost = (u) => (u.input * 3 + u.cacheWrite * 3.75 + u.cacheRead * 0.3 + u.output * 15) / 1e6;

module.exports = { claude, text, image, cost };
