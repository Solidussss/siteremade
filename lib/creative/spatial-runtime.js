'use strict';
// CREATIVE — the spatial runtime: the small, fixed WebGL program a spatial page carries (inlined in its index.html, no
// CDN, no library). It draws only the bounded vocabulary spatial.js validates -- picture planes, billboards, one glTF
// (GLB) model, a particle field, a point globe with arcs, and a camera -- from the page's #cr-spatial data, BEHIND the
// page's DOM words, which stay sharp, selectable and editable. It is an enhancement over the complete DOM page: it
// hides a DOM picture only after it has drawn its replacement, and it removes itself -- the DOM page is then exactly as
// it would have been -- when WebGL is missing or only software-emulated, the context is lost, anything throws, the
// device is too slow for its budget, or motion is reduced.
//
// Why not three.js: the page needs ~6 primitives; three.js (+ its GLB loader) would add ~800 KB to every spatial page.
// This runtime is ~25 KB and does exactly what the validator allows, nothing more.
//
// It reads the scroll geometry the DOM runtime caches on each scene (_top, _h) and measures its own anchors (the scenes'
// stages) only on load and resize: no layout reads per frame.

/* eslint-disable */
function spatialRuntime() {
  var d = document, html = d.documentElement, W = window, S = null;
  try { S = JSON.parse(d.getElementById('cr-spatial').textContent); } catch (e) { return; }
  if (!S || typeof S !== 'object' || !S.Q || !S.cam) return;
  var ST = W.__crSpatial = { state: 'idle', why: '', tier: '', drawCalls: 0, objects: 0, particles: 0, textures: 0, texBytes: 0, modelBytes: 0, modelTris: 0, frameMs: 0, frames: 0, owned: 0 };
  var gl = null, cv = null, alive = false, raf = 0, P = {}, B = {}, TEX = {}, texCount = 0, Q = null, tier = '', phone = false, dpr = 1;
  var all = [].slice.call(d.querySelectorAll('.sc')), MAXY = 0, gMax = 0, camRest = 0, vw = 0, vh = 0, D = 1, fovY = 35 * Math.PI / 180, lastT = 0, ema = 16, slow = 0, t0 = Date.now();
  var owned = [], surf = [], model = null, animated = false;
  function cl(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lum(c) { return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  function seen(c) { return Math.abs(lum(c) - lum(fogC)) >= 0.28 ? c : (Math.abs(lum(S.pal.ink) - lum(fogC)) >= Math.abs(lum(S.pal.glow) - lum(fogC)) ? S.pal.ink : S.pal.glow); }
  function sm(t) { t = cl(t); return t * t * (3 - 2 * t); }
  function reduced() { return html.getAttribute('data-motion') === 'reduced'; }
  function hex(h) { h = String(h || '').replace('#', ''); if (h.length !== 6) return [0, 0, 0]; return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255]; }

  // ------------------------------------------------------------ matrices (column-major, 4x4)
  function M() { var m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; }
  function mul(a, b) { var o = new Float32Array(16); for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) { var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
  function tr(x, y, z) { var m = M(); m[12] = x; m[13] = y; m[14] = z; return m; }
  function sc3(x, y, z) { var m = M(); m[0] = x; m[5] = y; m[10] = z; return m; }
  function rx(a) { var m = M(), c = Math.cos(a), s = Math.sin(a); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; }
  function ry(a) { var m = M(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; }
  function rz(a) { var m = M(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; }
  function persp(f, asp, n, fr) { var m = new Float32Array(16), t = 1 / Math.tan(f / 2); m[0] = t / asp; m[5] = t; m[10] = (fr + n) / (n - fr); m[11] = -1; m[14] = 2 * fr * n / (n - fr); return m; }
  function chain() { var m = arguments[0]; for (var i = 1; i < arguments.length; i++) m = mul(m, arguments[i]); return m; }
  function viewZ(V, m) { return V[2] * m[12] + V[6] * m[13] + V[10] * m[14] + V[14]; }

  // ------------------------------------------------------------ shaders
  var QUAD_VS = 'attribute vec2 aP;uniform mat4 uM,uV,uP;uniform vec4 uUV;varying vec2 vUV,vQ;varying float vZ;void main(){vec4 v=uV*uM*vec4(aP,0.,1.);vZ=-v.z;vQ=aP;vUV=uUV.xy+(aP*vec2(1.,-1.)+.5)*uUV.zw;gl_Position=uP*v;}';
  var QUAD_FS = 'precision mediump float;uniform sampler2D uT,uT2;uniform float uA,uFog,uMix,uDis,uMode,uRad,uBias;uniform vec3 uC,uFogC;uniform vec2 uFogR,uSize;varying vec2 vUV,vQ;varying float vZ;' +
    'float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}' +
    'void main(){vec4 c;if(uMode<.5){c=texture2D(uT,vUV);if(uMix>0.){vec4 c2=texture2D(uT2,vUV);float n=h(floor(vQ*48.));c=mix(c,c2,smoothstep(n-.15,n+.15,uMix*1.3-.15));}}' +
    'else if(uMode<1.5){c=vec4(uC,1.)*texture2D(uT,vUV,uBias).a*.55;}' +
    'else if(uMode<2.5){float r=length(vQ);c=vec4(uC,1.)*(1.-smoothstep(.485,.5,r));}else{c=vec4(uC,1.);}' +
    'if(uRad>0.){vec2 q=abs(vQ)*uSize-(uSize*.5-uRad);float dd=length(max(q,0.))-uRad;c*=1.-smoothstep(-1.,.5,dd);}' +
    'if(uDis>0.){float n=h(floor(gl_FragCoord.xy*.5)+7.);c*=smoothstep(uDis-.3,uDis+.02,n*.7+.3*(1.-uDis));}' +
    'float f=clamp((vZ-uFogR.x)/(uFogR.y-uFogR.x),0.,1.)*uFog;c.rgb=mix(c.rgb,uFogC*c.a,f);gl_FragColor=c*uA;}';
  // points: globe (0), ambient (1), dust (2), stars (3), points (4), data (5), burst (6)
  var PT_VS = 'attribute vec4 aR;uniform mat4 uM,uV,uP;uniform float uS,uT,uY,uQ,uSz,uDpr,uW,uH,uD,uA,uFog;uniform vec3 uO;varying float vA;' +
    'void main(){vec3 p;float a=1.,s=uSz;' +
    'if(uS<.5){vec4 w=uM*vec4(aR.xyz,1.);vec3 nn=normalize(mat3(uM)*aR.xyz);a=mix(.16,1.,smoothstep(-.35,.6,nn.z));s=uSz*mix(.7,1.2,smoothstep(-.3,.8,nn.z));p=w.xyz;}' +
    'else if(uS<3.5){float par=uS>2.5?.08:.18+.55*(1.-aR.z);p=vec3((aR.x-.5)*2.4*uW,mod((aR.y-.5)*2.6*uH+uY*par+1.3*uH,2.6*uH)-1.3*uH,uS>2.5?-(1.4+aR.z*1.8)*uD:-aR.z*1.9*uD+.2*uD);' +
    'if(uS<2.5){p.x+=sin(uT*(uS<1.5?.15:.07)+aR.w*6.28)*(uS<1.5?22.:10.);p.y+=cos(uT*(uS<1.5?.12:.05)+aR.w*9.)*14.;}' +
    'a=uS<1.5?.35+.4*aR.w:uS<2.5?.45:.35+.65*abs(sin(uT*(.6+aR.w)+aR.x*20.));s=uS<1.5?uSz*(1.+2.*aR.w):uS<2.5?uSz*(.6+aR.w):uSz*(.4+.7*aR.w);}' +
    'else if(uS<4.5){p=vec3((aR.x-.5)*2.8*uW,0.,-aR.y*2.6*uD+.25*uD);p.y=-.3*uH+sin(p.x*.004+uT*.5+aR.y*8.)*26.+sin(p.z*.003+uY*.0015)*34.;a=.55;s=uSz*(.7+.6*aR.w);}' +
    'else if(uS<5.5){vec2 g=floor(aR.xy*vec2(44.,30.))/vec2(44.,30.);p=vec3((g.x-.5)*2.6*uW,-.34*uH,-g.y*2.8*uD+.35*uD);float k=fract(g.y*3.-uY*.0005-uT*.04);a=.25+.75*smoothstep(.85,1.,k);s=uSz*(.8+1.2*smoothstep(.85,1.,k));}' +
    'else{vec3 dir=normalize(aR.xyz-.5+.001);float e=1.-pow(1.-uQ,3.);p=uO+dir*(.15+.85*aR.w)*.55*uH*e+vec3(0.,-e*e*.08*uH,0.);a=(1.-uQ)*smoothstep(0.,.06,uQ);s=uSz*(.6+aR.w);}' +
    'vec4 v=uV*vec4(p,1.);float z=-v.z;a*=1.-clamp((z-uD*.9)/(uD*2.6),0.,1.)*uFog;vA=a*uA*step(1.,z);gl_Position=uP*v;gl_PointSize=clamp(s*uDpr*uD/max(z,1.),1.,48.);}';
  var PT_FS = 'precision mediump float;uniform vec3 uC;varying float vA;void main(){float r=length(gl_PointCoord-.5);float a=smoothstep(.5,.12,r)*vA;gl_FragColor=vec4(uC*a,a);}';
  var LN_VS = 'attribute vec4 aL;uniform mat4 uM,uV,uP;uniform float uQ;varying float vA;void main(){vec4 w=uM*vec4(aL.xyz,1.);vec3 nn=normalize(mat3(uM)*aL.xyz);float t=fract(aL.w),k=floor(aL.w);vA=step(t,clamp(uQ*1.6-k*.08,0.,1.))*mix(.12,.9,smoothstep(-.3,.6,nn.z));gl_Position=uP*uV*w;}';
  var LN_FS = 'precision mediump float;uniform vec3 uC;uniform float uA;varying float vA;void main(){float a=vA*uA;gl_FragColor=vec4(uC*a,a);}';
  var MS_VS = 'attribute vec3 aP,aN;attribute vec2 aU;uniform mat4 uM,uV,uP;varying vec3 vN;varying vec2 vU;varying float vZ;void main(){vec4 v=uV*uM*vec4(aP,1.);vZ=-v.z;vN=normalize(mat3(uM)*aN);vU=aU;gl_Position=uP*v;}';
  var MS_FS = 'precision mediump float;uniform sampler2D uT;uniform vec4 uCol;uniform float uHasT,uA,uFog;uniform vec3 uFogC;uniform vec2 uFogR;varying vec3 vN;varying vec2 vU;varying float vZ;' +
    'void main(){vec4 b=uCol;if(uHasT>.5)b*=texture2D(uT,vU);vec3 n=normalize(vN);float l=.42+.5*max(dot(n,normalize(vec3(.45,.6,.7))),0.)+.25*pow(1.-max(n.z,0.),2.);vec3 c=b.rgb*l;' +
    'float f=clamp((vZ-uFogR.x)/(uFogR.y-uFogR.x),0.,1.)*uFog;c=mix(c,uFogC,f);gl_FragColor=vec4(c*b.a*uA,b.a*uA);}';

  function prog(vs, fs, attrs) {
    var p = gl.createProgram();
    [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]].forEach(function (x) { var s = gl.createShader(x[0]); gl.shaderSource(s, x[1]); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s)); gl.attachShader(p, s); });
    gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link');
    var o = { p: p, u: {}, a: {} }; var nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < nu; i++) { var u = gl.getActiveUniform(p, i); o.u[u.name] = gl.getUniformLocation(p, u.name); }
    attrs.forEach(function (a) { o.a[a] = gl.getAttribLocation(p, a); });
    return o;
  }
  function use(o) { if (use.cur !== o) { gl.useProgram(o.p); use.cur = o; } }

  // ------------------------------------------------------------ textures (power-of-two, mipmapped, premultiplied)
  function pot(n, max) { var p = Math.pow(2, Math.round(Math.log(Math.max(1, n)) / Math.LN2)); return Math.max(64, Math.min(max || Q.texSize, p)); }
  function tex(url, cb, max) {
    if (!url) { cb(null); return; }
    if (TEX[url]) { if (TEX[url].t) cb(TEX[url]); else TEX[url].wait.push(cb); return; }
    if (texCount >= Q.textures) { cb(null); return; }
    texCount++; var rec = TEX[url] = { t: null, wait: [cb] }; var im = new Image();
    im.onload = function () {
      var r = null;
      try {
        if (!alive) return;
        var w = pot(im.naturalWidth, max), h = pot(im.naturalHeight, max), c = d.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(im, 0, 0, w, h);
        var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        rec.t = t; rec.aa = im.naturalWidth / im.naturalHeight; rec.px = Math.max(im.naturalWidth, im.naturalHeight); ST.textures++; ST.texBytes += Math.round(w * h * 4 * 1.33); r = rec;
      } catch (e) { r = null; } // (a picture the browser will not hand to WebGL -- e.g. opened from disk -- stays a DOM picture)
      var q = rec.wait; rec.wait = []; q.forEach(function (f) { f(r); }); kick();
    };
    im.onerror = function () { var q = rec.wait; rec.wait = []; q.forEach(function (f) { f(null); }); };
    im.src = url;
  }

  // ------------------------------------------------------------ one GLB model (a subset of glTF 2.0: meshes of triangles,
  // float positions, optional normals and texture coordinates, base colour and base colour texture; no skins, animation,
  // morph targets or compression -- a model that needs them is not drawn, and the actor's own picture takes its place)
  function loadModel(A) {
    if (!A.model || !Q.models || !W.fetch || !W.TextDecoder) return;
    W.fetch(A.model).then(function (r) { if (!r.ok) throw new Error('model ' + r.status); return r.arrayBuffer(); }).then(function (buf) {
      if (!alive) return; if (buf.byteLength > S.caps.modelBytes) throw new Error('model too large');
      var m = parseGLB(buf); if (!m) throw new Error('model unreadable');
      ST.modelBytes = buf.byteLength; ST.modelTris = m.tris; A.mesh = m; A.form = 'model'; own(A.el); kick();
    }).catch(function (e) { ST.why = ST.why || ('model: ' + (e && e.message || 'failed')); kick(); });
  }
  function parseGLB(buf) {
    var dv = new DataView(buf); if (dv.getUint32(0, true) !== 0x46546C67) return null;
    var len = dv.getUint32(8, true), off = 12, J = null, bin = null;
    while (off + 8 <= len) { var cl0 = dv.getUint32(off, true), ct = dv.getUint32(off + 4, true); if (ct === 0x4E4F534A) J = JSON.parse(new W.TextDecoder().decode(new Uint8Array(buf, off + 8, cl0))); else if (ct === 0x004E4942) bin = new Uint8Array(buf, off + 8, cl0); off += 8 + cl0; }
    if (!J || !bin || (J.extensionsRequired && J.extensionsRequired.length)) return null;
    function acc(i, comps) {
      var a = J.accessors[i], bv = J.bufferViews[a.bufferView], n = a.count, size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type]; if (!bv || size !== comps && comps) return null;
      var bytes = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[a.componentType]; if (!bytes || a.sparse) return null;
      var start = (bv.byteOffset || 0) + (a.byteOffset || 0), stride = bv.byteStride || size * bytes, out = a.componentType === 5126 ? new Float32Array(n * size) : new Uint32Array(n * size);
      var v = new DataView(bin.buffer, bin.byteOffset);
      for (var k = 0; k < n; k++) for (var c = 0; c < size; c++) { var o = start + k * stride + c * bytes; out[k * size + c] = bytes === 4 ? (a.componentType === 5126 ? v.getFloat32(o, true) : v.getUint32(o, true)) : bytes === 2 ? v.getUint16(o, true) : v.getUint8(o); }
      return out;
    }
    function local(nd) {
      if (nd.matrix) return new Float32Array(nd.matrix);
      var t = nd.translation || [0, 0, 0], q = nd.rotation || [0, 0, 0, 1], s = nd.scale || [1, 1, 1], x = q[0], y = q[1], z = q[2], w = q[3];
      var m = new Float32Array([1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0, 2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0, 2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0, t[0], t[1], t[2], 1]);
      return mul(m, sc3(s[0], s[1], s[2]));
    }
    var prims = [], tris = 0, lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    function visit(ni, parent) {
      var nd = J.nodes[ni]; if (!nd) return; var wm = mul(parent, local(nd));
      if (nd.mesh != null && J.meshes[nd.mesh]) J.meshes[nd.mesh].primitives.forEach(function (pr) {
        if (prims.length >= 8 || (pr.mode != null && pr.mode !== 4) || pr.attributes.POSITION == null || (pr.targets && pr.targets.length && false)) return;
        var pos = acc(pr.attributes.POSITION, 3); if (!pos) return; var nor = pr.attributes.NORMAL != null ? acc(pr.attributes.NORMAL, 3) : null, uv = pr.attributes.TEXCOORD_0 != null ? acc(pr.attributes.TEXCOORD_0, 2) : null;
        var idx = pr.indices != null ? acc(pr.indices, 1) : null; var n = pos.length / 3; if (!idx) { idx = new Uint32Array(n); for (var k = 0; k < n; k++) idx[k] = k; }
        tris += idx.length / 3; if (tris > Q.tris) throw new Error('model has too many triangles');
        var P3 = new Float32Array(pos.length), N3 = new Float32Array(pos.length);
        for (var k2 = 0; k2 < n; k2++) { var X = pos[k2 * 3], Y = pos[k2 * 3 + 1], Z = pos[k2 * 3 + 2];
          var px = wm[0] * X + wm[4] * Y + wm[8] * Z + wm[12], py = wm[1] * X + wm[5] * Y + wm[9] * Z + wm[13], pz = wm[2] * X + wm[6] * Y + wm[10] * Z + wm[14];
          P3[k2 * 3] = px; P3[k2 * 3 + 1] = py; P3[k2 * 3 + 2] = pz; lo[0] = Math.min(lo[0], px); lo[1] = Math.min(lo[1], py); lo[2] = Math.min(lo[2], pz); hi[0] = Math.max(hi[0], px); hi[1] = Math.max(hi[1], py); hi[2] = Math.max(hi[2], pz);
          if (nor) { var a = nor[k2 * 3], b = nor[k2 * 3 + 1], c = nor[k2 * 3 + 2], nx = wm[0] * a + wm[4] * b + wm[8] * c, ny = wm[1] * a + wm[5] * b + wm[9] * c, nz = wm[2] * a + wm[6] * b + wm[10] * c, l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; N3[k2 * 3] = nx / l; N3[k2 * 3 + 1] = ny / l; N3[k2 * 3 + 2] = nz / l; } }
        if (!nor) for (var f = 0; f < idx.length; f += 3) { var i0 = idx[f] * 3, i1 = idx[f + 1] * 3, i2 = idx[f + 2] * 3, ux = P3[i1] - P3[i0], uy = P3[i1 + 1] - P3[i0 + 1], uz = P3[i1 + 2] - P3[i0 + 2], vx = P3[i2] - P3[i0], vy = P3[i2 + 1] - P3[i0 + 1], vz = P3[i2 + 2] - P3[i0 + 2], cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;[i0, i1, i2].forEach(function (j) { N3[j] += cx; N3[j + 1] += cy; N3[j + 2] += cz; }); }
        var mat = pr.material != null && J.materials && J.materials[pr.material] || {}, pbr = mat.pbrMetallicRoughness || {};
        prims.push({ P: P3, N: N3, U: uv, I: idx, col: pbr.baseColorFactor || [0.8, 0.8, 0.8, 1], texI: pbr.baseColorTexture ? pbr.baseColorTexture.index : null });
      });
      (nd.children || []).forEach(function (c) { visit(c, wm); });
    }
    var scn = J.scenes && J.scenes[J.scene || 0]; (scn ? scn.nodes : J.nodes.map(function (_, i) { return i; })).forEach(function (ni) { visit(ni, M()); });
    if (!prims.length) return null;
    var cx0 = (lo[0] + hi[0]) / 2, cy0 = (lo[1] + hi[1]) / 2, cz0 = (lo[2] + hi[2]) / 2, H = Math.max(1e-6, hi[1] - lo[1]);
    var uint = gl.getExtension('OES_element_index_uint');
    prims.forEach(function (pr) {
      for (var k = 0; k < pr.P.length; k += 3) { pr.P[k] = (pr.P[k] - cx0) / H; pr.P[k + 1] = (pr.P[k + 1] - cy0) / H; pr.P[k + 2] = (pr.P[k + 2] - cz0) / H; }
      var big = pr.P.length / 3 > 65535; if (big && !uint) throw new Error('model needs 32-bit indices');
      pr.bp = buf3(pr.P); pr.bn = buf3(pr.N); pr.bu = pr.U ? buf3(pr.U) : null; pr.bi = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, pr.bi); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, big ? new Uint32Array(pr.I) : new Uint16Array(pr.I), gl.STATIC_DRAW); pr.it = big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT; pr.n = pr.I.length;
      if (pr.texI != null && J.textures && J.textures[pr.texI] && J.images) { var imgI = J.images[J.textures[pr.texI].source]; if (imgI && imgI.bufferView != null) { var bv = J.bufferViews[imgI.bufferView]; var blob = new Blob([new Uint8Array(bin.buffer, bin.byteOffset + (bv.byteOffset || 0), bv.byteLength)], { type: imgI.mimeType || 'image/png' }); var u = URL.createObjectURL(blob); tex(u, function (t) { pr.tex = t; }); } }
      pr.P = pr.N = pr.U = pr.I = null;
    });
    return { prims: prims, tris: tris, depth: (hi[2] - lo[2]) / H, width: (hi[0] - lo[0]) / H };
  }
  function buf3(a) { var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW); return b; }

  // ------------------------------------------------------------ geometry of the page (measured on load and resize only)
  function measure() {
    vw = W.innerWidth; vh = W.innerHeight; D = (vh / 2) / Math.tan(fovY / 2); MAXY = Math.max(0, d.scrollingElement.scrollHeight - vh); gMax = G(MAXY);
    all.forEach(function (s) { var pin = s.querySelector('.sc-pin'), st = s.querySelector('.sc-stage'); if (!pin) return; var pr = pin.getBoundingClientRect(), sr = st ? st.getBoundingClientRect() : pr, tx = s.querySelector('.sc-text'), tr0 = tx ? tx.getBoundingClientRect() : null; s._sp = { dx: sr.left - pr.left, dy: sr.top - pr.top, w: sr.width, h: sr.height, ph: pr.height, pin: s.hasAttribute('data-pin'), ty: tr0 ? tr0.top - pr.top : 0, th: tr0 ? tr0.height : 0 }; });
    if (cv) { var w = Math.round(vw * dpr), h = Math.round(vh * dpr); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } }
  }
  function G(y) { var n = all.length, k = 0; if (!n || all[0]._top == null) return -1; for (var i = 0; i < n; i++) { if (all[i]._top <= y + 1) k = i; else break; } var s = all[k]; return k + cl((y - s._top) / Math.max(1, s._h)); }
  function progOf(s, y) { var top = s._top - y; if (s.hasAttribute('data-pin')) { var span = s._h - vh; return span > 0 ? cl(-top / span) : 0; } return cl((vh - top) / (vh + s._h)); }
  // the centre of a scene's stage on screen now (a held scene keeps it in place while it holds)
  function anchor(i, y) { var s = all[i]; if (!s || s._top == null || !s._sp) return null; var t0 = s._top - y, t = s._sp.pin ? (t0 > 0 ? t0 : Math.min(0, t0 + s._h - s._sp.ph)) : t0; return { x: s._sp.dx + s._sp.w / 2 - vw / 2, y: vh / 2 - (t + s._sp.dy + s._sp.h / 2), w: s._sp.w, h: s._sp.h }; }
  function wordsIn(y, b0, b1) { var m = 0; for (var i = 0; i < all.length; i++) { var s = all[i]; if (!s._sp || !s._sp.th || s._top == null) continue; var t0 = s._top - y, t = s._sp.pin ? (t0 > 0 ? t0 : Math.min(0, t0 + s._h - s._sp.ph)) : t0, a0 = t + s._sp.ty, a1 = a0 + s._sp.th; if (a1 < b0 - 40 || a0 > b1 + 40) continue; var ov = (Math.min(a1, b1) - Math.max(a0, b0)) / Math.max(1, b1 - b0); m = Math.max(m, cl(ov * 3 + 0.2)); } return m; }
  function sample(K, g, dim) { var n = K.length, i = 0; if (g <= K[0][0]) return K[0]; if (g >= K[n - 1][0]) return K[n - 1]; while (i < n - 2 && K[i + 1][0] < g) i++; var a = K[i], b = K[i + 1], t = sm((g - a[0]) / Math.max(1e-6, b[0] - a[0])), o = [g]; for (var j = 1; j < dim; j++) o.push(a[j] + (b[j] - a[j]) * t); return o; }

  // ------------------------------------------------------------ the objects
  var actors = [], pieces = [], seams = [], parts = null;
  function build() {
    (S.actors || []).forEach(function (a) {
      if (phone && a.role === 'secondary') return;
      // (a model actor is drawn as its picture -- a plane that turns -- until its model has loaded, and for good if it
      // does not: the picture is always the fallback)
      var el = d.querySelector('.cr-front .ca[data-role="' + a.role + '"]'); var A = { a: a, el: el, form: a.form === 'model' ? 'plane' : a.form, tex: null, mesh: null, model: a.form === 'model' ? a.model : '' };
      tex(a.url, function (t) { if (!t) return; A.tex = t; own(el); }, Math.min(Q.texSize, phone ? 512 : 1024));
      if (A.model) loadModel(A);
      actors.push(A);
    });
    (S.pieces || []).forEach(function (p) {
      var sc = all[p.scene]; if (!sc) return; var P2 = { p: p, sc: sc, scs: (p.scenes || [p.scene]).map(function (i) { return all[i]; }).filter(Boolean), planes: [], ready: 0, need: (p.planes || []).length };
      if (p.kind === 'globe') { P2.need = 0; P2.side = sc.querySelector('.sc-text[data-align="right"]') ? -1 : sc.querySelector('.sc-text[data-align="center"]') ? 0 : 1; buildGlobe(P2); markLive(P2); pieces.push(P2); return; }
      var cap = phone ? (p.kind === 'cards' ? 5 : p.kind === 'lineup' ? 5 : 3) : 99;
      (p.planes || []).slice(0, cap).forEach(function (pl, j) { var o = { url: pl.url, aa: pl.aa, tex: null, j: j }; P2.planes.push(o); tex(pl.url, function (t) { if (t) { o.tex = t; P2.ready++; if (P2.ready === P2.planes.length) markLive(P2); } }, p.kind === 'flight' ? Q.texSize : Math.min(Q.texSize, phone ? 512 : 1024)); });
      pieces.push(P2);
    });
    (S.seams || []).forEach(function (s) {
      var el = d.querySelector('.cs[data-at="' + s.at + '"]'); var o = { s: s, el: el, tex: null };
      if (s.url) tex(s.url, function (t) { o.tex = t; }); if (el && (s.fam === 'object-pass' || s.fam === 'disc-approach')) own(el);
      seams.push(o);
    });
    var pt = S.particles; if (pt && pt.style !== 'none') buildParticles(pt);
    surf = all.map(function (s) { return hex(s.getAttribute('data-surf') || ''); });
    camRest = S.cam[S.cam.length - 1][0]; for (var ci = S.cam.length - 1; ci >= 0; ci--) { var K = S.cam[ci]; if (K[1] || K[2] || K[3] || K[4] || K[5]) break; camRest = K[0]; }
    animated = !!(parts && ['ambient', 'dust', 'stars', 'points', 'data'].indexOf(pt.style) >= 0) || pieces.some(function (p) { return p.p.kind === 'globe'; });
  }
  function own(el) { if (el && owned.indexOf(el) < 0) { el.classList.add('sp-own'); owned.push(el); ST.owned = owned.length; } }
  function markLive(P2) { P2.scs.forEach(function (s) { s.setAttribute('data-sp-live', ''); }); ST.owned++; kick(); }
  function lcg(seed) { var s = seed % 2147483647 || 7; return function () { s = s * 16807 % 2147483647; return (s - 1) / 2147483646; }; }
  function buildParticles(pt) {
    var n = Math.min(pt.count, Q.particles), r = lcg(4099), a = new Float32Array(n * 4); for (var i = 0; i < n * 4; i++) a[i] = r();
    parts = { n: n, style: { ambient: 1, dust: 2, stars: 3, points: 4, data: 5, burst: 6 }[pt.style] || 1, b: buf3(a), c: pt.fill, scene: pt.scene, size: { ambient: 4, dust: 2.4, stars: 2, points: 2.6, data: 2.6, burst: 5 }[pt.style] || 3 };
    ST.particles = n; html.classList.add('sp-pt');
  }
  function buildGlobe(P2) {
    var p = P2.p, n = Math.min(p.points, Q.globe), a = new Float32Array(n * 4), ga = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < n; i++) { var y = 1 - (i / (n - 1)) * 2, rr = Math.sqrt(1 - y * y), th = ga * i; a[i * 4] = Math.cos(th) * rr; a[i * 4 + 1] = y; a[i * 4 + 2] = Math.sin(th) * rr; a[i * 4 + 3] = 0; }
    P2.gb = buf3(a); P2.gn = n;
    var arcs = Math.min(p.arcs, Q.arcs), r = lcg(911 + p.scene), L = [], SEG = 36;
    for (var k = 0; k < arcs; k++) {
      var A = [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1], Bv = [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1];
      var nA = Math.hypot(A[0], A[1], A[2]) || 1, nB = Math.hypot(Bv[0], Bv[1], Bv[2]) || 1; A = A.map(function (v) { return v / nA; }); Bv = Bv.map(function (v) { return v / nB; });
      var ang = Math.acos(Math.max(-1, Math.min(1, A[0] * Bv[0] + A[1] * Bv[1] + A[2] * Bv[2]))), sn = Math.sin(ang) || 1;
      for (var j = 0; j < SEG; j++) for (var e = 0; e < 2; e++) { var t = (j + e) / SEG, wA = Math.sin((1 - t) * ang) / sn, wB = Math.sin(t * ang) / sn, lift = 1 + 0.22 * ang / Math.PI * Math.sin(Math.PI * t) * 1.6;
        L.push((A[0] * wA + Bv[0] * wB) * lift, (A[1] * wA + Bv[1] * wB) * lift, (A[2] * wA + Bv[2] * wB) * lift, k + Math.min(0.999, t)); }
    }
    P2.lb = L.length ? buf3(new Float32Array(L)) : null; P2.ln = L.length / 4;
    var dom = P2.sc.querySelector('.sp-globe-dom'); if (dom) own(dom);
  }

  // ------------------------------------------------------------ drawing
  var V = M(), PR = M(), fogC = [0, 0, 0], fogR = [1, 2], draws = 0, objects = 0, camYaw = 0, camPitch = 0;
  function quad(m, o) {
    use(P.q); var u = P.q.u; gl.uniformMatrix4fv(u.uM, false, m); gl.uniform4fv(u.uUV, o.uv || [0, 0, 1, 1]); gl.uniform1f(u.uA, o.a); gl.uniform1f(u.uMode, o.mode || 0);
    gl.uniform1f(u.uMix, o.mix || 0); gl.uniform1f(u.uDis, o.dis || 0); gl.uniform1f(u.uRad, o.rad || 0); gl.uniform2f(u.uSize, o.w || 1, o.h || 1); gl.uniform3fv(u.uC, o.c || [0, 0, 0]); gl.uniform1f(u.uBias, o.bias || 0);
    if (o.tex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, o.tex.t); } if (o.tex2) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, o.tex2.t); }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); draws++;
  }
  // (a picture fills its plane as CSS object-fit: cover does -- cropped, never stretched)
  function cover(ia, pa) { return ia > pa ? [(1 - pa / ia) / 2, 0, pa / ia, 1] : [0, (1 - ia / pa) / 2, 1, ia / pa]; }
  function frame() {
    if (!alive) return; var t1 = W.performance ? W.performance.now() : Date.now();
    var y = W.scrollY || W.pageYOffset, g = G(y); if (g < 0) return; var time = (Date.now() - t0) / 1000;
    if (Math.abs(W.innerWidth - vw) > 1 || Math.abs(W.innerHeight - vh) > 1) measure();
    // the camera (on a phone: no orbit, no sideways travel, half the depth)
    // (a last scene too short to reach the top of the screen: the camera's remaining keys play over the last stretch
    // of scroll there is, so it still comes to rest)
    if (gMax <= 0) gMax = G(MAXY); var gc = g; if (gMax > 0 && gMax < camRest && g > gMax - 0.6) gc = gMax - 0.6 + cl((g - gMax + 0.6) / 0.6) * (camRest - gMax + 0.6);
    var c = sample(S.cam, gc, 6), dz = c[1], dx = c[2], dy = c[3], yaw = c[4] * Math.PI / 180, pitch = c[5] * Math.PI / 180;
    if (phone) { dz *= 0.5; dy *= 0.5; dx = 0; yaw = 0; pitch = 0; }
    ST.g = Math.round(g * 1000) / 1000; ST.cam = [dz, dx, dy, yaw, pitch].map(function (v) { return Math.round(v * 1000) / 1000; }); ST.actorsPx = [];
    V = chain(tr(0, 0, -D * (1 - dz)), rx(-pitch), ry(-yaw), tr(-dx * vw, dy * vh, 0)); camYaw = yaw; camPitch = pitch;
    PR = persp(fovY, vw / vh, D * 0.04, D * 7);
    // the fog is the colour the page is passing through (the backdrop's own blend, from scene to scene)
    var n = all.length, k = Math.max(0, Math.min(n - 1, Math.floor(g))), bt = sm((g - k - 0.6) / 0.4), s0 = surf[k] || [0, 0, 0], s1 = surf[k + 1] || s0;
    fogC = [s0[0] + (s1[0] - s0[0]) * bt, s0[1] + (s1[1] - s0[1]) * bt, s0[2] + (s1[2] - s0[2]) * bt]; fogR = [D * 1.05, D * 3.4];
    backdrop(g);
    gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    draws = 0; objects = 0; var list = [];
    // particles first (far field), then everything else back to front
    if (parts) drawParticles(g, y, time);
    pieces.forEach(function (P2) { collectPiece(P2, g, y, time, list); });
    actors.forEach(function (A) { collectActor(A, g, y, list); });
    seams.forEach(function (o) { collectSeam(o, y, list); });
    list.sort(function (a, b) { return b.z - a.z; });
    use(P.q); gl.uniformMatrix4fv(P.q.u.uV, false, V); gl.uniformMatrix4fv(P.q.u.uP, false, PR); gl.uniform1f(P.q.u.uFog, S.fog); gl.uniform3fv(P.q.u.uFogC, fogC); gl.uniform2fv(P.q.u.uFogR, fogR); gl.uniform1i(P.q.u.uT, 0); gl.uniform1i(P.q.u.uT2, 1);
    bindQuad();
    list.forEach(function (it) { if (draws >= Q.drawCalls) return; objects++; it.f(); });
    ST.drawCalls = draws; ST.objects = objects; ST.frames++;
    var t2 = W.performance ? W.performance.now() : Date.now(); ST.frameMs = Math.round((t2 - t1) * 100) / 100;
  }
  function bindQuad() { use(P.q); gl.bindBuffer(gl.ARRAY_BUFFER, B.quad); gl.enableVertexAttribArray(P.q.a.aP); gl.vertexAttribPointer(P.q.a.aP, 2, gl.FLOAT, false, 0, 0); }
  var cbA = d.querySelector('.cb-a'), cbB = d.querySelector('.cb-b'), BA = '', BB = '', BT = -1;
  function backdrop(g) { if (!cbA || !cbB) return; var n = all.length, k = Math.max(0, Math.min(n - 1, Math.floor(g))), t = Math.round(sm((g - k - 0.6) / 0.4) * 100) / 100, a = all[k].getAttribute('data-surf') || '', b = (all[k + 1] && all[k + 1].getAttribute('data-surf')) || a; if (a !== BA) { BA = a; cbA.style.backgroundColor = a; } if (b !== BB) { BB = b; cbB.style.backgroundColor = b; } if (t !== BT) { BT = t; cbB.style.opacity = String(t); } }
  function presence(i, g, before, after) { return sm((g - i + before) / 0.45) * (1 - sm((g - i - after) / 0.45)); }
  function collectActor(A, g, y, list) {
    var a = A.a; if (!A.tex && !A.mesh) return; if (g < a.from - 0.7 || g > a.to + 1.3) return;
    var v = sample(a.K, g, 8), o = cl(v[5]);
    // (on a phone the actor shares the top of the screen with the next scene's words: once its run ends it clears quickly)
    if (phone) o *= 1 - sm((g - a.to - 0.25) / 0.3);
    // (on a phone the actor stands in the top band: while a scene's words pass through that band it steps back, so the
    // words are never read over the picture)
    if (phone) o *= 1 - 0.78 * wordsIn(y, S.nav + vh * 0.01, S.nav + vh * 0.37);
    if (o <= 0.01) return;
    var h, w, cx, cy, rot = v[4];
    if (phone) { var hb = vh * 0.36; h = hb; w = h * a.aa; if (w > vw * 0.72) { w = vw * 0.72; h = w / a.aa; } cx = v[1] * 0.35 * vw / 100; cy = vh / 2 - (S.nav + vh * 0.01 + v[2] * 0.3 * vh / 100 + hb / 2); rot = Math.max(-8, Math.min(8, rot)); }
    else { var big = a.role === 'secondary'; h = vh * (big ? 0.44 : 0.54); w = h * a.aa; var mw = vw * (big ? 0.28 : 0.34); if (w > mw) { w = mw; h = w / a.aa; } cx = v[1] * vw / 100; cy = -v[2] * vh / 100; }
    var s = v[3], z = v[6] * D, turn = (phone ? Math.max(-20, Math.min(20, v[7])) : v[7]) * Math.PI / 180, r = -rot * Math.PI / 180;
    var pos = tr(cx, cy, z), vz = viewZ(V, pos);
    // (where the actor lands on screen -- read by the review tools to check it against the DOM actor's place)
    var cp = mul(PR, mul(V, pos)); if (cp[15] > 0) ST.actorsPx.push({ role: a.role, x: Math.round((cp[12] / cp[15] * 0.5 + 0.5) * vw), y: Math.round((0.5 - cp[13] / cp[15] * 0.5) * vh), h: Math.round(h * s * (D / Math.max(1, -vz))), o: Math.round(o * 100) / 100, form: A.form });
    if (A.form === 'model' && A.mesh) { list.push({ z: vz, f: function () { drawMesh(A.mesh, chain(pos, rz(r), ry(turn), sc3(h * s, h * s, h * s)), o); bindQuad(); } }); return; }
    // (a billboard always faces the camera: it undoes the camera's own turn; a plane keeps its place in the world and turns)
    var m = A.form === 'billboard' ? chain(pos, ry(camYaw), rx(camPitch), rz(r), sc3(w * s, h * s, 1)) : chain(pos, ry(turn), rz(r), sc3(w * s, h * s, 1));
    // (the DOM actor's drop shadow: the picture's own silhouette, blurred by its smaller mipmaps, below and behind it)
    if (Q.shadow) { var sh = chain(tr(0, -h * s * 0.045, -2), m); list.push({ z: vz - 1, f: function () { quad(sh, { tex: A.tex, a: o * 0.5, mode: 1, bias: 3.5, c: [0, 0, 0] }); } }); }
    list.push({ z: vz, f: function () { quad(m, { tex: A.tex, a: o }); } });
  }
  function drawMesh(mesh, m, o) {
    use(P.m); var u = P.m.u; gl.enable(gl.DEPTH_TEST); gl.uniformMatrix4fv(u.uM, false, m); gl.uniformMatrix4fv(u.uV, false, V); gl.uniformMatrix4fv(u.uP, false, PR); gl.uniform1f(u.uA, o); gl.uniform1f(u.uFog, S.fog); gl.uniform3fv(u.uFogC, fogC); gl.uniform2fv(u.uFogR, fogR); gl.uniform1i(u.uT, 0);
    mesh.prims.forEach(function (pr) {
      gl.bindBuffer(gl.ARRAY_BUFFER, pr.bp); gl.enableVertexAttribArray(P.m.a.aP); gl.vertexAttribPointer(P.m.a.aP, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, pr.bn); gl.enableVertexAttribArray(P.m.a.aN); gl.vertexAttribPointer(P.m.a.aN, 3, gl.FLOAT, false, 0, 0);
      if (pr.bu && P.m.a.aU >= 0) { gl.bindBuffer(gl.ARRAY_BUFFER, pr.bu); gl.enableVertexAttribArray(P.m.a.aU); gl.vertexAttribPointer(P.m.a.aU, 2, gl.FLOAT, false, 0, 0); } else if (P.m.a.aU >= 0) { gl.disableVertexAttribArray(P.m.a.aU); gl.vertexAttrib2f(P.m.a.aU, 0, 0); }
      gl.uniform4fv(u.uCol, pr.col); gl.uniform1f(u.uHasT, pr.tex && pr.bu ? 1 : 0); if (pr.tex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, pr.tex.t); }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, pr.bi); gl.drawElements(gl.TRIANGLES, pr.n, pr.it, 0); draws++;
    });
    if (P.m.a.aN >= 0) gl.disableVertexAttribArray(P.m.a.aN); if (P.m.a.aU >= 0) gl.disableVertexAttribArray(P.m.a.aU);
    gl.disable(gl.DEPTH_TEST);
  }
  function collectPiece(P2, g, y, time, list) {
    var p = P2.p, kind = p.kind;
    if (kind === 'flight') {
      if (P2.ready < P2.planes.length || !P2.planes.length) return; var nP = P2.planes.length, u = g - p.scene, gap = D * 1.05;
      // (the steps of one held scene: its pictures advance with the hold; before it the first arrives from depth, after it
      // the last flies past)
      if (p.steps) { var s0 = P2.sc, held = s0._h - vh, past = (y - s0._top) - held; u = g < p.scene ? g - p.scene : past <= 0 ? progOf(s0, y) * (nP - 0.4) : nP - 0.4 + cl(past / vh) * 0.8 + Math.max(0, g - p.scene - 1) * 2; }
      if (u < -0.45 || u > nP + 0.3) return;
      var F = u < 0 ? -(1 - sm((u + 0.45) / 0.45)) : 0; if (u >= 0) for (var j = 0; j < nP; j++) F += sm((u - j - 0.55) / 0.6);
      P2.planes.forEach(function (o, i) {
        var z = (F - i) * gap; if (z < -2.2 * gap || z > 0.85 * D) return;
        var a = sm((z + 2.2 * gap) / gap) * (u < 0 ? sm((u + 0.45) / 0.3) : 1), dis = sm((z - 0.28 * D) / (0.5 * D)); if (a <= 0.01 || dis >= 0.99) return;
        var w = vw * 1.1, h = vh * 1.1, m = chain(tr((i % 2 ? 1 : -1) * vw * 0.015 * (1 - cl(1 + z / gap)), 0, z), sc3(w, h, 1)), uv = cover(o.tex.aa, w / h), vz = viewZ(V, m);
        list.push({ z: vz, f: function () { quad(m, { tex: o.tex, a: a, uv: uv, dis: dis }); } });
      });
      return;
    }
    var at = anchor(p.scene, y); if (!at) return; var pr = presence(p.scene, g, 0.7, 1.0); if (pr <= 0.01) return; var pg = progOf(P2.sc, y);
    if (kind === 'lineup') {
      if (P2.ready < P2.planes.length) return; var N = P2.planes.length, slot = Math.min(at.w / (N + 0.6), phone ? vw * 0.42 : 300), R = Math.max(phone ? vw * 0.75 : 340, at.w * 0.55), step = 2 * Math.asin(Math.min(0.95, slot * 0.62 / R)), th = (0.5 - pg) * (N - 1) * step * 1.1, rise = (1 - sm(pg / 0.2)) * 0.45 * D;
      P2.planes.forEach(function (o, i) {
        var an = (i - (N - 1) / 2) * step + th, f = Math.cos(an); if (f < 0.1) return;
        var ww0 = o.tex.aa >= 1 ? slot : slot * Math.max(0.6, o.tex.aa), hh = Math.min(ww0 / o.tex.aa, at.h * 0.6, vh * 0.48) * (1 + 0.14 * sm((f - 0.9) / 0.1)), ww = hh * o.tex.aa, m = chain(tr(at.x + R * Math.sin(an), at.y, R * (f - 1) - rise), ry(-an * 0.7), sc3(ww, hh, 1)), a = pr * sm((f - 0.1) / 0.35);
        list.push({ z: viewZ(V, m), f: function () { quad(m, { tex: o.tex, a: a }); } });
      });
      return;
    }
    if (kind === 'cards') {
      if (P2.ready < P2.planes.length) return; var r = lcg(173 + p.scene), N2 = P2.planes.length;
      P2.planes.forEach(function (o, i) {
        var x = (r() - 0.5) * (phone ? 0.5 : 0.8) * vw, yy = (r() - 0.5) * 0.6 * vh, z0 = -(0.3 + 2.1 * i / N2) * D, turn = (r() - 0.5) * 0.42, tilt = (r() - 0.5) * 0.14, k = 0.8 + 0.4 * r();
        var z = z0 + pg * 2.6 * D; if (z > 0.8 * D) return; var hh = vh * 0.32 * k, ww = hh * o.tex.aa;
        var a = pr * sm((z + 2.6 * D) / D), dis = sm((z - 0.3 * D) / (0.45 * D)); if (a <= 0.01 || dis >= 0.99) return;
        var m = chain(tr(x, yy, z), ry(turn), rz(tilt), sc3(ww, hh, 1));
        list.push({ z: viewZ(V, m), f: function () { quad(m, { tex: o.tex, a: a, dis: dis, rad: Math.min(ww, hh) * 0.04, w: ww, h: hh }); } });
      });
      return;
    }
    if (kind === 'globe') {
      // (beside the scene's words -- on the side they leave free -- and on a phone behind them, dimmer)
      var R2 = phone ? vw * 0.42 : Math.min(vw, vh) * (P2.side ? 0.3 : 0.36), gx = phone ? 0 : P2.side * vw * 0.2, gy = at.y + (phone ? vh * 0.12 : P2.side ? 0 : -vh * 0.14);
      var yawG = pg * 2.4 + (tier === 'low' ? 0 : time * 0.05), m2 = chain(tr(gx, gy, -0.1 * D), rx(0.38), ry(yawG), sc3(R2, R2, R2)), c = seen(S.pal[p.fill] || S.pal.accent), a2 = pr * (phone ? 0.6 : P2.side ? 1 : 0.6);
      list.push({ z: viewZ(V, m2), f: function () {
        use(P.pt); var u = P.pt.u; gl.uniformMatrix4fv(u.uM, false, m2); gl.uniformMatrix4fv(u.uV, false, V); gl.uniformMatrix4fv(u.uP, false, PR); gl.uniform1f(u.uS, 0); gl.uniform1f(u.uSz, phone ? 2.4 : 3.2); gl.uniform1f(u.uDpr, dpr); gl.uniform1f(u.uD, D); gl.uniform1f(u.uA, a2); gl.uniform1f(u.uFog, 0); gl.uniform3fv(u.uC, c);
        gl.bindBuffer(gl.ARRAY_BUFFER, P2.gb); gl.enableVertexAttribArray(P.pt.a.aR); gl.vertexAttribPointer(P.pt.a.aR, 4, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.POINTS, 0, P2.gn); draws++;
        if (P2.lb) { use(P.ln); var u2 = P.ln.u; gl.uniformMatrix4fv(u2.uM, false, m2); gl.uniformMatrix4fv(u2.uV, false, V); gl.uniformMatrix4fv(u2.uP, false, PR); gl.uniform1f(u2.uQ, pg); gl.uniform3fv(u2.uC, c); gl.uniform1f(u2.uA, a2 * 0.8);
          gl.bindBuffer(gl.ARRAY_BUFFER, P2.lb); gl.enableVertexAttribArray(P.ln.a.aL); gl.vertexAttribPointer(P.ln.a.aL, 4, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.LINES, 0, P2.ln); draws++; }
        bindQuad(); } });
    }
  }
  function collectSeam(o, y, list) {
    var s = o.s, sc = all[s.at]; if (!sc || sc._top == null) return;
    var end = Math.min(sc._top, MAXY ? Math.max(0, MAXY - vh * 0.3) : sc._top), span = Math.max(1, Math.min(s.span * vh, end)), w = cl((y - (end - span)) / span);
    if (w <= 0.001 || w >= 0.999) return; var e = sm(w);
    if (s.fam === 'object-pass') { var z = -1.4 * D + w * 2.3 * D; if (z > 0.9 * D) return; var m = chain(tr((0.45 - 0.9 * w) * vw * 0.5, 0, z), ry(0.12 * (1 - w)), sc3(vw * 1.25, vh * 1.25, 1));
      list.push({ z: viewZ(V, m), f: function () { quad(m, { mode: 3, c: s.c, a: sm(w / 0.08) * (1 - sm((w - 0.9) / 0.1)) }); } }); return; }
    if (s.fam === 'disc-approach') { var m2 = chain(tr(0, -0.08 * vh, -3 * D * (1 - e)), sc3(Math.max(vw, vh) * 1.55, Math.max(vw, vh) * 1.55, 1));
      list.push({ z: viewZ(V, m2), f: function () { quad(m2, { mode: 2, c: s.c, a: sm(w / 0.06) * (1 - sm((w - 0.9) / 0.1)) }); } }); return; }
    if ((s.fam === 'plane-approach' || s.fam === 'card-flight') && o.tex) { var card = s.fam === 'card-flight', ww = vw * 1.06, hh = vh * 1.06, m3 = chain(tr(card ? -0.28 * vw * (1 - e) : 0, 0, -2.4 * D * (1 - e)), ry(card ? 0.5 * (1 - e) : 0), sc3(ww, hh, 1)), uv = cover(o.tex.aa, ww / hh);
      list.push({ z: viewZ(V, m3), f: function () { quad(m3, { tex: o.tex, uv: uv, a: sm(w / 0.15) * (1 - sm((w - 0.86) / 0.13)), rad: card ? 18 * (1 - e) : 0, w: ww, h: hh }); } }); }
  }
  function drawParticles(g, y, time) {
    var q = 0, o = [0, 0, 0], a = 1;
    if (parts.style === 6) { var at = anchor(parts.scene, y), sc = all[parts.scene]; if (!at || !sc) return; q = cl((progOf(sc, y) - 0.12) / 0.5); if (q <= 0 || q >= 1) return; o = [at.x, at.y, 0]; }
    else a = sm(g / 0.3 + 0.35);
    use(P.pt); var u = P.pt.u; gl.uniformMatrix4fv(u.uM, false, M()); gl.uniformMatrix4fv(u.uV, false, V); gl.uniformMatrix4fv(u.uP, false, PR);
    gl.uniform1f(u.uS, parts.style); gl.uniform1f(u.uT, tier === 'low' ? 0 : time); gl.uniform1f(u.uY, y); gl.uniform1f(u.uQ, q); gl.uniform1f(u.uSz, parts.size * (phone ? 0.8 : 1)); gl.uniform1f(u.uDpr, dpr); gl.uniform1f(u.uW, vw); gl.uniform1f(u.uH, vh); gl.uniform1f(u.uD, D); gl.uniform1f(u.uA, a); gl.uniform1f(u.uFog, S.fog); gl.uniform3fv(u.uO, o); gl.uniform3fv(u.uC, S.pal[parts.c] || S.pal.glow);
    gl.bindBuffer(gl.ARRAY_BUFFER, parts.b); gl.enableVertexAttribArray(P.pt.a.aR); gl.vertexAttribPointer(P.pt.a.aR, 4, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.POINTS, 0, Math.min(parts.n, Q.particles)); draws++; bindQuad();
  }

  // ------------------------------------------------------------ the loop: on scroll, plus a gentle clock only while
  // something alive is on screen (particles drifting, a globe turning); frames are timed, and a device that cannot keep
  // up steps down a tier -- and, below the lowest, hands the page back to the DOM
  function kick() { if (!raf && alive) raf = requestAnimationFrame(run); }
  function run(ts) {
    raf = 0; if (!alive) return;
    try { frame(); } catch (e) { fail('runtime: ' + (e && e.message || e)); return; }
    if (lastT && animated && !d.hidden) { var dt = ts - lastT; ema = ema * 0.9 + dt * 0.1; if (ema > 42) { if (++slow > 45) degrade(); } else slow = Math.max(0, slow - 1); }
    lastT = animated && !d.hidden ? ts : 0;
    if (animated && tier !== 'low' && !d.hidden) kick();
  }
  function degrade() {
    slow = 0; ema = 16;
    if (tier === 'high') { tier = 'medium'; } else if (tier === 'medium') { tier = 'low'; } else { fail('too slow for this device'); return; }
    Q = S.Q[tier]; ST.tier = tier; dpr = Math.min(W.devicePixelRatio || 1, Q.dpr); measure();
  }
  function pickTier() {
    var nav = W.navigator || {}, mem = nav.deviceMemory || 8, cores = nav.hardwareConcurrency || 8;
    var t = phone ? 'low' : mem <= 4 || cores <= 4 ? 'medium' : 'high'; if (S.q === 'medium' && t === 'high') t = 'medium'; return t;
  }
  function fail(why) { ST.why = why; teardown(); ST.state = 'dom'; }
  function teardown() {
    alive = false; if (raf) cancelAnimationFrame(raf); raf = 0;
    html.classList.remove('sp-on'); html.classList.remove('sp-pt');
    owned.forEach(function (el) { el.classList.remove('sp-own'); }); owned = [];
    all.forEach(function (s) { s.removeAttribute('data-sp-live'); });
    try { var x = gl && gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } catch (e) { /* gone */ }
    if (cv && cv.parentNode) cv.parentNode.removeChild(cv);
    gl = null; cv = null; TEX = {}; texCount = 0; actors = []; pieces = []; seams = []; parts = null; ST.owned = 0;
  }
  function start() {
    if (alive || reduced() || ST.state === 'failed') return;
    phone = W.innerWidth <= 720; if (phone && S.phone === 'dom') { ST.state = 'dom'; ST.why = 'phones get the DOM page'; return; }
    tier = pickTier(); Q = S.Q[tier]; ST.tier = tier; dpr = Math.min(W.devicePixelRatio || 1, Q.dpr);
    try {
      cv = d.createElement('canvas'); cv.className = 'sp-canvas'; cv.setAttribute('aria-hidden', 'true');
      // (software-emulated WebGL would be slower than the DOM page it replaces: then the DOM page stays)
      var opts = { alpha: true, antialias: tier !== 'low', premultipliedAlpha: true, depth: true, stencil: false, powerPreference: tier === 'high' ? 'high-performance' : 'low-power', failIfMajorPerformanceCaveat: true };
      gl = cv.getContext('webgl', opts) || cv.getContext('experimental-webgl', opts);
      if (!gl) { cv = null; ST.state = 'dom'; ST.why = 'no hardware WebGL'; return; }
      var back = d.querySelector('.cr-back'); if (back && back.parentNode) back.parentNode.insertBefore(cv, back.nextSibling); else d.body.insertBefore(cv, d.body.firstChild);
      cv.addEventListener('webglcontextlost', function (e) { e.preventDefault(); if (!alive) return; fail('context lost'); ST.state = 'failed'; }, false);
      alive = true;
      P.q = prog(QUAD_VS, QUAD_FS, ['aP']); P.pt = prog(PT_VS, PT_FS, ['aR']); P.ln = prog(LN_VS, LN_FS, ['aL']); P.m = prog(MS_VS, MS_FS, ['aP', 'aN', 'aU']);
      B.quad = buf3(new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]));
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
      measure(); build(); html.classList.add('sp-on'); ST.state = 'on'; frame(); kick();
    } catch (e) { fail('start: ' + (e && e.message || e)); }
  }
  // the DOM runtime measures the scenes on load and resize; the spatial layer measures its anchors right after it
  var m0 = W.__crArtMeasure; W.__crArtMeasure = function () { if (m0) m0(); if (alive) { measure(); kick(); } };
  W.addEventListener('scroll', kick, { passive: true });
  // (the page's height changes as pictures load: its reachable end is measured again then, never per frame)
  if (W.ResizeObserver) new W.ResizeObserver(function () { if (alive) { measure(); kick(); } }).observe(d.body);
  W.addEventListener('resize', function () { if (!alive) return; if ((W.innerWidth <= 720) !== phone) { teardown(); ST.state = 'idle'; start(); } else { measure(); kick(); } });
  d.addEventListener('visibilitychange', function () { if (!d.hidden) kick(); });
  // (the studio's reduced-motion preview switch)
  if (W.MutationObserver) new W.MutationObserver(function () { if (reduced()) { if (alive) { teardown(); ST.state = 'dom'; ST.why = 'reduced motion'; } } else if (!alive) { ST.state = 'idle'; start(); } }).observe(html, { attributes: true, attributeFilter: ['data-motion'] });
  S.nav = parseFloat(getComputedStyle(html).getPropertyValue('--nav')) || 56;
  if (reduced()) { ST.state = 'dom'; ST.why = 'reduced motion'; return; }
  start();
}

// the runtime as it is written into a page: the same text on the server and in the studio bundle (whose copy of this
// file is indented -- leading whitespace is dropped, so preview and export carry the identical program); full-line
// comments stay in this file, not in every page
const RUNTIME = '(' + spatialRuntime.toString().replace(/\r?\n[ \t]+/g, '\n').replace(/\n\/\/[^\n]*/g, '').replace(/\n\/\* eslint-disable \*\//g, '') + ')();';
module.exports = { RUNTIME };
