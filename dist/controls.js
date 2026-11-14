// controls.js: player input and movement.
// Owns keyboard keys, mouse look with pointer lock, drag/touch look, the on-screen
// movement buttons and joystick (presentation.js), jump, walking physics under lunar
// gravity and collision against the ship walls and obstacles.
// world.js calls controls.update(dt) once per frame while not on the title screen.
import * as T from "./vendor/three.module.js";
import { enableTouchStick } from "./presentation.js";

// Movement tuning. Units: metres, seconds, radians.
export const WALK_SPEED = 4.5;
export const RUN_SPEED = 7; // while Left Shift is held
export const LUNAR_GRAVITY = 1.62; // m/s², pulls jumps back down
export const JUMP_VELOCITY = 3.2;
export const MAX_JUMP_HEIGHT = 1.1;
export const LOOK_SPEED = 0.003; // radians per pixel, times the sensitivity setting
export const PITCH_LIMIT = 1.25; // how far you can look up or down
export const START_POSITION = [0, 1.8, 2]; // x, eye height, z
// Walkable interior: |x| < SHIP_HALF_WIDTH and |z| < SHIP_HALF_LENGTH.
export const SHIP_HALF_WIDTH = 8.4;
export const SHIP_HALF_LENGTH = 12.8;

const MOVE_KEYS = [
  "KeyW",
  "KeyS",
  "KeyA",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
];

// Collision test shared by walking, VR movement and the route trail.
// obstacles is filled by obstacle() in scene.js while the ship is built.
export function createClearance(obstacles) {
  return function clearAt(x, z) {
    return (
      Math.abs(x) < SHIP_HALF_WIDTH &&
      Math.abs(z) < SHIP_HALF_LENGTH &&
      !obstacles.some((o) => Math.abs(x - o.x) < o.w && Math.abs(z - o.z) < o.d)
    );
  };
}

// Reads ctx.canvas, ctx.dialog, ctx.keys, ctx.player, ctx.preferences, ctx.playing,
// ctx.inMenu and ctx.clearAt; calls ctx.hud.pause() and ctx.hud.interact().
export function createControls(ctx) {
  const { canvas, dialog, keys, player } = ctx;
  let yaw = 0,
    pitch = 0,
    jumpY = 0,
    velocity = 0;

  function jump() {
    if (ctx.playing && !dialog.open && jumpY === 0) velocity = JUMP_VELOCITY;
  }
  document.getElementById("jump").onclick = jump;

  // Keyboard. Escape pauses; E interacts; Space jumps.
  document.addEventListener("keydown", (e) => {
    if (dialog.open || ctx.inMenu) return;
    if (e.code === "Escape") {
      ctx.hud.pause();
      return;
    }
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code))
      e.preventDefault();
    keys.add(e.code);
    if (!e.repeat && e.code === "KeyE") ctx.hud.interact();
    if (!e.repeat && e.code === "Space") jump();
  });
  document.addEventListener("keyup", (e) => keys.delete(e.code));

  // Leaving the tab or losing pointer lock pauses the mission.
  window.addEventListener("blur", () => ctx.hud.pause());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) ctx.hud.pause();
  });
  document.addEventListener("pointerlockchange", () => {
    if (!document.pointerLockElement) ctx.hud.pause();
  });

  function look(dx, dy) {
    yaw -= dx * LOOK_SPEED * ctx.preferences.sensitivity;
    pitch = T.MathUtils.clamp(
      pitch - dy * LOOK_SPEED * ctx.preferences.sensitivity,
      -PITCH_LIMIT,
      PITCH_LIMIT,
    );
  }
  // Mouse look while the pointer is locked to the canvas.
  document.addEventListener("mousemove", (e) => {
    if (ctx.playing && !dialog.open && document.pointerLockElement === canvas)
      look(e.movementX, e.movementY);
  });
  // Clicking the scene requests pointer lock (mouse); touch and pen drag to look.
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (dialog.open || ctx.inMenu) return;
    ctx.playing = true;
    if (e.pointerType === "mouse" && canvas.requestPointerLock) {
      canvas.requestPointerLock()?.catch?.(() => {});
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

  // On-screen arrow buttons (data-key) and the touch joystick feed the same key set.
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

  return {
    jump,
    isWalking() {
      return MOVE_KEYS.some((k) => keys.has(k));
    },
    // VR left-stick movement, with the same collision as walking.
    move(dx, dz) {
      if (ctx.clearAt(player.x + dx, player.z)) player.x += dx;
      if (ctx.clearAt(player.x, player.z + dz)) player.z += dz;
    },
    // New expedition: back to the start, level view, on the floor.
    reset() {
      player.set(...START_POSITION);
      yaw = pitch = jumpY = velocity = 0;
    },
    // Per-frame physics, then place the camera at the player's eyes.
    update(dt, camera) {
      if (ctx.playing && !dialog.open) {
        let forward =
            Number(keys.has("KeyW") || keys.has("ArrowUp")) -
            Number(keys.has("KeyS") || keys.has("ArrowDown")),
          right =
            Number(keys.has("KeyD") || keys.has("ArrowRight")) -
            Number(keys.has("KeyA") || keys.has("ArrowLeft"));
        const length = Math.hypot(forward, right) || 1;
        forward /= length;
        right /= length;
        const speed = keys.has("ShiftLeft") ? RUN_SPEED : WALK_SPEED;
        const dx = (right * Math.cos(yaw) - forward * Math.sin(yaw)) * speed * dt,
          dz = (-forward * Math.cos(yaw) - right * Math.sin(yaw)) * speed * dt;
        if (ctx.clearAt(player.x + dx, player.z)) player.x += dx;
        if (ctx.clearAt(player.x, player.z + dz)) player.z += dz;
        velocity -= LUNAR_GRAVITY * dt;
        jumpY = Math.max(0, Math.min(MAX_JUMP_HEIGHT, jumpY + velocity * dt));
        if (jumpY === 0) velocity = 0;
      }
      camera.position.set(player.x, player.y + jumpY, player.z);
      camera.rotation.set(pitch, yaw, 0, "YXZ");
    },
  };
}
