/*
 * Saving, loading and previewing a mission.
 * ES module. Expects engine.js to be loaded first as a classic script, so its
 * globals (days, forecast, RESOURCES ...) exist.
 *
 * A save is just the list of choice ids the commander picked. Loading replays
 * them through the engine, so a save can never hold impossible meter values.
 */

const SAVE_KEY = 'lunar-frontier-mission-v2';
const SAVE_VERSION = 2;
/* Saves from the first version of the game. They no longer match the days. */
const OLD_SAVE_KEYS = ['lunar-frontier-mission-v1'];

const METERS = [
  ['power', '⚡', 'Battery'],
  ['life', '💨', 'Air & Water'],
  ['safety', '🛡️', 'Crew Safety'],
  ['science', '🔬', 'Science'],
];

function engineDays() {
  return typeof days !== 'undefined' ? days : null;
}

function discard(key) {
  try { localStorage.removeItem(key); } catch { /* storage blocked: nothing to remove */ }
}

/** Save the mission. Returns true if it worked (storage can be blocked). */
export function saveMission(state) {
  // Debug day jumps and subsequent test choices must not overwrite the real mission.
  if (state.debugPreview) return true;
  try {
    const choices = state.log.map(entry => entry.choiceId);
    if (choices.some(id => typeof id !== 'string')) return false;
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, choices }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Load the saved mission by replaying it with `initial` and `decide`.
 * Returns null (and deletes the save) if there is no save or it no longer fits
 * the mission, for example a save from an older version of the game.
 */
export function loadMission(initial, decide) {
  OLD_SAVE_KEYS.forEach(discard);
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(SAVE_KEY));
  } catch {
    discard(SAVE_KEY);
    return null;
  }
  if (!saved) return null;

  const mission = engineDays();
  const valid = mission && saved.version === SAVE_VERSION && Array.isArray(saved.choices) && saved.choices.length <= mission.length;
  if (!valid) { discard(SAVE_KEY); return null; }

  try {
    let state = initial();
    for (const id of saved.choices) {
      const index = state.ended ? -1 : mission[state.day].choices.findIndex(choice => choice.id === id);
      if (index < 0) { discard(SAVE_KEY); return null; }
      state = decide(state, index);
    }
    return state;
  } catch {
    discard(SAVE_KEY);
    return null;
  }
}

/* "⚡ −14 💨 +8" for a set of meter changes (zeros are left out). */
function changeText(deltas) {
  const parts = METERS
    .filter(([key]) => deltas[key])
    .map(([key, icon]) => `${icon} ${deltas[key] > 0 ? '+' : '−'}${Math.abs(deltas[key])}`);
  return parts.length ? parts.join(' ') : 'no change';
}

/**
 * Preview choice `index` without playing it. Delegates to the engine's global
 * forecast(), so the preview is exactly what decide() would do.
 * Falls back to running `decide` directly if the engine global is missing.
 *
 * @returns {{deltas, notes, warnings, endsMission, text:string} | null}
 *   `text` (also returned by String(result)) is a one-line summary such as
 *   "By tonight: ⚡ −14 🔬 +20".
 */
export function forecast(state, index, decide) {
  let preview = null;
  const engineForecast = typeof globalThis.forecast === 'function' && globalThis.forecast !== forecast ? globalThis.forecast : null;
  if (engineForecast) {
    preview = engineForecast(state, index);
  } else if (typeof decide === 'function') {
    const next = decide(state, index);
    if (next !== state) {
      const entry = next.log[next.log.length - 1];
      preview = { deltas: entry.deltas, notes: entry.notes, warnings: next.warnings, endsMission: next.ended };
    }
  }
  if (!preview) return null;
  const text = `By tonight: ${changeText(preview.deltas)}${preview.endsMission ? ' · the mission ends' : ''}`;
  return { ...preview, text, toString: () => text };
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

/** An HTML table of the meters after each day. */
export function resourceHistory(state) {
  const head = METERS.map(([, icon, label]) => `<th scope="col"><span aria-hidden="true">${icon}</span> ${label}</th>`).join('');
  const rows = state.log.map(entry => {
    const cells = METERS.map(([key]) => `<td>${entry.after && entry.after[key] !== undefined ? entry.after[key] : '—'}</td>`).join('');
    return `<tr><th scope="row">Day ${entry.day}</th><td>${escapeHtml(entry.choice || '')}</td>${cells}</tr>`;
  }).join('');
  return `<h2>Your mission history</h2><table class="mission-history"><thead><tr><th scope="col">Day</th><th scope="col">Choice</th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}
