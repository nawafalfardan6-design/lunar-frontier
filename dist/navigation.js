import * as T from "./vendor/three.module.js";
// Four-neighbour search uses the same clearance test as player movement.
export function findRoute(start, target, clear) {
  const step = 0.5,
    key = (x, z) => `${x},${z}`,
    sx = Math.round(start.x / step),
    sz = Math.round(start.z / step);
  const queue = [[sx, sz]],
    parents = new Map([[key(sx, sz), null]]);
  let end = null;
  for (let i = 0; i < queue.length; i++) {
    const [x, z] = queue[i];
    if (Math.hypot(x * step - target.x, z * step - target.z) < 1.8) {
      end = [x, z];
      break;
    }
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const a = x + dx,
        b = z + dz,
        k = key(a, b);
      if (
        !parents.has(k) &&
        Math.abs(a) < 18 &&
        Math.abs(b) < 27 &&
        clear(a * step, b * step) &&
        clear(((x + a) * step) / 2, ((z + b) * step) / 2)
      ) {
        parents.set(k, [x, z]);
        queue.push([a, b]);
      }
    }
  }
  const path = [];
  while (end) {
    path.push({ x: end[0] * step, z: end[1] * step });
    end = parents.get(key(...end));
  }
  return path.reverse();
}
export function createGuidance(scene, clear) {
  const material = new T.MeshBasicMaterial({
    color: 0x88ddff,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });
  const geometry = new T.CircleGeometry(0.12, 12),
    dots = [];
  for (let i = 0; i < 150; i++) {
    const dot = new T.Mesh(geometry, material);
    dot.rotation.x = -Math.PI / 2;
    dot.visible = false;
    scene.add(dot);
    dots.push(dot);
  }
  let remaining = 0,
    refresh = 0;
  return {
    show() {
      remaining = 20;
      refresh = 0;
    },
    update(dt, player, target, active) {
      if (!active) {
        dots.forEach((d) => (d.visible = false));
        return;
      }
      remaining = Math.max(0, remaining - dt);
      refresh -= dt;
      if (remaining === 0 || Math.hypot(player.x - target.x, player.z - target.z) < 2) {
        dots.forEach((d) => (d.visible = false));
        return;
      }
      material.opacity = Math.min(0.85, remaining / 3);
      if (refresh <= 0) {
        refresh = 0.6;
        const path = findRoute(player, target, clear);
        dots.forEach((d, i) => {
          d.visible = i < path.length;
          if (d.visible) d.position.set(path[i].x, 0.085, path[i].z);
        });
      }
    },
  };
}
