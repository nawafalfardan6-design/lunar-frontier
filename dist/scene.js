// scene.js: the Three.js stage.
// Owns the renderer, cameras, sunlight, materials and the mesh helpers
// box()/mesh()/mat()/obstacle(), and assembles the world in a fixed order:
// title Moon, terrain and sky (landscape.js), ship interior (ship.js), crew figures,
// amber objective beacon, route trail (navigation.js) and first-person gloves.
// Also owns per-frame scene animation (sky follow, crew idle, gloves, title Moon spin).
import * as T from "./vendor/three.module.js";
import { surfaceTexture } from "./surfaces.js";
import { buildShip } from "./ship.js";
import { createGuidance } from "./navigation.js";
import { astronautGlove } from "./xr.js";
import { buildMenuScene, buildTerrain, buildSky } from "./landscape.js";

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
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  return renderer;
}

function addSunlight(scene) {
  scene.add(new T.HemisphereLight(0xdde6ef, 0x272b30, 1.2));
  const sun = new T.DirectionalLight(0xffffff, 2.4);
  sun.position.set(17, 10, -41);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 65, bottom: -65, far: 160 });
  sun.shadow.bias = -0.001;
  scene.add(sun);
}

// Shared building blocks. ship.js receives box, mesh, mat and obstacle.
function createHelpers(scene, obstacles) {
  const panelTexture = surfaceTexture("panel");
  const materials = new Map();
  function mat(color) {
    if (!materials.has(color))
      materials.set(
        color,
        new T.MeshStandardMaterial({
          color,
          map: panelTexture,
          bumpMap: panelTexture,
          bumpScale: 0.006,
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
  // Registers a walk-blocking rectangle (with player clearance) for collision.
  function obstacle(x, z, w, d) {
    obstacles.push({ x, z, w: w / 2 + 0.45, d: d / 2 + 0.45 });
  }
  // Text sign on a plane. Currently unused, kept for future labels.
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
    mesh(new T.PlaneGeometry(7, 1.16), new T.MeshBasicMaterial({ map: texture }), x, y, z);
  }
  return { mat, mesh, box, obstacle, sign };
}

// A standing crew member in a white suit; userData.arms is animated each frame.
function astronaut({ mesh, box, mat }, scene, x, z, color) {
  const g = new T.Group();
  g.userData.arms = [];
  g.position.set(x, 0, z);
  scene.add(g);
  mesh(new T.CapsuleGeometry(0.32, 0.4, 8, 16), mat(0xe2e7e9), 0, 1.2, 0, g);
  box(0.55, 0.65, 0.4, 0x6c8492, 0, 1.2, -0.4, g);
  mesh(new T.SphereGeometry(0.36, 32, 24), mat(0xe9e8dc), 0, 1.9, 0, g);
  mesh(
    new T.SphereGeometry(0.3, 32, 24),
    new T.MeshStandardMaterial({ color: 0x252a32, metalness: 0.8, roughness: 0.13 }),
    0,
    1.91,
    0.2,
    g,
  ).scale.z = 0.6;
  for (const side of [-1, 1]) {
    mesh(new T.CapsuleGeometry(0.13, 0.48, 6, 12), mat(0xd8dfe3), side * 0.2, 0.42, 0, g);
    const arm = mesh(
      new T.CapsuleGeometry(0.12, 0.5, 6, 12),
      mat(0xd8dfe3),
      side * 0.45,
      1.1,
      0,
      g,
    );
    g.userData.arms.push(arm);
  }
  box(0.5, 0.16, 0.53, color, 0, 1.2, 0, g);
  return g;
}

// Amber ring and floating arrow over the current day's terminal.
function buildBeacon(scene, mesh) {
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
  return { beacon, arrow };
}

// First-person gloves with sleeves, attached to the camera.
function createGloves(camera) {
  const glove = astronautGlove();
  camera.add(glove);
  const leftGlove = astronautGlove();
  camera.add(leftGlove);
  leftGlove.scale.x = -1;
  for (const hand of [glove, leftGlove]) {
    const sleeve = new T.Mesh(
      new T.CapsuleGeometry(0.055, 0.22, 6, 16),
      new T.MeshStandardMaterial({ color: 0xdce1e7, roughness: 0.85 }),
    );
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
  scene.background = new T.Color(0x010204);
  // No atmospheric haze on the Moon.
  const camera = new T.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 650);
  const { menuScene, menuCamera, menuMoon } = buildMenuScene();
  camera.rotation.order = "YXZ";
  addSunlight(scene);
  const helpers = createHelpers(scene, obstacles);
  const { mesh, box, mat, obstacle } = helpers;
  buildTerrain(mesh);
  const { sky, earth } = buildSky(scene, menuScene, mesh);
  const skyAnchor = new T.Vector3();
  const animateShip = buildShip(scene, box, mesh, mat, obstacle);
  const crew = [
    astronaut(helpers, scene, -6, -10, 0xffbd65),
    astronaut(helpers, scene, 6, 10, 0x99d88c),
    astronaut(helpers, scene, 6, 2, 0x86c3df),
  ];
  const { beacon, arrow } = buildBeacon(scene, mesh);
  const guidance = createGuidance(scene, clearAt);
  const { glove, leftGlove } = createGloves(camera);

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    menuCamera.aspect = innerWidth / innerHeight;
    menuCamera.updateProjectionMatrix();
    menuMoon.position.set(innerWidth < 700 ? 0.9 : 3.2, innerWidth < 700 ? 1.6 : 0, 0);
    menuMoon.scale.setScalar(innerWidth < 700 ? 0.75 : 1);
  }

  return {
    renderer,
    scene,
    camera,
    guidance,
    resize,
    // Graphics quality setting: pixel ratio and shadows.
    applyQuality(quality) {
      renderer.setPixelRatio(quality === "low" ? 1 : Math.min(devicePixelRatio, 1.7));
      renderer.shadowMap.enabled = quality === "high";
      resize();
    },
    placeBeacon(station) {
      beacon.position.set(station.x, 0, station.z);
    },
    // Start of every frame: sky follows the viewer; ship systems, Earth and crew idle.
    animateBackdrop(time, dt, motion) {
      camera.getWorldPosition(skyAnchor);
      sky.position.copy(skyAnchor);
      animateShip(time * 0.001, motion);
      if (motion) earth.rotation.y += dt * 0.003;
      crew.forEach((person, i) => {
        person.position.y = motion ? Math.sin(time * 0.0015 + i) * 0.012 : 0;
        person.userData.arms.forEach((arm, j) => {
          arm.rotation.x = motion ? -0.15 + Math.sin(time * 0.0008 + i + j) * 0.14 : 0;
          arm.rotation.z = (j ? 1 : -1) * 0.06;
        });
      });
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
      crew.forEach(
        (p, i) => (p.rotation.y = reducedMotion ? i : Math.sin(time * 0.0003 + i) * 0.3 + i),
      );
    },
    render() {
      renderer.render(scene, camera);
    },
  };
}
