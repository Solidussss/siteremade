// TRUE 3D — the browser engine (source). Built by scripts/build-three-d-runtime.js into vendor/three-d/sr3d.min.js: ONE
// file, three.js and its glTF loader included, that a page with a 3D scene fetches from its own folder when a stage comes
// near the screen (the page's inline loader decides that: lib/creative/three-d.js). A page without a 3D scene never
// references it. No site gets its own renderer: every 3D scene on every site is this program, given validated numbers.
//
//   SiteRemade3D.mount(el, cfg, cb) -> { setProgress(p), setVisible(on), destroy() } | null
//     cfg: { model (a url of the page's own file), composition, interaction, camera, turns, lighting, tier ('full' |
//            'lite'), dpr, maxBytes, maxTriangles, anchor }           -- the validated scene (three-d.js forPage)
//     cb:  { ready(info), error(why), frame(pose) }
//
// What it does: mounts a canvas in the stage, loads one GLB, centres and frames it whatever its own units are, lights it,
// and draws the pose three-d-pose.js computes from scroll progress, pointer and clicks -- only while something changes
// (no frame is drawn for a resting or off-screen stage). What it never does: run anything from the model (a GLB is data),
// fetch anything but the model file it was given (a model that points at another address gets nothing), or keep going
// after an error -- it reports, and the page's own picture stays.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Box3, Vector3, HemisphereLight, DirectionalLight, AmbientLight,
  PMREMGenerator, LoadingManager, SRGBColorSpace, NeutralToneMapping, REVISION,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import POSE from '../creative/three-d-pose.js';

const VERSION = 1;
const RAD = Math.PI / 180;
// the light of each preset: the room's reflections (env), a sky/ground fill, a key and a rim
const LIGHTS = {
  studio: { env: 0.7, hemi: 0.2, key: 1.5, rim: 0.7, ambient: 0 },
  soft: { env: 0.9, hemi: 0.45, key: 0.6, rim: 0.2, ambient: 0.1 },
  dramatic: { env: 0.22, hemi: 0.06, key: 2.4, rim: 1.6, ambient: 0 },
  neutral: { env: 0.8, hemi: 0.15, key: 0, rim: 0, ambient: 0.25 },
};
// how quickly the drawn pose follows its target (per second): scroll is followed closely, a click turn eases
const FOLLOW = { 'scroll-rotate': 16, 'scroll-orbit': 16, 'pointer-tilt': 6, 'click-rotate': 5, none: 8 };

// one fetch per model file, however many stages show it
const files = new Map();
function file(url, maxBytes) {
  if (!files.has(url)) {
    files.set(url, fetch(url).then(r => { if (!r.ok) throw new Error('model ' + r.status); return r.arrayBuffer(); }).then(buf => {
      if (maxBytes && buf.byteLength > maxBytes) throw new Error('model too large');
      return buf;
    }).catch(e => { files.delete(url); throw e; }));
  }
  return files.get(url);
}
function triangles(root) {
  let n = 0;
  root.traverse(o => { if (o.isMesh && o.geometry) { const g = o.geometry; n += Math.floor((g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0) / 3); } });
  return n;
}
function dispose(root) {
  root.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    [].concat(o.material || []).forEach(m => { Object.keys(m).forEach(k => { if (m[k] && m[k].isTexture) m[k].dispose(); }); m.dispose(); });
  });
}

function mount(el, cfg, cb) {
  const c = cfg || {}; const on = cb || {}; const say = (k, v) => { try { if (on[k]) on[k](v); } catch (e) { /* the page's own handler */ } };
  const lite = c.tier === 'lite';
  const canvas = document.createElement('canvas'); canvas.className = 'td-canvas'; canvas.setAttribute('aria-hidden', 'true');
  let renderer = null;
  try { renderer = new WebGLRenderer({ canvas, alpha: true, antialias: !lite, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: true }); }
  catch (e) { say('error', 'no WebGL'); return null; }
  renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = SRGBColorSpace; renderer.toneMapping = NeutralToneMapping; // (the product's own colours, not a film look)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, c.dpr || 2));
  el.appendChild(canvas);

  const scene = new Scene(); const camera = new PerspectiveCamera(32, 1, 0.05, 100);
  const pivot = new Group(); const holder = new Group(); pivot.add(holder); scene.add(pivot);
  const L = LIGHTS[c.lighting] || LIGHTS.studio;
  const pmrem = new PMREMGenerator(renderer); const room = new RoomEnvironment(); const env = pmrem.fromScene(room, 0.04).texture; dispose(room);
  scene.environment = env; scene.environmentIntensity = L.env;
  if (L.hemi) scene.add(new HemisphereLight(0xffffff, 0x8a8f99, L.hemi));
  if (L.key) { const k = new DirectionalLight(0xffffff, L.key); k.position.set(3, 4, 5); scene.add(k); }
  if (L.rim) { const r = new DirectionalLight(0xffffff, L.rim); r.position.set(-4, 2.5, -3.5); scene.add(r); }
  if (L.ambient) scene.add(new AmbientLight(0xffffff, L.ambient));

  const input = { p: 0, anchor: c.anchor || 0, px: 0, py: 0, clicks: 0, t: 0 };
  const spec = { composition: c.composition, interaction: c.interaction, camera: c.camera, turns: c.turns };
  const floats = !!(POSE.COMPOSITIONS[c.composition] && POSE.COMPOSITIONS[c.composition].float);
  const follow = FOLLOW[c.interaction] || FOLLOW.none;
  // the model's size as the camera needs it: its bounding sphere (r), and -- for a model that only turns about its own
  // upright axis -- its half height (hy) and the widest it ever is across that turn (rxz)
  const tilts = c.interaction === 'pointer-tilt';
  let cur = null; let radius = 1; let hy = 1; let rxz = 1; let model = null; let alive = true; let visible = true; let raf = 0; let last = 0; let ready = false; let w = 0; let h = 0;

  function size() {
    const nw = el.clientWidth, nh = el.clientHeight; if (!nw || !nh || (nw === w && nh === h)) return;
    w = nw; h = nh; renderer.setSize(w, h, false); camera.aspect = w / h; wake();
  }
  // the camera frames the model's bounding sphere at any turn, in a wide or a tall stage
  function place(v) {
    camera.fov = v.fov; const fv = v.fov * RAD; const fh = 2 * Math.atan(Math.tan(fv / 2) * camera.aspect);
    const az = v.azimuth * RAD, elv = v.elevation * RAD;
    // (a turntable fills its stage better than its sphere would: its nearest edge, top and side, just inside the frame)
    const fit = tilts ? radius / Math.sin(Math.min(fv, fh) / 2) : Math.max((hy * Math.cos(elv) + rxz * Math.abs(Math.sin(elv))) / Math.tan(fv / 2), rxz / Math.tan(fh / 2)) + rxz;
    const d = fit * 1.05 * v.distance;
    camera.position.set(d * Math.cos(elv) * Math.sin(az), d * Math.sin(elv), d * Math.cos(elv) * Math.cos(az)); camera.lookAt(0, 0, 0);
    camera.near = Math.max(0.01, d - radius * 2.2); camera.far = d + radius * 2.2; camera.updateProjectionMatrix();
    pivot.rotation.set(v.rotX, v.rotY, 0); pivot.position.y = v.lift * radius * 2; pivot.scale.setScalar(v.scale);
    el.style.setProperty('--td-o', String(Math.round(v.opacity * 1000) / 1000));
  }
  function tick(now) {
    raf = 0; if (!alive || !visible || !model) return;
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0.016); last = now; input.t += dt;
    const target = POSE.pose(spec, input); let moving = floats;
    if (!cur) cur = target;
    else {
      const k = 1 - Math.exp(-dt * follow);
      Object.keys(target).forEach(key => { const dlt = target[key] - cur[key]; if (Math.abs(dlt) > 1e-4) { cur[key] += dlt * k; moving = true; } else cur[key] = target[key]; });
    }
    place(cur); renderer.render(scene, camera);
    say('frame', { rotY: cur.rotY, rotX: cur.rotX, azimuth: cur.azimuth, distance: cur.distance, scale: cur.scale });
    if (!ready) { ready = true; say('ready', { triangles: triangles(model), three: REVISION, tier: lite ? 'lite' : 'full' }); }
    if (moving) wake();
  }
  function wake() { if (alive && visible && model && !raf) raf = requestAnimationFrame(tick); }

  const ro = window.ResizeObserver ? new ResizeObserver(size) : null; if (ro) ro.observe(el);
  const onPointer = e => {
    if (e.pointerType === 'touch') return; // (a finger scrolls the page; it never steers the model)
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
    input.px = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2)); input.py = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2)); wake();
  };
  const onClick = () => { input.clicks += 1; wake(); };
  const onLost = e => { e.preventDefault(); fail('context lost'); };
  if (c.interaction === 'pointer-tilt') window.addEventListener('pointermove', onPointer, { passive: true });
  if (c.interaction === 'click-rotate') canvas.addEventListener('click', onClick);
  canvas.addEventListener('webglcontextlost', onLost);

  function destroy() {
    if (!alive) return; alive = false;
    if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect();
    window.removeEventListener('pointermove', onPointer); canvas.removeEventListener('click', onClick); canvas.removeEventListener('webglcontextlost', onLost);
    try { dispose(scene); env.dispose(); pmrem.dispose(); renderer.dispose(); renderer.forceContextLoss(); } catch (e) { /* already gone */ }
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    el.style.removeProperty('--td-o');
  }
  function fail(why) { if (!alive) return; destroy(); say('error', why); }

  // a model is data: nothing in it runs, and it may read nothing but its own bytes (an address inside it gets nothing)
  const manager = new LoadingManager(); manager.setURLModifier(url => (/^(blob:|data:)/i.test(String(url)) ? url : 'data:,'));
  file(c.model, c.maxBytes).then(buf => {
    if (!alive) return;
    new GLTFLoader(manager).parse(buf, '', gltf => {
      if (!alive) return;
      const root = gltf.scene || (gltf.scenes && gltf.scenes[0]); if (!root) { fail('empty model'); return; }
      const n = triangles(root); if (!n) { dispose(root); fail('empty model'); return; }
      if (c.maxTriangles && n > c.maxTriangles) { dispose(root); fail('model too heavy'); return; }
      // centred and brought to one size here too, whatever the file's own units: the camera frames its bounding sphere
      const box = new Box3().setFromObject(root); const dim = box.getSize(new Vector3()); const mid = box.getCenter(new Vector3());
      const k = 2 / Math.max(dim.x, dim.y, dim.z, 1e-6);
      root.position.sub(mid).multiplyScalar(k); root.scale.multiplyScalar(k); holder.add(root);
      radius = Math.max(0.2, dim.length() * k * 0.5); hy = Math.max(0.1, dim.y * k * 0.5); rxz = Math.max(0.1, Math.hypot(dim.x, dim.z) * k * 0.5); model = root; size(); if (!w) { w = 1; h = 1; } wake();
    }, e => fail((e && e.message) || 'model unreadable'));
  }).catch(e => fail((e && e.message) || 'model failed'));

  return {
    setProgress(p) { if (typeof p === 'number' && isFinite(p) && p !== input.p) { input.p = p; wake(); } },
    setVisible(v) { visible = !!v; if (visible) { last = 0; wake(); } },
    destroy,
  };
}

export { mount, VERSION as version, REVISION as three };
