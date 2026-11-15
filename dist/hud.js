// hud.js: on-screen interface (DOM only, no Three.js objects).
// Owns the HUD (day, sunlight, meters, stars, today's job and warnings), the destination
// marker, the shared <dialog> (show/resume), title menu, settings, how-to, help, pause,
// mission goals, the terminal flow (choice → hands-on task → result), the mission report,
// the VR button, and saved settings (preferences) in localStorage.
// The HTML for the HUD and the mission dialogs comes from mission-panels.js.
// Engine globals from engine.js: days, initial, decide.
import * as T from "./vendor/three.module.js";
import { companionReaction } from "./companion.js";
import { saveMission } from "./mission-session.js";
import { startTask } from "./tasks.js";
import { acknowledgeEarth } from "./mission-evidence.js";
import {
  hudHtml,
  objectiveHtml,
  choiceHtml,
  resultHtml,
  reportHtml,
  goalsHtml,
  guideHtml,
  sourcesHtml,
} from "./mission-panels.js";

const SETTINGS_KEY = "lunar-frontier-settings";

export function loadPreferences() {
  const preferences = {
    quality: "high",
    moonSpin: true,
    sensitivity: 1,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    remoteAssist: false, // accessibility: a button that opens today's terminal from anywhere
  };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    // Rotation starts on each visit; the title control can pause it for this session.
    if (["low", "high"].includes(saved.quality)) preferences.quality = saved.quality;
    if (Number.isFinite(saved.sensitivity))
      preferences.sensitivity = Math.max(0.4, Math.min(2, saved.sensitivity));
    if (typeof saved.reducedMotion === "boolean") preferences.reducedMotion = saved.reducedMotion;
    if (typeof saved.remoteAssist === "boolean") preferences.remoteAssist = saved.remoteAssist;
  } catch {}
  return preferences;
}

// The terminal for today's mission day: days[i].station names one of ctx.stations.
export function currentStation(ctx) {
  const expeditionTarget = ctx.eva?.target();
  if (expeditionTarget) return expeditionTarget;
  const day = days[Math.min(ctx.state.day, days.length - 1)];
  return ctx.stations.find((station) => station.name === day.station) || ctx.stations[0];
}

// Title-screen container. Created before the renderer, so it exists even without WebGL.
export function createEntry() {
  const entry = document.createElement("section");
  entry.id = "entry";
  document.body.append(entry);
  return entry;
}

// Needs ctx.stage (scene.js), ctx.controls, ctx.entry and the shared game state on ctx.
export function createHud(ctx) {
  const { dialog, modal, keys, preferences } = ctx;
  const touch = matchMedia("(pointer: coarse)");
  const hud = document.getElementById("hud");
  const objective = document.getElementById("objective");
  const prompt = document.getElementById("prompt");
  const interactButton = document.getElementById("interact");

  const destination = document.createElement("div");
  destination.id = "destination-marker";
  destination.innerHTML = "<span>◇</span><small></small>";
  document.body.append(destination);
  const markerPosition = new T.Vector3();
  // Remote assist opens today's terminal from anywhere. It is an accessibility
  // setting, off by default; applyPreferences() shows or hides the button.
  const stationAccess = document.createElement("button");
  stationAccess.id = "station-access";
  stationAccess.textContent = "Remote assist";
  stationAccess.hidden = true;
  document.body.append(stationAccess);

  // HUD panel (day, sunlight, meters, stars) and the beacon. Called when state changes.
  function updateMeters() {
    lastObjective = "";
    hud.innerHTML = hudHtml(ctx.state);
    ctx.stage.setMissionDay(Math.min(ctx.state.day, days.length - 1));
    document.getElementById("hud-goals").onclick = () => {
      if (!dialog.open && !ctx.inMenu) goalsDialog(resume);
    };
    ctx.stage.placeBeacon(currentStation(ctx));
  }

  // Opens the shared dialog with the given HTML. Every panel goes through here.
  function show(html) {
    keys.clear();
    document.exitPointerLock?.();
    modal.innerHTML = html;
    if (!dialog.open) dialog.showModal();
    // Focus the heading, not the first button, so a stray Space or Enter (jump, E)
    // can't pick a choice by accident. Tab then reaches the buttons.
    const heading = modal.querySelector("h1, h2");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    dialog.scrollTop = 0; // showModal() may have scrolled to the first button
  }
  // Closes the dialog and returns to walking around the ship.
  function resume() {
    dialog.close();
    ctx.inMenu = false;
    ctx.missionStarted = true;
    document.body.classList.remove("title-screen");
    ctx.playing = true;
    ctx.controls.relock(); // mouse: look around again without an extra click
  }
  function applyPreferences() {
    ctx.stage.applyQuality(preferences.quality);
    document.body.classList.toggle("reduce-motion", preferences.reducedMotion);
    stationAccess.hidden = !preferences.remoteAssist;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(preferences));
    } catch {}
  }

  function titleScreen() {
    ctx.playing = false;
    ctx.inMenu = true;
    keys.clear();
    dialog.close();
    document.body.classList.add("title-screen");
    ctx.entry.innerHTML = `<div class="entry-panel"><h1>LUNAR<br><span>FRONTIER</span></h1><nav aria-label="Main menu"><button id="start-game">${ctx.missionStarted ? "CONTINUE EXPEDITION" : "START EXPEDITION"} <span>↗</span></button><button id="settings">SETTINGS <span>⚙</span></button><button id="how-to">HOW TO PLAY <span>?</span></button></nav></div><div class="moon-caption"><button id="moon-spin">${preferences.moonSpin ? "Pause rotation" : "Rotate Moon"}</button></div>`;
    document.getElementById("start-game").onclick = () => {
      if (ctx.missionStarted) {
        resume();
        return;
      }
      ctx.eva.opening();
    };
    if (ctx.missionStarted) {
      const fresh = document.createElement("button");
      fresh.textContent = "NEW EXPEDITION";
      document.getElementById("start-game").after(fresh);
      fresh.onclick = () => {
        show('<h2>Start a new expedition?</h2><p>This replaces your progress on this device.</p><button id="fresh-yes">Start again</button><button id="fresh-no">Keep my progress</button>');
        document.getElementById("fresh-no").onclick = () => dialog.close();
        document.getElementById("fresh-yes").onclick = () => {
          ctx.state = initial();
          ctx.eva.reset();
          updateMeters();
        };
      };
    }
    document.getElementById("settings").onclick = () => settingsMenu();
    document.getElementById("moon-spin").onclick = (event) => {
      preferences.moonSpin = !preferences.moonSpin;
      event.target.textContent = preferences.moonSpin ? "Pause rotation" : "Rotate Moon";
      applyPreferences();
    };
    document.getElementById("how-to").onclick = () => {
      show(
        `<section class="lf-panel lf-guide"><span class="kicker">FIELD GUIDE</span><h2>You are the commander.</h2><p>Selene has landed on the Moon with four crew. Keep them safe for ${days.length} days.</p>${guideHtml()}<button id="menu-back">Back to menu</button></section>`,
      );
      document.getElementById("menu-back").onclick = () => dialog.close();
    };
  }

  // back: what "Done" does (close the dialog on the title screen, or return to pause).
  function settingsMenu(back = () => dialog.close()) {
    show(
      `<span class="kicker">MAKE YOURSELF AT HOME</span><h2>Settings</h2><div class="setting"><label for="quality">Graphics quality</label><select id="quality"><option value="high">High · shadows enabled</option><option value="low">Low · smoother performance</option></select></div><div class="setting"><label for="sensitivity">Look sensitivity <output id="sensitivity-value">${preferences.sensitivity.toFixed(1)}×</output></label><input id="sensitivity" type="range" min="0.4" max="2" step="0.1" value="${preferences.sensitivity}"></div><div class="setting check"><label for="motion">Reduce motion</label><input id="motion" type="checkbox" ${preferences.reducedMotion ? "checked" : ""}></div><div class="setting check"><label for="remote-assist">Remote assist: use terminals from anywhere</label><input id="remote-assist" type="checkbox" ${preferences.remoteAssist ? "checked" : ""}></div><p>Reduced motion stops decorative animations. Remote assist adds a button that opens today’s terminal from anywhere, so you don’t have to walk there. Settings save on this device.</p><button id="settings-done">Done</button>`,
    );
    document.getElementById("quality").value = preferences.quality;
    document.getElementById("quality").onchange = (e) => {
      preferences.quality = e.target.value;
      applyPreferences();
    };
    document.getElementById("sensitivity").oninput = (e) => {
      preferences.sensitivity = Number(e.target.value);
      document.getElementById("sensitivity-value").textContent =
        preferences.sensitivity.toFixed(1) + "×";
      applyPreferences();
    };
    document.getElementById("motion").onchange = (e) => {
      preferences.reducedMotion = e.target.checked;
      applyPreferences();
    };
    document.getElementById("remote-assist").onchange = (e) => {
      preferences.remoteAssist = e.target.checked;
      applyPreferences();
    };
    document.getElementById("settings-done").onclick = back;
  }

  // Stars, warnings and today's power budget. back: what "Got it" does.
  function goalsDialog(back) {
    show(goalsHtml(ctx.state));
    document.getElementById("goals-close").onclick = back;
  }

  // End-of-mission report: stars, summary and a day-by-day recap.
  function missionReport() {
    show(reportHtml(ctx.state));
    document.getElementById("replay").onclick = () => {
      ctx.state = initial();
      ctx.eva.reset();
      updateMeters();
    };
    document.getElementById("explore").onclick = resume;
  }

  // Terminal: choice dialog, then the hands-on task (tasks.js), then the result dialog
  // after decide() applies the choice.
  // direct = true is "Remote assist", which works from anywhere.
  function interact(direct = false) {
    if (dialog.open || !ctx.playing) return;
    ctx.gloveReach = 1;
    if (ctx.state.ended) {
      missionReport();
      return;
    }
    if (ctx.eva?.intercept()) return;
    if (!ctx.near && !direct) return;
    chooseJob();
  }

  function chooseJob() {
    const { state } = ctx;
    show(choiceHtml(state));
    document.getElementById("back").onclick = resume;
    modal.querySelectorAll("[data-choice]").forEach((button) => {
      button.onclick = () => {
        if (ctx.state !== state) return; // already chosen (double click)
        const index = Number(button.dataset.choice);
        const finish = () => {
          if (days[state.day].choices[index].kind === "comms") {
            acknowledgeEarth(show, () => applyChoice(state, index));
          } else applyChoice(state, index);
        };
        // VR has no sliders, so the mini-game is skipped there.
        if (ctx.stage.renderer.xr.isPresenting) finish();
        else startTask(days[state.day].choices[index], state.day + 1, show, finish, chooseJob);
      };
    });
  }

  function applyChoice(before, index) {
    if (ctx.state !== before) return;
    ctx.state = decide(before, index);
    const saved = saveMission(ctx.state);
    updateMeters();
    const { state } = ctx;
    show(resultHtml(before, state, companionReaction(state), saved));
    document.getElementById("continue").onclick = state.ended ? missionReport : resume;
  }

  function pause() {
    keys.clear();
    if (ctx.stage.renderer.xr.isPresenting) return;
    if (!ctx.playing || dialog.open) return;
    ctx.playing = false;
    pauseMenu();
  }
  function pauseMenu() {
    show(
      '<h2>Mission paused</h2><p>Your crew is waiting.</p><div class="lf-menu"><button id="resume" class="lf-primary">Resume exploration</button><button class="secondary" id="pause-goals">Mission goals ★</button><button class="secondary" id="pause-settings">Settings</button><button class="secondary" id="main-menu">Main menu</button></div>',
    );
    document.getElementById("resume").onclick = resume;
    document.getElementById("pause-goals").onclick = () => goalsDialog(pauseMenu);
    document.getElementById("pause-settings").onclick = () => settingsMenu(pauseMenu);
    document.getElementById("main-menu").onclick = titleScreen;
  }

  interactButton.onclick = () => interact();
  stationAccess.onclick = () => interact(true);
  document.getElementById("help").onclick = () => {
    show(
      `<section class="lf-panel lf-guide"><span class="kicker">CONTROLS &amp; SCIENCE</span><h2>How to play</h2>${guideHtml()}<h3 class="lf-subhead">The science</h3><p>Each turn is one Earth day aboard the landed spacecraft Selene. The numbers are simplified game rules, but the science ideas are real. Learn more from NASA:</p>${sourcesHtml()}<button id="return">${ctx.inMenu ? "Back to menu" : "Return to ship"}</button></section>`,
    );
    document.getElementById("return").onclick = () => (ctx.inMenu ? dialog.close() : resume());
  };
  dialog.addEventListener("cancel", (e) => e.preventDefault());

  // Last values written by updateFrameText, so the DOM only changes when the text does.
  let lastObjective = "";
  let lastPrompt = "";

  return {
    show,
    resume,
    pause,
    interact,
    report: missionReport,
    titleScreen,
    settingsMenu,
    applyPreferences,
    updateMeters,

    // VR entry button; shown by CSS when body has the vr-supported class.
    addVrButton(xr) {
      const vrButton = document.createElement("button");
      vrButton.id = "enter-vr";
      vrButton.textContent = "Enter VR";
      document.body.append(vrButton);
      vrButton.onclick = async () => {
        vrButton.disabled = true;
        try {
          await xr.enter();
          if (!ctx.missionStarted) ctx.eva.opening();
          else resume();
        } catch {
          show(
            '<h2>VR could not start</h2><p>Open the game directly in Quest Browser and try again.</p><button id="vr-close">Close</button>',
          );
          document.getElementById("vr-close").onclick = () => dialog.close();
        } finally {
          vrButton.disabled = false;
        }
      };
    },

    // Every frame: the on-screen marker over the target terminal.
    updateMarker(activeTarget) {
      const { camera, renderer } = ctx.stage;
      destination.hidden = ctx.inMenu || dialog.open || ctx.state.ended || renderer.xr.isPresenting;
      if (!destination.hidden) {
        camera.updateMatrixWorld();
        markerPosition.set(activeTarget.x, 2.2, activeTarget.z).project(camera);
        if (markerPosition.z > 1) {
          const local = camera.worldToLocal(new T.Vector3(activeTarget.x, 2.2, activeTarget.z));
          markerPosition.x = local.x >= 0 ? 2 : -2;
          markerPosition.y = 0;
        }
        destination.style.left = `${Math.max(5, Math.min(95, (markerPosition.x * 0.5 + 0.5) * 100))}%`;
        destination.style.top = `${Math.max(16, Math.min(84, (-markerPosition.y * 0.5 + 0.5) * 100))}%`;
        destination.querySelector("small").textContent = activeTarget.name;
      }
    },

    // Every frame while walking: today's job card, the interact prompt and the Interact
    // button. Each is only written when it changes.
    updateFrameText(station) {
      const { state } = ctx;
      const objectiveText = objectiveHtml(state, station, touch.matches);
      if (objectiveText !== lastObjective) {
        lastObjective = objectiveText;
        objective.innerHTML = objectiveText;
      }
      const action = touch.matches ? "tap Use terminal" : "press E";
      const promptText = state.ended
        ? `Mission complete · ${action} for your report`
        : ctx.near
          ? `${station.name} · ${action}`
          : "";
      if (promptText !== lastPrompt) {
        lastPrompt = promptText;
        prompt.textContent = promptText;
      }
      const disabled = !state.ended && !ctx.near;
      if (interactButton.disabled !== disabled) interactButton.disabled = disabled;
    },
  };
}
