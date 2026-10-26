// The heavy photo work -- shrinking a big photo, finding its subject (lib/photo-analyse.js, ~3 s of WebAssembly) --
// on one background thread, so the server keeps answering everyone else while it runs. One job at a time, in order.
'use strict';

const path = require('path');
const { Worker, isMainThread, parentPort } = require('worker_threads');

if (!isMainThread && parentPort) {
  // the worker: one job at a time from the main thread
  const { analyse } = require('./photo-analyse');
  const { shrink } = require('./photo-shrink');
  parentPort.on('message', async ({ id, task, data }) => {
    try {
      const buf = Buffer.from(data);
      const result = task === 'analyse' ? await analyse(buf) : task === 'shrink' ? shrink(buf) : null;
      parentPort.postMessage({ id, result });
    } catch (e) { parentPort.postMessage({ id, error: String(e && e.message || e) }); }
  });
} else {
  let worker = null, seq = 0;
  const waiting = new Map();
  function start() {
    worker = new Worker(path.join(__dirname, 'photo-work.js'));
    worker.unref(); // (an idle worker never keeps the process alive)
    worker.on('message', ({ id, result, error }) => { const w = waiting.get(id); if (!w) return; waiting.delete(id); if (waiting.size === 0) worker.unref(); error ? w.reject(new Error(error)) : w.resolve(result && result.type === 'Buffer' ? Buffer.from(result.data) : result instanceof Uint8Array ? Buffer.from(result) : result); });
    worker.on('error', (e) => { for (const w of waiting.values()) w.reject(e); waiting.clear(); worker = null; });
    worker.on('exit', () => { worker = null; });
  }
  function run(task, buf) {
    if (!worker) start();
    worker.ref();
    return new Promise((resolve, reject) => { const id = ++seq; waiting.set(id, { resolve, reject }); worker.postMessage({ id, task, data: Buffer.from(buf) }); });
  }
  module.exports = {
    analyse: (buf) => run('analyse', typeof buf === 'string' ? Buffer.from(buf.replace(/^data:image\/jpeg;base64,/, ''), 'base64') : buf),
    shrink: (buf) => run('shrink', buf),
  };
}
