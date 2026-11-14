import * as T from "./vendor/three.module.js";
// Self-contained procedural surfaces: no external textures or network dependency.
export function surfaceTexture(type) {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d");
  let seed = 817;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const data = ctx.createImageData(512, 512);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = (type === "moon" ? 153 : 220) + (rnd() - 0.5) * (type === "moon" ? 20 : 12);
    data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  if (type === "moon") {
    // Broad, irregular basalt-like regions under the smaller impact features.
    for (let i = 0; i < 18; i++) {
      const x = rnd() * 512,
        y = rnd() * 512,
        r = 20 + rnd() * 65;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "#42424255");
      g.addColorStop(1, "#55555500");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    for (let i = 0; i < 550; i++) {
      const x = rnd() * 512,
        y = rnd() * 512,
        r = 1 + rnd() ** 4 * 16;
      for (const dx of [-512, 0, 512])
        for (const dy of [-512, 0, 512]) {
          const g = ctx.createRadialGradient(
            x + dx - r * 0.18,
            y + dy - r * 0.18,
            r * 0.1,
            x + dx,
            y + dy,
            r,
          );
          g.addColorStop(0, "#55555544");
          g.addColorStop(0.65, "#66666644");
          g.addColorStop(0.83, "#dddddd33");
          g.addColorStop(1, "#99999900");
          ctx.fillStyle = g;
          ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
        }
    }
  } else {
    ctx.strokeStyle = "#7a8087";
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 508, 508);
    for (const x of [12, 500])
      for (const y of [12, 500]) {
        ctx.fillStyle = "#6a7177";
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
  }
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
