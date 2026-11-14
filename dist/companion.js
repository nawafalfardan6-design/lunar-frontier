/*
 * Nora: the friendly voice on the crew channel.
 * ES module. Reads the engine globals (from engine.js) when they exist, so her
 * numbers always match the real rules.
 *
 * Exports (used by world.js):
 *   opening                         HTML for the first briefing
 *   companionAdvice(state)          a hint for the day ahead
 *   companionReaction(state)        a reaction to the decision just made
 *   createCompanion(getState, show, close)  adds the "Ask Nora" button
 */

// Engine globals, with fallbacks so Nora never crashes if engine.js is missing.
const researchGoal = () => (typeof RESEARCH_GOAL === 'number' ? RESEARCH_GOAL : 40);
const reserveGoal = () => (typeof RESERVE_GOAL === 'number' ? RESERVE_GOAL : 30);
const safeLevel = () => (typeof SAFE_LEVEL === 'number' ? SAFE_LEVEL : 40);
/* A number from a choice's effects, e.g. effectOf('remote-research', 'science'). */
function effectOf(choiceId, key, fallback) {
  if (typeof days === 'undefined') return fallback;
  for (const day of days) {
    const choice = day.choices.find(item => item.id === choiceId);
    if (choice) return choice.effects[key];
  }
  return fallback;
}

const has = (state, flag) => Array.isArray(state.flags) && state.flags.includes(flag);
const warning = (state, id) => (state.warnings || []).find(item => item.id === id);

export const opening = `<span class="kicker">NORA / CREW CHANNEL</span><h2>Seven days of food. Four people.</h2><p>Our ride home comes after Day 7. Until then, let’s keep Selene running. The Sun sets on Day 6, so we need to save Battery for the night.</p><button id="launch">Get to the air recycler →</button>`;

/** Advice for the day the crew is about to play. */
export function companionAdvice(state) {
  if (state.ended) {
    return state.life === 0 || state.safety === 0
      ? 'Mission control called an early return. We learned where Selene needed more help. I’m ready to try again with you.'
      : 'All seven days are in the log. Let’s see which stars your choices earned.';
  }

  // Urgent things first: a warning that is due today.
  if (warning(state, 'battery')) {
    return 'Our Battery is almost empty. If it runs out, the heaters and air pumps slow down and the crew gets hurt. Pick the job that uses the least ⚡ today.';
  }
  const due = (state.warnings || []).find(item => item.dueDay === state.day + 1 && item.id !== 'sunset');
  if (due) return `Heads up: “${due.text}” It hits tonight. ${due.fix}`;
  if (state.life < safeLevel() + 5) return `Air & Water is down to ${state.life}. The crew needs it at ${safeLevel()} or more by the end. A repair job would help.`;
  if (state.safety < safeLevel() + 5) return `Crew Safety is down to ${state.safety}. The crew needs it at ${safeLevel()} or more by the end. Look for a choice that adds 🛡️.`;

  const science = state.science;
  const goalScience = researchGoal();
  switch (state.day) {
    case 0:
      return 'Maya says the air filter is wearing out. Servicing it now costs a little Battery. If we skip it for science, it will clog on Day 3 unless we fix it.';
    case 1:
      return 'A solar storm may come on Day 4. Water bags make the shelter strong. The plants need care today if you want a harvest on Day 5. Only one job fits in today’s shift.';
    case 2: {
      const jobs = [has(state, 'filter-worn') && 'fix the worn filter', !has(state, 'shelter-ready') && 'finish the storm shelter'].filter(Boolean);
      return jobs.length
        ? `The storm comes tomorrow. “Catch up on safety jobs” would ${jobs.join(' and ')}. The crater experiment gives lots of 🔬, but then those risks stay.`
        : `The filter and the shelter are ready. The crater experiment gives ${effectOf('crater-experiment', 'science', 40)} 🔬 but uses ${Math.abs(effectOf('crater-experiment', 'power', -24))} ⚡. Check that we can spare it before sunset.`;
    }
    case 3:
      return science >= goalScience
        ? `We already have ${science} 🔬, enough to send home. Resting saves Battery for the night ahead.`
        : science + effectOf('remote-research', 'science', 20) >= goalScience
          ? `We have ${science} 🔬. Remote research would bring us to ${goalScience}, enough for the research star. Resting saves Battery instead.`
          : `We have ${science} 🔬. Even remote research won’t reach ${goalScience} today, so resting and saving Battery may be smarter.`;
    case 4:
      return has(state, 'plants-tended')
        ? 'Last sunny day! The plants you tended are ready. Watering them today earns the harvest star. Cleaning the recycler helps Air & Water instead.'
        : 'Last sunny day! The plants were not tended on Day 2, so they cannot be harvested. Cleaning the recycler gives the crew more Air & Water.';
    case 5:
      return science >= goalScience
        ? `The Sun sets today. We have ${science} 🔬, enough for the research star. The big dish costs less ⚡ today than the small dish tomorrow.`
        : `The Sun sets today. We only have ${science} 🔬, not the ${goalScience} we need for the research star. Power-saving keeps more Battery for the night.`;
    case 6:
      if (has(state, 'research-sent')) return `Our research is already home. Final checks keep the crew safe. Try to finish with ${reserveGoal()} ⚡ or more.`;
      return science >= goalScience
        ? `Last chance to send our ${science} 🔬 home. The small dish uses a lot of ⚡, so check whether we still keep ${reserveGoal()} ⚡ for the night.`
        : `We don’t have enough 🔬 for the research star, so final safety checks are the better job today.`;
    default:
      return 'Check the warnings and the forecast on each choice. They show exactly what will happen.';
  }
}

/* What Nora says about each choice, by choice id. */
const REACTIONS = {
  'service-filter': () => 'Maya says the air system sounds steadier already. No surprises on Day 3.',
  'dust-experiment': () => 'Leo has his first results! Remember the worn filter: it needs fixing by Day 3.',
  'tend-greenhouse': () => 'Sam marked the plants in the crew notebook. Water them on Day 5 for a harvest. The shelter still needs work before Day 4.',
  'stock-shelter': () => 'The shelter walls are full of water bags. Preparation is quiet work until the day you need it.',
  'crater-experiment': state => `Ice in the crater! We now have ${state.science} 🔬.`,
  'catch-up': () => 'Everything is fixed and ready. The storm can come.',
  'rest-in-shelter': () => 'The storm passed while the crew rested. We saved our Battery.',
  'remote-research': state => `Leo collected data right through the storm. We now have ${state.science} 🔬.`,
  'clean-recycler': () => 'Fresh water is flowing again. Maya is very happy.',
  harvest: state => has(state, 'harvest') ? 'Fresh lettuce! Your care on Day 2 paid off.' : 'No harvest this time. The plants needed care on Day 2.',
  'send-research': state => has(state, 'research-sent') ? 'Earth got our findings! Leo has been waiting all week for that.' : 'We only sent a status call. There was not enough 🔬 for a full report.',
  'power-save': () => 'The window covers are closed. The heaters will work less tonight.',
  'final-checks': () => 'Every suit, seal and tank passed. Selene is ready for the long night.',
  'late-downlink': state => has(state, 'research-sent') ? 'The small dish caught our signal. The research is home!' : 'We only sent a status call. There was not enough 🔬 for a full report.',
};

/** A reaction to the decision that was just made (the last log entry). */
export function companionReaction(state) {
  const last = state.log && state.log[state.log.length - 1];
  if (state.life === 0 || state.safety === 0) return 'We reached a critical limit. I’m with you. Let’s review the decisions before our next expedition.';
  if (!last) return 'Ready when you are, Commander.';

  // A penalty that just hit matters more than the choice itself.
  const hits = last.notes.filter(note => note.tone === 'bad').map(note => note.cause);
  const react = REACTIONS[last.choiceId];
  let text = hits.includes('battery') ? 'The Battery ran dry, just like the warning said. The crew got cold and the air pumps slowed.'
    : hits.includes('filter') ? 'The worn filter clogged, just like the warning said. Maya swapped it, but we lost Air & Water.'
    : hits.includes('storm') ? 'The storm hit and the shelter walls were thin. The crew is okay, but Crew Safety dropped.'
    : react ? react(state) : 'Done. Let’s see what the next day brings.';
  if (state.ended) return `${text} That was your final call, Commander. Let’s look at the report.`;
  if (state.power < reserveGoal()) text += ` Our Battery is down to ${state.power} ⚡, so let’s be careful.`;
  return text;
}

/** Adds the "Ask Nora" button. `show(html)` opens a dialog, `close()` closes it. */
export function createCompanion(getState, show, close) {
  const button = document.createElement('button');
  button.id = 'ask-nora';
  button.innerHTML = '<span class="companion-avatar" aria-hidden="true">N</span><span>Ask Nora<small>Need a hand?</small></span>';
  button.onclick = () => {
    const state = getState();
    show(`<div class="companion-heading"><span class="companion-avatar" aria-hidden="true">N</span><div><strong>NORA</strong><small>Here when you need me</small></div></div><h2>Let’s take this one step at a time.</h2><p>${companionAdvice(state)}</p><p class="supply-note">${Math.max(0, 7 - state.day)} mission days of packaged meals remain. A fresh harvest is a bonus. This is the fictional mission’s supply plan.</p><button id="nora-close">Got it. I’m ready.</button>`);
    document.getElementById('nora-close').onclick = close;
  };
  document.body.append(button);
}
