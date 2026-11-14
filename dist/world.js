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
  player = new T.Vector3(0, 1.8, 13),
  obstacles = [];
let inMenu = true;
let missionStarted = false;
const preferences = {
  quality: "high",
  sensitivity: 1,
  reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
};
try {
  const saved = JSON.parse(
    localStorage.getItem("lunar-frontier-settings") || "{}",
  );
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
scene.background = new T.Color(0x201c38);
scene.fog = new T.FogExp2(0x514366, 0.0025);
const camera = new T.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 650);
const menuScene = new T.Scene();
menuScene.background = new T.Color(0x201c38);
const menuCamera = new T.PerspectiveCamera(
  42,
  innerWidth / innerHeight,
  0.1,
  600,
);
menuCamera.position.set(0, 0, 16);
menuScene.add(new T.AmbientLight(0x9a86bc, 0.7));
const moonlight = new T.DirectionalLight(0xffdeb4, 3.4);
moonlight.position.set(-4, 5, 8);
menuScene.add(moonlight);
const moonGeometry = new T.SphereGeometry(3.6, 96, 64);
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
    if (distance < 1) depth -= 0.13 * (1 - distance * distance);
    if (distance >= 0.85 && distance < 1.2)
      depth += 0.045 * Math.sin(((distance - 0.85) / 0.35) * Math.PI);
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
    0.09,
    0.12,
    0.57 + variation + depth * 0.8,
  );
  moonColors.push(color.r, color.g, color.b);
}
moonGeometry.setAttribute("color", new T.Float32BufferAttribute(moonColors, 3));
moonGeometry.computeVertexNormals();
const menuMoon = new T.Mesh(
  moonGeometry,
  new T.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    flatShading: true,
  }),
);
menuMoon.position.x = 3.2;
menuScene.add(menuMoon);
camera.rotation.order = "YXZ";
scene.add(new T.HemisphereLight(0xb9b5ed, 0x594c65, 2.1));
const sun = new T.DirectionalLight(0xffd5a1, 2.6);
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
const materials = new Map();
function mat(color) {
  if (!materials.has(color))
    materials.set(
      color,
      new T.MeshStandardMaterial({
        color,
        roughness: 1,
        metalness: 0,
        flatShading: true,
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
  const shade = new T.Color().setHSL(0.72, 0.1, 0.42 + random() * 0.075);
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
    new T.DodecahedronGeometry(size),
    mat(0x80728d),
    x,
    size * 0.2,
    z,
  );
  rock.scale.y = 0.55;
  rock.rotation.set(random(), random() * 6, random());
}
for (let i = 0; i < 22; i++) {
  const a = (i / 22) * Math.PI * 2;
  mesh(
    new T.ConeGeometry(25 + random() * 20, 20 + random() * 40, 5),
    mat(0x796287),
    Math.sin(a) * 205,
    0,
    Math.cos(a) * 205,
  );
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
menuScene.add(
  new T.Points(starGeo, new T.PointsMaterial({ color: 0xf1ddbd, size: 0.6 })),
);
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
function habitat(x, z, name, color, plants = false) {
  const roof = mesh(
    new T.SphereGeometry(5.5, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2),
    mat(0xf0ddbb),
    x,
    5.3,
    z,
  );
  roof.scale.set(1, 0.4, 0.8);
  box(12, 0.5, 10, 0x37334b, x, 0.25, z);
  box(11, 4.7, 8.5, 0xe1d6bf, x, 2.7, z);
  box(11.5, 0.4, 9, color, x, 5.15, z);
  for (const dx of [-3.5, 3.5]) {
    box(2.7, 1.7, 0.16, 0x122c3f, x + dx, 3.2, z + 4.3);
    box(2.3, 1.3, 0.18, plants ? 0x448c76 : 0x73ada7, x + dx, 3.2, z + 4.4);
  }
  box(2.1, 3.5, 0.35, 0x35334b, x, 2, z + 4.5);
  for (const dx of [-1.15, 1.15])
    box(0.12, 3.3, 0.4, color, x + dx, 2, z + 4.6);
  sign(name, x, 5.9, z + 4.5);
  if (plants) {
    for (let i = -2; i <= 2; i++) {
      box(0.8, 0.6, 0.8, 0x476d59, x + i * 1.7, 5.7, z);
      mesh(new T.ConeGeometry(0.6, 1.8, 7), mat(0x89bf67), x + i * 1.7, 6.6, z);
    }
  } else
    for (const dx of [-4, 4])
      mesh(
        new T.CylinderGeometry(0.65, 0.65, 5, 12),
        mat(0x889ca9),
        x + dx,
        2.7,
        z - 5,
      );
  obstacle(x, z, 12, 10);
}
habitat(0, -12, "LIFE SUPPORT", 0x8edac8);
habitat(-22, -8, "CREW SHELTER", 0xf3c477);
habitat(22, -10, "GREENHOUSE", 0xa8d079, true);
habitat(0, 32, "MISSION CONTROL", 0x9bb8e8);
for (let i = 0; i < 4; i++) {
  const x = -26 + (i % 2) * 8,
    z = 17 + Math.floor(i / 2) * 8;
  box(0.4, 2.3, 0.4, 0xadc0cc, x, 1.1, z);
  const panel = box(6.5, 0.15, 4.5, 0x173a6e, x, 2.5, z);
  panel.rotation.x = -0.35;
  for (let j = -2; j <= 2; j++) {
    const strip = box(0.04, 0.18, 4.4, 0x7c9fc8, x + j * 1.1, 2.5, z);
    strip.rotation.x = -0.35;
  }
  obstacle(x, z, 6.5, 4.5);
}
box(4, 1.4, 3, 0xc3cbd0, 24, 0.7, 11);
obstacle(24, 11, 4, 3);
mesh(new T.CylinderGeometry(0.6, 0.9, 2, 12), mat(0xe6b76a), 24, 2.3, 11);
sign("SCIENCE STATION", 24, 4.5, 11);
mesh(new T.CylinderGeometry(0.5, 1, 5, 12), mat(0xb6c3cd), 21, 2.5, 29);
const dish = mesh(
  new T.SphereGeometry(4, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2),
  new T.MeshStandardMaterial({ color: 0xd4dce1, side: T.DoubleSide }),
  21,
  6,
  29,
);
dish.rotation.x = Math.PI + 0.5;
box(0.12, 4, 0.12, 0x819cae, 21, 6.5, 29);
obstacle(21, 29, 7, 7);
sign("COMMUNICATIONS", 21, 10, 29);
function astronaut(x, z, color) {
  const g = new T.Group();
  g.position.set(x, 0, z);
  scene.add(g);
  box(0.7, 0.8, 0.5, 0xe2e7e9, 0, 1.15, 0, g);
  box(0.55, 0.65, 0.4, 0x6c8492, 0, 1.2, -0.4, g);
  mesh(new T.SphereGeometry(0.4, 16, 12), mat(0xe9e8dc), 0, 1.9, 0, g);
  mesh(
    new T.SphereGeometry(0.32, 16, 12),
    mat(0x322c24),
    0,
    1.91,
    0.2,
    g,
  ).scale.z = 0.6;
  for (const side of [-1, 1]) {
    box(0.25, 0.7, 0.28, 0xd8dfe3, side * 0.23, 0.4, 0, g);
    box(0.23, 0.8, 0.25, 0xd8dfe3, side * 0.53, 1.1, 0, g);
  }
  box(0.5, 0.16, 0.53, color, 0, 1.2, 0, g);
  return g;
}
const crew = [
  astronaut(-4, -5, 0xffbd65),
  astronaut(17, -3, 0x99d88c),
  astronaut(16, 23, 0x86c3df),
];
box(5, 0.04, 47, 0x8f8297, 0, 0, 10);
box(49, 0.04, 4, 0x8f8297, 0, 0.01, 3);
for (let i = -3; i <= 6; i++)
  for (const side of [-1, 1]) {
    box(0.16, 0.7, 0.16, 0x394a57, side * 3, 0.35, i * 5);
    mesh(
      new T.SphereGeometry(0.12, 6, 6),
      new T.MeshBasicMaterial({ color: 0xc3e9ea }),
      side * 3,
      0.75,
      i * 5,
    );
  }
const stations = [
  { name: "Life support", x: 0, z: -5.6 },
  { name: "Crew shelter", x: -22, z: -1.6 },
  { name: "Science station", x: 24, z: 14 },
  { name: "Radiation shelter", x: -22, z: -1.6 },
  { name: "Greenhouse", x: 22, z: -3.6 },
  { name: "Communications", x: 21, z: 34 },
  { name: "Mission control", x: 0, z: 38.4 },
];
for (const i of [0, 1, 2, 4, 5, 6]) {
  const s = stations[i];
  box(0.8, 1.1, 0.6, 0x223c4f, s.x, 0.55, s.z);
  const screen = box(0.85, 0.65, 0.12, 0x7ed5c5, s.x, 1.35, s.z + 0.22);
  screen.material = new T.MeshStandardMaterial({
    color: 0x72d7c2,
    emissive: 0x328f7a,
    emissiveIntensity: 0.8,
  });
}
const beacon = new T.Group();
scene.add(beacon);
const ring = mesh(
  new T.TorusGeometry(1.4, 0.055, 8, 48),
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
  entry.innerHTML = `<div class="entry-panel"><span class="entry-eyebrow">A LITTLE OUTPOST. A BIG ADVENTURE.</span><h1>LUNAR<br><span>FRONTIER</span></h1><p class="entry-tagline">Your mission. Your crew.<br>Your decisions.</p><nav aria-label="Main menu"><button id="start-game">${missionStarted ? "CONTINUE EXPEDITION" : "START EXPEDITION"} <span>↗</span></button><button id="settings">SETTINGS <span>⚙</span></button><button id="how-to">HOW TO PLAY <span>?</span></button></nav><p class="menu-note">4 astronauts · 7 days · One small step at a time</p></div><div class="moon-caption">THE MOON<span>YOUR NEXT FRONTIER</span></div><div class="entry-footer">LUNAR FRONTIER <span>A SPACE EXPLORATION GAME</span></div>`;
  document.getElementById("start-game").onclick = resume;
  document.getElementById("settings").onclick = settingsMenu;
  document.getElementById("how-to").onclick = () => {
    show(
      '<span class="kicker">FIELD GUIDE</span><h2>Welcome, Commander.</h2><p>Walk to the amber marker and interact with its terminal. Each decision advances your seven-day mission and changes power, life support or crew safety.</p><p><b>WASD / arrows</b> — walk<br><b>Drag the mouse</b> — look<br><b>E</b> — use a terminal<br><b>Space</b> — jump<br><b>Shift</b> — walk faster<br><b>Escape</b> — pause</p><p>On touch screens, use the movement buttons and drag the world. Keep the crew safe, transmit research and help the crop experiment reach harvest.</p><button id="menu-back">Back to menu</button>',
    );
    document.getElementById("menu-back").onclick = () => dialog.close();
  };
}
function settingsMenu() {
  show(
    `<span class="kicker">MAKE YOURSELF AT HOME</span><h2>Settings</h2><div class="setting"><label for="quality">Graphics quality</label><select id="quality"><option value="high">High · shadows enabled</option><option value="low">Low · smoother performance</option></select></div><div class="setting"><label for="sensitivity">Look sensitivity <output id="sensitivity-value">${preferences.sensitivity.toFixed(1)}×</output></label><input id="sensitivity" type="range" min="0.4" max="2" step="0.1" value="${preferences.sensitivity}"></div><div class="setting check"><label for="motion">Reduce motion</label><input id="motion" type="checkbox" ${preferences.reducedMotion ? "checked" : ""}></div><p>Reduced motion stops the Moon rotation and decorative animations. Settings save on this device.</p><button id="settings-done">Done</button>`,
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
    `<span class="kicker">MISSION REPORT</span><h1>${outcome(state)}</h1><p>${state.day < 7 ? "A critical system reached zero. Mission control ended the expedition early." : "You completed seven days on the lunar surface."}</p><p>Research transmitted ${state.flags.includes("sent") ? "✓" : "—"} · Crop harvested ${state.flags.includes("food") ? "✓" : "—"}</p>${state.log.map((l) => `<details><summary>Day ${l.day} · ${l.choice}</summary><p>${l.notes.join(" ")}</p></details>`).join("")}<button id="replay">New expedition</button><button class="secondary" id="explore">Keep exploring</button>`,
  );
  document.getElementById("replay").onclick = () => {
    state = initial();
    player.set(0, 1.8, 13);
    yaw = pitch = jumpY = velocity = 0;
    hud();
    resume();
  };
  document.getElementById("explore").onclick = resume;
}
function interact() {
  if (dialog.open || !playing) return;
  gloveReach = 1;
  if (state.ended) {
    report();
    return;
  }
  if (!near) return;
  const day = days[state.day];
  show(
    `<span class="kicker">DAY ${state.day + 1} / ${stations[state.day].name.toUpperCase()}</span><h2>${day.title}</h2><p>${day.story}</p><div class="choices">${day.choices.map((c, i) => `<button class="choice" data-choice="${i}">${c[0]}<span>${c[1]}</span></button>`).join("")}</div><p>Daily essentials use 12 power. Charging restores 14 after Days 1–6. Below 15 power, essential systems struggle.</p><button class="secondary" id="back">Back to exploring</button>`,
  );
  document.getElementById("back").onclick = resume;
  modal.querySelectorAll("[data-choice]").forEach(
    (button) =>
      (button.onclick = () => {
        state = decide(state, Number(button.dataset.choice));
        hud();
        const last = state.log.at(-1);
        show(
          `<span class="kicker">DAY ${last.day} COMPLETE</span><h2>${last.choice}</h2><ul>${last.notes.map((n) => `<li>${n}</li>`).join("")}</ul><aside><h3>Why this matters in real life</h3><p>${last.why}</p></aside><button id="continue">${state.ended ? "View report" : "Explore day " + (state.day + 1)} →</button>`,
        );
        document.getElementById("continue").onclick = state.ended
          ? report
          : resume;
      }),
  );
}
document.getElementById("interact").onclick = interact;
document.getElementById("help").onclick = () => {
  show(
    '<h2>Explore the outpost</h2><p>WASD or arrow keys move. Drag the mouse to look. E interacts near the amber marker. Space jumps. Shift moves faster. Escape pauses. Touch screens have movement buttons.</p><h3>Mission science</h3><p>Each turn represents one Earth day. Resource points, events and solar charging are simplified game rules. This is an illustrative outpost. Packaged meals sustain the crew while an existing crop experiment grows.</p><p><a href="https://pds.nasa.gov/ds-view/pds/viewProfile.jsp?dsid=LRO-L-DLRE-5-GCP-V1.0" target="_blank" rel="noopener">NASA Diviner</a> · <a href="https://www.nasa.gov/reference/environmental-control-and-life-support-systems-eclss/" target="_blank" rel="noopener">Life support</a> · <a href="https://www.nasa.gov/reference/crew-systems/" target="_blank" rel="noopener">Crew protection</a> · <a href="https://www.nasa.gov/exploration-research-and-technology/growing-plants-in-space/" target="_blank" rel="noopener">Growing food</a></p><p>NASA science explanations are included. Numerical NASA measurements are still pending integration.</p><button id="return">Return to surface</button>',
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
function clearAt(x, z) {
  return (
    Math.abs(x) < 55 &&
    Math.abs(z) < 55 &&
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
    if (!preferences.reducedMotion) menuMoon.rotation.y += dt * 0.045;
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
    jumpY = Math.max(0, jumpY + velocity * dt);
    if (jumpY === 0) velocity = 0;
  }
  camera.position.set(player.x, player.y + jumpY, player.z);
  camera.rotation.set(pitch, yaw, 0, "YXZ");
  arrow.position.y = preferences.reducedMotion
    ? 3
    : 3 + Math.sin(time * 0.003) * 0.2;
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
    `<span class="kicker">CURRENT OBJECTIVE</span><h2>${state.ended ? "Mission complete" : days[state.day].title}</h2><p>${state.ended ? "Explore freely. Interact to review your mission." : `${s.name} · ${Math.round(distance)} m · ${direction}. Follow the amber marker.`}</p>`;
  document.getElementById("prompt").textContent = state.ended
    ? "Mission complete · E to view report"
    : near
      ? `E / Interact · ${s.name}`
      : "";
  document.getElementById("interact").disabled = !state.ended && !near;
  renderer.render(scene, camera);
}
hud();
applyPreferences();
titleScreen();
renderer.setAnimationLoop(frame);
