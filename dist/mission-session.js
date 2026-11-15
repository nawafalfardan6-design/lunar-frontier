/*
 * Saving, loading and previewing a mission.
 * ES module. Expects engine.js to be loaded first as a classic script, so its
 * globals (days, forecast, RESOURCES ...) exist.
 *
 * A save is just the list of choice ids the commander picked. Loading replays
 * them through the engine, so a save can never hold impossible meter values.
 */

const EXPEDITION_KEY = 'lunar-frontier-expedition-v1';
const SAVE_KEY = 'lunar-frontier-mission-v2';
const SAVE_VERSION = 2;
/* Saves from the first version of the game. They no longer match the days. */
const OLD_SAVE_KEYS = ['lunar-frontier-mission-v1'];

const METERS = [
  ['power', '⚡', 'Battery'],
  ['life', '💨', 'Life Support'],
  ['safety', '🛡️', 'Crew Safety'],
  ['science', '🔬', 'Science'],
];

function engineDays() {
  return typeof days !== 'undefined' ? days : null;
}

function discard(key) {
  try { localStorage.removeItem(key); } catch { /* storage blocked: nothing to remove */ }
}

// Validate the complete snapshot: surface actions cannot be reconstructed from daily choices.
export function validExpeditionSave(saved) {
  const s = saved?.state, e = s?.expedition, mission = engineDays();
  if (saved?.version !== 1 || !s || !e || e.version !== 1 || !mission) return false;
  const between = (n, lo, hi) => Number.isFinite(n) && n >= lo && n <= hi;
  if (!Number.isInteger(s.day) || !between(s.day, 0, mission.length)) return false;
  if (!['power','life','safety','science'].every(k => between(s[k], 0, 100))) return false;
  if (typeof s.ended !== 'boolean' || s.ended !== (s.day >= mission.length || s.life === 0 || s.safety === 0)) return false;
  if (!Array.isArray(s.log) || s.log.length !== s.day || !Array.isArray(s.flags) || !s.flags.every(f => typeof f === 'string')) return false;
  if (!Array.isArray(s.warnings) || !s.warnings.every(w => typeof w?.text === 'string')) return false;
  if (!s.log.every((entry, i) => mission[i].choices.some(c => c.id === entry.choiceId) && entry.after && entry.deltas && Array.isArray(entry.notes))) return false;
  if (!['complete','suited','outside'].every(k => typeof e[k] === 'boolean')) return false;
  if (!between(e.suit, 0, 40) || !between(e.oxygen, 0, 200) || !between(e.water, 0, 60) || !between(e.food, 0, 21)) return false;
  if (!['ice','rocks','iceLeft','rocksLeft','scans','melted'].every(k => Number.isInteger(e[k]) && between(e[k],0,2))) return false;
  if (e.ice + e.iceLeft + e.melted !== 2 || e.rocks + e.rocksLeft + e.scans !== 2) return false;
  if (!Number.isInteger(e.tripsDay) || !between(e.tripsDay,-1,6) || typeof e.notice !== 'string') return false;
  if (e.outside && (!e.suited || e.suit <= 0)) return false;
  if (e.complete && (!e.melted || e.iceLeft)) return false;
  return Array.isArray(e.position) && e.position.length === 2 && between(e.position[0],-14,14) && between(e.position[1],16,43);
}

/** Save the mission. Returns true if it worked (storage can be blocked). */
export function saveMission(state) {
  // Debug day jumps and subsequent test choices must not overwrite the real mission.
  if (state.debugPreview) return true;
  try {
    if (state.expedition) {
      localStorage.setItem(EXPEDITION_KEY, JSON.stringify({ version: 1, state }));
      return true;
    }
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
export function loadMission(initial, decide, options = {}) {
  // Keep the legacy save intact, so rolling back the files also restores its progress.
  try {
    const savedExpedition = JSON.parse(localStorage.getItem(EXPEDITION_KEY));
    if (options.expedition && validExpeditionSave(savedExpedition)) return savedExpedition.state;
  } catch { /* A malformed new save falls back to the original mission. */ }
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
