import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SHOTS, HOTSPOTS, partLabel } from './shots.js';

const BG = 0x07090d;
const isMobile = () => window.innerWidth < 860;

// ---------------------------------------------------------------------------
// Renderer / scene
// ---------------------------------------------------------------------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 9, 24);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.75;

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.02, 100);
camera.position.set(6, 2, 7);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.4, 0.3, 8);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------------------
// Lighting — the model ships with no lights or environment, so we build a
// simple studio: soft key light with shadows and a cool rim light.
// ---------------------------------------------------------------------------
const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(4, 7, 3);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -4;
key.shadow.camera.right = 4;
key.shadow.camera.top = 4;
key.shadow.camera.bottom = -4;
key.shadow.camera.far = 20;
key.shadow.bias = -0.0004;
key.shadow.radius = 6;
scene.add(key);

const rim = new THREE.DirectionalLight(0x9cc4ff, 0.7);
rim.position.set(-5, 3, -6);
scene.add(rim);


// ---------------------------------------------------------------------------
// Floor — studio floor, contact shadow (AO texture that came with the model
// pack but is not referenced by the GLB) and decorative rings.
// ---------------------------------------------------------------------------
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(30, 96),
  new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.55, metalness: 0.0, envMapIntensity: 0.3 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const aoTex = new THREE.TextureLoader().load('/textures/ground_ao.jpg');
aoTex.colorSpace = THREE.SRGBColorSpace;
const contactShadow = new THREE.Mesh(
  new THREE.PlaneGeometry(7.4, 7.4),
  new THREE.MeshBasicMaterial({
    map: aoTex,
    blending: THREE.MultiplyBlending,
    premultipliedAlpha: true,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  })
);
contactShadow.rotation.x = -Math.PI / 2;
contactShadow.position.set(0, 0.002, 0.09);
contactShadow.renderOrder = 1;
scene.add(contactShadow);

const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, toneMapped: false });
for (const r of [3.2, 3.24, 5.2]) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.012, 160), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.003;
  scene.add(ring);
}
const accentRing = new THREE.Mesh(
  new THREE.RingGeometry(3.2, 3.23, 160, 1, 0, Math.PI / 3),
  new THREE.MeshBasicMaterial({ color: 0xe3262f, transparent: true, opacity: 0.8, toneMapped: false })
);
accentRing.rotation.x = -Math.PI / 2;
accentRing.position.y = 0.004;
scene.add(accentRing);

// ---------------------------------------------------------------------------
// State filled once the model is loaded
// ---------------------------------------------------------------------------
const car = {
  root: null,
  meshes: [],
  wheels: [], // { obj, base, parentInv, front }
  headLights: [],
  tailLights: [],
  leds: [],
  lcd: null,
  headSpots: [],
};

const loaderEl = document.getElementById('loader');
const loaderFill = document.getElementById('loader-fill');
const loaderPct = document.getElementById('loader-pct');

new GLTFLoader().load(
  '/models/i20.glb',
  (gltf) => {
    setupCar(gltf.scene);
    loaderFill.style.width = '100%';
    loaderPct.textContent = '100%';
    setTimeout(() => loaderEl.classList.add('done'), 250);
  },
  (e) => {
    const total = e.total || 20050392;
    const pct = Math.min(99, Math.round((e.loaded / total) * 100));
    loaderFill.style.width = pct + '%';
    loaderPct.textContent = pct + '%';
  },
  (err) => {
    console.error(err);
    loaderPct.textContent = 'Hata: model yüklenemedi';
  }
);

function emissiveClone(mesh, color, intensity = 0) {
  const m = mesh.material.clone();
  m.emissive = new THREE.Color(color);
  m.emissiveIntensity = intensity;
  mesh.material = m;
  return m;
}

function setupCar(root) {
  root.updateMatrixWorld(true);
  car.root = root;

  root.traverse((o) => {
    if (!o.isMesh) return;
    car.meshes.push(o);
    o.castShadow = true;
    o.receiveShadow = true;
    const m = o.material;
    // Transparent glass from the export writes depth and hides what is
    // behind it; let it blend properly instead.
    if (m.transparent) {
      m.depthWrite = false;
      o.castShadow = false;
    }
    if (/tire/.test(m.name)) m.roughness = 0.85;
    // Mirror-sharp clearcoat turns the key light into a blinding point.
    if (m.name === 'ag_rw_i20_wrc_2017_body') m.clearcoatRoughness = 0.2;
    // Exported as 0.78 metallic, which makes the dark dashboard mirror-like.
    if (m.name === 'cockpit') m.metalness = 0.15;
    if (m.name === 'window') {
      m.color.setRGB(0.03, 0.06, 0.07);
      m.opacity = 0.45;
      m.roughness = 0.02;
    }
  });

  // Find nodes by name prefix (three.js strips '.' from node names).
  const nodes = [];
  root.traverse((o) => nodes.push(o));
  const top = (re) => nodes.filter((o) => re.test(o.name) && o.parent && /FBX/.test(o.parent.name));

  // Wheels + brake calipers: the GLB has no animation, so we roll and steer
  // them in code around their own pivots.
  const wheelRe = /^(WHEEL_|SUSP_)(LF|RF|LR|RR)/;
  for (const o of nodes) {
    const m = wheelRe.exec(o.name);
    if (!m || !(o.parent && /FBX/.test(o.parent.name))) continue;
    const parentQ = new THREE.Quaternion();
    o.parent.getWorldQuaternion(parentQ);
    car.wheels.push({
      obj: o,
      base: o.quaternion.clone(),
      parentQ,
      parentInv: parentQ.clone().invert(),
      front: m[2].endsWith('F'),
      spins: m[1] === 'WHEEL_',
    });
  }

  // Head / tail lights get their own emissive materials so they can be
  // switched on per chapter.
  for (const n of top(/^(LIGHT_FRONT\d|hlight01|hlight0201)/)) {
    n.traverse((o) => o.isMesh && car.headLights.push(emissiveClone(o, 0xdfeaff)));
  }
  for (const n of top(/^(LIGHT_REAR|rlight_000[0246])/)) {
    n.traverse((o) => o.isMesh && car.tailLights.push(emissiveClone(o, 0xff0a00)));
  }

  // Real light sources for the headlights so they illuminate the floor.
  for (const x of [-0.63, 0.63]) {
    const s = new THREE.SpotLight(0xe8f0ff, 0, 12, 0.45, 0.6, 1.5);
    s.position.set(x, 0.6, 1.95);
    s.target.position.set(x * 1.6, 0, 7);
    scene.add(s, s.target);
    car.headSpots.push(s);
  }

  // Shift-light LEDs on the dashboard (LED_0..LED_77).
  for (const n of nodes) {
    const m = /^LED_(\d+)/.exec(n.name);
    if (m) {
      n.traverse((o) => {
        if (o.isMesh) car.leds.push({ i: +m[1], mat: emissiveClone(o, 0x000000) });
      });
    }
  }
  car.leds.sort((a, b) => a.i - b.i);

  // The LCD dash display only has a 32x32 black texture — replace it with a
  // live canvas that shows gear / speed / rpm.
  const lcdNode = top(/^LCD/)[0];
  if (lcdNode) car.lcd = buildLcd(lcdNode);

  scene.add(root);
  buildHotspots();
}

function buildLcd(lcdNode) {
  let lcdMesh = null;
  lcdNode.traverse((o) => {
    if (o.isMesh && !lcdMesh && o.material.name === 'material') lcdMesh = o;
  });
  if (!lcdMesh) return null;

  const box = new THREE.Box3().setFromObject(lcdMesh);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  // Average world-space normal of the display surface.
  const g = lcdMesh.geometry;
  const nAttr = g.attributes.normal;
  const n = new THREE.Vector3();
  for (let i = 0; i < nAttr.count; i++) n.add(new THREE.Vector3().fromBufferAttribute(nAttr, i));
  n.transformDirection(lcdMesh.matrixWorld);
  if (n.z > 0) n.negate(); // face the driver (towards -Z)

  const cvs = document.createElement('canvas');
  cvs.width = 512;
  cvs.height = 320;
  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  const w = size.x * 0.92;
  const h = Math.hypot(size.y, size.z) * 0.92;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
  );
  plane.position.copy(center).addScaledVector(n, 0.002);
  plane.lookAt(center.clone().addScaledVector(n, 1));
  scene.add(plane);
  return { cvs, ctx: cvs.getContext('2d'), tex, last: 0 };
}

function drawLcd(lcd, rpm, speed, gear) {
  const { ctx, cvs } = lcd;
  const W = cvs.width;
  const H = cvs.height;
  ctx.fillStyle = '#05070a';
  ctx.fillRect(0, 0, W, H);
  // rpm bar
  const segs = 24;
  for (let i = 0; i < segs; i++) {
    const on = i / segs < rpm;
    const hue = i < 14 ? '#38e07b' : i < 20 ? '#ffd23f' : '#ff3b30';
    ctx.fillStyle = on ? hue : '#1a1f27';
    ctx.fillRect(16 + i * 20, 16, 16, 40);
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 180px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(gear, W / 2, 190);
  ctx.font = 'bold 54px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(String(Math.round(speed)).padStart(3, '0'), 20, 260);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#6fa8dc';
  ctx.fillText(Math.round(rpm * 9000) + '', W - 20, 260);
  ctx.font = '600 22px Inter, sans-serif';
  ctx.fillStyle = '#8b95a5';
  ctx.textAlign = 'left';
  ctx.fillText('KM/H', 22, 300);
  ctx.textAlign = 'right';
  ctx.fillText('RPM', W - 22, 300);
  lcd.tex.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Scroll-driven camera
// ---------------------------------------------------------------------------
const sections = [...document.querySelectorAll('.chapter')];
const shotList = sections.map((s) => SHOTS[s.dataset.shot]);
const nav = document.getElementById('chapters');
const hudNum = document.getElementById('hud-num');
const hudFill = document.getElementById('hud-fill');
document.getElementById('hud-total').textContent = String(sections.length).padStart(2, '0');

sections.forEach((s, i) => {
  const b = document.createElement('button');
  b.textContent = SHOTS[s.dataset.shot].title;
  b.addEventListener('click', () => scrollToChapter(i));
  nav.appendChild(b);
});
const navButtons = [...nav.children];

function scrollToChapter(i) {
  exitFree();
  window.scrollTo({ top: sections[i].offsetTop, behavior: 'smooth' });
}

const panelObserver = new IntersectionObserver(
  (entries) => entries.forEach((e) => e.target.classList.toggle('visible', e.isIntersecting)),
  { threshold: 0.45 }
);
sections.forEach((s) => panelObserver.observe(s.querySelector('.panel')));

// progress: float chapter index (0 .. n-1)
function scrollProgress() {
  const y = window.scrollY;
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i].offsetTop;
    const b = sections[i + 1].offsetTop;
    if (y < b) return i + THREE.MathUtils.clamp((y - a) / (b - a), 0, 1);
  }
  return sections.length - 1;
}

// Each transition holds briefly at the start/end so the reader can see the
// shot, then eases between them.
const easeHold = (t) => {
  const u = THREE.MathUtils.clamp((t - 0.12) / 0.76, 0, 1);
  return u * u * (3 - 2 * u);
};

// Interpolate camera positions in cylindrical coordinates around the car so
// the camera orbits instead of cutting straight through the body.
function toCyl(p) {
  return { r: Math.hypot(p[0], p[2]), a: Math.atan2(p[0], p[2]), y: p[1] };
}
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function shotAt(progress) {
  const i = Math.min(Math.floor(progress), shotList.length - 2);
  const t = easeHold(progress - i);
  const A = shotList[i];
  const B = shotList[i + 1];
  const ca = toCyl(A.pos);
  const cb = toCyl(B.pos);
  const r = THREE.MathUtils.lerp(ca.r, cb.r, t);
  const a = lerpAngle(ca.a, cb.a, t);
  // Lift the camera a little mid-transition for a sweeping move.
  const lift = Math.sin(t * Math.PI) * 0.25 * Math.min(ca.r, cb.r) * 0.3;
  const y = THREE.MathUtils.lerp(ca.y, cb.y, t) + lift;
  const pos = new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);
  const target = new THREE.Vector3().fromArray(A.target).lerp(new THREE.Vector3().fromArray(B.target), t);
  const mob = isMobile();
  const shiftA = mob ? 0 : A.shift;
  const shiftB = mob ? 0 : B.shift;
  return {
    pos,
    target,
    fov: THREE.MathUtils.lerp(A.fov, B.fov, t) * (mob ? 1.25 : 1),
    shift: THREE.MathUtils.lerp(shiftA, shiftB, t),
    lift: mob ? THREE.MathUtils.lerp(A.mobileLift ?? 0.12, B.mobileLift ?? 0.12, t) : 0,
  };
}

// Light state per chapter
const chapterWeight = (progress, name) => {
  const idx = sections.findIndex((s) => s.dataset.shot === name);
  return THREE.MathUtils.clamp(1 - Math.abs(progress - idx) * 1.6, 0, 1);
};

// ---------------------------------------------------------------------------
// Free mode (last chapter): orbit controls + double-click to focus a part
// ---------------------------------------------------------------------------
const controls = new OrbitControls(camera, canvas);
controls.enabled = false;
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 0.35;
controls.maxDistance = 12;
controls.maxPolarAngle = Math.PI / 2 - 0.03;
controls.zoomSpeed = 0.8;

let freeMode = false;
let focusTween = null;
const focusLabel = document.getElementById('focus-label');
let focusLabelTimer = 0;

function enterFree() {
  if (freeMode) return;
  freeMode = true;
  document.body.classList.add('free');
  controls.target.copy(cam.target);
  controls.enabled = true;
  camera.clearViewOffset();
  const s = SHOTS.explore;
  focusTween = {
    t: 0,
    fromPos: camera.position.clone(),
    toPos: new THREE.Vector3().fromArray(s.pos),
    fromTarget: cam.target.clone(),
    toTarget: new THREE.Vector3().fromArray(s.target),
  };
}
function exitFree() {
  if (!freeMode) return;
  freeMode = false;
  focusTween = null;
  document.body.classList.remove('free');
  controls.enabled = false;
  cam.target.copy(controls.target);
}

function focusOn(center, size, label) {
  if (!freeMode) enterFree();
  const carCenter = new THREE.Vector3(0, 0.6, 0);
  const outward = center.clone().sub(carCenter);
  outward.y = 0;
  if (outward.lengthSq() < 1e-4) outward.set(1, 0, 0);
  outward.normalize();
  const fromCam = camera.position.clone().sub(center).normalize();
  const dir = outward.multiplyScalar(0.6).add(fromCam.multiplyScalar(0.4));
  dir.y = Math.max(dir.y, 0.25);
  dir.normalize();
  const dist = THREE.MathUtils.clamp(size * 2.2, 0.55, 5);
  focusTween = {
    t: 0,
    fromPos: camera.position.clone(),
    toPos: center.clone().addScaledVector(dir, dist),
    fromTarget: controls.target.clone(),
    toTarget: center.clone(),
  };
  if (label) {
    focusLabel.textContent = label;
    focusLabel.classList.add('show');
    clearTimeout(focusLabelTimer);
    focusLabelTimer = setTimeout(() => focusLabel.classList.remove('show'), 2200);
  }
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

// The top-level part (direct child of the FBX root) that a mesh belongs to.
function partOf(o) {
  while (o.parent && !/FBX/.test(o.parent.name)) o = o.parent;
  return o;
}

canvas.addEventListener('dblclick', (e) => {
  if (!freeMode || !car.root) return;
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(car.meshes, false)[0];
  if (!hit) return;
  const part = partOf(hit.object);
  const box = new THREE.Box3().setFromObject(part);
  const size = box.getSize(new THREE.Vector3());
  // Large panels (body, chassis) → focus the clicked point; small parts →
  // centre on the whole part.
  const big = Math.max(size.x, size.y, size.z) > 1.2;
  const center = big ? hit.point : box.getCenter(new THREE.Vector3());
  focusOn(center, big ? 0.5 : Math.max(size.x, size.y, size.z), partLabel(part.name));
});

document.getElementById('reset-view').addEventListener('click', () => {
  const s = SHOTS.explore;
  focusTween = {
    t: 0,
    fromPos: camera.position.clone(),
    toPos: new THREE.Vector3().fromArray(s.pos),
    fromTarget: controls.target.clone(),
    toTarget: new THREE.Vector3().fromArray(s.target),
  };
});

// ---------------------------------------------------------------------------
// Hotspots
// ---------------------------------------------------------------------------
const hotspotLayer = document.getElementById('hotspots');
const hotspots = [];
function buildHotspots() {
  for (const h of HOTSPOTS) {
    const el = document.createElement('button');
    el.className = 'hotspot hidden';
    el.innerHTML = `<span class="dot"></span><span class="label">${h.label}</span>`;
    el.addEventListener('click', () => {
      if (freeMode) {
        focusOn(new THREE.Vector3().fromArray(h.focus), h.size, h.label);
      } else {
        const i = sections.findIndex((s) => s.dataset.shot === h.shot);
        scrollToChapter(i);
      }
    });
    hotspotLayer.appendChild(el);
    hotspots.push({ ...h, el, p: new THREE.Vector3().fromArray(h.pos), visible: false });
  }
}

const tmpV = new THREE.Vector3();
let hotspotFrame = 0;
function updateHotspots(progress) {
  const show = progress < 0.35 || freeMode;
  hotspotFrame++;
  for (const h of hotspots) {
    tmpV.copy(h.p).project(camera);
    const onScreen = tmpV.z < 1 && Math.abs(tmpV.x) < 0.95 && Math.abs(tmpV.y) < 0.92;
    if (show && onScreen && hotspotFrame % 8 === 0) {
      // Occlusion test against the car body.
      const dir = h.p.clone().sub(camera.position);
      const dist = dir.length();
      raycaster.set(camera.position, dir.normalize());
      raycaster.far = dist - 0.05;
      h.visible = raycaster.intersectObjects(car.meshes, false).length === 0;
      raycaster.far = Infinity;
    }
    const vis = show && onScreen && h.visible;
    h.el.classList.toggle('hidden', !vis);
    const x = (tmpV.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-tmpV.y * 0.5 + 0.5) * window.innerHeight;
    h.el.style.transform = `translate(${x}px, ${y - 7}px)`;
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
const cam = { pos: camera.position.clone(), target: new THREE.Vector3(0, 0.6, 0), fov: 35, shift: 0, lift: 0 };
const mouse = new THREE.Vector2();
const mouseSmooth = new THREE.Vector2();
window.addEventListener('pointermove', (e) => {
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
});

let lastScrollY = window.scrollY;
let wheelAngle = 0;
let wheelVel = 0;
let steer = 0;
let rpm = 0.15;
let firstFrame = true;
const clock = new THREE.Timer();
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);

function frame() {
  clock.update();
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.getElapsed();
  const progress = scrollProgress();
  const last = sections.length - 1;

  // Free mode kicks in when the last chapter is reached.
  if (progress >= last - 0.001) enterFree();
  else if (freeMode && progress < last - 0.02) exitFree();

  const k = 1 - Math.exp(-dt * 4.5);
  if (freeMode) {
    if (focusTween) {
      focusTween.t = Math.min(1, focusTween.t + dt / 1.2);
      const t = 1 - Math.pow(1 - focusTween.t, 3);
      camera.position.lerpVectors(focusTween.fromPos, focusTween.toPos, t);
      controls.target.lerpVectors(focusTween.fromTarget, focusTween.toTarget, t);
      if (focusTween.t >= 1) focusTween = null;
    }
    camera.fov += (SHOTS.explore.fov - camera.fov) * k;
    camera.updateProjectionMatrix();
    controls.update();
    cam.pos.copy(camera.position);
  } else {
    const s = window.__shotOverride || shotAt(progress);
    if (firstFrame) {
      cam.pos.copy(s.pos);
      cam.target.copy(s.target);
      firstFrame = false;
    }
    cam.pos.lerp(s.pos, k);
    cam.target.lerp(s.target, k);
    cam.fov += (s.fov - cam.fov) * k;
    cam.shift += (s.shift - cam.shift) * k;
    cam.lift += (s.lift - cam.lift) * k;

    // Gentle mouse parallax
    mouseSmooth.lerp(mouse, 1 - Math.exp(-dt * 3));
    const right = new THREE.Vector3().subVectors(cam.target, cam.pos).cross(Y).normalize();
    const dist = cam.pos.distanceTo(cam.target);
    camera.position
      .copy(cam.pos)
      .addScaledVector(right, mouseSmooth.x * dist * 0.025)
      .addScaledVector(Y, -mouseSmooth.y * dist * 0.015);
    camera.lookAt(cam.target);
    camera.fov = cam.fov;
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.setViewOffset(w, h, -cam.shift * w, cam.lift * h, w, h);
    camera.updateProjectionMatrix();
  }

  // Wheels roll with scroll velocity, front wheels steer in the wheel chapter.
  const dy = window.scrollY - lastScrollY;
  lastScrollY = window.scrollY;
  wheelVel += (dy * 0.012 - wheelVel) * 0.15;
  const wheelW = chapterWeight(progress, 'wheel');
  wheelAngle += wheelVel + dt * 0.6 * wheelW;
  steer += (wheelW * -0.32 - steer) * k;
  for (const w of car.wheels) {
    // world rotation = steer(Y) * spin(X) * original
    qa.setFromAxisAngle(Y, w.front ? steer : 0);
    if (w.spins) qa.multiply(qb.setFromAxisAngle(X, wheelAngle));
    w.obj.quaternion.copy(w.parentInv).multiply(qa).multiply(w.parentQ).multiply(w.base);
  }

  // Lights
  const headW = Math.max(chapterWeight(progress, 'front'), freeMode ? 0.5 : 0);
  const tailW = Math.max(chapterWeight(progress, 'rear'), freeMode ? 0.5 : 0, chapterWeight(progress, 'wing') * 0.6);
  for (const m of car.headLights) m.emissiveIntensity = headW * 11;
  for (const m of car.tailLights) m.emissiveIntensity = tailW * 20;
  for (const s of car.headSpots) s.intensity = headW * 30;

  // Dashboard: rev up when looking into the cockpit.
  const cockpitW = chapterWeight(progress, 'cockpit');
  const targetRpm = 0.18 + cockpitW * (0.55 + 0.4 * Math.abs(Math.sin(time * 1.3)));
  rpm += (targetRpm - rpm) * k;
  const litLeds = Math.round(rpm * car.leds.length);
  car.leds.forEach((l, i) => {
    const f = i / car.leds.length;
    l.mat.emissive.setHex(f < 0.6 ? 0x2bff6a : f < 0.85 ? 0xffc21a : 0xff2a1a);
    l.mat.emissiveIntensity = i < litLeds ? 14 : 0;
  });
  if (car.lcd && time - car.lcd.last > 0.08) {
    car.lcd.last = time;
    const gear = rpm < 0.25 ? 'N' : String(Math.min(6, 1 + Math.floor((rpm - 0.25) * 9)));
    drawLcd(car.lcd, rpm, rpm * 190, gear);
  }

  accentRing.rotation.z = time * 0.15;

  // HUD
  const active = Math.round(progress);
  hudNum.textContent = String(active + 1).padStart(2, '0');
  hudFill.style.width = (progress / last) * 100 + '%';
  navButtons.forEach((b, i) => b.classList.toggle('active', i === active));

  updateHotspots(progress);
  composer.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
});

// Debug / screenshot hook
window.__car = { car, camera, scene, SHOTS, bloom, key, rim };
