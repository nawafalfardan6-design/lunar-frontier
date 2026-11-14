// landscape.js: the Moon outside the ship and the title-screen Moon.
// Owns the seeded terrain, scattered rocks, distant crater rim, starfield,
// Earth, Sun and halo, plus the rotating cratered Moon on the title screen.
// scene.js calls these builders once, in a fixed order (see random() below).
import * as T from "./vendor/three.module.js";
import { surfaceTexture } from "./surfaces.js";

// Seeded random numbers keep terrain, rocks and stars identical on every visit.
// The call order below matters: changing it reshuffles the whole landscape.
let seed = 7421;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

// Title screen: a slowly rotating cratered Moon.
export function buildMenuScene() {
  const menuScene = new T.Scene();
  menuScene.background = new T.Color(0x05080c);
  const menuCamera = new T.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 600);
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
    const direction = new T.Vector3().fromBufferAttribute(moonVertices, i).normalize();
    let depth = 0;
    for (const crater of craterCenters) {
      const distance = direction.distanceTo(crater.center) / crater.radius;
      if (distance < 1) depth -= 0.035 * (1 - distance * distance);
      if (distance >= 0.85 && distance < 1.2)
        depth += 0.012 * Math.sin(((distance - 0.85) / 0.35) * Math.PI);
    }
    const variation =
      Math.sin(direction.x * 9 + direction.z * 3) * Math.cos(direction.y * 8) * 0.035;
    moonVertices.setXYZ(
      i,
      direction.x * (3.6 + depth),
      direction.y * (3.6 + depth),
      direction.z * (3.6 + depth),
    );
    const color = new T.Color().setHSL(0, 0, 0.57 + variation + depth * 0.8);
    moonColors.push(color.r, color.g, color.b);
  }
  moonGeometry.setAttribute("color", new T.Float32BufferAttribute(moonColors, 3));
  moonGeometry.computeVertexNormals();
  const lunarTexture = surfaceTexture("moon");
  const menuMoon = new T.Mesh(
    moonGeometry,
    new T.MeshStandardMaterial({
      vertexColors: true,
      map: lunarTexture,
      bumpMap: lunarTexture,
      bumpScale: 0.035,
      roughness: 1,
      flatShading: false,
    }),
  );
  menuMoon.position.x = 3.2;
  menuScene.add(menuMoon);
  return { menuScene, menuCamera, menuMoon };
}

// Ground plane (flat near the lander), scattered rocks and the distant crater rim.
export function buildTerrain(mesh) {
  const terrain = new T.PlaneGeometry(500, 500, 150, 150);
  terrain.rotateX(-Math.PI / 2);
  const positions = terrain.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      z = positions.getZ(i);
    positions.setY(
      i,
      Math.hypot(x, z) < 60
        ? -0.06
        : Math.sin(x * 0.041) * Math.cos(z * 0.037) * 1.2 + Math.sin(x * 0.14 + z * 0.09) * 0.35,
    );
  }
  terrain.computeVertexNormals();
  const ground = terrain.toNonIndexed();
  const groundColors = [];
  for (let i = 0; i < ground.attributes.position.count; i += 3) {
    const shade = new T.Color().setHSL(0, 0, 0.43 + random() * 0.012);
    for (let vertex = 0; vertex < 3; vertex++) groundColors.push(shade.r, shade.g, shade.b);
  }
  ground.setAttribute("color", new T.Float32BufferAttribute(groundColors, 3));
  mesh(
    ground,
    new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: false }),
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
      new T.MeshStandardMaterial({ color: 0x777779, roughness: 1 }),
      x,
      size * 0.2,
      z,
    );
    rock.scale.y = 0.55;
    rock.rotation.set(random(), random() * 6, random());
  }
  const ridgeMaterial = new T.MeshStandardMaterial({ color: 0x66676a, roughness: 1 });
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2,
      geo = new T.SphereGeometry(1, 40, 24),
      vertices = geo.attributes.position;
    for (let j = 0; j < vertices.count; j++) {
      const x = vertices.getX(j),
        y = vertices.getY(j),
        z = vertices.getZ(j);
      const erosion = 1 + 0.12 * Math.sin(x * 13 + z * 7 + i) + 0.07 * Math.sin(z * 21 - y * 9);
      vertices.setXYZ(j, x * erosion, y * (0.8 + 0.15 * Math.sin(x * 8 + z * 11 + i)), z * erosion);
    }
    geo.computeVertexNormals();
    const hill = mesh(geo, ridgeMaterial, Math.sin(a) * 210, -10, Math.cos(a) * 210);
    hill.scale.set(40 + random() * 30, 15 + random() * 15, 35 + random() * 25);
  }
}

// Stars, Earth and Sun. The sky group follows the viewer every frame (no parallax).
export function buildSky(scene, menuScene, mesh) {
  const sky = new T.Group();
  scene.add(sky);
  const stars = new Float32Array(12000);
  for (let i = 0; i < stars.length; i += 3) {
    const a = random() * 6.28,
      h = random(),
      r = 520;
    stars[i] = Math.cos(a) * Math.sqrt(1 - h * h) * r;
    stars[i + 1] = h * r;
    stars[i + 2] = Math.sin(a) * Math.sqrt(1 - h * h) * r;
  }
  const starGeo = new T.BufferGeometry();
  starGeo.setAttribute("position", new T.BufferAttribute(stars, 3));
  const starfield = new T.Points(
    starGeo,
    new T.PointsMaterial({
      color: 0xe6f0ff,
      size: 1.8,
      sizeAttenuation: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  starfield.renderOrder = -1000;
  sky.add(starfield);
  const brightStarGeo = new T.BufferGeometry();
  brightStarGeo.setAttribute("position", new T.BufferAttribute(stars.slice(0, 540), 3));
  const brightStars = new T.Points(
    brightStarGeo,
    new T.PointsMaterial({
      color: 0xffffff,
      size: 2.8,
      sizeAttenuation: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  brightStars.renderOrder = -1000;
  sky.add(brightStars);
  // A full backdrop keeps stars visible at both desktop and phone aspect ratios.
  const titleStars = new Float32Array(1500);
  for (let i = 0; i < titleStars.length; i += 3) {
    titleStars[i] = (random() - 0.5) * 95;
    titleStars[i + 1] = (random() - 0.5) * 50;
    titleStars[i + 2] = -35 - random() * 15;
  }
  const titleStarGeometry = new T.BufferGeometry();
  titleStarGeometry.setAttribute("position", new T.BufferAttribute(titleStars, 3));
  menuScene.add(
    new T.Points(
      titleStarGeometry,
      new T.PointsMaterial({
        color: 0xd8e9f7,
        size: 1.6,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.85,
      }),
    ),
  );
  const earthCanvas = document.createElement("canvas");
  earthCanvas.width = 1024;
  earthCanvas.height = 512;
  const earthCtx = earthCanvas.getContext("2d");
  earthCtx.fillStyle = "#155c96";
  earthCtx.fillRect(0, 0, 1024, 512);
  // Approximate continent silhouettes and cloud bands on a spherical globe.
  // prettier-ignore
  const continents = [
    [[130, 100], [250, 65], [330, 130], [260, 210], [220, 250], [160, 180]],
    [[270, 240], [350, 270], [370, 330], [310, 440], [280, 370]],
    [[470, 150], [550, 160], [600, 250], [555, 340], [500, 270]],
    [[510, 115], [610, 70], [800, 100], [880, 190], [740, 240], [650, 180]],
    [[800, 340], [885, 315], [920, 375], [850, 400]],
  ];
  earthCtx.fillStyle = "#789071";
  for (const points of continents) {
    earthCtx.beginPath();
    points.forEach(([x, y], i) => (i ? earthCtx.lineTo(x, y) : earthCtx.moveTo(x, y)));
    earthCtx.closePath();
    earthCtx.fill();
  }
  for (let i = 0; i < 220; i++) {
    earthCtx.fillStyle = `rgba(244,249,255,${0.12 + random() * 0.25})`;
    earthCtx.beginPath();
    earthCtx.ellipse(
      random() * 1024,
      random() * 512,
      15 + random() * 65,
      2 + random() * 10,
      -0.3,
      0,
      Math.PI * 2,
    );
    earthCtx.fill();
  }
  const earthTexture = new T.CanvasTexture(earthCanvas);
  earthTexture.colorSpace = T.SRGBColorSpace;
  const earth = mesh(
    new T.SphereGeometry(14, 64, 48),
    new T.MeshStandardMaterial({
      map: earthTexture,
      roughness: 0.8,
      emissiveMap: earthTexture,
      emissive: 0xffffff,
      emissiveIntensity: 0.25,
      depthWrite: false,
    }),
    -90,
    140,
    -440,
  );
  earth.rotation.y = -1.6;
  const atmosphere = mesh(
    new T.SphereGeometry(14.25, 64, 48),
    new T.MeshBasicMaterial({
      color: 0x6dbfff,
      transparent: true,
      opacity: 0.12,
      side: T.BackSide,
      depthWrite: false,
    }),
    0,
    0,
    0,
    earth,
  );
  sky.add(earth);
  earth.renderOrder = -999;
  earth.castShadow = false;
  earth.receiveShadow = false;
  atmosphere.renderOrder = -998;
  // Sky objects follow the viewer: no nearby-object parallax or motion through terrain.
  const solarDisc = new T.Mesh(
    new T.SphereGeometry(2.3, 32, 24),
    new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, depthWrite: false }),
  );
  solarDisc.position.set(170, 100, -410);
  solarDisc.renderOrder = -999;
  sky.add(solarDisc);
  const haloCanvas = document.createElement("canvas");
  haloCanvas.width = haloCanvas.height = 128;
  const hc = haloCanvas.getContext("2d");
  const hg = hc.createRadialGradient(64, 64, 2, 64, 64, 64);
  hg.addColorStop(0, "rgba(255,250,225,.85)");
  hg.addColorStop(0.15, "rgba(255,244,214,.3)");
  hg.addColorStop(1, "rgba(255,244,214,0)");
  hc.fillStyle = hg;
  hc.fillRect(0, 0, 128, 128);
  const sunHalo = new T.Sprite(
    new T.SpriteMaterial({
      map: new T.CanvasTexture(haloCanvas),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      blending: T.AdditiveBlending,
    }),
  );
  sunHalo.position.copy(solarDisc.position);
  sunHalo.scale.set(25, 25, 1);
  sunHalo.renderOrder = -998;
  sky.add(sunHalo);
  return { sky, earth };
}
