/*
 * Engine tests for Lunar Frontier. Plain Node, no dependencies:
 *
 *   node tests/engine.test.js
 *
 * Plays every possible decision path through the 7-day mission, prints how
 * many end in success / partial / early, and checks the game's promises:
 * honest previews, no hidden penalties, pure functions and valid data.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const E = require('../dist/engine.js');

let checks = 0;
function check(condition, message) {
  checks++;
  assert.ok(condition, message);
}

const METERS = ['power', 'life', 'safety', 'science'];
const KINDS = ['repair', 'science', 'shelter', 'garden', 'comms', 'rest'];

/* Play a list of choice ids (one per day) and return the final state. */
function playIds(ids) {
  let state = E.initial();
  ids.forEach((id, day) => {
    const index = E.days[day].choices.findIndex(choice => choice.id === id);
    assert.ok(index >= 0, `Day ${day + 1} has no choice "${id}"`);
    state = E.decide(state, index);
  });
  return state;
}

/* Every path through the mission, as { trail: [index, ...], states: [s0, s1, ...] }. */
function allPaths() {
  const result = [];
  (function walk(states, trail) {
    const state = states[states.length - 1];
    if (state.ended) { result.push({ trail, states }); return; }
    E.days[state.day].choices.forEach((_, i) => walk(states.concat([E.decide(state, i)]), trail.concat([i])));
  })([E.initial()], []);
  return result;
}

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

check(Array.isArray(E.STATIONS) && E.STATIONS.length > 0, 'STATIONS is a non-empty list');
check(E.days.length === 7, 'the mission has 7 days');
check(METERS.every(key => E.RESOURCES[key] && E.RESOURCES[key].label && E.RESOURCES[key].icon), 'RESOURCES describes all 4 meters');
check(E.RESOURCES.science.start === 0, 'Science starts at 0');

// STATIONS must be real terminals in ship.js (read as text: it is an ES module that imports three.js).
const shipSource = fs.readFileSync(path.join(__dirname, '..', 'dist', 'ship.js'), 'utf8');
const shipNames = [...shipSource.matchAll(/name:\s*["'`]([^"'`]+)["'`]/g)].map(match => match[1]);
for (const station of E.STATIONS) check(shipNames.includes(station), `station "${station}" exists in ship.js`);

const choiceIds = new Set();
E.days.forEach((day, d) => {
  const where = `Day ${d + 1}`;
  for (const field of ['id', 'title', 'speaker', 'briefing', 'story', 'why']) {
    check(typeof day[field] === 'string' && day[field].length > 0, `${where} has ${field}`);
  }
  check(E.STATIONS.includes(day.station), `${where} station "${day.station}" is in STATIONS`);
  check(day.source && day.source.label && /^https:\/\/([a-z]+\.)?nasa\.gov\//.test(day.source.url), `${where} cites a nasa.gov source`);
  check(day.choices.length >= 2 && day.choices.length <= 3, `${where} has 2 or 3 choices`);
  for (const choice of day.choices) {
    const what = `${where} choice "${choice.id}"`;
    check(!choiceIds.has(choice.id), `${what} has a unique id`);
    choiceIds.add(choice.id);
    check(choice.label && choice.summary, `${what} has a label and summary`);
    check(KINDS.includes(choice.kind), `${what} has a valid kind (got "${choice.kind}")`);
    check(METERS.every(key => Number.isInteger(choice.effects[key])), `${what} lists all 4 effects as integers`);
    check(Array.isArray(choice.sets) && Array.isArray(choice.clears), `${what} has sets and clears lists`);
  }
});

// The budget: sunny days charge, the night does not, and the night costs more.
for (let d = 0; d < 7; d++) {
  const budget = E.dailyBudget(d);
  check(typeof budget.label === 'string' && Number.isInteger(budget.load) && Number.isInteger(budget.solar), `dailyBudget(${d}) has the right shape`);
  check(budget.sunlight === (d + 1 < E.SUNSET_DAY), `Day ${d + 1} sunlight matches SUNSET_DAY`);
}
check(E.SUNSET_DAY <= 7, 'the Sun sets before the mission ends');
check(E.dailyBudget(6).solar === 0 && E.dailyBudget(6).load > E.dailyBudget(0).load, 'the night has no solar power and a bigger load');

/* ------------------------------------------------------------------ */
/* Every decision path                                                 */
/* ------------------------------------------------------------------ */

const paths = allPaths();
const totals = { success: 0, partial: 0, early: 0 };
const starTotals = {};
const byRisksHit = { 0: [0, 0], 1: [0, 0], 2: [0, 0] }; // risks hit → [paths, successes]
let blackoutPaths = 0;
let lowest = { life: 100, safety: 100 };

for (const { trail, states } of paths) {
  const label = `path ${trail.join('')}`;
  const final = states[states.length - 1];
  const result = E.report(final);
  totals[result.success ? 'success' : result.early ? 'early' : 'partial']++;
  for (const star of result.stars) if (star.earned) starTotals[star.id] = (starTotals[star.id] || 0) + 1;
  if (final.log.some(entry => entry.notes.some(note => note.cause === 'battery'))) blackoutPaths++;
  const risksHit = final.log.flatMap(entry => entry.notes).filter(note => note.cause === 'filter' || note.cause === 'storm').length;
  byRisksHit[risksHit][0]++;
  if (result.success) byRisksHit[risksHit][1]++;
  lowest = { life: Math.min(lowest.life, final.life), safety: Math.min(lowest.safety, final.safety) };

  check(E.outcome(final) === result.title, `${label}: outcome() matches report().title`);
  check(final.ended && final.log.length === trail.length, `${label}: ends with one log entry per decision`);

  states.forEach((state, step) => {
    // Every meter stays a whole number from 0 to 100.
    for (const key of METERS) check(Number.isInteger(state[key]) && state[key] >= 0 && state[key] <= 100, `${label} step ${step}: ${key}=${state[key]} is an integer in 0..100`);
    check(E.goals(state).every(star => typeof star.progress === 'string' && star.progress.length > 0), `${label} step ${step}: every goal has a progress line`);
    for (const warning of state.warnings) {
      check(warning.id && warning.text && Number.isInteger(warning.dueDay) && warning.fix, `${label} step ${step}: warning has id, text, dueDay and fix`);
      check(warning.dueDay >= state.day + 1, `${label} step ${step}: warning "${warning.id}" is not already overdue`);
    }
    if (step === 0) return;

    const before = states[step - 1];
    const entry = state.log[state.log.length - 1];
    const choice = E.days[before.day].choices[trail[step - 1]];

    // No hidden penalties: every bad note names a cause that was a warning
    // in the state the player was looking at when they chose.
    for (const note of entry.notes) {
      check(['good', 'bad', 'info'].includes(note.tone), `${label} day ${entry.day}: note tone is valid`);
      check(['choice', 'goal', 'budget', 'risk'].includes(note.topic), `${label} day ${entry.day}: note topic is valid`);
      if (note.tone !== 'bad') continue;
      check(note.cause && note.ahead, `${label} day ${entry.day}: penalty note has a cause and preview text`);
      const warned = before.warnings.find(warning => warning.id === note.cause);
      check(warned, `${label} day ${entry.day}: penalty "${note.cause}" was warned about before choosing`);
      check(warned.dueDay === entry.day, `${label} day ${entry.day}: warning "${note.cause}" named the right day`);
    }
    // ...and Air & Water / Crew Safety never drop below what the choice showed
    // unless a penalty note explains it.
    for (const key of ['life', 'safety']) {
      const shown = Math.max(0, Math.min(100, before[key] + choice.effects[key]));
      if (state[key] < shown) check(entry.notes.some(note => note.tone === 'bad'), `${label} day ${entry.day}: ${key} drop is explained`);
    }

    // Log deltas match the real change.
    for (const key of METERS) check(entry.deltas[key] === state[key] - before[key], `${label} day ${entry.day}: log delta for ${key} is exact`);
  });
}

/* ------------------------------------------------------------------ */
/* forecast() and purity, from every reachable state                   */
/* ------------------------------------------------------------------ */

const seen = new Set();
for (const { states } of paths) {
  for (const state of states) {
    if (state.ended) continue;
    const key = JSON.stringify(state);
    if (seen.has(key)) continue;
    seen.add(key);
    E.days[state.day].choices.forEach((_, i) => {
      const snapshot = JSON.stringify(state);
      const preview = E.forecast(state, i);
      const next = E.decide(state, i);
      check(JSON.stringify(state) === snapshot, `decide/forecast do not mutate their input (day ${state.day + 1}, choice ${i})`);
      check(next !== state && next.day === state.day + 1, 'decide returns a new state for the next day');
      for (const m of METERS) check(preview.deltas[m] === next[m] - state[m], `forecast delta for ${m} matches decide (day ${state.day + 1}, choice ${i})`);
      check(JSON.stringify(preview.notes) === JSON.stringify(next.log[next.log.length - 1].notes), 'forecast notes match decide');
      check(JSON.stringify(preview.warnings) === JSON.stringify(next.warnings), 'forecast warnings match decide');
      check(preview.endsMission === next.ended, 'forecast endsMission matches decide');
    });
  }
}

// Invalid input is ignored instead of crashing.
const start = E.initial();
check(E.decide(start, 5) === start, 'decide ignores a choice that does not exist');
check(E.forecast(start, -1) === null, 'forecast returns null for a choice that does not exist');
check(start.day === 0 && start.flags.length === 0 && start.log.length === 0 && start.ended === false, 'initial() is a fresh mission');

/* ------------------------------------------------------------------ */
/* Named strategies                                                    */
/* ------------------------------------------------------------------ */

const careful = playIds(['service-filter', 'stock-shelter', 'crater-experiment', 'rest-in-shelter', 'clean-recycler', 'send-research', 'final-checks']);
const carefulReport = E.report(careful);
check(carefulReport.success, `careful commander succeeds (got "${carefulReport.title}", battery ${careful.power})`);
check(carefulReport.stars.find(star => star.id === 'reserve').earned, 'careful commander keeps a battery reserve');
check(!careful.log.some(entry => entry.notes.some(note => note.tone === 'bad')), 'careful commander never takes a penalty');

const reckless = playIds(['dust-experiment', 'tend-greenhouse', 'crater-experiment', 'remote-research', 'harvest', 'send-research', 'late-downlink']);
const recklessReport = E.report(reckless);
check(!recklessReport.success, `"all science, skip maintenance" does not succeed (got "${recklessReport.title}")`);
check(!recklessReport.crewSafe, 'skipping maintenance leaves the crew unsafe');

// Skipping the filter shows a warning right away, and it can be fixed later.
const skipped = playIds(['dust-experiment']);
check(skipped.warnings.some(warning => warning.id === 'filter' && warning.dueDay === 3), 'skipping the filter warns about Day 3 straight away');
const fixedLate = playIds(['dust-experiment', 'tend-greenhouse', 'catch-up']);
check(!fixedLate.warnings.length || !fixedLate.warnings.some(warning => warning.id === 'filter' || warning.id === 'storm'), 'the Day 3 catch-up fixes the filter and the shelter');
check(!fixedLate.log.some(entry => entry.notes.some(note => note.tone === 'bad')), 'fixing risks late still avoids the penalties');

// The solar storm is announced the day before (and earlier).
const dayThree = playIds(['service-filter', 'tend-greenhouse']);
check(dayThree.warnings.some(warning => warning.id === 'storm' && warning.dueDay === 4), 'storm warning is shown before Day 4');
check(/storm/i.test(E.days[2].briefing), 'the Day 3 briefing announces tomorrow’s storm');

// The report handles an early end (a meter at 0).
const early = Object.assign(E.initial(), { day: 4, life: 0, ended: true });
const earlyReport = E.report(early);
check(earlyReport.early && !earlyReport.success && earlyReport.title === 'Mission ended early', 'report() handles an early end');
check(E.outcome(early) === 'Mission ended early', 'outcome() returns the title string');
check(earlyReport.stars.every(star => star.id && star.label && typeof star.earned === 'boolean' && star.how), 'every star explains how to earn it');

/* ------------------------------------------------------------------ */
/* Balance                                                             */
/* ------------------------------------------------------------------ */

const total = paths.length;
const pct = n => `${((100 * n) / total).toFixed(1)}%`;
console.log(`Lunar Frontier engine: ${total} decision paths`);
console.log(`  Mission success      ${String(totals.success).padStart(4)}  ${pct(totals.success)}`);
console.log(`  Partial success      ${String(totals.partial).padStart(4)}  ${pct(totals.partial)}`);
console.log(`  Mission ended early  ${String(totals.early).padStart(4)}  ${pct(totals.early)}`);
console.log(`  Stars earned: ${E.STARS.map(star => `${star.label} ${starTotals[star.id] || 0}`).join(', ')}`);
console.log(`  Success by risks that hit (filter, storm): ${[0, 1, 2].map(n => `${n} hit ${byRisksHit[n][1]}/${byRisksHit[n][0]}`).join(', ')}`);
console.log(`  Paths where the Battery ran out: ${blackoutPaths}. Lowest final Air & Water ${lowest.life}, Crew Safety ${lowest.safety}.`);
console.log(`  Careful commander: ${carefulReport.title} (⚡${careful.power} 💨${careful.life} 🛡️${careful.safety} 🔬${careful.science})`);
console.log(`  All science, skip maintenance: ${recklessReport.title} (⚡${reckless.power} 💨${reckless.life} 🛡️${reckless.safety} 🔬${reckless.science})`);

const successRate = totals.success / total;
check(successRate >= 0.25 && successRate <= 0.70, `between 25% and 70% of paths succeed (got ${pct(totals.success)})`);
// Maintenance pays off: fixing risks in time wins more often than ignoring them.
const rate = n => byRisksHit[n][1] / byRisksHit[n][0];
check(rate(0) > 2 * Math.max(rate(1), rate(2)), 'paths that fix every risk succeed at least twice as often as paths that let one hit');

console.log(`All ${checks} checks passed.`);
