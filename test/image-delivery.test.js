'use strict';
// lib/image-delivery.js against the REAL generation_events table and the
// REAL content-addressed asset store (SQLite :memory:), with only the paid
// provider call faked. Covers what happens when storing the paid image
// works, and when it doesn't.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createImageDelivery } = require('../lib/image-delivery');
const { createGenerationEvents } = require('../lib/generation-events');
const projectStore = require('../lib/project-store');

const PROMPT = 'Glow Theory serum bottle on travertine, soft window light, Vancouver apothecary mood, no text';
const IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function setup({ storeImage } = {}) {
  process.env.SITEREMADE_BACKEND = 'local';
  const { resetDatabaseAdapter } = require('../lib/adapters/database-adapter');
  const db = resetDatabaseAdapter(':memory:');
  const events = createGenerationEvents(db);
  const paid = [];
  const delivery = createImageDelivery({
    generate: async args => { paid.push(args); return { ok: true, dataUrl: IMAGE, model: 'gpt-image-1-mini', quality: 'medium', provider: 'openai', creditsCharged: 1, estimatedCostUsd: 0.015 }; },
    events,
    storeImage: storeImage || (dataUrl => projectStore.storeImageDataUrl(db, dataUrl)),
    loadImage: hash => projectStore.loadImageDataUrl(db, hash),
  });
  const imageRows = () => events.listRecent({ kind: 'image', limit: 100 });
  return { db, events, delivery, paid, imageRows };
}
const args = requestKey => ({ accountId: 'acct_1', projectId: 'proj_1', requestKey, prompt: PROMPT, model: 'gpt-image-1-mini', quality: 'medium', aspectRatio: '16:9', taskType: 'IMAGE_ADD' });

test('successful store: recorded as replayable "delivered" with its asset hash, and a repeat is replayed free', async () => {
  const { delivery, paid, imageRows } = setup();
  const first = await delivery.deliver(args('proj_1::hero::k1'));
  assert.equal(first.ok, true);
  assert.equal(first.dataUrl, IMAGE);
  assert.equal(first.stored, true);
  const [row] = imageRows();
  assert.equal(row.outcome, 'delivered');
  assert.ok(row.asset_hash, 'the stored asset hash is recorded');
  assert.equal(row.detail.stored, true);
  assert.equal(row.detail.replayable, true);
  assert.equal(row.detail.storeError, null);

  const again = await delivery.deliver(args('proj_1::hero::k1'));
  assert.equal(again.replayed, true);
  assert.equal(again.creditsCharged, 0);
  assert.equal(again.dataUrl, IMAGE);
  assert.equal(paid.length, 1, 'no second paid call');
});

test('failed store (write throws): the paying request still gets its image, recorded as non-replayable "delivered_not_stored"', async () => {
  const { delivery, paid, imageRows } = setup({ storeImage: () => { const e = new Error('disk full'); e.code = 'ENOSPC'; throw e; } });
  const first = await delivery.deliver(args('proj_1::hero::k2'));
  assert.equal(first.ok, true, 'the paid image is not lost to the visitor');
  assert.equal(first.dataUrl, IMAGE);
  assert.equal(first.creditsCharged, 1);
  assert.equal(first.stored, false);
  const rows = imageRows();
  assert.deepEqual(rows.map(r => r.outcome), ['delivered_not_stored']);
  assert.equal(rows[0].asset_hash, null);
  assert.equal(rows[0].credits_charged, 1, 'the charge is still recorded');
  assert.equal(rows[0].detail.replayable, false);
  assert.equal(rows[0].detail.storeError, 'ENOSPC');
  assert.ok(!rows.some(r => r.outcome === 'delivered'), 'never claims a replayable delivery');

  // Nothing to replay: an honest second paid call, never a fake replay.
  const again = await delivery.deliver(args('proj_1::hero::k2'));
  assert.equal(again.ok, true);
  assert.notEqual(again.replayed, true);
  assert.equal(paid.length, 2);
});

test('failed store (no hash returned): same explicit non-replayable outcome', async () => {
  const { delivery, imageRows } = setup({ storeImage: () => null });
  const result = await delivery.deliver(args('proj_1::hero::k3'));
  assert.equal(result.ok, true);
  assert.equal(result.stored, false);
  const [row] = imageRows();
  assert.equal(row.outcome, 'delivered_not_stored');
  assert.equal(row.detail.storeError, 'no_asset_hash');
});

test('failed store: a retry that joined the in-flight call still receives the image', async () => {
  let release;
  const gate = new Promise(r => { release = r; });
  process.env.SITEREMADE_BACKEND = 'local';
  const { resetDatabaseAdapter } = require('../lib/adapters/database-adapter');
  const db = resetDatabaseAdapter(':memory:');
  const events = createGenerationEvents(db);
  let calls = 0;
  const delivery = createImageDelivery({
    generate: async () => { calls++; await gate; return { ok: true, dataUrl: IMAGE, model: 'gpt-image-1-mini', quality: 'medium', creditsCharged: 1 }; },
    events, storeImage: () => { throw new Error('read-only volume'); }, loadImage: () => null,
  });
  const a = delivery.deliver(args('proj_1::hero::k4'));
  const b = delivery.deliver(args('proj_1::hero::k4'));
  release();
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(calls, 1);
  assert.equal(ra.dataUrl, IMAGE);
  assert.equal(rb.dataUrl, IMAGE);
  assert.equal(rb.joined, true);
  assert.equal(rb.creditsCharged, 0);
  const outcomes = events.listRecent({ kind: 'image' }).map(r => r.outcome).sort();
  assert.deepEqual(outcomes, ['delivered_not_stored', 'joined']);
  assert.equal(events.listRecent({ kind: 'image' }).find(r => r.outcome === 'delivered_not_stored').detail.storeError, 'store_threw');
});

test('generation events never store prompt text -- only its length', async () => {
  const check = rows => rows.forEach(r => {
    assert.ok(!JSON.stringify(r).includes('travertine'), `prompt text leaked into a ${r.outcome} row`);
    assert.equal(r.detail.prompt, undefined);
    assert.equal(r.detail.promptChars, PROMPT.length);
  });
  // (one database at a time -- the local adapter is a per-process singleton)
  const failing = setup({ storeImage: () => null });
  await failing.delivery.deliver(args('proj_1::hero::k5'));
  check(failing.imageRows());
  const ok = setup();
  await ok.delivery.deliver(args('proj_1::hero::k6'));
  // ...and a provider-failure row, in the same table as the successful one.
  const failed = createImageDelivery({ generate: async () => ({ ok: false, reason: 'provider_error' }), events: ok.events, storeImage: () => null, loadImage: () => null });
  await failed.deliver(args('proj_1::hero::k7'));
  const rows = ok.imageRows();
  assert.deepEqual(rows.map(r => r.outcome).sort(), ['delivered', 'provider_error']);
  check(rows);
});
