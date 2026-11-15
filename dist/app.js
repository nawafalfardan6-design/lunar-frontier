/*
 * Lunar Frontier: the simple 2D mission dashboard (mission.html).
 * ES module. It uses the engine globals from engine.js:
 *   RESOURCES, RESOURCE_KEYS, days, dailyBudget, initial, decide, forecast,
 *   goals, report, SAFE_LEVEL, RESEARCH_GOAL, RESERVE_GOAL, HEALTHY_LEVEL, SUNSET_DAY.
 * Everything here lives inside one function so nothing clashes with those names.
 */
import { stormEvidence, acknowledgeEarth } from './mission-evidence.js';

(function () {
  'use strict';

  const app = document.getElementById('app');

  let state = initial();
  /* 'welcome' → 'day' → 'result' → 'day' ... → 'report' */
  let view = 'welcome';

  const KIND_LABELS = {
    repair: '🔧 Repair',
    science: '🧪 Science',
    shelter: '🧱 Shelter',
    garden: '🌱 Garden',
    comms: '📡 Radio',
    rest: '💤 Rest',
  };
  const NOTE_ICONS = { good: '✅', bad: '⚠️', info: 'ℹ️' };

  /* ---------------------------------------------------------------- */
  /* Small helpers                                                     */
  /* ---------------------------------------------------------------- */

  function esc(text) {
    return String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  }

  /* Signed number with a real minus sign: +8, −12. */
  function signed(n) {
    return `${n > 0 ? '+' : '−'}${Math.abs(n)}`;
  }

  /* Chips like "⚡ −12  💨 +8". Zero changes are left out. */
  function chips(effects, emptyText) {
    const items = RESOURCE_KEYS.filter(key => effects[key]).map(key => {
      const r = RESOURCES[key];
      const tone = effects[key] > 0 ? 'up' : 'down';
      return `<span class="chip chip-${tone}"><span aria-hidden="true">${r.icon} ${signed(effects[key])}</span><span class="sr-only">${r.label} ${signed(effects[key])}</span></span>`;
    });
    if (!items.length) return emptyText ? `<span class="chip chip-none">${esc(emptyText)}</span>` : '';
    return items.join('');
  }

  /* ---------------------------------------------------------------- */
  /* Pieces of the dashboard                                           */
  /* ---------------------------------------------------------------- */

  function meterStatus(key, value) {
    if (key === 'power') {
      if (value < RESERVE_GOAL) return ['warn', `Below the ${RESERVE_GOAL} ⚡ night reserve`];
      return ['ok', 'Charged'];
    }
    if (key === 'science') {
      if (state.flags.includes('research-sent')) return ['ok', 'Sent to Earth!'];
      if (value >= RESEARCH_GOAL) return ['ok', 'Enough to send home'];
      return ['info', `${RESEARCH_GOAL - value} more to send home`];
    }
    if (value < SAFE_LEVEL) return ['bad', `Unsafe! Needs ${SAFE_LEVEL}+`];
    if (value < SAFE_LEVEL + 10) return ['warn', 'Watch closely'];
    if (value < HEALTHY_LEVEL) return ['ok', 'Safe'];
    return ['ok', 'Healthy'];
  }

  /* Where the goal line sits on each meter's bar. */
  const GOAL_LINE = { power: () => RESERVE_GOAL, life: () => SAFE_LEVEL, safety: () => SAFE_LEVEL, science: () => RESEARCH_GOAL };

  function meters() {
    return `<div class="meters">${RESOURCE_KEYS.map(key => {
      const r = RESOURCES[key];
      const value = state[key];
      const [tone, status] = meterStatus(key, value);
      return `<article class="meter meter-${tone}">
        <span class="meter-label"><span aria-hidden="true">${r.icon}</span> ${esc(r.label)}</span>
        <strong>${value}<small>/100</small></strong>
        <span class="bar" aria-hidden="true"><span class="fill" style="width:${value}%"></span><span class="goal-line" style="left:${GOAL_LINE[key]()}%"></span></span>
        <span class="meter-status">${esc(status)}</span>
      </article>`;
    }).join('')}</div>`;
  }

  function timeline() {
    const items = days.map((day, i) => {
      const sunny = dailyBudget(i).sunlight;
      const done = i < state.day;
      const current = i === state.day && !state.ended;
      const cls = ['pip', sunny ? 'pip-sun' : 'pip-night', done ? 'pip-done' : '', current ? 'pip-current' : ''].join(' ');
      const label = `Day ${i + 1}, ${sunny ? 'daytime' : 'lunar night'}${done ? ', done' : current ? ', today' : ''}`;
      return `<li class="${cls}" aria-label="${label}"${current ? ' aria-current="step"' : ''}><span aria-hidden="true">${done ? '✓' : sunny ? '☀️' : '🌙'}</span><small aria-hidden="true">Day ${i + 1}</small></li>`;
    }).join('');
    return `<ol class="timeline" aria-label="Mission days">${items}</ol>`;
  }

  function budgetCard() {
    if (state.ended) return '';
    const budget = dailyBudget(state.day);
    const dayNumber = state.day + 1;
    const daysToSunset = SUNSET_DAY - dayNumber;
    const sunset = budget.sunlight
      ? (daysToSunset === 1 ? 'Sunset is tomorrow! Today is the last day of solar charging.' : `Sunset in ${daysToSunset} days, on Day ${SUNSET_DAY}.`)
      : 'The Sun is down. No charging until long after the crew goes home.';
    return `<section class="card budget ${budget.sunlight ? 'budget-sun' : 'budget-night'}" aria-labelledby="budget-title">
      <h3 id="budget-title">Day ${dayNumber} power budget</h3>
      <p class="sr-only">${esc(budget.label)}</p>
      <dl class="budget-rows" aria-hidden="true">
        <div><dt>${budget.sunlight ? '☀️ Solar panels' : '🌙 No sunlight'}</dt><dd>${budget.solar ? signed(budget.solar) : '0'} ⚡</dd></div>
        <div><dt>${budget.sunlight ? '🔌 Ship uses' : '🔥 Ship + heaters'}</dt><dd>${signed(-budget.load)} ⚡</dd></div>
        <div class="net"><dt>Before your job</dt><dd>${signed(budget.solar - budget.load)} ⚡</dd></div>
      </dl>
      <p class="muted">${esc(sunset)}</p>
    </section>`;
  }

  function warningsCard() {
    if (state.ended) return '';
    const list = state.warnings;
    const body = list.length
      ? `<ul class="warning-list">${list.map(w => `<li class="warning warning-${esc(w.id)}">
          <strong>${esc(w.text)}</strong>
          <span class="due">Due: Day ${w.dueDay}</span>
          <span class="fix">Fix: ${esc(w.fix)}</span>
        </li>`).join('')}</ul>`
      : '<p class="all-clear">✅ No warnings. All systems are on track.</p>';
    return `<section class="card warnings" aria-labelledby="warnings-title">
      <h3 id="warnings-title">⚠️ Warnings${list.length ? ` (${list.length})` : ''}</h3>
      ${body}
    </section>`;
  }

  function goalsCard() {
    const safe = state.life >= SAFE_LEVEL && state.safety >= SAFE_LEVEL;
    const stars = goals(state).map(star => `<li class="${star.earned ? 'earned' : ''}">
        <span class="star" aria-hidden="true">${star.earned ? '⭐' : '☆'}</span>
        <span><strong>${esc(star.label)}</strong><small>${esc(star.progress)}</small></span>
      </li>`).join('');
    return `<section class="card goals" aria-labelledby="goals-title">
      <h3 id="goals-title">Mission goals</h3>
      <p class="crew-check ${safe ? 'ok' : 'bad'}">${safe ? '✅' : '⚠️'} Crew safe: 💨 and 🛡️ at ${SAFE_LEVEL}+ at the end</p>
      <ul class="star-list">${stars}</ul>
      <p class="muted">Safe crew + 2 stars = Mission success.</p>
    </section>`;
  }

  /* The day's briefing and choices. */
  function dayPanel() {
    const day = days[state.day];
    const cards = day.choices.map((choice, i) => {
      const preview = forecast(state, i);
      const extra = preview.notes
        .filter(note => note.topic === 'goal' || note.topic === 'risk')
        .map(note => `<span class="preview-note note-${note.tone}"><span aria-hidden="true">${NOTE_ICONS[note.tone]}</span> ${esc(note.ahead || note.text)}</span>`)
        .join('');
      return `<button class="choice" data-choice="${i}" type="button">
        <span class="kind">${KIND_LABELS[choice.kind] || esc(choice.kind)}</span>
        <strong class="choice-label">${esc(choice.label)}</strong>
        <span class="choice-summary">${esc(choice.summary)}</span>
        <span class="chips" aria-label="Effects of this choice">${chips(choice.effects, 'No meter change')}</span>
        <span class="preview">By tonight, with ship power: ${chips(preview.deltas, 'no change')}</span>
        ${extra}
        <span class="choose">Choose this →</span>
      </button>`;
    }).join('');
    return `<section class="panel day-panel" id="focus" tabindex="-1" aria-labelledby="day-title">
      <p class="eyebrow">DAY ${state.day + 1} OF ${days.length} · ${esc(day.station.toUpperCase())}</p>
      <h2 id="day-title">${esc(day.title)}</h2>
      <blockquote class="briefing"><p>“${esc(day.briefing)}”</p><cite>${esc(day.speaker)}</cite></blockquote>
      <p class="story">${esc(day.story)}</p>
      ${stormEvidence(state.day)}
      <h3 class="choices-title">Choose one job for today</h3>
      <div class="choices">${cards}</div>
    </section>`;
  }

  function sourceLink(source) {
    return `<a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.label)} ↗</a>`;
  }

  function notesList(notes) {
    return `<ul class="notes">${notes.map(note => `<li class="note note-${note.tone}"><span aria-hidden="true">${NOTE_ICONS[note.tone]}</span> ${esc(note.text)}</li>`).join('')}</ul>`;
  }

  /* What happened after the commander chose. */
  function resultPanel() {
    const last = state.log[state.log.length - 1];
    return `<section class="panel result-panel" id="focus" tabindex="-1" aria-labelledby="result-title">
      <p class="eyebrow">DAY ${last.day} RESULT · ${esc(last.station.toUpperCase())}</p>
      <h2 id="result-title">${esc(last.choice)}</h2>
      <p class="result-chips"><span class="muted">Today’s change:</span> ${chips(last.deltas, 'no change')}</p>
      ${notesList(last.notes)}
      <aside class="why">
        <h3>Why this matters in real life</h3>
        <p>${esc(last.why)}</p>
        <p class="source">Source: ${sourceLink(last.source)}</p>
      </aside>
      <button id="next" class="primary" type="button">${state.ended ? 'See the mission report' : `Continue to Day ${state.day + 1}`} →</button>
    </section>`;
  }

  function reportPanel() {
    const result = report(state);
    const tone = result.success ? 'success' : result.early ? 'early' : 'partial';
    const stars = result.stars.map(star => `<li class="${star.earned ? 'earned' : ''}">
        <span class="star" aria-hidden="true">${star.earned ? '⭐' : '☆'}</span>
        <span><strong>${esc(star.label)}</strong> ${star.earned ? '<em>Earned!</em>' : '<em>Not this time</em>'}<small>${esc(star.how)}</small></span>
      </li>`).join('');
    const check = (key) => {
      const ok = state[key] >= SAFE_LEVEL;
      return `<li class="${ok ? 'ok' : 'bad'}">${ok ? '✅' : '⚠️'} ${RESOURCES[key].icon} ${esc(RESOURCES[key].label)}: <strong>${state[key]}</strong> (needs ${SAFE_LEVEL}+)</li>`;
    };
    const week = state.log.map(entry => `<details class="log-day">
        <summary><span class="log-title">Day ${entry.day} · ${esc(entry.choice)}</span> <span class="chips">${chips(entry.deltas, 'no change')}</span></summary>
        ${notesList(entry.notes)}
        <p class="muted">${esc(entry.why)} ${sourceLink(entry.source)}</p>
      </details>`).join('');
    return `<section class="panel report-panel report-${tone}" id="focus" tabindex="-1" aria-labelledby="report-title">
      <p class="eyebrow">MISSION REPORT</p>
      <h2 id="report-title">${esc(result.title)}</h2>
      <p class="report-summary">${esc(result.summary)}</p>
      <h3>Crew safety</h3>
      <ul class="crew-list">${check('life')}${check('safety')}</ul>
      <h3>Stars</h3>
      <ul class="star-list big">${stars}</ul>
      <h3>Your week</h3>
      ${week}
      <button id="restart" class="primary" type="button">Try a new strategy ↻</button>
    </section>`;
  }

  function welcomePanel() {
    const stars = goals(initial()).map(star => `<li><span aria-hidden="true">☆</span> <strong>${esc(star.label)}:</strong> ${esc(star.how)}</li>`).join('');
    return `<section class="panel welcome" id="focus" tabindex="-1" aria-labelledby="welcome-title">
      <h2 id="welcome-title">You are the commander.</h2>
      <p>Selene has landed on the Moon with four crew. Each day you pick one job. Every choice shows what it costs before you pick it, so read, plan and choose.</p>
      <ul class="rules">
        <li><span aria-hidden="true">🛡️</span> <strong>Keep the crew safe:</strong> finish with 💨 Life Support and 🛡️ Crew Safety at ${SAFE_LEVEL} or more.</li>
        <li><span aria-hidden="true">🌙</span> <strong>Plan for the night:</strong> the Sun sets on Day ${SUNSET_DAY}. After that there is no solar power, and the heaters need extra ⚡.</li>
        <li><span aria-hidden="true">⚠️</span> <strong>Watch the warnings:</strong> they tell you what will go wrong, when, and how to fix it.</li>
      </ul>
      <h3>Earn stars</h3>
      <ul class="rules">${stars}</ul>
      <p><strong>Safe crew + 2 stars = Mission success.</strong></p>
      <button id="start" class="primary" type="button">Begin your mission →</button>
      <p class="muted">Ages 7–12 · About 10 minutes · Replay to try a new strategy</p>
    </section>`;
  }

  /* ---------------------------------------------------------------- */
  /* Render + events                                                   */
  /* ---------------------------------------------------------------- */

  function render(moveFocus) {
    document.body.classList.toggle('playing', view !== 'welcome');
    if (view === 'welcome') {
      app.innerHTML = welcomePanel();
    } else {
      const main = view === 'report' ? reportPanel() : view === 'result' ? resultPanel() : dayPanel();
      app.innerHTML = `<div class="hud">${meters()}${timeline()}</div>
        <div class="layout${view === 'report' ? ' layout-report' : ''}">
          ${main}
          ${view === 'report' ? '' : budgetCard() + warningsCard() + goalsCard()}
        </div>`;
    }

    app.querySelectorAll('[data-choice]').forEach(button => {
      button.onclick = () => {
        const before = state;
        const index = Number(button.dataset.choice);
        const finish = () => {
          if (state !== before) return;
          state = decide(before, index);
          view = 'result';
          render(true);
        };
        if (days[state.day].choices[index].kind === 'comms') {
          acknowledgeEarth(html => { app.innerHTML = html; }, finish);
        } else finish();
      };
    });
    const on = (id, handler) => { const el = document.getElementById(id); if (el) el.onclick = handler; };
    on('start', () => { view = 'day'; render(true); });
    on('next', () => { view = state.ended ? 'report' : 'day'; render(true); });
    on('restart', () => { state = initial(); view = 'day'; render(true); });

    if (moveFocus) {
      const focus = document.getElementById('focus');
      if (focus) {
        focus.focus({ preventScroll: true });
        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (app.getBoundingClientRect().top < 0) app.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      }
    }
  }

  /* The sources list at the bottom of the page comes from the mission data. */
  const sourceList = document.getElementById('source-list');
  if (sourceList) {
    sourceList.innerHTML = days.map((day, i) => `<li><strong>Day ${i + 1} · ${esc(day.title)}:</strong> ${sourceLink(day.source)}</li>`).join('');
  }

  render(false);
})();
