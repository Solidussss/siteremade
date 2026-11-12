'use strict';
// BESPOKE (v5) -- a hero video made from the business's OWN photo (Wan or Seedance image-to-video: the AI studio, or
// lib/video-hero.js make() on the server), prepared the way the 36 designs play theirs: hero.mp4, a poster (the
// first frame), the last frame for still mode, and 90 to 240 still frames the page flips through as you scroll
// (smoother than seeking a video, above all on iPhones).
//   prepare(videoFile, outDir) -> { video: 'hero.mp4', poster, last, frames: { pattern, count, w, h, seconds } | null }
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const videoHero = require('../video-hero');

function duration(ff, file) {
  try { execFileSync(ff, ['-i', file], { stdio: ['ignore', 'ignore', 'pipe'] }); } catch (e) {
    const m = String(e.stderr || '').match(/Duration: (\d+):(\d+):([\d.]+)/);
    if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
  return 5;
}

async function prepare(videoFile, outDir) {
  const dir = path.join(outDir, 'media'); fs.mkdirSync(dir, { recursive: true });
  const ff = videoHero.ffmpegPath(), video = path.join(dir, 'hero.mp4');
  // one 1280px take built for scrubbing: a keyframe every third of a second, no sound (as video-hero assemble())
  execFileSync(ff, ['-v', 'error', '-y', '-i', videoFile, '-an', '-vf', 'scale=1280:-2:flags=lanczos,fps=24,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '27', '-g', '8', '-keyint_min', '8', '-sc_threshold', '0', '-movflags', '+faststart', video]);
  execFileSync(ff, ['-v', 'error', '-y', '-i', video, '-frames:v', '1', '-q:v', '3', path.join(dir, 'hero-poster.jpg')]);
  execFileSync(ff, ['-v', 'error', '-y', '-sseof', '-0.25', '-i', video, '-update', '1', '-q:v', '3', path.join(dir, 'hero-last.jpg')]);
  const seconds = duration(ff, video);
  const tmp = path.join(dir, '.frames'), hero = path.join(dir, 'hero');
  let info = null;
  try { info = await videoHero.frames(video, tmp, seconds); fs.rmSync(hero, { recursive: true, force: true }); fs.renameSync(path.join(tmp, 'f'), hero); } catch (e) { info = null; }
  fs.rmSync(tmp, { recursive: true, force: true });
  return { video: 'hero.mp4', poster: 'hero-poster.jpg', last: 'hero-last.jpg',
    frames: info ? { pattern: 'media/hero/{n}.jpg', count: info.count, w: info.w, h: info.h, seconds: Math.round(seconds * 10) / 10 } : null };
}

module.exports = { prepare };
