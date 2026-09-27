'use strict';
// The scripts index.html actually loads, in page order, and the syntax
// checks the regression test runs on each.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');

function browserScripts() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  return [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)]
    .map(m => m[1])
    .filter(src => !/^(?:https?:)?\/\//.test(src)) // local files only
    .map(src => ({ src, file: path.join(ROOT, src.replace(/^\//, '')) }));
}

// Regex lookbehind -- (?<= or (?<! -- is a PARSE error in Safari/iOS before
// 16.4: a single one anywhere in a script stops the whole file from loading.
// Node's V8 accepts it, so compiling here can't catch it; this scan does.
// Deliberately strict: it also flags the syntax inside comments/strings, so
// keep it out of this code entirely.
function findLookbehinds(source) {
  const hits = [];
  source.split('\n').forEach((line, i) => { if (/\(\?<[=!]/.test(line)) hits.push({ line: i + 1, text: line.trim().slice(0, 120) }); });
  return hits;
}

// Throws a SyntaxError if V8 can't parse it.
function compile(source, filename) { return new vm.Script(source, { filename }); }

module.exports = { browserScripts, findLookbehinds, compile };
