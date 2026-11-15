// scene.js: the Three.js stage.
// Owns the renderer, cameras, sunlight, cabin reflections, materials and the mesh
// helpers box()/mesh()/mat()/obstacle(), and assembles the world in a fixed order:
// title Moon, terrain and sky (landscape.js), ship interior (ship.js), crew figures,
// amber objective beacon, route trail (navigation.js) and first-person gloves.
// Also owns per-frame scene animation (sky follow, crew idle, gloves, title Moon spin).
// Add ?debug to the page URL to get window.lfDebug (camera override and draw counts).
import * as T from "./vendor/three.module.js";
import { RoomEnvironment } from "./vendor/RoomEnvironment.js";
import { surfaceTexture } from "./surfaces.js";
import { buildShip } from "./ship.js";
import { createGuidance } from "./navigation.js";
import { astronautGlove } from "./xr.js";
import { buildMenuScene, buildTerrain, buildSky, SUN_DIRECTION } from "./landscape.js";

// Look-and-feel constants. Try changing these!
const EXPOSURE = 1.0; // overall brightness after tone mapping
const SUN_COLOR = 0xfff4e6; // raw sunlight: no blue sky in between to filter it
const SUN_INTENSITY = 7; // harsh, like the real Moon
const GROUND_BOUNCE = 0.3; // sunlight bouncing off the bright ground into shadows
const CABIN_FILL = 0.45; // soft light and reflections inside the ship
const PANEL_BUMP = 1.2; // depth of panel seams and fasteners
const TILES_PER_METRE = 1; // wall and floor panels repeat this often
const MAX_PIXEL_RATIO = 1.7; // sharper on high-DPI screens, but slower
const SHADOW_MAP_SIZE = 2048;

function createRenderer(canvas, dialog, modal) {
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas, antialias: true });
  } catch (error) {
    modal.innerHTML =
      '<h1>3D graphics unavailable</h1><p>Enable hardware acceleration in your browser, or play the mission dashboard.</p><a href="mission.html">Open dashboard</a>';
    dialog.showModal();
    throw error;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.shadowMap.enabled = true;
  // Filtered edges; the tight shadow box keeps them sharp (no air on the Moon to blur them).
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  return renderer;
}

// The Sun: one hard directional light whose shadow map is fitted tightly around
// the lander (sharp cabin shadows and the lander's own shadow on the ground).
// Rocks and craters farther out have their shadows baked in (landscape.js).
function addSunlight(scene) {
  const sun = new T.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(50);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  Object.assign(sun.shadow.camera, { left: -19, right: 19, top: 19, bottom: -19, near: 25, far: 95 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  // Black sky above, sunlit dust below: shadows stay deep but not pure black.
  scene.add(new T.HemisphereLight(0x000000, 0xa49d92, GROUND_BOUNCE));
  return sun;
}

// Soft studio-style light and reflections for the cabin's metal and plastic.
// Only MeshStandardMaterial uses it; the Moon's ground and rocks are Lambert.
function addEnvironment(renderer, scene) {
  const pmrem = new T.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  scene.environmentIntensity = CABIN_FILL;
  room.dispose();
  pmrem.dispose();
}

// Box with UVs measured in metres on every face, so panel textures tile at the
// same size on a 19 m floor and a 10 cm rail instead of stretching.
function tiledBox(w, h, d) {
  const geometry = new T.BoxGeometry(w, h, d);
  const uv = geometry.attributes.uv;
  // Face order: +x, -x, +y, -y, +z, -z; four vertices each.
  const faceSize = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let i = 0; i < uv.count; i++) {
    const [su, sv] = faceSize[Math.floor(i / 4)];
    uv.setXY(i, uv.getX(i) * su * TILES_PER_METRE, uv.getY(i) * sv * TILES_PER_METRE);
  }
  return geometry;
}

// Joins [geometry, matrix] pairs (position, normal, uv, index) into one geometry.
function mergeParts(parts) {
  let vertices = 0,
    indices = 0;
  for (const [geometry] of parts) {
    vertices += geometry.attributes.position.count;
    indices += geometry.index.count;
  }
  const position = new Float32Array(vertices * 3),
    normal = new Float32Array(vertices * 3),
    uv = new Float32Array(vertices * 2),
    index = new (vertices > 65535 ? Uint32Array : Uint16Array)(indices);
  const v = new T.Vector3(),
    normalMatrix = new T.Matrix3();
  let vo = 0,
    io = 0;
  for (const [geometry, matrix] of parts) {
    const p = geometry.attributes.position,
      n = geometry.attributes.normal,
      t = geometry.attributes.uv,
      source = geometry.index;
    normalMatrix.getNormalMatrix(matrix);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      position[(vo + i) * 3] = v.x;
      position[(vo + i) * 3 + 1] = v.y;
      position[(vo + i) * 3 + 2] = v.z;
      v.fromBufferAttribute(n, i).applyMatrix3(normalMatrix).normalize();
      normal[(vo + i) * 3] = v.x;
      normal[(vo + i) * 3 + 1] = v.y;
      normal[(vo + i) * 3 + 2] = v.z;
      uv[(vo + i) * 2] = t.getX(i);
      uv[(vo + i) * 2 + 1] = t.getY(i);
    }
    // A mirrored part would turn inside out; flip its triangles back.
    const flip = matrix.determinant() < 0;
    for (let i = 0; i < source.count; i += 3) {
      index[io + i] = source.getX(i) + vo;
      index[io + i + 1] = source.getX(flip ? i + 2 : i + 1) + vo;
      index[io + i + 2] = source.getX(flip ? i + 1 : i + 2) + vo;
    }
    vo += p.count;
    io += source.count;
  }
  const merged = new T.BufferGeometry();
  merged.setAttribute("position", new T.BufferAttribute(position, 3));
  merged.setAttribute("normal", new T.BufferAttribute(normal, 3));
  merged.setAttribute("uv", new T.BufferAttribute(uv, 2));
  merged.setIndex(new T.BufferAttribute(index, 1));
  merged.computeBoundingSphere();
  return merged;
}

// Joins every static mesh under root that shares a material and shadow settings
// into one mesh: hundreds of draw calls become a few dozen (twice as many in VR).
// Meshes (or their parents) tagged userData.dynamic are left alone.
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const toRoot = new T.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  root.traverse((object) => {
    if (!object.isMesh || object.isInstancedMesh) return;
    for (let o = object; o && o !== root; o = o.parent) if (o.userData.dynamic) return;
    const { attributes, index } = object.geometry;
    if (!index || !attributes.normal || !attributes.uv || Object.keys(attributes).length !== 3)
      return;
    const key = `${object.material.uuid}|${object.castShadow}|${object.receiveShadow}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(object);
  });
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const parts = list.map((m) => [m.geometry, new T.Matrix4().multiplyMatrices(toRoot, m.matrixWorld)]);
    const merged = new T.Mesh(mergeParts(parts), list[0].material);
    merged.castShadow = list[0].castShadow;
    merged.receiveShadow = list[0].receiveShadow;
    for (const m of list) m.removeFromParent();
    root.add(merged);
  }
}

// Shared building blocks. ship.js receives box, mesh, mat, obstacle and mergeParts.
function createHelpers(root, obstacles) {
  const panel = { map: surfaceTexture("panel"), bumpMap: surfaceTexture("panel-bump") };
  const floor = { map: surfaceTexture("floor"), bumpMap: surfaceTexture("floor-bump") };
  const materials = new Map(),
    boxes = new Map();
  // One shared material per colour and look.
  // surface: "panel" (wall panels), "floor" (deck plates) or "plain" (no texture);
  // glow: 0..1, how much the colour lights itself (station accents).
  function mat(color, { surface = "panel", roughness = 0.6, metalness = 0.15, glow = 0 } = {}) {
    const key = `${color}|${surface}|${roughness}|${metalness}|${glow}`;
    if (!materials.has(key)) {
      const material = new T.MeshStandardMaterial({ color, roughness, metalness });
      const maps = surface === "panel" ? panel : surface === "floor" ? floor : null;
      if (maps) Object.assign(material, maps, { bumpScale: PANEL_BUMP });
      if (glow) {
        material.emissive.set(color);
        material.emissiveIntensity = glow;
      }
      materials.set(key, material);
    }
    return materials.get(key);
  }
  // Details receive shadows but do not cast them; callers opt in for big parts.
  function mesh(geometry, material, x, y, z, parent = root) {
    const m = new T.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  // color may be a hex colour or a material from mat(). Big, solid boxes cast
  // shadows; thin plates and small parts do not (options.cast overrides).
  function box(w, h, d, color, x, y, z, parent = root, options = {}) {
    const key = `${w}|${h}|${d}`;
    if (!boxes.has(key)) boxes.set(key, tiledBox(w, h, d));
    const m = mesh(boxes.get(key), color.isMaterial ? color : mat(color), x, y, z, parent);
    m.castShadow =
      options.cast ?? (Math.max(w, h, d) >= 1 && Math.min(w, h, d) >= 0.08 && w * h * d >= 0.1);
    return m;
  }
  // Registers a walk-blocking rectangle (with player clearance) for collision.
  // controls.js relies on the 0.45 padding here; keep it in sync.
  function obstacle(x, z, w, d) {
    obstacles.push({ x, z, w: w / 2 + 0.45, d: d / 2 + 0.45 });
  }
  return { scene: root, mat, mesh, box, obstacle, mergeParts };
}

// A standing crew member in a white suit; userData.arms is animated each frame.
function astronaut({ mesh, box, mat }, scene, x, z, color) {
  const g = new T.Group();
  g.userData.arms = [];
  g.position.set(x, 0, z);
  scene.add(g);
  const suit = mat(0xe2e7e9, { surface: "plain", roughness: 0.8, metalness: 0 });
  const limbs = mat(0xd8dfe3, { surface: "plain", roughness: 0.8, metalness: 0 });
  mesh(new T.CapsuleGeometry(0.32, 0.4, 8, 16), suit, 0, 1.2, 0, g);
  box(0.55, 0.65, 0.4, mat(0x6c8492, { surface: "plain" }), 0, 1.2, -0.4, g);
  mesh(new T.SphereGeometry(0.36, 32, 24), mat(0xe9e8dc, { surface: "plain", roughness: 0.5 }), 0, 1.9, 0, g);
  mesh(
    new T.SphereGeometry(0.3, 32, 24),
    mat(0x2a2f38, { surface: "plain", roughness: 0.1, metalness: 0.9 }),
    0,
    1.91,
    0.2,
    g,
  ).scale.z = 0.6;
  for (const side of [-1, 1]) {
    mesh(new T.CapsuleGeometry(0.13, 0.48, 6, 12), limbs, side * 0.2, 0.42, 0, g);
    const arm = mesh(new T.CapsuleGeometry(0.12, 0.5, 6, 12), limbs, side * 0.45, 1.1, 0, g);
    g.userData.arms.push(arm);
  }
  box(0.5, 0.16, 0.53, mat(color, { surface: "plain" }), 0, 1.2, 0, g);
  // People are big and important: they cast shadows.
  g.traverse((part) => (part.castShadow = part.isMesh));
  return g;
}

// Amber ring and floating arrow over the current day's terminal.
function buildBeacon(scene, mesh) {
  const beacon = new T.Group();
  scene.add(beacon);
  const amber = new T.MeshBasicMaterial({ color: 0xffc679 });
  const ring = mesh(new T.TorusGeometry(0.9, 0.055, 8, 48), amber, 0, 0.09, 0, beacon);
  ring.rotation.x = Math.PI / 2;
  const arrow = mesh(new T.ConeGeometry(0.3, 0.6, 4), amber, 0, 3, 0, beacon);
  arrow.rotation.z = Math.PI;
  return { beacon, arrow };
}

// First-person gloves with sleeves, attached to the camera.
function createGloves(camera) {
  const glove = astronautGlove();
  camera.add(glove);
  const leftGlove = astronautGlove();
  camera.add(leftGlove);
  leftGlove.scale.x = -1;
  const sleeveGeometry = new T.CapsuleGeometry(0.055, 0.22, 6, 16);
  const sleeveMaterial = new T.MeshStandardMaterial({ color: 0xdce1e7, roughness: 0.85 });
  for (const hand of [glove, leftGlove]) {
    const sleeve = new T.Mesh(sleeveGeometry, sleeveMaterial);
    sleeve.rotation.x = Math.PI / 2;
    sleeve.position.set(0, -0.018, 0.21);
    hand.add(sleeve);
    hand.scale.multiplyScalar(1.35);
  }
  return { glove, leftGlove };
}

// Builds the whole stage. Needs ctx.canvas, ctx.dialog, ctx.modal (for the
// no-WebGL message), ctx.obstacles (filled by obstacle()) and ctx.clearAt (route trail).
export function createScene({ canvas, dialog, modal, obstacles, clearAt }) {
  const renderer = createRenderer(canvas, dialog, modal);
  const scene = new T.Scene();
  // Black sky even in daytime: the Moon has no air to scatter sunlight.
  scene.background = new T.Color(0x000000);
  const camera = new T.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 650);
  const menu = buildMenuScene();
  const { menuScene, menuCamera, menuMoon } = menu;
  camera.rotation.order = "YXZ";
  const sun = addSunlight(scene);
  addEnvironment(renderer, scene);
  buildTerrain(scene);
  const backdrop = buildSky(scene);
  const { sky, earth } = backdrop;
  const starMaterials = [...menu.starMaterials, ...backdrop.starMaterials];
  // The ship is built into its own group, then its static parts are merged.
  const shipRoot = new T.Group();
  scene.add(shipRoot);
  const shipHelpers = createHelpers(shipRoot, obstacles);
  const animateShip = buildShip(shipHelpers);
  const hatch = shipRoot.getObjectByName('eva-hatch');
  let hatchOpen = false;
  mergeStatic(shipRoot);
  const helpers = createHelpers(scene, obstacles);
  const { mesh } = helpers;
  const crew = [
    astronaut(helpers, scene, -6, -10, 0xffbd65),
    astronaut(helpers, scene, 6, 10, 0x99d88c),
    astronaut(helpers, scene, 6, 2, 0x86c3df),
  ];
  const { beacon, arrow } = buildBeacon(scene, mesh);
  const guidance = createGuidance(scene, clearAt);
  const { glove, leftGlove } = createGloves(camera);
  const skyAnchor = new T.Vector3();

  // ?debug: window.lfDebug.view = {x, y, z, yaw, pitch} overrides the camera, and
  // renderer.info then counts the shadow pass too.
  const debug = /(^|[?&])debug\b/.test(location.search)
    ? { view: null, renderer, scene, camera, menuScene }
    : null;
  if (debug) window.lfDebug = debug;

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    menuCamera.aspect = innerWidth / innerHeight;
    menuCamera.updateProjectionMatrix();
    menuMoon.position.set(innerWidth < 700 ? 0.9 : 3.2, innerWidth < 700 ? 1.6 : 0, 0);
    menuMoon.scale.setScalar(innerWidth < 700 ? 0.75 : 1);
    for (const material of starMaterials)
      material.uniforms.pixelRatio.value = renderer.getPixelRatio();
  }

  return {
    renderer,
    setHatch(open) { hatchOpen = open; },
    scene,
    camera,
    guidance,
    resize,
    // Graphics quality setting. Low: no shadows, 1 pixel per CSS pixel.
    // High: sharp shadows and up to MAX_PIXEL_RATIO on high-DPI screens.
    applyQuality(quality) {
      const high = quality !== "low";
      renderer.setPixelRatio(high ? Math.min(devicePixelRatio, MAX_PIXEL_RATIO) : 1);
      if (renderer.shadowMap.enabled !== high) {
        renderer.shadowMap.enabled = high;
        sun.castShadow = high;
        // Shaders are compiled with or without shadows; rebuild them.
        scene.traverse((object) => {
          if (object.material) object.material.needsUpdate = true;
        });
      }
      resize();
    },
    placeBeacon(station) {
      beacon.position.set(station.x, 0, station.z);
    },
    // Scenario sunset, not a lunar ephemeris. Cabin lamps stay on.
    setMissionDay(dayIndex) {
      const sunlight = dailyBudget(dayIndex).sunlight;
      sun.intensity = sunlight ? SUN_INTENSITY : 0;
      backdrop.setSunlight(sunlight);
    },
    // Start of every frame: sky follows the viewer; ship systems, Earth and crew idle.
    animateBackdrop(time, dt, motion) {
      if (hatch) hatch.position.y += ((hatchOpen ? 3.9 : 0) - hatch.position.y) * Math.min(1, dt * 8);
      camera.getWorldPosition(skyAnchor);
      sky.position.copy(skyAnchor);
      animateShip(time * 0.001, motion);
      if (motion) earth.rotation.y += dt * 0.003;
      for (let i = 0; i < crew.length; i++) {
        const person = crew[i];
        person.position.y = motion ? Math.sin(time * 0.0015 + i) * 0.012 : 0;
        const arms = person.userData.arms;
        for (let j = 0; j < arms.length; j++) {
          arms[j].rotation.x = motion ? -0.15 + Math.sin(time * 0.0008 + i + j) * 0.14 : 0;
          arms[j].rotation.z = (j ? 1 : -1) * 0.06;
        }
      }
    },
    hideGloves() {
      glove.visible = false;
      leftGlove.visible = false;
    },
    showGloves() {
      glove.visible = true;
      leftGlove.visible = true;
    },
    // reach: 0..1 interaction poke; walking adds a stronger sway.
    animateGloves(time, reach, motion, walking) {
      const armX = innerWidth < 700 ? 0.17 : 0.25;
      glove.position.set(armX - reach * 0.08, -0.22 + reach * 0.06, -0.48 - reach * 0.15);
      leftGlove.position.set(-armX, -0.22, -0.48);
      leftGlove.rotation.x = -0.22;
      glove.rotation.x = -0.28 - reach * 0.6;
      const sway = motion
        ? Math.sin(time * (walking ? 0.008 : 0.0018)) * (walking ? 0.012 : 0.003)
        : 0;
      glove.position.y += sway;
      leftGlove.position.y -= sway;
      glove.rotation.z = walking ? Math.sin(time * 0.008) * 0.025 : 0;
      leftGlove.rotation.z = -glove.rotation.z;
    },
    renderMenu(dt, moonSpin) {
      if (moonSpin) menuMoon.rotation.y += dt * 0.2;
      renderer.render(menuScene, menuCamera);
    },
    // Beacon arrow bob and crew turning, after the camera has moved.
    animateIdle(time, reducedMotion) {
      arrow.position.y = reducedMotion ? 3 : 2.6 + Math.sin(time * 0.003) * 0.12;
      for (let i = 0; i < crew.length; i++)
        crew[i].rotation.y = reducedMotion ? i : Math.sin(time * 0.0003 + i) * 0.3 + i;
    },
    render() {
      if (debug) {
        const v = debug.view;
        if (v) {
          camera.position.set(v.x, v.y, v.z);
          camera.rotation.set(v.pitch || 0, v.yaw || 0, 0, "YXZ");
        }
        renderer.info.autoReset = false;
        renderer.info.reset();
      }
      renderer.render(scene, camera);
    },
  };
}
