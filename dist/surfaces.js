// surfaces.js: procedural canvas textures. No image files and no network.
// Each texture is built once and shared (cached by name).
//   panel, panel-bump  1 m x 1 m wall panel: seams and corner fasteners (scene.js tiles it)
//   floor, floor-bump  1 m x 1 m deck: four plates with anti-slip dots
//   moon               tileable regolith with tiny craters (terrain ground)
//   moonGlobe()        whole-Moon map plus height map for the title screen
// Albedo maps are near-white so the material colour sets the final colour.
import * as T from "./vendor/three.module.js";

const SIZE = 512;
const cache = new Map();

export function surfaceTexture(type) {
  if (!cache.has(type)) cache.set(type, buildSurface(type));
  return cache.get(type);
}

// Seeded random numbers: the same textures on every visit.
function seeded(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function makeCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

// Grey base with per-pixel grain; rowStreak adds a brushed-metal look.
function grain(ctx, rnd, base, amount, rowStreak = 0) {
  const data = ctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    const streak = (rnd() - 0.5) * rowStreak;
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const v = base + streak + (rnd() - 0.5) * amount;
      data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
      data.data[i + 3] = 255;
    }
  }
  ctx.putImageData(data, 0, 0);
}

// Soft round spot, repeated across the tile edges so the texture wraps seamlessly.
function wrappedSpot(ctx, x, y, r, inner, outer) {
  for (const dx of [-SIZE, 0, SIZE])
    for (const dy of [-SIZE, 0, SIZE]) {
      const cx = x + dx,
        cy = y + dy;
      if (cx + r < 0 || cx - r > SIZE || cy + r < 0 || cy - r > SIZE) continue;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, inner);
      g.addColorStop(1, outer);
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
}

function drawPanel(ctx, rnd, bump) {
  if (bump) {
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, SIZE, SIZE);
  } else {
    grain(ctx, rnd, 236, 7, 5);
    // Faint wear so big walls are not perfectly flat.
    for (let i = 0; i < 14; i++)
      wrappedSpot(ctx, rnd() * SIZE, rnd() * SIZE, 40 + rnd() * 120, "#6b707518", "#6b707500");
  }
  // One seam per tile (top and left edges), with a lit bevel beside it.
  ctx.fillStyle = bump ? "#262626" : "#8e959c";
  ctx.fillRect(0, 0, SIZE, 5);
  ctx.fillRect(0, 0, 5, SIZE);
  ctx.fillStyle = bump ? "#a8a8a8" : "#ffffff55";
  ctx.fillRect(5, 5, SIZE - 5, 3);
  ctx.fillRect(5, 5, 3, SIZE - 5);
  // Corner fasteners.
  for (const x of [26, SIZE - 20])
    for (const y of [26, SIZE - 20]) {
      ctx.fillStyle = bump ? "#e0e0e0" : "#7a8188";
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = bump ? "#ffffff" : "#c4c9ce";
      ctx.beginPath();
      ctx.arc(x - 1, y - 1, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
}

function drawFloor(ctx, rnd, bump) {
  if (bump) {
    ctx.fillStyle = "#707070";
    ctx.fillRect(0, 0, SIZE, SIZE);
  } else {
    grain(ctx, rnd, 222, 12);
    for (let i = 0; i < 22; i++)
      wrappedSpot(ctx, rnd() * SIZE, rnd() * SIZE, 30 + rnd() * 90, "#4a505614", "#4a505600");
  }
  // Anti-slip dots in a staggered grid.
  ctx.fillStyle = bump ? "#d8d8d8" : "#ffffff40";
  for (let y = 12; y < SIZE; y += 24)
    for (let x = 12 + ((y / 24) % 2) * 12; x < SIZE; x += 24) {
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  // Four 50 cm plates per tile.
  ctx.fillStyle = bump ? "#202020" : "#5d636a";
  for (const p of [0, SIZE / 2]) {
    ctx.fillRect(0, p, SIZE, 4);
    ctx.fillRect(p, 0, 4, SIZE);
  }
}

function drawRegolith(ctx, rnd) {
  grain(ctx, rnd, 150, 24);
  // Broad darker and lighter soil patches.
  for (let i = 0; i < 26; i++) {
    const dark = rnd() < 0.6;
    wrappedSpot(
      ctx,
      rnd() * SIZE,
      rnd() * SIZE,
      25 + rnd() * 80,
      dark ? "#3c3c3c40" : "#d8d8d830",
      dark ? "#3c3c3c00" : "#d8d8d800",
    );
  }
  // Small craters: dark floor, bright rim on the far side.
  for (let i = 0; i < 300; i++) {
    const x = rnd() * SIZE,
      y = rnd() * SIZE,
      r = 1.5 + rnd() ** 4 * 22;
    for (const dx of [-SIZE, 0, SIZE])
      for (const dy of [-SIZE, 0, SIZE]) {
        const cx = x + dx,
          cy = y + dy;
        if (cx + r < 0 || cx - r > SIZE || cy + r < 0 || cy - r > SIZE) continue;
        const g = ctx.createRadialGradient(cx - r * 0.18, cy - r * 0.18, r * 0.1, cx, cy, r);
        g.addColorStop(0, "#4a4a4a38");
        g.addColorStop(0.65, "#6060602c");
        g.addColorStop(0.84, "#e0e0e02c");
        g.addColorStop(1, "#99999900");
        ctx.fillStyle = g;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
  }
  // Bright specks of fresh rock.
  ctx.fillStyle = "#f2f2f2";
  for (let i = 0; i < 900; i++) ctx.fillRect(rnd() * SIZE, rnd() * SIZE, 1.3, 1.3);
}

function buildSurface(type) {
  const canvas = makeCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");
  const rnd = seeded(817);
  const bump = type.endsWith("-bump");
  if (type.startsWith("panel")) drawPanel(ctx, rnd, bump);
  else if (type.startsWith("floor")) drawFloor(ctx, rnd, bump);
  else drawRegolith(ctx, rnd);
  const texture = new T.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  // Height maps are data, not colour.
  texture.colorSpace = bump ? T.NoColorSpace : T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// Title-screen Moon: an equirectangular albedo map with the near-side maria
// (the "face" we see from Earth), ray craters like Tycho, and a height map
// that makes craters cast little shadows along the day/night line.
export function moonGlobe() {
  if (cache.has("globe")) return cache.get("globe");
  const W = 1024,
    H = 512;
  const albedoCanvas = makeCanvas(W, H),
    heightCanvas = makeCanvas(W, H);
  const a = albedoCanvas.getContext("2d"),
    h = heightCanvas.getContext("2d");
  const rnd = seeded(4242);
  a.fillStyle = "#a9a59e";
  a.fillRect(0, 0, W, H);
  h.fillStyle = "#808080";
  h.fillRect(0, 0, W, H);

  // Draws a radial gradient centred on lon/lat (degrees), widened near the poles
  // to undo the map stretch, and wrapped across the 180° seam.
  function spot(ctx, lon, lat, radius, stops) {
    const x = ((((lon / 360 + 0.25) % 1) + 1) % 1) * W;
    const y = (0.5 - lat / 180) * H;
    const r = (radius / 360) * W;
    const stretch = 1 / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    for (const dx of [-W, 0, W]) {
      if (x + dx + r * stretch < 0 || x + dx - r * stretch > W) continue;
      ctx.save();
      ctx.translate(x + dx, y);
      ctx.scale(stretch, 1);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      for (const [offset, color] of stops) g.addColorStop(offset, color);
      ctx.fillStyle = g;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.restore();
    }
  }

  // Highland mottling.
  for (let i = 0; i < 220; i++) {
    const light = rnd() < 0.5;
    const tone = light ? "200,196,188" : "120,117,112";
    spot(a, rnd() * 360 - 180, Math.asin(rnd() * 2 - 1) * 57.3, 3 + rnd() * 14, [
      [0, `rgba(${tone},0.10)`],
      [1, `rgba(${tone},0)`],
    ]);
  }
  // Maria: dark lava plains. [longitude, latitude, size] in degrees.
  // prettier-ignore
  const maria = [
    [-57, 18, 17], [-48, 32, 12], [-64, 2, 12], [-42, 6, 10], [-70, -10, 8], // Procellarum
    [-16, 34, 13], [-24, 40, 8], // Imbrium
    [17, 28, 8], // Serenitatis
    [30, 9, 9], [24, 2, 6], // Tranquillitatis
    [59, 17, 6], // Crisium
    [51, -7, 7], // Fecunditatis
    [34, -15, 5], // Nectaris
    [-17, -20, 8], // Nubium
    [-39, -24, 5], // Humorum
    [4, 13, 4], // Vaporum
    [-20, 56, 5], [5, 57, 5], [30, 58, 4], // Frigoris
    [147, 27, 3], // Moscoviense (far side)
  ];
  // Many small overlapping patches give each mare a ragged, natural edge.
  for (const [lon, lat, size] of maria)
    for (let k = 0; k < 9; k++) {
      const jl = lon + (rnd() - 0.5) * size * 1.3,
        jb = lat + (rnd() - 0.5) * size * 1.0,
        r = size * (0.3 + rnd() * 0.45);
      const alpha = 0.22 + rnd() * 0.22;
      spot(a, jl, jb, r, [
        [0, `rgba(72,70,68,${alpha})`],
        [0.6, `rgba(72,70,68,${alpha * 0.7})`],
        [1, "rgba(72,70,68,0)"],
      ]);
      spot(h, jl, jb, r, [
        [0, "rgba(104,104,104,0.35)"],
        [1, "rgba(104,104,104,0)"],
      ]);
    }
  // Impact craters, mostly small, a few large.
  for (let i = 0; i < 950; i++) {
    const lon = rnd() * 360 - 180,
      lat = Math.asin(rnd() * 1.9 - 0.95) * 57.3,
      r = 0.3 + rnd() ** 4 * 6;
    // In full sunlight craters are subtle; the height map shows them near the terminator.
    if (rnd() < 0.12)
      spot(a, lon, lat, r * 2.4, [
        [0, "rgba(235,230,222,0.12)"],
        [1, "rgba(235,230,222,0)"],
      ]);
    spot(a, lon, lat, r, [
      [0, "rgba(96,93,89,0.16)"],
      [0.75, "rgba(110,107,102,0.1)"],
      [0.88, "rgba(228,224,216,0.12)"],
      [1, "rgba(228,224,216,0)"],
    ]);
    // Only the bigger craters get relief; at this distance small ones are just spots.
    if (r > 1.1)
      spot(h, lon, lat, r * 1.15, [
        [0, "rgba(40,40,40,0.8)"],
        [0.6, "rgba(80,80,80,0.6)"],
        [0.8, "rgba(200,200,200,0.6)"],
        [1, "rgba(128,128,128,0)"],
      ]);
  }
  // Young craters with bright rays: Tycho, Copernicus, Kepler, Aristarchus.
  // prettier-ignore
  const rayed = [[-11, -43, 1.3, 34, 40], [-20, 10, 1.4, 24, 22], [-38, 8, 0.6, 14, 12], [-47, 24, 0.6, 10, 8]];
  for (const [lon, lat, r, rays, length] of rayed) {
    const x = ((lon / 360 + 0.25) % 1) * W,
      y = (0.5 - lat / 180) * H,
      stretch = 1 / Math.cos((lat * Math.PI) / 180);
    a.lineCap = "round";
    for (let k = 0; k < rays; k++) {
      const angle = rnd() * Math.PI * 2,
        len = ((length * (0.4 + rnd() * 0.6)) / 360) * W;
      a.strokeStyle = `rgba(242,238,230,${0.06 + rnd() * 0.08})`;
      a.lineWidth = 1 + rnd() * 2.5;
      a.beginPath();
      a.moveTo(x, y);
      a.lineTo(x + Math.cos(angle) * len * stretch, y + Math.sin(angle) * len);
      a.stroke();
    }
    spot(a, lon, lat, r * 3, [
      [0, "rgba(250,247,240,0.55)"],
      [1, "rgba(250,247,240,0)"],
    ]);
  }
  // Fine grain on top of everything.
  const pixels = a.getImageData(0, 0, W, H);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const n = (rnd() - 0.5) * 14;
    pixels.data[i] += n;
    pixels.data[i + 1] += n;
    pixels.data[i + 2] += n;
  }
  a.putImageData(pixels, 0, 0);

  const map = new T.CanvasTexture(albedoCanvas);
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 4;
  const bump = new T.CanvasTexture(heightCanvas);
  bump.colorSpace = T.NoColorSpace;
  const globe = { map, bump };
  cache.set("globe", globe);
  return globe;
}
