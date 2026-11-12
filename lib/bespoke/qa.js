'use strict';
// BESPOKE (v5) -- looking at the page the way a person will: headless Chrome screenshots in still mode at desktop
// (1440x900 and full page) and phone (390x844 and full page), plus a horizontal overflow probe at 390px.
//   shoot(dir, { chrome }) -> { desktop, desktopFull, mobile, mobileFull, overflow: { desktop, mobile } }
// dir holds index.html (and media/). Needs Google Chrome or Chromium: CHROME_PATH, or the usual install paths.
// Headless Chrome can't make a window narrower than about 500px, so phones are framed in a 390px iframe.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const CANDIDATES = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
const findChrome = () => CANDIDATES.find((p) => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }) || null;

function chromeRun(chrome, args, profile) {
  return execFileSync(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
    '--force-device-scale-factor=1', '--virtual-time-budget=6000', `--user-data-dir=${profile}`, ...args], { encoding: 'utf8', timeout: 60000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
}

// a copy of the page that reports its horizontal overflow into the parent's title (or its own when not framed)
function probeHtml(html) {
  const probe = '<script>addEventListener("load",function(){setTimeout(function(){var d=document.documentElement,o=d.scrollWidth-d.clientWidth;var t=(parent!==window?parent.document:document);t.title="OVERFLOW:"+o+":"+d.scrollHeight},300)})</script>';
  return html.replace(/<\/body>/i, probe + '</body>');
}
const frame = (src, h) => `<!doctype html><html><head><title>frame</title></head><body style="margin:0;background:#000"><iframe src="${src}" style="border:0;width:390px;height:${h}px;display:block"></iframe></body></html>`;

function ffmpegPath() { try { return require('ffmpeg-static'); } catch (e) { return 'ffmpeg'; } }
// the phone frame is 600px wide; keep the 390px page
function cropTo(file, w) {
  const tmp = file.replace(/\.png$/, '.tmp.png');
  execFileSync(ffmpegPath(), ['-v', 'error', '-y', '-i', file, '-vf', `crop=${w}:ih:0:0`, tmp]); fs.renameSync(tmp, file);
}
function cropHeight(file, h) {
  const tmp = file.replace(/\.png$/, '.tmp.png');
  execFileSync(ffmpegPath(), ['-v', 'error', '-y', '-i', file, '-vf', `crop=iw:min(ih\\,${Math.max(1, h)}):0:0`, tmp]); fs.renameSync(tmp, file);
}
// smaller JPEG copies for the visual review (the AI reads images up to about 1500px on the long side)
function reviewImages(out) {
  const make = (src, vf) => { const dst = src.replace(/\.png$/, '.review.jpg'); execFileSync(ffmpegPath(), ['-v', 'error', '-y', '-i', src, '-vf', vf, '-q:v', '5', dst]); return dst; };
  return {
    desktop: make(out.desktop, 'scale=1200:-2'),
    mobile: make(out.mobile, 'scale=390:-2'),
    desktopFull: make(out.desktopFull, 'scale=480:-2,crop=iw:min(ih\\,3800):0:0'),
    mobileFull: make(out.mobileFull, 'scale=300:-2,crop=iw:min(ih\\,3800):0:0'),
  };
}

function shoot(dir, { chrome = findChrome() } = {}) {
  if (!chrome) throw new Error('No Chrome found for screenshots (set CHROME_PATH).');
  const shots = path.join(dir, 'shots'); fs.mkdirSync(shots, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bespoke-chrome-'));
  const page = 'file://' + path.resolve(dir, 'index.html') + '?still';
  const out = { desktop: path.join(shots, 'desktop.png'), desktopFull: path.join(shots, 'desktop-full.png'), mobile: path.join(shots, 'mobile.png'), mobileFull: path.join(shots, 'mobile-full.png'), overflow: {}, height: {} };
  try {
    chromeRun(chrome, ['--window-size=1440,900', `--screenshot=${out.desktop}`, page], profile);
    chromeRun(chrome, ['--window-size=1440,9000', `--screenshot=${out.desktopFull}`, page], profile);
    for (const [file, h] of [[out.mobile, 844], [out.mobileFull, 9000]]) {
      const f = path.join(dir, `.frame-${h}.html`); fs.writeFileSync(f, frame(page, h));
      chromeRun(chrome, [`--window-size=600,${h}`, `--screenshot=${file}`, 'file://' + f], profile); fs.unlinkSync(f);
      cropTo(file, 390);
    }
    const probe = path.join(dir, '.probe.html'); fs.writeFileSync(probe, probeHtml(fs.readFileSync(path.join(dir, 'index.html'), 'utf8')));
    const read = (dom) => { const m = String(dom).match(/<title>OVERFLOW:(-?\d+):(\d+)<\/title>/); return m ? { overflow: Number(m[1]), height: Number(m[2]) } : null; };
    const dk = read(chromeRun(chrome, ['--window-size=1440,900', '--dump-dom', 'file://' + probe + '?still'], profile));
    const pf = path.join(dir, '.frame-probe.html'); fs.writeFileSync(pf, frame('file://' + probe + '?still', 844));
    const mb = read(chromeRun(chrome, ['--window-size=600,844', '--dump-dom', 'file://' + pf], profile));
    fs.unlinkSync(probe); fs.unlinkSync(pf);
    out.overflow = { desktop: dk ? dk.overflow : null, mobile: mb ? mb.overflow : null };
    out.height = { desktop: dk ? dk.height : null, mobile: mb ? mb.height : null };
    // the full-page shots are taken in a tall window: cut them to the page's own height
    if (dk && dk.height < 9000) cropHeight(out.desktopFull, dk.height);
    if (mb && mb.height < 9000) cropHeight(out.mobileFull, mb.height);
  } finally { fs.rmSync(profile, { recursive: true, force: true }); }
  return out;
}

module.exports = { shoot, findChrome, probeHtml, reviewImages };
