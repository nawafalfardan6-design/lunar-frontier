// ship.js: the lander Selene's interior.
// Owns the terminal positions for each mission day (shipStations), the hull, walls,
// compartments, equipment, their collision boxes (obstacle()) and the ship's own
// animations (vent fans, screen scan lines, status LEDs). Called from scene.js.
// Static parts are merged into a few big meshes by scene.js after this runs;
// anything animated is tagged userData.dynamic so it stays separate.
import * as T from "./vendor/three.module.js";

// One terminal per mission day, in day order. The amber beacon marks the current one.
export const shipStations = [
  { name: "Air recycling", x: -5, z: -8 },
  { name: "Storm shelter", x: 5, z: 0 },
  { name: "Power bay", x: 5, z: -8 },
  { name: "Storm shelter", x: 5, z: 0 },
  { name: "Food & water", x: -5, z: 0 },
  { name: "Water recovery", x: -5, z: 8 },
  { name: "Flight deck", x: 5, z: 8 },
];

// Cabin palette. Change these to restyle the whole ship.
const COLORS = {
  wall: 0xd9d7d0, // off-white wall panels
  ceiling: 0xaab0b6, // light grey ceiling
  deck: 0x2a2f35, // floor slab
  floor: 0x6c757e, // blue-grey deck plates
  trim: 0x3a4148, // dark-grey frames, posts and consoles
  beam: 0x99a1a9, // ceiling beams and window sills
  rail: 0xe2b23a, // safety-yellow handrails
  guide: 0x3f86d1, // blue guide stripes along the corridor
  hatch: 0xe07a33, // orange hatch and hazard markings
};
// Cool white ceiling panels along the corridor.
const CABIN_LIGHT = { color: 0xe6eeff, intensity: 8, distance: 18, decay: 1.3 };
// Warm spotlight glow over each station console.
const WARM_LIGHT = 0xffd9a8;
// How strongly the station colours glow (0 = not at all).
const ACCENT_GLOW = 0.35;

// Every room has its own colour and picture, so kids can say "the blue room".
// Keyed by station name; sign is the short word over the doorway.
const STATION_STYLE = {
  "Air recycling": { color: "#45c4dc", sign: "AIR", icon: "air" },
  "Power bay": { color: "#f2c230", sign: "POWER", icon: "power" },
  "Food & water": { color: "#6cc24a", sign: "FOOD", icon: "food" },
  "Storm shelter": { color: "#ea5a4a", sign: "SHELTER", icon: "shelter" },
  "Water recovery": { color: "#4a8ff0", sign: "WATER", icon: "water" },
  "Flight deck": { color: "#a77ff0", sign: "FLIGHT", icon: "flight" },
};

// Simple pictograms drawn in a 100 x 100 box centred on (x, y).
function drawIcon(c, kind, x, y, size) {
  c.save();
  c.translate(x, y);
  c.scale(size / 100, size / 100);
  c.lineWidth = 10;
  c.lineCap = c.lineJoin = "round";
  c.strokeStyle = c.fillStyle;
  c.beginPath();
  if (kind === "air") {
    for (const [y0, length] of [
      [-26, 74],
      [0, 86],
      [26, 60],
    ]) {
      c.moveTo(-42, y0);
      c.bezierCurveTo(-18, y0 - 16, 2, y0 + 16, -42 + length, y0);
    }
    c.stroke();
  } else if (kind === "power") {
    c.moveTo(12, -48);
    c.lineTo(-28, 8);
    c.lineTo(0, 8);
    c.lineTo(-12, 48);
    c.lineTo(30, -12);
    c.lineTo(2, -12);
    c.closePath();
    c.fill();
  } else if (kind === "food") {
    c.ellipse(6, -8, 24, 42, 0.7, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(-34, 44);
    c.lineTo(0, 4);
    c.stroke();
  } else if (kind === "shelter") {
    c.moveTo(0, -46);
    c.lineTo(38, -30);
    c.lineTo(33, 12);
    c.quadraticCurveTo(22, 36, 0, 48);
    c.quadraticCurveTo(-22, 36, -33, 12);
    c.lineTo(-38, -30);
    c.closePath();
    c.fill();
  } else if (kind === "water") {
    c.moveTo(0, -48);
    c.quadraticCurveTo(36, 2, 33, 18);
    c.arc(0, 16, 33, 0, Math.PI);
    c.quadraticCurveTo(-36, 2, 0, -48);
    c.fill();
  } else {
    // Flight: a rocket.
    c.moveTo(0, -50);
    c.quadraticCurveTo(26, -18, 17, 26);
    c.lineTo(-17, 26);
    c.quadraticCurveTo(-26, -18, 0, -50);
    c.moveTo(-17, 2);
    c.lineTo(-32, 36);
    c.lineTo(-12, 26);
    c.moveTo(17, 2);
    c.lineTo(32, 36);
    c.lineTo(12, 26);
    c.fill();
    c.fillRect(-8, 30, 16, 16);
  }
  c.restore();
}

function canvasTexture(canvas) {
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// helpers from scene.js: scene (the ship's root group), box, mesh, mat, obstacle, mergeParts.
export function buildShip({ scene, box, mesh, mat, obstacle, mergeParts }) {
  const fans = [],
    indicators = [],
    scans = [];
  const { wall, trim, beam } = COLORS;
  const accent = (style) => mat(style.color, { surface: "plain", glow: ACCENT_GLOW, roughness: 0.4 });
  const glowing = new T.MeshBasicMaterial({ color: 0xf2f6ff, toneMapped: false });

  // Floor slab, ceiling and deck plates.
  box(19, 0.3, 28, COLORS.deck, 0, -0.15, 0);
  box(19, 0.3, 28, COLORS.ceiling, 0, 3.5, 0, scene, { cast: true });
  const plate = mat(COLORS.floor, { surface: "floor", roughness: 0.75, metalness: 0.1 });
  const guide = mat(COLORS.guide, { surface: "plain", glow: 0.25 });
  for (let z = -12; z <= 12; z += 3) {
    box(17.5, 0.04, 2.92, plate, 0, 0.02, z);
    box(0.09, 0.05, 2.6, guide, -2.8, 0.05, z);
    box(0.09, 0.05, 2.6, guide, 2.8, 0.05, z);
  }
  // Front and side windows open onto the lunar surface outside the lander.
  box(19, 1.4, 0.4, wall, 0, 0.7, -13.5);
  box(19, 0.5, 0.4, wall, 0, 3.25, -13.5);
  for (const x of [-9, -4.5, 0, 4.5, 9]) box(0.25, 2, 0.5, trim, x, 2.2, -13.5);
  box(19, 0.12, 0.5, beam, 0, 1.42, -13.45); // window sill
  box(19, 3.5, 0.4, wall, 0, 1.75, 13.5);
  for (const side of [-1, 1]) {
    box(0.4, 1.4, 27, wall, side * 9, 0.7, 0);
    box(0.4, 0.5, 27, wall, side * 9, 3.25, 0);
    for (let z = -12; z <= 12; z += 4) box(0.5, 3.5, 0.22, trim, side * 9, 1.75, z);
    box(0.18, 0.22, 27, beam, side * 8.8, 1.4, 0); // window sill rail
  }
  // Ceiling beams with cool white light panels, and the lamps that light the cabin.
  for (let z = -10; z <= 10; z += 5) {
    box(18, 0.25, 0.3, beam, 0, 3.25, z);
    box(5, 0.06, 0.26, glowing, 0, 3.1, z);
    const lamp = new T.PointLight(
      CABIN_LIGHT.color,
      CABIN_LIGHT.intensity,
      CABIN_LIGHT.distance,
      CABIN_LIGHT.decay,
    );
    lamp.position.set(0, 2.55, z); // below the panel, so the ceiling is not glaring
    scene.add(lamp);
  }
  // Rear hatch with orange hazard markings.
  box(2.8, 3.8, 0.2, trim, 0, 2, 13.2);
  box(0.08, 3.6, 0.22, COLORS.hatch, 0, 2, 13.06);
  box(2.2, 0.12, 0.1, COLORS.hatch, 0, 2.1, 12.95);

  // Station console: desk, monitor, glowing trim in the room's colour.
  function screen(name, x, z, angle) {
    const style = STATION_STYLE[name];
    const group = new T.Group();
    group.position.set(x, 0, z);
    group.rotation.y = angle;
    scene.add(group);
    box(1.6, 1, 0.9, trim, 0, 0.5, 0, group);
    box(1.64, 0.05, 0.94, accent(style), 0, 1.02, 0, group);
    box(1.82, 1.0, 0.08, trim, 0, 1.5, 0.38, group);
    box(1.82, 0.06, 0.1, accent(style), 0, 2.03, 0.38, group);
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const c = canvas.getContext("2d");
    const background = c.createLinearGradient(0, 0, 0, 256);
    background.addColorStop(0, "#0f2633");
    background.addColorStop(1, "#08141c");
    c.fillStyle = background;
    c.fillRect(0, 0, 512, 256);
    c.fillStyle = style.color;
    c.fillRect(0, 0, 512, 64);
    c.fillStyle = "#08141c";
    drawIcon(c, style.icon, 36, 32, 44);
    c.font = "bold 32px sans-serif";
    c.fillText(name.toUpperCase(), 72, 44);
    // Faint grid and a trace in the room colour.
    c.strokeStyle = "#ffffff14";
    c.lineWidth = 1;
    for (let gx = 25; gx < 500; gx += 40) c.strokeRect(gx, 88, 40, 100);
    c.strokeStyle = style.color;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(25, 150);
    for (let i = 1; i < 18; i++) c.lineTo(25 + i * 26, 150 - Math.sin(i * 1.7) * 30);
    c.stroke();
    c.fillStyle = "#a9c3cf";
    c.font = "18px monospace";
    c.fillText("SELENE / SYSTEM CONTROL", 25, 228);
    mesh(
      new T.PlaneGeometry(1.65, 0.82),
      new T.MeshBasicMaterial({ map: canvasTexture(canvas), toneMapped: false }),
      0,
      1.5,
      0.425,
      group,
    );
    const scan = mesh(
      new T.PlaneGeometry(1.55, 0.018),
      new T.MeshBasicMaterial({ color: 0xa5dded, transparent: true, opacity: 0.35 }),
      0,
      1.15,
      0.432,
      group,
    );
    scan.userData.dynamic = true;
    scans.push(scan);
    const led = mesh(
      new T.SphereGeometry(0.035, 8, 6),
      new T.MeshBasicMaterial({ color: 0x85c4b5 }),
      0.62,
      0.88,
      0.47,
      group,
    );
    led.userData.dynamic = true;
    indicators.push(led);
    obstacle(x, z, 1.6, 0.9);
  }
  for (const index of [0, 1, 2, 4, 5, 6]) {
    const station = shipStations[index];
    screen(station.name, station.x, station.z, 0);
  }
  // Six pressure compartments around a narrow central passage.
  function bulkhead(w, d, x, z) {
    box(w, 3.5, d, wall, x, 1.75, z);
    box(w + 0.02, 0.14, d + 0.02, trim, x, 0.07, z); // dark kick plate along the floor
    obstacle(x, z, w, d);
  }
  // Doorway frames and floor thresholds glow in the colour of the room behind them.
  const roomAt = (x, z) =>
    STATION_STYLE[shipStations.find((s) => Math.sign(s.x) === Math.sign(x) && s.z === z).name];
  for (const x of [-2, 2]) {
    for (const z of [-11, -5, -3, 3, 5, 11]) bulkhead(0.22, 2, x, z);
    for (const z of [-8, 0, 8]) {
      const style = roomAt(x, z);
      box(0.3, 0.5, 4, trim, x, 3.25, z);
      // Dark frame posts with a light strip facing the corridor and into the doorway.
      const inward = -Math.sign(x);
      for (const dz of [-2, 2]) {
        box(0.32, 3, 0.12, trim, x, 1.5, z + dz);
        box(0.03, 2.8, 0.08, accent(style), x + inward * 0.17, 1.5, z + dz);
        box(0.08, 2.8, 0.03, accent(style), x, 1.5, z + dz - Math.sign(dz) * 0.065);
      }
      box(0.08, 0.03, 3.76, accent(style), x, 2.985, z); // under the lintel
      box(0.34, 0.012, 3.7, accent(style), x, 0.046, z);
    }
  }
  for (const z of [-4, 4]) for (const x of [-5.5, 5.5]) bulkhead(7, 0.22, x, z);
  // Room signs over each doorway: icon and word on a dark plate, facing the corridor.
  for (const index of [0, 1, 2, 4, 5, 6]) {
    const station = shipStations[index];
    const style = STATION_STYLE[station.name];
    const x = Math.sign(station.x) * 2,
      z = station.z;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#121c24";
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = style.color;
    ctx.fillRect(0, 0, 118, 128);
    ctx.fillRect(118, 118, 394, 10);
    ctx.fillStyle = "#101820";
    drawIcon(ctx, style.icon, 59, 64, 78);
    ctx.fillStyle = "#f3f6f8";
    ctx.font = "bold 64px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(style.sign, 315, 86);
    const plaque = mesh(
      new T.PlaneGeometry(2.2, 0.55),
      new T.MeshBasicMaterial({ map: canvasTexture(canvas), toneMapped: false }),
      x + (x < 0 ? 0.17 : -0.17),
      2.95,
      z,
    );
    plaque.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  // Warm downlights over every console, with a soft pool of light on the floor.
  const poolCanvas = document.createElement("canvas");
  poolCanvas.width = poolCanvas.height = 128;
  const pc = poolCanvas.getContext("2d");
  const pool = pc.createRadialGradient(64, 64, 0, 64, 64, 64);
  pool.addColorStop(0, "rgba(255,214,160,0.55)");
  pool.addColorStop(0.5, "rgba(255,200,140,0.22)");
  pool.addColorStop(1, "rgba(255,200,140,0)");
  pc.fillStyle = pool;
  pc.fillRect(0, 0, 128, 128);
  const poolMaterial = new T.MeshBasicMaterial({
    map: canvasTexture(poolCanvas),
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    toneMapped: false,
  });
  const lampMaterial = new T.MeshBasicMaterial({ color: WARM_LIGHT, toneMapped: false });
  const poolGeometry = new T.PlaneGeometry(3.2, 3.2).rotateX(-Math.PI / 2);
  const lampGeometry = new T.CircleGeometry(0.24, 24).rotateX(Math.PI / 2);
  for (const index of [0, 1, 2, 4, 5, 6]) {
    const { x, z } = shipStations[index];
    mesh(lampGeometry, lampMaterial, x, 3.34, z + 1.1);
    mesh(poolGeometry, poolMaterial, x, 0.05, z + 1.1);
  }
  // Conduits (blue water line, orange power line), handrails and service panels.
  for (const [x, color] of [
    [-1.55, 0x4f86c0],
    [1.55, 0xd9823a],
  ]) {
    const pipe = mesh(
      new T.CylinderGeometry(0.055, 0.055, 25, 12),
      mat(color, { surface: "plain", roughness: 0.45, metalness: 0.3 }),
      x,
      3.12,
      0,
    );
    pipe.rotation.x = Math.PI / 2;
  }
  const railGeometry = new T.CylinderGeometry(0.04, 0.04, 2, 12);
  const railMaterial = mat(COLORS.rail, { surface: "plain", roughness: 0.4, metalness: 0.2 });
  for (const x of [-8.7, 8.7])
    for (const z of [-8, 0, 8]) {
      const rail = mesh(railGeometry, railMaterial, x, 1.15, z);
      rail.rotation.x = Math.PI / 2;
      box(0.12, 0.3, 0.12, trim, x, 1.05, z - 1);
      box(0.12, 0.3, 0.12, trim, x, 1.05, z + 1);
      box(0.12, 1.1, 2.8, wall, x, 2.25, z + 2.7);
    }
  // Equipment is secured to outer walls, leaving each doorway clear.
  // Air: oxygen tanks with a band in the room colour.
  const tankGeometry = new T.CylinderGeometry(0.4, 0.4, 2.5, 20);
  const bandGeometry = new T.CylinderGeometry(0.415, 0.415, 0.16, 20);
  for (const z of [-9, -7]) {
    mesh(tankGeometry, mat(0xe9ebec, { surface: "plain", roughness: 0.35 }), -7.8, 1.25, z).castShadow = true;
    mesh(bandGeometry, accent(STATION_STYLE["Air recycling"]), -7.8, 1.7, z);
    obstacle(-7.8, z, 1, 1);
  }
  // Power: battery racks with yellow cell markers.
  for (const z of [-9, -7]) {
    box(0.8, 2.5, 1.4, trim, 7.8, 1.25, z);
    obstacle(7.8, z, 0.8, 1.4);
    for (let y = 0.5; y < 2.5; y += 0.5)
      box(0.12, 0.12, 0.8, accent(STATION_STYLE["Power bay"]), 7.3, y, z);
  }
  // Shelter: bunks with blue sleeping bags.
  for (const y of [0.6, 1.8]) {
    box(1.7, 0.15, 3, trim, 7.5, y, 0);
    box(1.5, 0.15, 2.7, 0x50698a, 7.5, y + 0.15, 0);
    box(1.2, 0.2, 0.45, 0xe6e9ea, 7.5, y + 0.3, -0.9);
  }
  obstacle(7.5, 0, 1.7, 3);
  // Food: planters growing salad.
  for (const z of [-1, 1]) {
    box(1.4, 0.8, 1.4, 0xd9dcd8, -7.5, 0.4, z);
    for (const dx of [-0.3, 0.3])
      mesh(new T.ConeGeometry(0.3, 0.7, 7), mat(0x5c9e48, { surface: "plain", roughness: 0.8 }), -7.5 + dx, 1.1, z);
    obstacle(-7.5, z, 1.4, 1.4);
  }
  // Water: blue storage tanks.
  for (const z of [7, 9]) {
    mesh(
      new T.CylinderGeometry(0.5, 0.5, 2, 20),
      mat(0x6d9fcc, { surface: "plain", roughness: 0.35, metalness: 0.15 }),
      -7.5,
      1,
      z,
    ).castShadow = true;
    obstacle(-7.5, z, 1, 1);
  }
  // Flight deck: pilot seat and control panel.
  box(1.2, 0.3, 1.4, trim, 7.2, 0.6, 9);
  box(1.2, 1.1, 0.2, 0x56606a, 7.2, 1.1, 9.6);
  box(1.0, 0.05, 0.05, accent(STATION_STYLE["Flight deck"]), 7.2, 1.6, 9.49);
  obstacle(7.2, 9, 1.2, 1.6);
  // Recessed ventilation fans in the service bulkheads. Each fan's four blades
  // are one mesh, so a spinning fan costs a single draw call.
  const blades = mergeParts(
    [0, 1, 2, 3].map((i) => {
      const a = (i * Math.PI) / 2;
      const matrix = new T.Matrix4()
        .makeRotationZ(a)
        .setPosition(Math.sin(a) * 0.1, Math.cos(a) * 0.1, 0);
      return [new T.BoxGeometry(0.12, 0.33, 0.025), matrix];
    }),
  );
  const bladeMaterial = mat(0x59656e, { surface: "plain" });
  for (const [x, z] of [
    [-6, -3.8],
    [6, -3.8],
    [-6, 4.2],
    [6, 4.2],
  ]) {
    mesh(new T.TorusGeometry(0.25, 0.035, 8, 24), mat(beam, { surface: "plain" }), x, 2.55, z);
    mesh(new T.CircleGeometry(0.23, 24), mat(0x171d23, { surface: "plain" }), x, 2.55, z - 0.025);
    const fan = mesh(blades, bladeMaterial, x, 2.55, z);
    fan.userData.dynamic = true;
    fans.push(fan);
  }
  // Per-frame animation. Plain loops: no closures or garbage every frame.
  return (time, motion) => {
    for (let i = 0; i < fans.length; i++) if (motion) fans[i].rotation.z = time * (2 + i * 0.15);
    for (let i = 0; i < scans.length; i++)
      scans[i].position.y = motion ? 1.12 + ((time * 0.16 + i * 0.19) % 1) * 0.72 : 1.45;
    for (let i = 0; i < indicators.length; i++)
      indicators[i].material.color.setHex(
        motion && Math.sin(time * 1.2 + i) > 0.85 ? 0xc4ebdf : 0x72a99a,
      );
  };
}
