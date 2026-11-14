// controls.js: player input and movement.
// Owns keyboard keys, mouse look with pointer lock, drag/touch look, the analog touch
// joystick (drawn by presentation.js), jump, walking physics under lunar gravity and
// collision against the ship walls and obstacles.
// world.js calls controls.update(dt) once per frame while not on the title screen.
import * as T from "./vendor/three.module.js";
import { enableTouchStick } from "./presentation.js";

// Movement tuning. Units: metres, seconds, radians. Try changing these!
export const WALK_SPEED = 3; // m/s with WASD, arrow keys or a full joystick push
export const RUN_SPEED = 4.5; // m/s while either Shift key is held
export const ACCELERATION = 18; // m/s², how fast you speed up toward walking speed
export const BRAKING = 30; // m/s², how fast you stop when you let go (bigger = quicker stop)
export const AIR_CONTROL = 0.3; // share of ACCELERATION and BRAKING you keep while in the air
export const LUNAR_GRAVITY = 1.62; // m/s², the Moon's real gravity (Earth's is 9.81)
export const JUMP_SPEED = 1.7; // m/s upward at take-off: about 0.9 m high and 2.1 s in the air
export const HEAD_ROOM = 1.2; // m your eyes can rise above standing height before the ceiling stops you
export const PLAYER_RADIUS = 0.35; // m, how close your body can get to walls and equipment
export const LOOK_SPEED = 0.003; // radians per mouse pixel, times the sensitivity setting
export const TOUCH_LOOK_SPEED = 0.006; // radians per finger-drag pixel, times the sensitivity setting
export const MOUSE_SPIKE_LIMIT = 150; // px; a bigger single mouse jump is a glitch and is ignored
export const PITCH_LIMIT = 1.25; // radians you can look up or down (1.57 would be straight up)
export const STICK_DEAD_ZONE = 0.12; // joystick pushes smaller than this count as "not pushed"
export const GLOVE_BOB_SPEED = 0.5; // m/s; walking faster than this makes the gloves bob
export const START_POSITION = [0, 1.8, 2]; // x, eye height, z
// Inside faces of the ship walls: |x| < SHIP_INNER_HALF_WIDTH, |z| < SHIP_INNER_HALF_LENGTH.
export const SHIP_INNER_HALF_WIDTH = 8.75;
export const SHIP_INNER_HALF_LENGTH = 13.15;
// scene.js obstacle() already pads every box by this much; collision swaps it for PLAYER_RADIUS.
const SCENE_OBSTACLE_PADDING = 0.45;

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
// True when a player centred at (x, z) does not overlap a wall or obstacle.
// obstacles is filled by obstacle() in scene.js while the ship is built.
export function createClearance(obstacles) {
  const maxX = SHIP_INNER_HALF_WIDTH - PLAYER_RADIUS;
  const maxZ = SHIP_INNER_HALF_LENGTH - PLAYER_RADIUS;
  const grow = PLAYER_RADIUS - SCENE_OBSTACLE_PADDING;
  return function clearAt(x, z) {
    return (
      Math.abs(x) < maxX &&
      Math.abs(z) < maxZ &&
      !obstacles.some((o) => Math.abs(x - o.x) < o.w + grow && Math.abs(z - o.z) < o.d + grow)
    );
  };
}

// Reads ctx.canvas, ctx.dialog, ctx.keys, ctx.player, ctx.preferences, ctx.playing,
// ctx.inMenu, ctx.stage and ctx.clearAt; calls ctx.hud.pause() and ctx.hud.interact().
export function createControls(ctx) {
  const { canvas, dialog, keys, player } = ctx;
  const finePointer = matchMedia("(pointer:fine)");
  const stickInput = { x: 0, y: 0 }; // touch joystick, -1..1, y < 0 is forward
  let yaw = 0,
    pitch = 0,
    jumpY = 0, // eye height above standing, m
    vx = 0, // horizontal velocity, m/s
    vz = 0,
    vy = 0; // vertical velocity, m/s

  function grounded() {
    return jumpY === 0 && vy === 0;
  }
  // One jump at a time: only from the floor.
  function jump() {
    if (ctx.playing && !dialog.open && grounded()) vy = JUMP_SPEED;
  }
  document.getElementById("jump").onclick = jump;

  // Keyboard. Escape pauses; E interacts; Space jumps.
  let escapeAt = -Infinity;
  document.addEventListener("keydown", (e) => {
    if (dialog.open || ctx.inMenu) return;
    if (e.code === "Escape") {
      escapeAt = performance.now();
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

  // Small "Click to look around" hint, shown while playing with a mouse but unlocked.
  const hint = document.createElement("div");
  hint.id = "look-hint";
  hint.textContent = "Click to look around";
  hint.hidden = true;
  hint.style.cssText =
    "position:fixed;left:50%;top:58%;transform:translateX(-50%);padding:6px 14px;border-radius:999px;background:#0b1420b3;color:#e8eef3;font:600 13px/1.3 system-ui,sans-serif;pointer-events:none;z-index:5";
  document.body.append(hint);
  function refreshHint() {
    const hide =
      !ctx.playing ||
      ctx.inMenu ||
      dialog.open ||
      !finePointer.matches ||
      document.pointerLockElement === canvas ||
      !!ctx.stage?.renderer.xr.isPresenting;
    if (hint.hidden !== hide) hint.hidden = hide;
  }

  // Switching tabs pauses. A window blur (alt-tab, the browser's lock notice) only
  // drops held keys; the hint then invites a click to look around again.
  let blurAt = -Infinity;
  window.addEventListener("blur", () => {
    blurAt = performance.now();
    keys.clear();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) ctx.hud.pause();
  });
  // Losing pointer lock shows the hint. Browsers swallow the Escape key that ends a
  // lock, so a lock lost while the window still has focus (and no dialog took it)
  // is treated as Escape and pauses; one lost to alt-tab or a blur does not.
  document.addEventListener("pointerlockchange", () => {
    refreshHint();
    if (document.pointerLockElement) return;
    if (!ctx.playing || ctx.inMenu || dialog.open) return; // show() released it
    setTimeout(() => {
      const now = performance.now();
      const escaped = now - escapeAt < 500;
      const lostFocus = document.hidden || !document.hasFocus() || now - blurAt < 500;
      if (escaped || !lostFocus) ctx.hud.pause();
    }, 150);
  });

  function look(dx, dy, speed) {
    const turn = speed * ctx.preferences.sensitivity;
    yaw -= dx * turn;
    pitch = T.MathUtils.clamp(pitch - dy * turn, -PITCH_LIMIT, PITCH_LIMIT);
  }
  // Mouse look while the pointer is locked to the canvas. Spikes are ignored.
  document.addEventListener("mousemove", (e) => {
    if (!ctx.playing || dialog.open || document.pointerLockElement !== canvas) return;
    if (Math.abs(e.movementX) > MOUSE_SPIKE_LIMIT || Math.abs(e.movementY) > MOUSE_SPIKE_LIMIT)
      return;
    look(e.movementX, e.movementY, LOOK_SPEED);
  });
  // Clicking the scene requests pointer lock (mouse); touch and pen drag to look.
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (dialog.open || ctx.inMenu) return;
    ctx.playing = true;
    if (e.pointerType === "mouse") relock();
    if (drag) return; // a second finger does not take over the look
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag || drag.id !== e.pointerId || document.pointerLockElement) return;
    const speed = e.pointerType === "mouse" ? LOOK_SPEED : TOUCH_LOOK_SPEED;
    look(e.clientX - drag.x, e.clientY - drag.y, speed);
    drag.x = e.clientX;
    drag.y = e.clientY;
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    canvas.addEventListener(type, (e) => {
      if (drag?.id === e.pointerId) drag = null;
    });

  // Asks for pointer lock on mouse devices. Call it from a click (a user gesture).
  function relock() {
    if (!finePointer.matches || !canvas.requestPointerLock) return;
    if (ctx.stage?.renderer.xr.isPresenting || document.pointerLockElement === canvas) return;
    try {
      canvas.requestPointerLock()?.catch?.(() => {});
    } catch {}
  }

  // Touch joystick: an analog {x, y} vector, so a small push walks slowly.
  enableTouchStick(stickInput);

  // Moves the player by step along one axis if the spot is clear. When blocked, it
  // creeps up to the obstacle in halving steps so you stop flush against it.
  // Returns false when blocked. If already overlapping, any move is allowed.
  function moveAxis(axis, step) {
    if (!step) return true;
    const clear = (d) =>
      axis === "x" ? ctx.clearAt(player.x + d, player.z) : ctx.clearAt(player.x, player.z + d);
    if (!clear(0) || clear(step)) {
      player[axis] += step;
      return true;
    }
    for (let i = 0; i < 4; i++) {
      step /= 2;
      if (clear(step)) player[axis] += step;
    }
    return false;
  }

  const api = {
    jump,
    relock,
    isWalking() {
      return jumpY === 0 && Math.hypot(vx, vz) > GLOVE_BOB_SPEED;
    },
    // VR left-stick movement, with the same collision as walking.
    move(dx, dz) {
      moveAxis("x", dx);
      moveAxis("z", dz);
    },
    // New expedition: back to the start, level view, on the floor.
    reset() {
      player.set(...START_POSITION);
      yaw = pitch = jumpY = vx = vz = vy = 0;
    },
    // Per-frame physics, then place the camera at the player's eyes.
    update(dt, camera) {
      if (ctx.playing && !dialog.open) {
        // Wanted direction: keys give -1, 0 or 1; the joystick adds an analog push.
        let forward =
            Number(keys.has("KeyW") || keys.has("ArrowUp")) -
            Number(keys.has("KeyS") || keys.has("ArrowDown")),
          right =
            Number(keys.has("KeyD") || keys.has("ArrowRight")) -
            Number(keys.has("KeyA") || keys.has("ArrowLeft"));
        const push = Math.hypot(stickInput.x, stickInput.y);
        if (push > STICK_DEAD_ZONE) {
          const scale = Math.min(1, (push - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE)) / push;
          forward -= stickInput.y * scale;
          right += stickInput.x * scale;
        }
        const amount = Math.hypot(forward, right);
        if (amount > 1) {
          forward /= amount; // diagonals are no faster than straight lines
          right /= amount;
        }
        const running = keys.has("ShiftLeft") || keys.has("ShiftRight");
        const speed = running ? RUN_SPEED : WALK_SPEED;
        const targetX = (right * Math.cos(yaw) - forward * Math.sin(yaw)) * speed,
          targetZ = (-forward * Math.cos(yaw) - right * Math.sin(yaw)) * speed;

        // Ease the velocity toward the target, with less grip in the air.
        const onFloor = jumpY === 0;
        const rate = (amount > 0.01 ? ACCELERATION : BRAKING) * (onFloor ? 1 : AIR_CONTROL);
        const gapX = targetX - vx,
          gapZ = targetZ - vz,
          gap = Math.hypot(gapX, gapZ),
          change = rate * dt;
        if (gap <= change) {
          vx = targetX;
          vz = targetZ;
        } else {
          vx += (gapX / gap) * change;
          vz += (gapZ / gap) * change;
        }

        // Walls: try x and z separately so you slide along them.
        if (!moveAxis("x", vx * dt)) vx = 0;
        if (!moveAxis("z", vz * dt)) vz = 0;

        // Jump arc under lunar gravity (exact for constant gravity).
        if (!grounded()) {
          jumpY += (vy - 0.5 * LUNAR_GRAVITY * dt) * dt;
          vy -= LUNAR_GRAVITY * dt;
          if (jumpY >= HEAD_ROOM) {
            jumpY = HEAD_ROOM;
            vy = Math.min(vy, 0);
          }
          if (jumpY <= 0) jumpY = vy = 0;
        }
      } else {
        vx = vz = 0; // paused or in a dialog: stop walking
      }
      refreshHint();
      camera.position.set(player.x, player.y + jumpY, player.z);
      camera.rotation.set(pitch, yaw, 0, "YXZ");
    },
  };

  // Test handle for automated checks: open the game with ?debug in the address.
  if (location.search.includes("debug"))
    window.__lf = {
      ctx,
      stick: stickInput,
      physics: () => ({ x: player.x, z: player.z, vx, vz, vy, jumpY, yaw, pitch }),
      setLook(y, p) {
        yaw = y;
        pitch = p;
      },
    };
  return api;
}
