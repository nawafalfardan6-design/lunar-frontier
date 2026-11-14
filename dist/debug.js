// Local development panel. Inspection and movement tools do not alter mission saves.
import { START_POSITION } from "./controls.js";

// Replay earlier choices so flags, warnings and resource totals match the selected day.
export function debugDayState(day, source, engine) {
  if (!Number.isInteger(day) || day < 0 || day >= engine.days.length) {
    throw new RangeError("Invalid mission day");
  }
  let state = engine.initial();
  for (let index = 0; index < day; index++) {
    const choiceId = source.log[index]?.choiceId;
    const saved = engine.days[index].choices.findIndex((choice) => choice.id === choiceId);
    state = engine.decide(state, saved >= 0 ? saved : 0);
  }
  state.debugPreview = true;
  return state;
}

export function createDebugMenu(ctx) {
  let opened = false;
  let changedDay = false;
  let previousPanel = null;
  let previousFocus = null;
  let hadDialog = false;
  let timer = null;
  let wireframe = false;
  const materials = new Map();

  function close() {
    if (!opened) return;
    opened = false;
    clearInterval(timer);
    ctx.keys.clear();
    ctx.modal.replaceChildren();
    if (changedDay) {
      ctx.hud.resume();
    } else if (hadDialog) {
      ctx.modal.append(previousPanel);
      previousFocus?.focus();
    } else if (ctx.inMenu) {
      ctx.dialog.close();
      previousFocus?.focus();
    } else {
      ctx.hud.resume();
    }
    previousPanel = null;
  }

  function open() {
    if (ctx.stage.renderer.xr.isPresenting) return;
    opened = true;
    changedDay = false;
    hadDialog = ctx.dialog.open;
    previousFocus = document.activeElement;
    previousPanel = document.createDocumentFragment();
    while (ctx.modal.firstChild) previousPanel.append(ctx.modal.firstChild);
    ctx.hud.show(`
      <section class="debug-panel">
        <span class="kicker">DEVELOPER TOOLS</span>
        <h2>Debug menu</h2>
        <p>Ctrl + ' or Escape closes this menu. Day changes are for testing and are not saved. Reload to return to saved progress.</p>
        <pre id="debug-status" aria-label="Game status"></pre>
        <label for="debug-day">Mission day</label>
        <select id="debug-day"></select>
        <button id="debug-set-day">Go to day</button>
        <p>Earlier days use your recorded choices, or the first option when none exists.</p>
        <label for="debug-station">Teleport to station</label>
        <select id="debug-station"></select>
        <div class="debug-actions">
          <button id="debug-teleport">Teleport</button>
          <button id="debug-spawn">Return to spawn</button>
          <button id="debug-wireframe" aria-pressed="${wireframe}">Wireframe: ${wireframe ? "on" : "off"}</button>
          <button id="debug-close">Close</button>
        </div>
        <p id="debug-message" role="status"></p>
      </section>`);
    const daySelect = document.getElementById("debug-day");
    days.forEach((day, index) => {
      daySelect.add(new Option(`Day ${index + 1}`, String(index)));
    });
    daySelect.value = String(Math.min(ctx.state.day, days.length - 1));
    const select = document.getElementById("debug-station");
    ctx.stations.forEach((station, index) => {
      select.add(new Option(station.name, String(index)));
    });
    const status = document.getElementById("debug-status");
    const refresh = () => {
      const info = ctx.stage.renderer.info.render;
      status.textContent = [
        `Day: ${Math.min(ctx.state.day + 1, days.length)} / ${days.length}${ctx.state.ended ? " (ended)" : ""}${ctx.state.debugPreview ? " — test mode" : ""}`,
        ...RESOURCE_KEYS.map((key) => `${RESOURCES[key].label}: ${ctx.state[key]}`),
        `Position: ${ctx.player.x.toFixed(2)}, ${ctx.player.y.toFixed(2)}, ${ctx.player.z.toFixed(2)}`,
        `Draw calls: ${info.calls} | Triangles: ${info.triangles}`,
      ].join("\n");
    };
    refresh();
    timer = setInterval(refresh, 300);
    const message = document.getElementById("debug-message");
    document.getElementById("debug-set-day").onclick = () => {
      ctx.state = debugDayState(Number(daySelect.value), ctx.state, { days, initial, decide });
      ctx.missionStarted = true;
      changedDay = true;
      // A terminal or result panel from the old day must not retain stale handlers.
      hadDialog = false;
      previousPanel = null;
      ctx.hud.updateMeters();
      const stationIndex = ctx.stations.findIndex((station) =>
        station.name === days[ctx.state.day].station);
      if (stationIndex >= 0) select.value = String(stationIndex);
      message.textContent = `Day ${ctx.state.day + 1} selected. Close the menu to play it.`;
      refresh();
    };
    document.getElementById("debug-teleport").onclick = () => {
      const station = ctx.stations[Number(select.value)];
      let spot = null;
      for (const radius of [1.5, 2, 2.5, 3]) {
        for (let i = 0; i < 16; i++) {
          const angle = (i / 16) * Math.PI * 2;
          const x = station.x + Math.sin(angle) * radius;
          const z = station.z + Math.cos(angle) * radius;
          if (ctx.clearAt(x, z)) { spot = { x, z }; break; }
        }
        if (spot) break;
      }
      if (!spot) { message.textContent = "No clear landing spot near this station."; return; }
      ctx.controls.reset();
      ctx.player.set(spot.x, START_POSITION[1], spot.z);
      message.textContent = `Moved to ${station.name}. Close this menu to continue.`;
      refresh();
    };
    document.getElementById("debug-spawn").onclick = () => {
      ctx.controls.reset();
      ctx.player.set(...START_POSITION);
      message.textContent = "Returned to spawn.";
      refresh();
    };
    document.getElementById("debug-wireframe").onclick = (event) => {
      wireframe = !wireframe;
      if (wireframe) {
        ctx.stage.scene.traverse((object) => {
          if (!object.isMesh) return;
          const list = Array.isArray(object.material) ? object.material : [object.material];
          list.forEach((material) => {
            if (!materials.has(material)) materials.set(material, material.wireframe);
            material.wireframe = true;
          });
        });
      } else {
        materials.forEach((value, material) => { material.wireframe = value; });
        materials.clear();
      }
      event.currentTarget.textContent = `Wireframe: ${wireframe ? "on" : "off"}`;
      event.currentTarget.setAttribute("aria-pressed", String(wireframe));
    };
    document.getElementById("debug-close").onclick = close;
  }

  document.addEventListener("keydown", (event) => {
    const shortcut = event.ctrlKey && !event.altKey && !event.metaKey &&
      (event.code === "Quote" || event.key === "'");
    if (!shortcut && !(opened && event.code === "Escape")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) return;
    if (opened) close(); else open();
  }, true);
  ctx.dialog.addEventListener("cancel", (event) => {
    if (!opened) return;
    event.preventDefault();
    close();
  });
}
