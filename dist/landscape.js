// landscape.js: the Moon outside the ship and the title-screen Moon.
// Owns the Sun's direction, the seeded terrain (craters, hills, the far crater rim),
// instanced rocks and their shadows, the starfield, Earth and the Sun, plus the
// rotating Moon on the title screen. scene.js calls these builders once, in a fixed
// order (see random() below).
import * as T from "./vendor/three.module.js";
import { surfaceTexture, moonGlobe } from "./surfaces.js";

// Where the Sun is in the lunar sky, in degrees. Azimuth 0 = straight out of the
// front windows, positive = to the right. A low Sun gives long black shadows,
// like the Apollo landings. scene.js aims the sunlight from here.
export const SUN_AZIMUTH = 50;
export const SUN_ELEVATION = 24;
const azimuth = T.MathUtils.degToRad(SUN_AZIMUTH),
  elevation = T.MathUtils.degToRad(SUN_ELEVATION);
export const SUN_DIRECTION = new T.Vector3(
  Math.cos(elevation) * Math.sin(azimuth),
  Math.sin(elevation),
  -Math.cos(elevation) * Math.cos(azimuth),
);

// Ground colour and look. Try changing these!
const GROUND_TINT = 0xc9c6c1; // regolith is a very slightly warm grey
const ROCK_TINT = 0xa39e97;
const SHADOW_FLOOR = 0.07; // how much light is left inside crater shadows (0 = black)
const TEXTURE_METRES = 8; // one regolith texture tile covers this many metres

// Seeded random numbers keep terrain, rocks and stars identical on every visit.
// The call order below matters: changing it reshuffles the whole landscape.
let seed = 7421;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}

// Smooth value noise (about -1..1) for natural-looking bumps.
function hash(ix, iz) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + 1442695041;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x, z) {
  const ix = Math.floor(x),
    iz = Math.floor(z);
  const fx = x - ix,
    fz = z - iz;
  const u = fx * fx * (3 - 2 * fx),
    v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz),
    b = hash(ix + 1, iz),
    c = hash(ix, iz + 1),
    d = hash(ix + 1, iz + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
function fbm(x, z, octaves) {
  let sum = 0,
    amplitude = 0.5;
  for (let i = 0; i < octaves; i++) {
    sum += amplitude * noise(x, z);
    x = x * 2.03 + 17.1;
    z = z * 2.03 - 9.7;
    amplitude *= 0.5;
  }
  return sum;
}
function smooth(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Round starfield: one draw call, each star with its own size and colour.
// Stars do not twinkle here: twinkling is caused by air, and space has none.
function starPoints(positions, colors, sizes) {
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.BufferAttribute(positions, 3));
  geometry.setAttribute("starColor", new T.BufferAttribute(colors, 3));
  geometry.setAttribute("starSize", new T.BufferAttribute(sizes, 1));
  const material = new T.ShaderMaterial({
    uniforms: { pixelRatio: { value: 1 } },
    vertexShader: `
      attribute vec3 starColor;
      attribute float starSize;
      uniform float pixelRatio;
      varying vec3 vColor;
      void main() {
        vColor = starColor;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = starSize * pixelRatio;
      }`,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float glow = exp(-dot(p, p) * 22.0);
        if (glow < 0.03) discard;
        gl_FragColor = vec4(vColor * glow, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
  });
  const points = new T.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = -1000;
  return points;
}

// Star colours from hot blue-white to cool orange, most of them white.
// prettier-ignore
const STAR_TINTS = [[0.78, 0.86, 1], [0.9, 0.94, 1], [1, 1, 1], [1, 1, 1], [1, 0.95, 0.84], [1, 0.84, 0.66]];
function starStyle(colors, sizes, k, dim) {
  const tint = STAR_TINTS[Math.floor(random() * STAR_TINTS.length)];
  const bright = random() ** 6; // a few bright stars, many faint ones
  const level = (0.22 + bright * 0.9) * dim;
  colors[k * 3] = tint[0] * level;
  colors[k * 3 + 1] = tint[1] * level;
  colors[k * 3 + 2] = tint[2] * level;
  sizes[k] = 2.4 + bright * 4.2;
}

// Canvas with a soft radial gradient, used for glows and the Sun's halo.
function glowTexture(stops) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [offset, color] of stops) g.addColorStop(offset, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

// A faint band of the Milky Way for the title backdrop.
function milkyWayTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.translate(256, 128);
  ctx.rotate(-0.42);
  for (let i = 0; i < 160; i++) {
    const x = (random() - 0.5) * 620,
      y = (random() - 0.5) * (30 + random() * 40),
      r = 12 + random() * 46;
    const warm = random() < 0.4;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, warm ? "rgba(255,226,196,0.045)" : "rgba(170,196,255,0.045)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Dark dust lane along the middle of the band.
  for (let i = 0; i < 40; i++) {
    const x = (random() - 0.5) * 560,
      y = (random() - 0.5) * 14,
      r = 8 + random() * 22;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(0,0,0,0.25)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

// Title screen: a slowly rotating Moon lit from the side, so the day/night line
// (the terminator) shows crater shadows. Faint earthshine lights the night side,
// a cool rim light outlines it, and a starfield with the Milky Way sits behind.
// Returns starMaterials so scene.js can match star size to the pixel ratio.
export function buildMenuScene() {
  const menuScene = new T.Scene();
  menuScene.background = new T.Color(0x020308);
  const menuCamera = new T.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 600);
  menuCamera.position.set(0, 0, 16);
  const sunlight = new T.DirectionalLight(0xfff5ea, 3.6);
  sunlight.position.set(-7, 2.5, 4);
  menuScene.add(sunlight);
  // Earthshine: sunlight bounced off Earth faintly lights the Moon's dark side.
  menuScene.add(new T.HemisphereLight(0x5a7099, 0x000000, 0.06));
  const rim = new T.DirectionalLight(0x9db6ff, 1.1);
  rim.position.set(6, 1.5, -5);
  menuScene.add(rim);

  const globe = moonGlobe();
  const menuMoon = new T.Mesh(
    new T.SphereGeometry(3.6, 128, 80),
    new T.MeshStandardMaterial({
      map: globe.map,
      bumpMap: globe.bump,
      bumpScale: 1.6,
      roughness: 1,
      metalness: 0,
    }),
  );
  menuMoon.position.x = 3.2;
  menuMoon.rotation.z = 0.12; // a slight tilt looks more natural than a level spin
  menuScene.add(menuMoon);
  // Soft glow hugging the limb (a sprite always faces the camera).
  const halo = new T.Sprite(
    new T.SpriteMaterial({
      map: glowTexture([
        [0, "rgba(150,180,235,0)"],
        [0.6, "rgba(150,180,235,0)"],
        [0.665, "rgba(170,198,245,0.22)"],
        [0.74, "rgba(120,150,210,0.07)"],
        [1, "rgba(80,110,180,0)"],
      ]),
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      toneMapped: false,
    }),
  );
  halo.scale.setScalar(11);
  menuMoon.add(halo);

  // Backdrop stars: a wide sheet behind the Moon fills desktop and phone screens.
  const count = 2600,
    positions = new Float32Array(count * 3),
    colors = new Float32Array(count * 3),
    sizes = new Float32Array(count);
  for (let k = 0; k < count; k++) {
    // A third of the stars crowd into the Milky Way band.
    const inBand = k % 3 === 0;
    let x = (random() - 0.5) * 110,
      y = (random() - 0.5) * 60;
    if (inBand) y = x * -0.45 + (random() - 0.5) * (random() * 14);
    positions[k * 3] = x;
    positions[k * 3 + 1] = y;
    positions[k * 3 + 2] = -36 - random() * 14;
    starStyle(colors, sizes, k, inBand ? 0.7 : 1);
  }
  const titleStars = starPoints(positions, colors, sizes);
  menuScene.add(titleStars);
  const band = new T.Mesh(
    new T.PlaneGeometry(150, 75),
    new T.MeshBasicMaterial({
      map: milkyWayTexture(),
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      toneMapped: false,
    }),
  );
  band.position.z = -55;
  band.renderOrder = -1001;
  menuScene.add(band);
  return { menuScene, menuCamera, menuMoon, starMaterials: [titleStars.material] };
}

// Terrain mesh: rings around the ship, close together near the windows and
// wider apart near the horizon, so detail goes where players can see it.
const TERRAIN_RADIUS = 480,
  RINGS = 100,
  SEGMENTS = 192,
  INNER = 6,
  GROWTH = 3.6;
function ringRadius(i) {
  return INNER + ((TERRAIN_RADIUS - INNER) * (Math.exp((GROWTH * i) / RINGS) - 1)) / (Math.exp(GROWTH) - 1);
}
function ringIndex(r) {
  return (
    (RINGS / GROWTH) *
    Math.log(1 + ((r - INNER) * (Math.exp(GROWTH) - 1)) / (TERRAIN_RADIUS - INNER))
  );
}

// Ground, craters, the distant crater rim, rocks and their shadows.
export function buildTerrain(scene) {
  // Craters: a few near the windows, bigger ones farther out.
  const craters = [];
  for (let i = 0; i < 90; i++) {
    const near = i < 14;
    const r = near ? 1.5 + random() * 5 : 3 + random() ** 2.2 * 42;
    const distance = near ? 24 + r + random() * 55 : 40 + r + random() * 280;
    const angle = random() * Math.PI * 2;
    const fresh = random() < 0.3;
    craters.push({
      x: Math.cos(angle) * distance,
      z: Math.sin(angle) * distance,
      r,
      depth: r * (fresh ? 0.26 : 0.16),
      rim: r * (fresh ? 0.07 : 0.035),
      fresh,
    });
  }

  // Height (metres) and albedo (brightness multiplier) at any point.
  const sample = { height: 0, tone: 1 };
  function surface(x, z) {
    const r = Math.hypot(x, z);
    // Flat pad under the lander, blending into rolling ground.
    const dx = Math.max(Math.abs(x) - 10.5, 0),
      dz = Math.max(Math.abs(z) - 15, 0);
    const pad = smooth(2, 26, Math.hypot(dx, dz));
    let height = -0.06 + pad * (fbm(x / 24, z / 24, 3) * 1.3 + fbm(x / 4.5, z / 4.5, 2) * 0.14);
    // Hills farther out, then the rim of a huge old crater around the horizon.
    height += smooth(45, 200, r) * fbm(x / 110 + 7, z / 110 - 3, 4) * 16;
    const ux = x / (r || 1),
      uz = z / (r || 1);
    height += Math.exp(-(((r - 360) / 70) ** 2)) * (26 + fbm(ux * 3.5 + 11, uz * 3.5 - 5, 4) * 30);
    height -= smooth(400, 480, r) * 30; // hide the far edge behind the rim
    // Large soft patches of darker and lighter soil.
    let tone = 1 + fbm(x / 150 + 3, z / 150 + 8, 3) * 0.32 + fbm(x / 14, z / 14, 2) * 0.1;
    for (const c of craters) {
      const ddx = x - c.x,
        ddz = z - c.z,
        d2 = ddx * ddx + ddz * ddz;
      if (d2 > c.r * c.r * 9) continue;
      const t = Math.sqrt(d2) / c.r;
      if (t < 1) height += c.depth * (t * t - 1);
      height += c.rim * Math.exp(-(((t - 1) / 0.3) ** 2)) * pad;
      // Fresh craters throw out bright ejecta; old ones have darker floors.
      if (c.fresh) tone *= 1 + 0.3 * Math.exp(-(((t - 1.1) / 0.7) ** 2));
      else if (t < 1) tone *= 0.9 + 0.1 * t;
    }
    sample.height = height;
    sample.tone = tone;
    return sample;
  }
  const heightAt = (x, z) => surface(x, z).height;

  // Build the ring mesh: SEGMENTS vertices per ring, plus one centre vertex.
  const vertexCount = (RINGS + 1) * SEGMENTS + 1;
  const positions = new Float32Array(vertexCount * 3),
    uvs = new Float32Array(vertexCount * 2),
    colors = new Float32Array(vertexCount * 3),
    heights = new Float32Array(vertexCount);
  const tint = new T.Color(GROUND_TINT);
  for (let i = 0; i <= RINGS; i++) {
    const r = ringRadius(i);
    for (let j = 0; j < SEGMENTS; j++) {
      const k = i * SEGMENTS + j,
        a = (j / SEGMENTS) * Math.PI * 2;
      const x = Math.cos(a) * r,
        z = Math.sin(a) * r;
      const { height, tone } = surface(x, z);
      heights[k] = height;
      positions.set([x, height, z], k * 3);
      uvs.set([x / TEXTURE_METRES, z / TEXTURE_METRES], k * 2);
      colors.set([tint.r * tone, tint.g * tone, tint.b * tone], k * 3);
    }
  }
  const centre = vertexCount - 1;
  positions.set([0, -0.06, 0], centre * 3);
  colors.set([tint.r, tint.g, tint.b], centre * 3);
  heights[centre] = -0.06;
  const index = [];
  for (let j = 0; j < SEGMENTS; j++) index.push(centre, (j + 1) % SEGMENTS, j);
  for (let i = 0; i < RINGS; i++)
    for (let j = 0; j < SEGMENTS; j++) {
      const a = i * SEGMENTS + j,
        b = (i + 1) * SEGMENTS + j,
        c = i * SEGMENTS + ((j + 1) % SEGMENTS),
        d = (i + 1) * SEGMENTS + ((j + 1) % SEGMENTS);
      index.push(a, c, b, c, d, b);
    }

  // Bake long shadows from hills and crater rims: march from each vertex towards
  // the Sun and darken it if the ground rises above the line of sight.
  function meshHeight(x, z) {
    const r = Math.hypot(x, z);
    if (r >= TERRAIN_RADIUS) return -Infinity;
    if (r <= INNER) return -0.06;
    const fi = Math.min(ringIndex(r), RINGS - 1e-6),
      i0 = Math.floor(fi),
      ti = fi - i0;
    let fj = (Math.atan2(z, x) / (Math.PI * 2)) * SEGMENTS;
    if (fj < 0) fj += SEGMENTS;
    const j0 = Math.floor(fj) % SEGMENTS,
      j1 = (j0 + 1) % SEGMENTS,
      tj = fj - Math.floor(fj);
    const h00 = heights[i0 * SEGMENTS + j0],
      h01 = heights[i0 * SEGMENTS + j1],
      h10 = heights[(i0 + 1) * SEGMENTS + j0],
      h11 = heights[(i0 + 1) * SEGMENTS + j1];
    return (h00 + (h01 - h00) * tj) * (1 - ti) + (h10 + (h11 - h10) * tj) * ti;
  }
  const sunFlat = Math.hypot(SUN_DIRECTION.x, SUN_DIRECTION.z);
  const stepX = SUN_DIRECTION.x / sunFlat,
    stepZ = SUN_DIRECTION.z / sunFlat,
    rise = SUN_DIRECTION.y / sunFlat;
  for (let k = 0; k < vertexCount - 1; k++) {
    const x = positions[k * 3],
      y = positions[k * 3 + 1] + 0.05,
      z = positions[k * 3 + 2];
    let blocked = 0;
    for (let t = 0.6; t < 260; t += 0.4 + t * 0.07) {
      const above = meshHeight(x + stepX * t, z + stepZ * t) - (y + t * rise);
      if (above > 0) blocked = Math.max(blocked, Math.min(1, above / (0.15 + t * 0.02)));
      if (blocked >= 1) break;
    }
    const light = 1 - blocked * (1 - SHADOW_FLOOR);
    colors[k * 3] *= light;
    colors[k * 3 + 1] *= light;
    colors[k * 3 + 2] *= light;
  }
  const ground = new T.BufferGeometry();
  ground.setAttribute("position", new T.BufferAttribute(positions, 3));
  ground.setAttribute("uv", new T.BufferAttribute(uvs, 2));
  ground.setAttribute("color", new T.BufferAttribute(colors, 3));
  ground.setIndex(index);
  ground.computeVertexNormals();
  const regolith = surfaceTexture("moon");
  // Lambert: matte like real moon dust, and cheaper than the cabin's PBR materials.
  const terrain = new T.Mesh(
    ground,
    new T.MeshLambertMaterial({
      map: regolith,
      bumpMap: regolith,
      bumpScale: 0.6,
      vertexColors: true,
    }),
  );
  terrain.receiveShadow = true; // the lander's shadow
  scene.add(terrain);
  buildRocks(scene, heightAt);
}

// Lumpy rock shapes: an icosahedron pushed in and out, squashed, flat bottom.
function rockGeometry(variant) {
  const geometry = new T.IcosahedronGeometry(1, 1);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const bump =
      1 +
      0.22 * Math.sin(x * 2.7 + variant * 1.9) * Math.sin(y * 3.1 + variant) * Math.sin(z * 2.3 + variant * 2.6) +
      0.1 * Math.sin(x * 6.3 - z * 5.1 + variant * 4.2);
    p.setXYZ(i, x * bump * (1 + variant * 0.08), Math.max(y * bump, -0.4) * 0.62, z * bump);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// Rocks are drawn as a few InstancedMeshes (one draw call per shape), and each
// rock gets a dark shadow decal stretched away from the Sun (one more draw call).
function buildRocks(scene, heightAt) {
  const rocks = [];
  for (let i = 0; i < 460; i++) {
    const kind = random();
    let distance, size;
    if (kind < 0.55) {
      distance = 13 + random() * 75; // pebbles you can see from the windows
      size = 0.08 + random() ** 2 * 0.4;
    } else if (kind < 0.9) {
      distance = 20 + random() ** 1.4 * 230;
      size = 0.35 + random() ** 2 * 1.3;
    } else {
      distance = 45 + random() * 270;
      size = 1.3 + random() ** 2 * 3.2;
    }
    const angle = random() * Math.PI * 2;
    const x = Math.cos(angle) * distance,
      z = Math.sin(angle) * distance;
    const spin = random() * Math.PI * 2,
      shape = Math.floor(random() * 4),
      tone = 0.75 + random() * 0.4;
    if (Math.abs(x) < 11 + size && Math.abs(z) < 15.5 + size) continue; // keep clear of the hull
    rocks.push({ x, z, size, spin, shape, tone });
  }
  const material = new T.MeshLambertMaterial({ color: ROCK_TINT, flatShading: true });
  const matrix = new T.Matrix4(),
    rotation = new T.Quaternion(),
    position = new T.Vector3(),
    scale = new T.Vector3(),
    color = new T.Color();
  const euler = new T.Euler();
  for (let shape = 0; shape < 4; shape++) {
    const group = rocks.filter((rock) => rock.shape === shape);
    const instances = new T.InstancedMesh(rockGeometry(shape), material, group.length);
    group.forEach((rock, k) => {
      position.set(rock.x, heightAt(rock.x, rock.z) - rock.size * 0.22, rock.z);
      rotation.setFromEuler(euler.set((rock.tone - 0.95) * 0.5, rock.spin, 0));
      scale.set(rock.size * (0.85 + 0.3 * rock.tone), rock.size, rock.size);
      instances.setMatrixAt(k, matrix.compose(position, rotation, scale));
      instances.setColorAt(k, color.setScalar(rock.tone));
    });
    instances.receiveShadow = true;
    instances.computeBoundingSphere();
    scene.add(instances);
  }

  // Shadow decals: ellipses lying on the ground, pointing away from the Sun.
  const away = new T.Vector3(-SUN_DIRECTION.x, 0, -SUN_DIRECTION.z).normalize();
  const reach = 0.42 / Math.tan(T.MathUtils.degToRad(SUN_ELEVATION)); // shadow length per metre of rock
  const plane = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const shadows = new T.InstancedMesh(
    plane,
    new T.MeshBasicMaterial({
      color: 0x000000,
      alphaMap: glowTexture([
        [0, "#ffffff"],
        [0.55, "#f0f0f0"],
        [1, "#000000"],
      ]),
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
    rocks.length,
  );
  const normal = new T.Vector3(),
    forward = new T.Vector3(),
    side = new T.Vector3();
  rocks.forEach((rock, k) => {
    const length = rock.size * (reach + 1.1);
    const cx = rock.x + away.x * (length / 2 - rock.size * 0.35),
      cz = rock.z + away.z * (length / 2 - rock.size * 0.35);
    // Tilt the decal to follow the slope of the ground.
    normal
      .set(heightAt(cx - 0.5, cz) - heightAt(cx + 0.5, cz), 1, heightAt(cx, cz - 0.5) - heightAt(cx, cz + 0.5))
      .normalize();
    forward.copy(away).addScaledVector(normal, -normal.dot(away)).normalize();
    side.crossVectors(normal, forward);
    matrix.makeBasis(side, normal, forward);
    rotation.setFromRotationMatrix(matrix);
    position.set(cx, heightAt(cx, cz) + 0.04, cz);
    scale.set(rock.size * 1.7, 1, length);
    shadows.setMatrixAt(k, matrix.compose(position, rotation, scale));
  });
  shadows.computeBoundingSphere();
  scene.add(shadows);
}

// Stars, Earth and Sun. The sky group follows the viewer every frame (no parallax).
// Returns starMaterials so scene.js can match star size to the pixel ratio.
export function buildSky(scene) {
  const sky = new T.Group();
  scene.add(sky);
  const count = 3600,
    positions = new Float32Array(count * 3),
    colors = new Float32Array(count * 3),
    sizes = new Float32Array(count);
  for (let k = 0; k < count; k++) {
    const a = random() * Math.PI * 2,
      h = random() * 1.05 - 0.05,
      r = 520;
    positions[k * 3] = Math.cos(a) * Math.sqrt(1 - h * h) * r;
    positions[k * 3 + 1] = h * r;
    positions[k * 3 + 2] = Math.sin(a) * Math.sqrt(1 - h * h) * r;
    // Daylight on the Moon washes out faint stars a little.
    starStyle(colors, sizes, k, 0.8);
  }
  const starfield = starPoints(positions, colors, sizes);
  sky.add(starfield);

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
  // Lambert ignores the cabin reflections, so Earth's night side stays dark.
  const earth = new T.Mesh(
    new T.SphereGeometry(14, 64, 48),
    new T.MeshLambertMaterial({
      map: earthTexture,
      emissiveMap: earthTexture,
      emissive: 0xffffff,
      emissiveIntensity: 0.05,
      depthWrite: false,
    }),
  );
  earth.position.set(-90, 140, -440);
  earth.rotation.y = -1.6;
  earth.renderOrder = -999;
  sky.add(earth);
  const atmosphere = new T.Mesh(
    new T.SphereGeometry(14.25, 64, 48),
    new T.MeshBasicMaterial({
      color: 0x6dbfff,
      transparent: true,
      opacity: 0.12,
      side: T.BackSide,
      depthWrite: false,
    }),
  );
  atmosphere.renderOrder = -998;
  earth.add(atmosphere);
  // The Sun's disc sits exactly where the sunlight comes from.
  const solarDisc = new T.Mesh(
    new T.SphereGeometry(2.3, 24, 16),
    new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, depthWrite: false }),
  );
  solarDisc.position.copy(SUN_DIRECTION).multiplyScalar(430);
  solarDisc.renderOrder = -999;
  sky.add(solarDisc);
  const sunHalo = new T.Sprite(
    new T.SpriteMaterial({
      map: glowTexture([
        [0, "rgba(255,250,225,.9)"],
        [0.12, "rgba(255,244,214,.35)"],
        [0.4, "rgba(255,244,214,.06)"],
        [1, "rgba(255,244,214,0)"],
      ]),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      blending: T.AdditiveBlending,
    }),
  );
  sunHalo.position.copy(solarDisc.position);
  sunHalo.scale.set(34, 34, 1);
  sunHalo.renderOrder = -998;
  sky.add(sunHalo);
  return { sky, earth, starMaterials: [starfield.material] };
}
