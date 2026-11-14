import {surfaceTexture} from './surfaces.js';
import {startTask} from './tasks.js';
import {buildShip, shipStations} from './ship.js';
import {opening, companionReaction, createCompanion} from './companion.js';
import {briefings, enableTouchStick} from './presentation.js';
import {saveMission, loadMission, forecast, resourceHistory} from './mission-session.js';
import * as T from "./vendor/three.module.js";
import { createXR, astronautGlove } from './xr.js';
const canvas = document.getElementById("world"),
  dialog = document.getElementById("dialog"),
  modal = document.getElementById("modal");
let state = initial(),
  playing = false,
  yaw = 0,
  pitch = 0,
  jumpY = 0,
  velocity = 0,
  near = false;
const keys = new Set(),
  player = new T.Vector3(0, 1.8, 2),
  obstacles = [];
let inMenu = true;
let missionStarted = false;
const preferences = {
  quality: "high",
  moonSpin: true,
  sensitivity: 1,
  reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
};
try {
  const saved = JSON.parse(
    localStorage.getItem("lunar-frontier-settings") || "{}",
  );
  // Rotation starts on each visit; the title control can pause it for this session.
  if (["low", "high"].includes(saved.quality))
    preferences.quality = saved.quality;
  if (Number.isFinite(saved.sensitivity))
    preferences.sensitivity = Math.max(0.4, Math.min(2, saved.sensitivity));
  if (typeof saved.reducedMotion === "boolean")
    preferences.reducedMotion = saved.reducedMotion;
} catch {}
const entry = document.createElement("section");
entry.id = "entry";
document.body.append(entry);
let renderer;
try {
  renderer = new T.WebGLRenderer({ canvas, antialias: true });
} catch (error) {
  modal.innerHTML =
    '<h1>3D graphics unavailable</h1><p>Enable hardware acceleration in your browser, or play the mission dashboard.</p><a href="mission.html">Open dashboard</a>';
  dialog.showModal();
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new T.Scene();
scene.background = new T.Color(0x010204);
// No atmospheric haze on the Moon.
const camera = new T.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 650);
const menuScene = new T.Scene();
menuScene.background = new T.Color(0x05080c);
const menuCamera = new T.PerspectiveCamera(
  42,
  innerWidth / innerHeight,
  0.1,
  600,
);
menuCamera.position.set(0, 0, 16);
menuScene.add(new T.AmbientLight(0xb8c8de, 0.22));
const moonlight = new T.DirectionalLight(0xffffff, 3.1);
moonlight.position.set(-4, 5, 8);
menuScene.add(moonlight);
const moonGeometry = new T.SphereGeometry(3.6, 160, 96);
const moonVertices = moonGeometry.attributes.position;
const craterCenters = [];
for (let i = 0; i < 32; i++) {
  const azimuth = i * 2.399963;
  const height = 1 - (i + 0.5) / 16;
  craterCenters.push({
    center: new T.Vector3(
      Math.cos(azimuth) * Math.sqrt(1 - height * height),
      height,
      Math.sin(azimuth) * Math.sqrt(1 - height * height),
    ),
    radius: 0.08 + (i % 5) * 0.035,
  });
}
const moonColors = [];
for (let i = 0; i < moonVertices.count; i++) {
  const direction = new T.Vector3()
    .fromBufferAttribute(moonVertices, i)
    .normalize();
  let depth = 0;
  for (const crater of craterCenters) {
    const distance = direction.distanceTo(crater.center) / crater.radius;
    if (distance < 1) depth -= 0.035 * (1 - distance * distance);
    if (distance >= 0.85 && distance < 1.2)
      depth += 0.012 * Math.sin(((distance - 0.85) / 0.35) * Math.PI);
  }
  const variation =
    Math.sin(direction.x * 9 + direction.z * 3) *
    Math.cos(direction.y * 8) *
    0.035;
  moonVertices.setXYZ(
    i,
    direction.x * (3.6 + depth),
    direction.y * (3.6 + depth),
    direction.z * (3.6 + depth),
  );
  const color = new T.Color().setHSL(
    0,
    0,
    0.57 + variation + depth * 0.8,
  );
  moonColors.push(color.r, color.g, color.b);
}
moonGeometry.setAttribute("color", new T.Float32BufferAttribute(moonColors, 3));
moonGeometry.computeVertexNormals();
const lunarTexture=surfaceTexture("moon");
const menuMoon = new T.Mesh(
  moonGeometry,
  new T.MeshStandardMaterial({
    vertexColors: true,
    map:lunarTexture, bumpMap:lunarTexture, bumpScale:0.035,
    roughness: 1,
    flatShading: false,
  }),
);
menuMoon.position.x = 3.2;
menuScene.add(menuMoon);
camera.rotation.order = "YXZ";
scene.add(new T.HemisphereLight(0xdde6ef, 0x272b30, 1.2));
const sun = new T.DirectionalLight(0xffffff, 2.4);
sun.position.set(-35, 45, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {
  left: -65,
  right: 65,
  top: 65,
  bottom: -65,
  far: 160,
});
sun.shadow.bias = -0.001;
scene.add(sun);
const panelTexture=surfaceTexture("panel");
const materials = new Map();
function mat(color) {
  if (!materials.has(color))
    materials.set(
      color,
      new T.MeshStandardMaterial({
        color,
        map:panelTexture, bumpMap:panelTexture, bumpScale:0.006,
        roughness: 0.65,
        metalness: 0.22,
        flatShading: false,
      }),
    );
  return materials.get(color);
}
function mesh(geometry, material, x, y, z, parent = scene) {
  const m = new T.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function box(w, h, d, color, x, y, z, parent = scene) {
  return mesh(new T.BoxGeometry(w, h, d), mat(color), x, y, z, parent);
}
function obstacle(x, z, w, d) {
  obstacles.push({ x, z, w: w / 2 + 0.45, d: d / 2 + 0.45 });
}
function sign(text, x, y, z) {
  const c = document.createElement("canvas");
  c.width = 768;
  c.height = 128;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#28263e";
  ctx.fillRect(0, 0, 768, 128);
  ctx.strokeStyle = "#f7cc88";
  ctx.lineWidth = 5;
  ctx.strokeRect(3, 3, 762, 122);
  ctx.fillStyle = "#f7cc88";
  ctx.font = "bold 42px monospace";
  ctx.textAlign = "center";
  ctx.fillText(text, 384, 80);
  const texture = new T.CanvasTexture(c);
  texture.colorSpace = T.SRGBColorSpace;
  mesh(
    new T.PlaneGeometry(7, 1.16),
    new T.MeshBasicMaterial({ map: texture }),
    x,
    y,
    z,
  );
}
let seed = 7421;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
const terrain = new T.PlaneGeometry(500, 500, 90, 90);
terrain.rotateX(-Math.PI / 2);
const positions = terrain.attributes.position;
for (let i = 0; i < positions.count; i++) {
  const x = positions.getX(i),
    z = positions.getZ(i);
  positions.setY(i, Math.hypot(x, z) < 60 ? -0.06 : (random() - 0.4) * 2.5);
}
terrain.computeVertexNormals();
const ground = terrain.toNonIndexed();
const groundColors = [];
for (let i = 0; i < ground.attributes.position.count; i += 3) {
  const shade = new T.Color().setHSL(0, 0, 0.43 + random() * 0.012);
  for (let vertex = 0; vertex < 3; vertex++)
    groundColors.push(shade.r, shade.g, shade.b);
}
ground.setAttribute("color", new T.Float32BufferAttribute(groundColors, 3));
mesh(
  ground,
  new T.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    flatShading: true,
  }),
  0,
  0,
  0,
);
for (let i = 0; i < 150; i++) {
  const x = (random() - 0.5) * 300,
    z = (random() - 0.5) * 300;
  if (Math.hypot(x, z) < 45) continue;
  const size = 0.4 + random() * 3;
  const rock = mesh(
    new T.IcosahedronGeometry(size, 2),
    mat(0x777779),
    x,
    size * 0.2,
    z,
  );
  rock.scale.y = 0.55;
  rock.rotation.set(random(), random() * 6, random());
}
for(let i=0;i<30;i++) {
 const a=i/30*Math.PI*2;
 const hill=mesh(new T.SphereGeometry(1,32,16),mat(0x68686a),Math.sin(a)*210,-8,Math.cos(a)*210);
 hill.scale.set(32+random()*30,18+random()*22,35+random()*25);
}
const stars = new Float32Array(5400);
for (let i = 0; i < stars.length; i += 3) {
  const a = random() * 6.28,
    h = random(),
    r = 340;
  stars[i] = Math.cos(a) * Math.sqrt(1 - h * h) * r;
  stars[i + 1] = h * r;
  stars[i + 2] = Math.sin(a) * Math.sqrt(1 - h * h) * r;
}
const starGeo = new T.BufferGeometry();
starGeo.setAttribute("position", new T.BufferAttribute(stars, 3));
scene.add(
  new T.Points(
    starGeo,
    new T.PointsMaterial({ color: 0xddeeff, size: 0.55, fog: false }),
  ),
);
// A full backdrop keeps stars visible at both desktop and phone aspect ratios.
const titleStars = new Float32Array(1500);
for (let i=0;i<titleStars.length;i+=3) {
  titleStars[i]=(random()-0.5)*95;
  titleStars[i+1]=(random()-0.5)*50;
  titleStars[i+2]=-35-random()*15;
}
const titleStarGeometry=new T.BufferGeometry();
titleStarGeometry.setAttribute('position',new T.BufferAttribute(titleStars,3));
menuScene.add(new T.Points(titleStarGeometry,new T.PointsMaterial({color:0xd8e9f7,size:1.6,sizeAttenuation:false,transparent:true,opacity:0.85})));
const earth = mesh(
  new T.SphereGeometry(9, 32, 24),
  mat(0x3c85bb),
  75,
  65,
  -180,
);
for (let i = 0; i < 15; i++) {
  const cloud = mesh(
    new T.SphereGeometry(1 + random() * 2, 12, 8),
    mat(i % 3 ? 0xd1e6e9 : 0x7eae95),
    0,
    0,
    0,
    earth,
  );
  const a = random() * 6.28,
    b = random() * 2.4;
  cloud.position.set(
    Math.sin(a) * Math.sin(b) * 8.8,
    Math.cos(b) * 8.8,
    Math.cos(a) * Math.sin(b) * 8.8,
  );
  cloud.scale.y = 0.5;
}
buildShip(scene,box,mesh,mat,obstacle);
function astronaut(x, z, color) {
  const g = new T.Group();
  g.position.set(x, 0, z);
  scene.add(g);
  mesh(new T.CapsuleGeometry(0.32,0.4,8,16),mat(0xe2e7e9),0,1.2,0,g);
  box(0.55, 0.65, 0.4, 0x6c8492, 0, 1.2, -0.4, g);
  mesh(new T.SphereGeometry(0.36, 32, 24), mat(0xe9e8dc), 0, 1.9, 0, g);
  mesh(
    new T.SphereGeometry(0.30, 32, 24),
    new T.MeshStandardMaterial({color:0x252a32,metalness:0.8,roughness:0.13}),
    0,
    1.91,
    0.2,
    g,
  ).scale.z = 0.6;
  for (const side of [-1, 1]) {
    mesh(new T.CapsuleGeometry(0.13,0.48,6,12),mat(0xd8dfe3),side*0.2,0.42,0,g);
    mesh(new T.CapsuleGeometry(0.12,0.5,6,12),mat(0xd8dfe3),side*0.45,1.1,0,g);
  }
  box(0.5, 0.16, 0.53, color, 0, 1.2, 0, g);
  return g;
}
const crew = [astronaut(-6,-10,0xffbd65),astronaut(6,10,0x99d88c),astronaut(6,2,0x86c3df)];
const stations = shipStations;
const beacon = new T.Group();
scene.add(beacon);
const ring = mesh(
  new T.TorusGeometry(0.9, 0.055, 8, 48),
  new T.MeshBasicMaterial({ color: 0xffc679 }),
  0,
  0.09,
  0,
  beacon,
);
ring.rotation.x = Math.PI / 2;
const arrow = mesh(
  new T.ConeGeometry(0.3, 0.6, 4),
  new T.MeshBasicMaterial({ color: 0xffc679 }),
  0,
  3,
  0,
  beacon,
);
arrow.rotation.z = Math.PI;
function hud() {
  document.getElementById("hud").innerHTML =
    `<div class="kicker">DAY ${Math.min(state.day + 1, 7)} / 7 · CREW 04</div>` +
    [
      ["power", "Power"],
      ["life", "Life support"],
      ["safety", "Crew safety"],
    ]
      .map(
        ([key, name]) =>
          `<div class="meter">${name}<b>${state[key]} / 100</b><progress max="100" value="${state[key]}" aria-label="${name}"></progress></div>`,
      )
      .join("");
  const s = stations[Math.min(state.day, 6)];
  beacon.position.set(s.x, 0, s.z);
}
function show(html) {
  keys.clear();
  document.exitPointerLock?.();
  modal.innerHTML = html;
  if (!dialog.open) dialog.showModal();
}
function resume() {
  dialog.close();
  inMenu = false;
  missionStarted = true;
  document.body.classList.remove("title-screen");
  playing = true;
}
function applyPreferences() {
  renderer.setPixelRatio(
    preferences.quality === "low" ? 1 : Math.min(devicePixelRatio, 1.7),
  );
  renderer.shadowMap.enabled = preferences.quality === "high";
  resize();
  try {
    localStorage.setItem(
      "lunar-frontier-settings",
      JSON.stringify(preferences),
    );
  } catch {}
}
function titleScreen() {
  playing = false;
  inMenu = true;
  keys.clear();
  dialog.close();
  document.body.classList.add("title-screen");
  entry.innerHTML = `<div class="entry-panel"><h1>LUNAR<br><span>FRONTIER</span></h1><nav aria-label="Main menu"><button id="start-game">${missionStarted ? "CONTINUE EXPEDITION" : "START EXPEDITION"} <span>↗</span></button><button id="settings">SETTINGS <span>⚙</span></button><button id="how-to">HOW TO PLAY <span>?</span></button></nav></div><div class="moon-caption"><button id="moon-spin">${preferences.moonSpin ? "Pause rotation" : "Rotate Moon"}</button></div>`;
  document.getElementById("start-game").onclick = () => {
    if (missionStarted) { resume(); return; }
    show(opening);
    document.getElementById('launch').onclick=resume;
  };
  document.getElementById("settings").onclick = settingsMenu;
  document.getElementById("moon-spin").onclick = event => { preferences.moonSpin = !preferences.moonSpin; event.target.textContent = preferences.moonSpin ? "Pause rotation" : "Rotate Moon"; applyPreferences(); };
  document.getElementById("how-to").onclick = () => {
    show(
      '<span class="kicker">FIELD GUIDE</span><h2>Welcome, Commander.</h2><p>Walk to the amber marker and interact with its terminal. Each decision advances your seven-day mission and changes power, life support or crew safety.</p><p><b>WASD / arrows</b> — walk<br><b>Drag the mouse</b> — look<br><b>E</b> — use a terminal<br><b>Space</b> — jump<br><b>Shift</b> — walk faster<br><b>Escape</b> — pause</p><p>On touch screens, use the movement buttons and drag the world. Keep the crew safe, transmit research and help the crop experiment reach harvest.</p><button id="menu-back">Back to menu</button>',
    );
    document.getElementById("menu-back").onclick = () => dialog.close();
  };
}
function settingsMenu() {
  show(
    `<span class="kicker">MAKE YOURSELF AT HOME</span><h2>Settings</h2><div class="setting"><label for="quality">Graphics quality</label><select id="quality"><option value="high">High · shadows enabled</option><option value="low">Low · smoother performance</option></select></div><div class="setting"><label for="sensitivity">Look sensitivity <output id="sensitivity-value">${preferences.sensitivity.toFixed(1)}×</output></label><input id="sensitivity" type="range" min="0.4" max="2" step="0.1" value="${preferences.sensitivity}"></div><div class="setting check"><label for="motion">Reduce motion</label><input id="motion" type="checkbox" ${preferences.reducedMotion ? "checked" : ""}></div><p>Reduced motion stops decorative animations during the mission. Moon rotation has its own control on the title screen. Settings save on this device.</p><button id="settings-done">Done</button>`,
  );
  document.getElementById("quality").value = preferences.quality;
  document.getElementById("quality").onchange = (e) => {
    preferences.quality = e.target.value;
    applyPreferences();
  };
  document.getElementById("sensitivity").oninput = (e) => {
    preferences.sensitivity = Number(e.target.value);
    document.getElementById("sensitivity-value").textContent =
      preferences.sensitivity.toFixed(1) + "×";
    applyPreferences();
  };
  document.getElementById("motion").onchange = (e) => {
    preferences.reducedMotion = e.target.checked;
    applyPreferences();
  };
  document.getElementById("settings-done").onclick = () => dialog.close();
}
function report() {
  show(
    `<span class="kicker">MISSION REPORT</span><h1>${outcome(state)}</h1><p>${state.day < 7 ? "A critical system reached zero. Mission control ended the expedition early." : "You completed seven days on the lunar surface."}</p><p>Research transmitted ${state.flags.includes("sent") ? "✓" : "—"} · Crop harvested ${state.flags.includes("food") ? "✓" : "—"}</p>${resourceHistory(state)}${state.log.map((l) => `<details><summary>Day ${l.day} · ${l.choice}</summary><p>${l.notes.join(" ")}</p></details>`).join("")}<button id="replay">New expedition</button><button class="secondary" id="explore">Keep exploring</button>`,
  );
  document.getElementById("replay").onclick = () => {
    state = initial();
    saveMission(state);
    player.set(0, 1.8, 2);
    yaw = pitch = jumpY = velocity = 0;
    hud();
    resume();
  };
  document.getElementById("explore").onclick = resume;
}
function interact(direct = false) {
  if (dialog.open || !playing) return;
  gloveReach = 1;
  if (state.ended) {
    report();
    return;
  }
  if (!near && !direct) return;
  const day = days[state.day];
  show(`<span class="kicker">DAY ${state.day+1} / ${stations[state.day].name}</span><h2>Choose your priority</h2><div class="choices">${day.choices.map((c,i)=>`<button class="choice" data-choice="${i}">${c[0]}<span>${c[1]}</span></button>`).join('')}</div><button class="secondary" id="back">Back to ship</button>`);
  document.getElementById('back').onclick=resume;
  modal.querySelectorAll('[data-choice]').forEach(button=>button.onclick=()=>{
    const index=Number(button.dataset.choice);
    startTask(state.day,index,day.choices[index][0],show,()=>{
      state=decide(state,index);const saved=saveMission(state);hud();
      const last=state.log.at(-1);
      show(`<span class="kicker">SYSTEM UPDATED</span><h2>${last.choice}</h2><p>${companionReaction(state)}</p><details><summary>Resource changes & science</summary><p>${last.notes.join(' ')}</p><p>${last.why}</p></details>${saved?'':'<p>Progress could not be saved. Keep this tab open.</p>'}<button id="continue">${state.ended?'View report':'Back to ship →'}</button>`);
      document.getElementById('continue').onclick=state.ended?report:resume;
    },resume);
  });
}

document.getElementById("interact").onclick = () => interact();
const stationAccess=document.createElement('button');
stationAccess.id='station-access';
stationAccess.textContent='Remote assist';
stationAccess.onclick=()=>interact(true);
document.body.append(stationAccess);
document.getElementById("help").onclick = () => {
  show(
    '<h2>Explore the lander</h2><p>WASD or arrow keys move. Drag the mouse to look. E interacts near the amber marker. Space jumps. Shift moves faster. Escape pauses. Touch screens have movement buttons.</p><h3>Mission science</h3><p>Each turn represents one Earth day. Resource points, events and solar charging are simplified game rules. You are aboard the landed spacecraft Selene. Packaged meals sustain the crew while an existing crop experiment grows.</p><p><a href="https://pds.nasa.gov/ds-view/pds/viewProfile.jsp?dsid=LRO-L-DLRE-5-GCP-V1.0" target="_blank" rel="noopener">NASA Diviner</a> · <a href="https://www.nasa.gov/reference/environmental-control-and-life-support-systems-eclss/" target="_blank" rel="noopener">Life support</a> · <a href="https://www.nasa.gov/reference/crew-systems/" target="_blank" rel="noopener">Crew protection</a> · <a href="https://www.nasa.gov/exploration-research-and-technology/growing-plants-in-space/" target="_blank" rel="noopener">Growing food</a></p><p>NASA science explanations are included. Numerical NASA measurements are still pending integration.</p><button id="return">Return to ship</button>',
  );
  document.getElementById("return").onclick = resume;
};
function jump() {
  if (playing && !dialog.open && jumpY === 0) velocity = 3.2;
}
document.getElementById("jump").onclick = jump;
document.addEventListener("keydown", (e) => {
  if (dialog.open || inMenu) return;
  if (e.code === "Escape") {
    pause();
    return;
  }
  if (
    ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
      e.code,
    )
  )
    e.preventDefault();
  keys.add(e.code);
  if (!e.repeat && e.code === "KeyE") interact();
  if (!e.repeat && e.code === "Space") jump();
});
document.addEventListener("keyup", (e) => keys.delete(e.code));
function pause() {
  keys.clear();
  if (renderer.xr.isPresenting) return;
  if (!playing || dialog.open) return;
  playing = false;
  show(
    '<h2>Mission paused</h2><p>Your crew is waiting.</p><button id="resume">Resume exploration</button><button class="secondary" id="main-menu">Main menu</button>',
  );
  document.getElementById("resume").onclick = resume;
  document.getElementById("main-menu").onclick = titleScreen;
}
window.addEventListener("blur", pause);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});
dialog.addEventListener("cancel", (e) => e.preventDefault());
document.addEventListener("pointerlockchange", () => {
  if (!document.pointerLockElement) pause();
});
function look(dx, dy) {
  yaw -= dx * 0.003 * preferences.sensitivity;
  pitch = T.MathUtils.clamp(
    pitch - dy * 0.003 * preferences.sensitivity,
    -1.25,
    1.25,
  );
}
document.addEventListener("mousemove", (e) => {
  if (playing && !dialog.open && document.pointerLockElement === canvas)
    look(e.movementX, e.movementY);
});
let drag = null;
canvas.addEventListener("pointerdown", (e) => {
  if (dialog.open || inMenu) return;
  playing = true;
  if (e.pointerType === 'mouse' && canvas.requestPointerLock) {
    canvas.requestPointerLock()?.catch?.(()=>{});
  }
  drag = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (drag && !document.pointerLockElement) {
    look(e.clientX - drag.x, e.clientY - drag.y);
    drag = { x: e.clientX, y: e.clientY };
  }
});
for (const type of ["pointerup", "pointercancel"])
  canvas.addEventListener(type, () => {
    drag = null;
  });
document.querySelectorAll("[data-key]").forEach((b) => {
  b.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    keys.add(b.dataset.key);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    b.addEventListener(type, () => keys.delete(b.dataset.key));
});
enableTouchStick(keys);
function clearAt(x, z) {
  return (
    Math.abs(x) < 8.4 &&
    Math.abs(z) < 12.8 &&
    !obstacles.some((o) => Math.abs(x - o.x) < o.w && Math.abs(z - o.z) < o.d)
  );
}
function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  menuCamera.aspect = innerWidth / innerHeight;
  menuCamera.updateProjectionMatrix();
  menuMoon.position.set(
    innerWidth < 700 ? 0.9 : 3.2,
    innerWidth < 700 ? 1.6 : 0,
    0,
  );
  menuMoon.scale.setScalar(innerWidth < 700 ? 0.75 : 1);
}
window.addEventListener("resize", resize);
resize();
let previous = performance.now();
const glove = astronautGlove();
camera.add(glove);
let gloveReach = 0;
const xr = createXR({renderer, scene, camera, dialog, modal, interact, position: player,
  move(dx,dz) {
    if (clearAt(player.x + dx, player.z)) player.x += dx;
    if (clearAt(player.x, player.z + dz)) player.z += dz;
  },
  status() {
    const station = stations[Math.min(state.day, 6)];
    near = Math.hypot(station.x-player.x, station.z-player.z) < 3.4;
    if (state.ended) return 'Mission complete\nPull trigger to view report';
    return `DAY ${state.day + 1} / 7\nPower ${state.power} · Life support ${state.life} · Safety ${state.safety}\n${station.name}\n${near ? 'Pull trigger to interact' : 'Follow the amber marker'}\nLeft stick: move · Right stick: snap turn`;
  }
});
xr.supported().then(supported => { if (supported) document.body.classList.add('vr-supported'); }).catch(() => {});
const vrButton = document.createElement('button');
vrButton.id = 'enter-vr';
vrButton.textContent = 'Enter VR';
document.body.append(vrButton);
vrButton.onclick = async () => {
  vrButton.disabled = true;
  try { await xr.enter(); resume(); } catch {
    show('<h2>VR could not start</h2><p>Open the game directly in Quest Browser and try again.</p><button id="vr-close">Close</button>');
    document.getElementById('vr-close').onclick = () => dialog.close();
  } finally { vrButton.disabled = false; }
};
function frame(time) {
  const dt = Math.min((time - previous) / 1000, 0.05);
  previous = time;
  if (renderer.xr.isPresenting) {
    glove.visible = false;
    xr.update(dt);
    renderer.render(scene, camera);
    return;
  }
  glove.visible = true;
  gloveReach = Math.max(0, gloveReach - dt * 2.8);
  glove.position.set(0.30 - gloveReach * 0.12, -0.32 + gloveReach * 0.08, -0.52 - gloveReach * 0.17);
  glove.rotation.x = -0.28 - gloveReach * 0.6;
  if (inMenu) {
    if (preferences.moonSpin) menuMoon.rotation.y += dt * 0.20;
    renderer.render(menuScene, menuCamera);
    return;
  }
  if (playing && !dialog.open) {
    let forward =
        Number(keys.has("KeyW") || keys.has("ArrowUp")) -
        Number(keys.has("KeyS") || keys.has("ArrowDown")),
      right =
        Number(keys.has("KeyD") || keys.has("ArrowRight")) -
        Number(keys.has("KeyA") || keys.has("ArrowLeft"));
    const length = Math.hypot(forward, right) || 1;
    forward /= length;
    right /= length;
    const speed = keys.has("ShiftLeft") ? 7 : 4.5;
    const dx = (right * Math.cos(yaw) - forward * Math.sin(yaw)) * speed * dt,
      dz = (-forward * Math.cos(yaw) - right * Math.sin(yaw)) * speed * dt;
    if (clearAt(player.x + dx, player.z)) player.x += dx;
    if (clearAt(player.x, player.z + dz)) player.z += dz;
    velocity -= 1.62 * dt;
    jumpY = Math.max(0, Math.min(1.1, jumpY + velocity * dt));
    if (jumpY === 0) velocity = 0;
  }
  camera.position.set(player.x, player.y + jumpY, player.z);
  camera.rotation.set(pitch, yaw, 0, "YXZ");
  arrow.position.y = preferences.reducedMotion
    ? 3
    : 2.6 + Math.sin(time * 0.003) * 0.12;
  crew.forEach(
    (p, i) =>
      (p.rotation.y = preferences.reducedMotion
        ? i
        : Math.sin(time * 0.0003 + i) * 0.3 + i),
  );
  const s = stations[Math.min(state.day, 6)],
    distance = Math.hypot(s.x - player.x, s.z - player.z);
  near = distance < 3.4;
  const bearing = Math.atan2(s.x - player.x, -(s.z - player.z)),
    relative = Math.atan2(Math.sin(bearing + yaw), Math.cos(bearing + yaw));
  const direction =
    Math.abs(relative) < 0.35
      ? "Ahead"
      : Math.abs(relative) > 2.5
        ? "Behind you"
        : relative > 0
          ? "To your right"
          : "To your left";
  document.getElementById("objective").innerHTML =
    `<span class="kicker">${state.day < 2 ? "SECURE THE LANDER" : state.day < 5 ? "KEEP THE CREW SAFE" : "BRING OUR WORK HOME"}</span><h2>${state.ended ? "Mission complete" : briefings[state.day].title}</h2><p>${state.ended ? "Open your mission report." : `Go to ${s.name} · ${Math.round(distance)} m · ${direction}`}</p><p class="objective-hint">${near ? "Press E or Interact to decide." : "Walk to the amber beacon or use Remote assist."}</p>`;
  document.getElementById("prompt").textContent = state.ended
    ? "Mission complete · E to view report"
    : near
      ? `E / Interact · ${s.name}`
      : "";
  document.getElementById("interact").disabled = !state.ended && !near;
  renderer.render(scene, camera);
}
createCompanion(()=>state,show,resume);
const restored=loadMission(initial,decide);
if(restored){state=restored;missionStarted=true;}
hud();
applyPreferences();
titleScreen();
renderer.setAnimationLoop(frame);
