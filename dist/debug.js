// Local development panel. Inspection and movement tools do not alter mission saves.
import { START_POSITION } from "./controls.js";

export function createDebugMenu(ctx) {
  let opened = false;
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
    if (hadDialog) {
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
    hadDialog = ctx.dialog.open;
    previousFocus = document.activeElement;
    previousPanel = document.createDocumentFragment();
    while (ctx.modal.firstChild) previousPanel.append(ctx.modal.firstChild);
    ctx.hud.show(`
      <section class="debug-panel">
        <span class="kicker">DEVELOPER TOOLS</span>
        <h2>Debug menu</h2>
        <p>Ctrl + ' or Escape closes this menu. Mission saves are unchanged.</p>
        <pre id="debug-status" aria-label="Game status"></pre>
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
    const select = document.getElementById("debug-station");
    ctx.stations.forEach((station, index) => {
      select.add(new Option(station.name, String(index)));
    });
    const status = document.getElementById("debug-status");
    const refresh = () => {
      const info = ctx.stage.renderer.info.render;
      status.textContent = [
        `Day: ${ctx.state.day + 1} / ${days.length}${ctx.state.ended ? " (ended)" : ""}`,
        ...RESOURCE_KEYS.map((key) => `${RESOURCES[key].label}: ${ctx.state[key]}`),
        `Position: ${ctx.player.x.toFixed(2)}, ${ctx.player.y.toFixed(2)}, ${ctx.player.z.toFixed(2)}`,
        `Draw calls: ${info.calls} | Triangles: ${info.triangles}`,
      ].join("\n");
    };
    refresh();
    timer = setInterval(refresh, 300);
    const message = document.getElementById("debug-message");
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
