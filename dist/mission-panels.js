// mission-panels.js: HTML for the HUD and the mission dialogs of the 3D game.
// Pure functions: each takes the mission state and returns an HTML string.
// hud.js puts the HTML on screen and wires up the buttons; hud.css styles it.
// Engine globals from engine.js: RESOURCES, RESOURCE_KEYS, SAFE_LEVEL, RESERVE_GOAL,
// RESEARCH_GOAL, SUNSET_DAY, days, dailyBudget, forecast, goals, report.

import { stormEvidence } from "./mission-evidence.js";

const KIND_LABELS = {
  repair: "🔧 Repair",
  science: "🧪 Science",
  shelter: "🧱 Shelter",
  garden: "🌱 Garden",
  comms: "📡 Radio",
  rest: "💤 Rest",
};
const NOTE_ICONS = { good: "✅", bad: "⚠️", info: "ℹ️", warn: "⚠️" };
// These warnings are about time passing, not about a choice, so no choice "fixes" them.
const NOT_FIXABLE = ["battery", "sunset"];

export const CONTROLS_TEXT =
  "WASD / arrows move · Shift runs · click and move the mouse to look (Esc to pause) · " +
  "E uses a terminal · Space jumps · on phones, use the joystick and drag to look";

export function esc(text) {
  return String(text).replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch],
  );
}

// Signed number with a real minus sign: +8, −12.
const signed = (n) => `${n > 0 ? "+" : "−"}${Math.abs(n)}`;
// "Air filter worn." from "Air filter worn. It will clog at the end of Day 3."
const firstSentence = (text) => (text.match(/^.*?[.!?](?=\s|$)/) || [text])[0];
// A warning's fix, e.g. "👉 Fix it on Day 3: choose …".
const fixLine = (w) => `<span class="lf-fix">👉 ${esc(w.fix)}</span>`;

// Chips like "⚡ −8  💨 +8": green when a meter goes up, red when it goes down.
export function chips(effects, emptyText = "No change") {
  const items = RESOURCE_KEYS.filter((key) => effects[key]).map((key) => {
    const { icon, label } = RESOURCES[key];
    const tone = effects[key] > 0 ? "lf-up" : "lf-down";
    const text = signed(effects[key]);
    return `<span class="lf-chip ${tone}" role="img" aria-label="${esc(label)} ${text}" title="${esc(label)}">${icon} ${text}</span>`;
  });
  return items.length ? items.join("") : `<span class="lf-chip lf-none">${esc(emptyText)}</span>`;
}

// Where each meter's danger line sits. Below the line the meter is red, and less than
// 10 above it amber. The Battery uses the night reserve goal; Science only grows.
function dangerLine(key) {
  if (key === "power") return RESERVE_GOAL;
  if (key === "science") return null;
  return SAFE_LEVEL;
}
// The goal tick drawn on each meter's bar.
const GOAL_TICK = {
  power: RESERVE_GOAL,
  life: SAFE_LEVEL,
  safety: SAFE_LEVEL,
  science: RESEARCH_GOAL,
};

function meterTone(key, value) {
  const line = dangerLine(key);
  if (line === null) return "ok";
  if (value < line) return "danger";
  if (value < line + 10) return "low";
  return "ok";
}

// "MC" for "Mission control · Earth", "M" for "Maya · habitat engineer".
function initials(speaker) {
  const words = speaker.split("·")[0].trim().split(/\s+/);
  return words.length > 1
    ? words
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
    : words[0][0];
}

function sunLine(dayIndex) {
  const budget = dailyBudget(dayIndex);
  const daysToSunset = SUNSET_DAY - (dayIndex + 1);
  if (!budget.sunlight)
    return {
      budget,
      main: "🌙 Lunar night: heaters on",
      sub: `Ship + heaters use −${budget.load} ⚡ a day. No solar power.`,
    };
  return {
    budget,
    main: `☀️ Daylight: +${budget.solar} ⚡`,
    sub: `Ship uses −${budget.load} ⚡ a day · ${daysToSunset === 1 ? "Sunset tomorrow!" : `Sunset on Day ${SUNSET_DAY}`}`,
  };
}

/* ------------------------------------------------------------------ */
/* Persistent HUD                                                      */
/* ------------------------------------------------------------------ */

// Top left: day, sunlight, the four meters and the stars button (#hud-goals).
export function hudHtml(state) {
  const dayIndex = Math.min(state.day, days.length - 1);
  const sun = sunLine(dayIndex);
  const dayText = state.ended ? "MISSION OVER" : `DAY ${state.day + 1} OF ${days.length}`;
  const meters = RESOURCE_KEYS.map((key) => {
    const { icon, label, about } = RESOURCES[key];
    const value = state[key];
    const tone = meterTone(key, value);
    const status = tone === "danger" ? "Danger!" : tone === "low" ? "Getting low" : "";
    return `<li class="lf-meter lf-${tone}" title="${esc(label)}: ${esc(about)}">
      <span class="lf-icon" role="img" aria-label="${esc(label)}">${icon}</span>
      <span class="lf-name" aria-hidden="true">${esc(label)}</span>
      <b>${value}</b>${status ? `<span class="lf-sr">${status}</span>` : ""}
      <span class="lf-bar" aria-hidden="true"><i style="width:${value}%"></i><em style="left:${GOAL_TICK[key]}%"></em></span>
    </li>`;
  }).join("");
  const stars = goals(state);
  const earned = stars.filter((star) => star.earned).length;
  const starItems = stars
    .map(
      (star) =>
        `<span class="lf-star${star.earned ? " earned" : ""}" title="${esc(star.how)}"><i aria-hidden="true">${star.earned ? "★" : "☆"}</i><span>${esc(star.label)}</span></span>`,
    )
    .join("");
  return `<div class="lf-day">
      <span class="kicker">${dayText}</span>
      <span class="lf-sun ${sun.budget.sunlight ? "lf-daylight" : "lf-night"}" title="${esc(sun.budget.label)}">${sun.main}<small>${esc(sun.sub)}</small></span>
    </div>
    <ul class="lf-meters" aria-label="Ship meters">${meters}</ul>
    <button type="button" id="hud-goals" class="lf-stars" aria-label="Stars: ${earned} of ${stars.length}. Open mission goals.">
      <span class="kicker">STARS ${earned}/${stars.length} <span class="lf-tap">· click to see how</span></span>
      <span class="lf-star-list">${starItems}</span>
    </button>`;
}

// Top right: today's job, where to go, and the active warnings.
export function objectiveHtml(state, station, touch) {
  if (state.ended)
    return `<span class="kicker">MISSION COMPLETE</span><h2>See your stars!</h2><p class="lf-goto">${touch ? "Tap <b>Use terminal</b>" : "Press <b>E</b>"} to open your mission report.</p>`;
  const day = days[state.day];
  const warnings = state.warnings
    .map((w) => `<li><b>⚠ ${esc(w.text)}</b>${fixLine(w)}</li>`)
    .join("");
  return `<span class="kicker">TODAY’S JOB · DAY ${state.day + 1}</span>
    <h2>${esc(day.title)}</h2>
    <p class="lf-goto">Go to the <b>◇ ${esc(station.name)}</b> terminal.</p>
    ${warnings ? `<ul class="lf-warnings" aria-label="Warnings">${warnings}</ul>` : ""}`;
}

/* ------------------------------------------------------------------ */
/* Choice dialog                                                       */
/* ------------------------------------------------------------------ */

const hasWarning = (list, id) => list.some((w) => w.id === id);
// Warnings a forecast says will hit tonight (bad notes carry the warning id as `cause`).
const hitsTonight = (preview) =>
  preview.notes.filter((n) => n.tone === "bad" && n.cause).map((n) => n.cause);

// What a choice leads to, beyond the meter numbers: goals, risks and warnings.
function choiceLines(state, preview, previews) {
  const lines = [];
  for (const note of preview.notes) {
    if (note.topic === "goal" || note.topic === "risk")
      lines.push({ tone: note.tone, text: note.ahead || note.text });
  }
  // New warnings for tomorrow that this choice causes (ones every choice brings are
  // shown once above the choices instead).
  for (const w of preview.warnings) {
    if (hasWarning(state.warnings, w.id)) continue;
    if (previews.every((p) => hasWarning(p.warnings, w.id))) continue;
    const text =
      w.id === "battery" ? "Tomorrow the Battery will be very low." : `New warning: ${w.text}`;
    lines.push({ tone: "warn", text });
  }
  // Warnings this choice fixes: gone after it, while another choice keeps them or lets them hit.
  for (const w of state.warnings) {
    if (NOT_FIXABLE.includes(w.id)) continue;
    const gone = !hasWarning(preview.warnings, w.id) && !hitsTonight(preview).includes(w.id);
    const otherKeeps = previews.some(
      (p) => p !== preview && (hasWarning(p.warnings, w.id) || hitsTonight(p).includes(w.id)),
    );
    if (gone && otherKeeps)
      lines.push({ tone: "good", text: `Fixes the warning “${firstSentence(w.text)}”` });
  }
  if (preview.endsMission && state.day + 1 < days.length)
    lines.push({ tone: "bad", text: "This would end the mission early!" });
  return lines;
}

function lineList(lines) {
  if (!lines.length) return "";
  return `<span class="lf-lines">${lines
    .map(
      (line) =>
        `<span class="lf-line lf-${line.tone}"><span aria-hidden="true">${NOTE_ICONS[line.tone]}</span> ${esc(line.text)}</span>`,
    )
    .join("")}</span>`;
}

function warningBox(warnings, title) {
  if (!warnings.length) return "";
  return `<div class="lf-alert"><p class="lf-alert-title">${title}</p><ul>${warnings
    .map(
      (w) =>
        `<li><b>⚠ ${esc(w.text)}</b> <span class="lf-due">Day ${w.dueDay}</span>${fixLine(w)}</li>`,
    )
    .join("")}</ul></div>`;
}

function budgetLine(dayIndex) {
  const budget = dailyBudget(dayIndex);
  return budget.sunlight
    ? `<p class="lf-budget lf-daylight"><span aria-hidden="true">☀️</span> Today the ship uses <b>${budget.load} ⚡</b>. Solar panels give <b>${budget.solar} ⚡</b>. That is <b>${signed(budget.solar - budget.load)} ⚡</b> before your job.</p>`
    : `<p class="lf-budget lf-night"><span aria-hidden="true">🌙</span> Lunar night: the ship and its heaters use <b>${budget.load} ⚡</b>. Solar panels give <b>0 ⚡</b>. That is <b>${signed(-budget.load)} ⚡</b> before your job.</p>`;
}

// The terminal dialog: briefing, today's budget, warnings and one card per choice.
// Buttons: [data-choice] for each choice and #back.
export function choiceHtml(state) {
  const day = days[state.day];
  const previews = day.choices.map((_, i) => forecast(state, i));
  const comingForAll = previews[0].warnings.filter(
    (w) => !hasWarning(state.warnings, w.id) && previews.every((p) => hasWarning(p.warnings, w.id)),
  );
  const cards = day.choices
    .map((choice, i) => {
      const preview = previews[i];
      const after = `${choice.label} (after tonight: ${effectText(preview.deltas) || "no change"})`;
      return `<button type="button" class="lf-choice" data-choice="${i}" data-short="${esc(after)}">
        <span class="lf-choice-label">${esc(choice.label)}</span>
        <span class="lf-kind">${KIND_LABELS[choice.kind] || esc(choice.kind)}</span>
        <span class="lf-summary">${esc(choice.summary)}</span>
        <span class="lf-row"><span class="lf-row-label">This job</span>${chips(choice.effects, "No meter change")}</span>
        <span class="lf-row lf-after"><span class="lf-row-label">After tonight</span>${chips(preview.deltas)}</span>
        ${lineList(choiceLines(state, preview, previews))}
        <span class="lf-pick">Choose this →</span>
      </button>`;
    })
    .join("");
  return `<section class="lf-panel lf-wide lf-choose">
    <span class="kicker">DAY ${state.day + 1} OF ${days.length} · ${esc(day.station.toUpperCase())}</span>
    <h2>${esc(day.title)}</h2>
    <div class="lf-context">
      <div>
        <div class="lf-brief">
          <span class="lf-avatar" aria-hidden="true">${esc(initials(day.speaker))}</span>
          <div>
            <p class="lf-speaker">${esc(day.speaker)}</p>
            <p class="lf-quote">“${esc(day.briefing)}”</p>
          </div>
        </div>
        <p class="lf-story">${esc(day.story)}</p>
      </div>
      <div>
        ${budgetLine(state.day)}
        ${state.expedition ? '<p class="lf-budget">Crew supplies tonight: −4 base oxygen, −1 meal-day. A shortage costs 5 Crew Safety. Life Support is the recycling-system health score; your stored supplies are shown separately.</p>' : ''}
        ${warningBox(state.warnings, "Warnings right now")}
        ${comingForAll.map((w) => `<p class="lf-coming"><b>Coming up:</b> ${esc(w.text)}</p>`).join("")}
      </div>
    </div>
    ${stormEvidence(state.day)}
    <div class="lf-pickrow">
      <h3 class="lf-subhead">Pick one job for today</h3>
      <p class="lf-hint">“After tonight” adds the solar power and what the ship uses.</p>
    </div>
    <div class="lf-choices">${cards}</div>
    <button type="button" class="secondary" id="back">Back to ship</button>
  </section>`;
}

/* ------------------------------------------------------------------ */
/* Result dialog                                                       */
/* ------------------------------------------------------------------ */

function notesList(notes) {
  return `<ul class="lf-notes">${notes
    .map(
      (note) =>
        `<li class="lf-note lf-${note.tone}"><span aria-hidden="true">${NOTE_ICONS[note.tone]}</span> ${esc(note.text)}</li>`,
    )
    .join("")}</ul>`;
}

function sourceLink(source, text = "Learn more at NASA ↗") {
  return `<a href="${esc(source.url)}" target="_blank" rel="noopener">${text}</a>`;
}

// What happened after a choice. `before` is the state the choice was made in.
// Buttons: #continue.
export function resultHtml(before, state, reaction, saved) {
  const last = state.log[state.log.length - 1];
  const choice = days[last.day - 1].choices[last.choiceIndex];
  const otherNotes = last.notes.filter((note) => note.topic !== "choice");
  const added = state.warnings.filter((w) => !hasWarning(before.warnings, w.id));
  const fixed = before.warnings.filter(
    (w) =>
      !NOT_FIXABLE.includes(w.id) &&
      !hasWarning(state.warnings, w.id) &&
      !last.notes.some((note) => note.cause === w.id),
  );
  const next = state.ended ? "See your mission report ★" : `Back to ship · Day ${state.day + 1} →`;
  return `<section class="lf-panel lf-wide lf-result">
    <span class="kicker">DAY ${last.day} RESULT · ${esc(last.station.toUpperCase())}</span>
    <h2>${esc(last.choice)}</h2>
    <div class="lf-columns">
      <div>
        <p class="lf-lead">${esc(choice.result)}</p>
        <p class="lf-row lf-today"><span class="lf-row-label">Today’s change</span>${chips(last.deltas)}</p>
        ${notesList(otherNotes)}
        ${warningBox(added, "New warning")}
        ${fixed.map((w) => `<p class="lf-fixed">✅ Fixed: ${esc(w.text)}</p>`).join("")}
        <div class="lf-nora">
          <span class="companion-avatar" aria-hidden="true">N</span>
          <p><b>Nora:</b> ${esc(reaction)}</p>
        </div>
      </div>
      <aside class="lf-why">
        <h3>🔭 Why this matters in real life</h3>
        <p>${esc(last.why)}</p>
        <p class="lf-source">${sourceLink(last.source)}<small>${esc(last.source.label)}</small></p>
      </aside>
    </div>
    ${saved ? "" : '<p class="lf-small">Progress could not be saved. Keep this tab open.</p>'}
    <button type="button" id="continue" class="lf-primary">${next}</button>
  </section>`;
}

/* ------------------------------------------------------------------ */
/* Mission report and goals                                            */
/* ------------------------------------------------------------------ */

function starList(stars, final) {
  return `<ul class="lf-starlist">${stars
    .map((star) => {
      const status = star.earned ? "Earned!" : final ? "Not this time" : star.progress;
      return `<li class="${star.earned ? "earned" : ""}">
        <span class="lf-bigstar" aria-hidden="true">${star.earned ? "★" : "☆"}</span>
        <span><b>${esc(star.label)}</b> <em>${esc(status)}</em><small>${esc(star.how)}</small></span>
      </li>`;
    })
    .join("")}</ul>`;
}

function crewCheck(state) {
  return ["life", "safety"]
    .map((key) => {
      const ok = state[key] >= SAFE_LEVEL;
      const { icon, label } = RESOURCES[key];
      return `<li class="${ok ? "lf-good" : "lf-bad"}">${ok ? "✅" : "⚠️"} ${icon} ${esc(label)}: <b>${state[key]}</b> <small>(needs ${SAFE_LEVEL}+)</small></li>`;
    })
    .join("");
}

// End of mission: big stars, the summary, each star and a day-by-day recap.
// Buttons: #replay and #explore.
export function reportHtml(state) {
  const result = report(state);
  const earned = result.stars.filter((star) => star.earned).length;
  const tone = result.success ? "success" : result.early ? "early" : "partial";
  // Earned stars first, so 3 stars read as ★★★☆.
  const bigStars = [...result.stars]
    .sort((a, b) => b.earned - a.earned)
    .map(
      (star, i) =>
        `<span class="${star.earned ? "earned" : ""}" style="--i:${i}">${star.earned ? "★" : "☆"}</span>`,
    )
    .join("");
  const week = state.log
    .map((entry) => {
      const bad = entry.notes.filter((note) => note.tone === "bad");
      return `<li>
        <span class="lf-week-day">Day ${entry.day}</span>
        <span class="lf-week-choice">${esc(entry.choice)}</span>
        <span class="lf-week-chips">${chips(entry.deltas)}</span>
        ${bad.map((note) => `<small class="lf-week-bad">⚠️ ${esc(note.text)}</small>`).join("")}
      </li>`;
    })
    .join("");
  return `<section class="lf-panel lf-wide lf-report lf-report-${tone}">
    <span class="kicker">MISSION REPORT</span>
    <div class="lf-bigstars" role="img" aria-label="${earned} of ${result.stars.length} stars">${bigStars}</div>
    <h1>${esc(result.title)}</h1>
    <p class="lf-lead">${esc(result.summary)}</p>
    <div class="lf-columns">
      <div>
        <h3 class="lf-subhead">Crew safety</h3>
        <ul class="lf-crew">${crewCheck(state)}</ul>
        <h3 class="lf-subhead">Your stars</h3>
        ${starList(result.stars, true)}
      </div>
      <div>
        <h3 class="lf-subhead">Your week</h3>
        <ol class="lf-week">${week}</ol>
      </div>
    </div>
    <div class="lf-actions">
      <button type="button" id="replay" class="lf-primary">Play again ↻</button>
      <button type="button" class="secondary" id="explore">Keep exploring</button>
    </div>
  </section>`;
}

// Mission goals, warnings and the power budget (from the HUD stars or the pause menu).
// Buttons: #goals-close.
export function goalsHtml(state) {
  const dayIndex = Math.min(state.day, days.length - 1);
  const warnings = state.warnings.length
    ? warningBox(state.warnings, "Warnings")
    : '<p class="lf-fixed">✅ No warnings. All systems are on track.</p>';
  return `<section class="lf-panel lf-goals">
    <span class="kicker">MISSION GOALS · ${state.ended ? "MISSION OVER" : `DAY ${state.day + 1} OF ${days.length}`}</span>
    <h2>Earn stars, keep the crew safe</h2>
    <p>Finish with 💨 Life Support and 🛡️ Crew Safety at <b>${SAFE_LEVEL} or more</b>. A safe crew plus <b>2 stars</b> is a Mission success.</p>
    ${starList(goals(state), false)}
    ${state.ended ? "" : warnings + budgetLine(dayIndex)}
    <button type="button" id="goals-close">Got it</button>
  </section>`;
}

/* ------------------------------------------------------------------ */
/* How to play and help                                                */
/* ------------------------------------------------------------------ */

// The five rules, shared by "How to play" and the in-game help.
export function guideHtml() {
  const rules = [
    [
      "🧭",
      `Each day, walk to the glowing ◇ terminal and pick <b>one job</b>. The mission lasts ${days.length} days.`,
    ],
    [
      "📊",
      "Watch the <b>4 meters</b>: ⚡ Battery, 💨 Life Support, 🛡️ Crew Safety and 🔬 Science. Every choice shows how they will change.",
    ],
    [
      "☀️",
      `The ship uses ⚡ every day. Solar panels refill it while the Sun is up. <b>The Sun sets on Day ${SUNSET_DAY}</b>: in the lunar night there is no solar power, and the heaters use more ⚡.`,
    ],
    ["⚠️", "<b>Warnings</b> tell you what will go wrong, on which day, and how to fix it."],
    [
      "⭐",
      `<b>Earn stars</b>: send research home, harvest the plants, save ⚡ for the night and keep the crew healthy. Keep 💨 and 🛡️ at ${SAFE_LEVEL}+ and earn 2 stars to win.`,
    ],
  ];
  return `<ul class="lf-rules">${rules
    .map(([icon, text]) => `<li><span aria-hidden="true">${icon}</span><span>${text}</span></li>`)
    .join("")}</ul>
  <p class="lf-controls"><b>Controls:</b> ${esc(CONTROLS_TEXT)}</p>`;
}

// NASA pages behind each day's science, for the help dialog.
export function sourcesHtml() {
  const seen = new Set();
  const links = days
    .filter((day) => !seen.has(day.source.url) && seen.add(day.source.url))
    .map((day) => `<li>${sourceLink(day.source, `${esc(day.source.label)} ↗`)}</li>`)
    .join("");
  return `<ul class="lf-sources">${links}</ul>`;
}
