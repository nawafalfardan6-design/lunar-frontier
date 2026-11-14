// world.js: entry point for the 3D game (index.html).
// Owns the shared context object (ctx), wiring between modules, the saved-mission
// restore and the per-frame animation loop. Edit elsewhere for most changes:
//   scene.js + landscape.js  3D world, lights, materials, terrain, sky
//   ship.js                  ship interior layout and collision boxes
//   controls.js              keyboard, mouse/touch look, movement physics
//   hud.js + mission-panels.js  HUD, dialogs, menus, settings
//   tasks.js                 hands-on mini-games
// Engine globals from engine.js (classic script): days, initial, decide, dailyBudget,
// RESOURCES, RESOURCE_KEYS.
import { createDebugMenu } from "./debug.js";
import * as T from "./vendor/three.module.js";
import { shipStations } from "./ship.js";
import { createCompanion } from "./companion.js";
import { loadMission } from "./mission-session.js";
import { createXR } from "./xr.js";
import { createScene } from "./scene.js";
import { createControls, createClearance, START_POSITION } from "./controls.js";
import { createHud, createEntry, loadPreferences, currentStation } from "./hud.js";

// Shared context. Modules read and write these fields at call time.
const ctx = {
  canvas: document.getElementById("world"),
  dialog: document.getElementById("dialog"),
  modal: document.getElementById("modal"),
  state: initial(), // mission state from engine.js; replaced by decide()
  playing: false, // walking around (not paused, not on the title screen)
  inMenu: true, // title screen is showing
  missionStarted: false, // start button reads CONTINUE once true
  near: false, // player is within reach of today's terminal
  gloveReach: 0, // 1 right after interacting, eases back to 0
  keys: new Set(), // KeyboardEvent.code values currently held
  player: new T.Vector3(...START_POSITION),
  obstacles: [], // collision boxes, filled while the ship is built
  stations: shipStations, // ship terminals; days[i].station names each day's (currentStation)
  preferences: loadPreferences(),
  entry: null, // title-screen <section>, hud.js
  clearAt: null, // collision test, controls.js
  stage: null, // renderer, camera and scene animation, scene.js
  hud: null, // dialogs and HUD text, hud.js
  controls: null, // input and movement, controls.js
  xr: null, // WebXR session, xr.js
};
const { dialog } = ctx;

ctx.entry = createEntry();
ctx.clearAt = createClearance(ctx.obstacles);
ctx.stage = createScene(ctx);
ctx.hud = createHud(ctx);
ctx.controls = createControls(ctx);
const { stage, hud, controls, player, preferences } = ctx;

window.addEventListener("resize", stage.resize);
stage.resize();

ctx.xr = createXR({
  renderer: stage.renderer,
  scene: stage.scene,
  camera: stage.camera,
  dialog,
  modal: ctx.modal,
  interact: hud.interact,
  position: player,
  move: controls.move,
  status() {
    const { state } = ctx;
    const station = currentStation(ctx);
    ctx.near = Math.hypot(station.x - player.x, station.z - player.z) < 3.4;
    if (state.ended) return "Mission complete\nPull trigger to view report";
    const meters = RESOURCE_KEYS.map((key) => `${RESOURCES[key].label} ${state[key]}`).join(" · ");
    const sky = dailyBudget(state.day).sunlight ? "Daylight" : "Lunar night: heaters on";
    const warnings = state.warnings.map((w) => `Warning: ${w.text}`).join("\n");
    return `DAY ${state.day + 1} OF ${days.length} · ${sky}\n${meters}\n${warnings ? warnings + "\n" : ""}Go to: ${station.name}\n${ctx.near ? "Pull trigger to use the terminal" : "Follow the amber marker"}\nLeft stick: move · Right stick: snap turn`;
  },
});
ctx.xr
  .supported()
  .then((supported) => {
    if (supported) document.body.classList.add("vr-supported");
  })
  .catch(() => {});
hud.addVrButton(ctx.xr);

let previous = performance.now();
function frame(time) {
  const dt = Math.min((time - previous) / 1000, 0.05);
  previous = time;
  const motion = ctx.playing && !dialog.open && !ctx.inMenu && !preferences.reducedMotion;
  stage.animateBackdrop(time, dt, motion);
  // Today's terminal: the amber beacon (scene.js) and the on-screen marker point at it.
  const activeTarget = currentStation(ctx);
  hud.updateMarker(activeTarget);
  if (stage.renderer.xr.isPresenting) {
    stage.hideGloves();
    ctx.xr.update(dt);
    stage.render();
    return;
  }
  stage.showGloves();
  ctx.gloveReach = Math.max(0, ctx.gloveReach - dt * 2.8);
  stage.animateGloves(time, ctx.gloveReach, motion, motion && controls.isWalking());
  if (ctx.inMenu) {
    stage.renderMenu(dt, preferences.moonSpin);
    return;
  }
  controls.update(dt, stage.camera);
  stage.animateIdle(time, preferences.reducedMotion);
  ctx.near = Math.hypot(activeTarget.x - player.x, activeTarget.z - player.z) < 3.4;
  hud.updateFrameText(activeTarget);
  stage.render();
}

createCompanion(() => ctx.state, hud.show, hud.resume);
const restored = loadMission(initial, decide);
if (restored) {
  ctx.state = restored;
  ctx.missionStarted = true;
}
hud.updateMeters();
hud.applyPreferences();
hud.titleScreen();
createDebugMenu(ctx);
stage.renderer.setAnimationLoop(frame);
