/*
 * Lunar Frontier mission engine
 * -----------------------------
 * Seven days on the Moon aboard the landed spacecraft Selene, with four crew.
 * Each day the commander makes ONE decision at a ship terminal (a "station").
 *
 * This file is plain data plus pure functions. It is a classic script:
 *   - In the browser, load it with <script src="engine.js"> BEFORE any ES modules.
 *     Everything at the top level becomes a global (RESOURCES, days, decide, ...).
 *   - In Node, `require('./engine.js')` returns the same names (see the bottom).
 *
 * Game rules in one breath:
 *   - Four meters, 0 to 100: Battery, Life Support, Crew Safety and Science.
 *   - Every day the ship uses a base load of Battery. Solar panels recharge it
 *     while the Sun is up. The Sun sets on Day 6: no more solar power, and the
 *     heaters raise the load. The battery is a planning problem.
 *   - Nothing is hidden. A choice that creates a delayed risk adds a visible
 *     warning straight away, with the day it will hit and how to fix it.
 *     Forecastable events (the solar storm, sunset) are warned about early.
 *   - The crew is safe if Life Support and Crew Safety both end at 40 or more.
 *     Four stars reward goals: research sent home, a fresh harvest, a battery
 *     reserve for the night and a healthy crew. Safe crew + 2 stars = success.
 *
 * Public API (globals in the browser, module.exports in Node):
 *   RESOURCES, RESOURCE_KEYS, STATIONS, CHOICE_KINDS, days, dailyBudget(dayIndex),
 *   initial(), decide(state, i), forecast(state, i), goals(state), report(state),
 *   outcome(state), effectText(effects), plus the tuning constants below.
 */

/* ------------------------------------------------------------------ */
/* Meters                                                              */
/* ------------------------------------------------------------------ */

const RESOURCES = {
  power:   { key: 'power',   label: 'Battery',     icon: '⚡', start: 80, about: 'Stored electricity for every machine on the ship.' },
  life:    { key: 'life',    label: 'Life Support', icon: '💨', start: 60, about: 'Health of the air and water recycling systems. This is a score, not stored oxygen.' },
  safety:  { key: 'safety',  label: 'Crew Safety', icon: '🛡️', start: 60, about: 'How well the crew is protected and ready.' },
  science: { key: 'science', label: 'Science',     icon: '🔬', start: 0,  about: 'Discoveries the crew has collected. Earn it!' },
};
const RESOURCE_KEYS = ['power', 'life', 'safety', 'science'];

/* The crew is "safe" when both of these meters end at SAFE_LEVEL or more. */
const SAFE_LEVEL = 40;
/* Science the research star needs before it is worth sending home. */
const RESEARCH_GOAL = 40;
/* Battery the ship should keep at the end to survive the lunar night. */
const HIBERNATION = Object.freeze({ days: 14, dailyLoad: 2, margin: 2 });
// Fictional uncrewed sleep mode: 14 x 2 + 2 margin = 30 teaching units.
const RESERVE_GOAL = HIBERNATION.days * HIBERNATION.dailyLoad + HIBERNATION.margin;
/* Both crew meters at this level or more earns the "Healthy crew" star. */
const HEALTHY_LEVEL = 70;

/* ------------------------------------------------------------------ */
/* Daily power budget                                                  */
/* ------------------------------------------------------------------ */

const DAYLIGHT = { load: 10, solar: 20 };
const NIGHT = { load: 20, solar: 0 };
/* Day number (1 to 7) when the Sun sets. Days before this are sunny. */
const SUNSET_DAY = 6;

/**
 * The power budget for a day. dayIndex is 0-based (0 = Day 1).
 * @returns {{load:number, solar:number, sunlight:boolean, label:string}}
 */
function dailyBudget(dayIndex) {
  const sunlight = dayIndex + 1 < SUNSET_DAY;
  const { load, solar } = sunlight ? DAYLIGHT : NIGHT;
  const label = sunlight
    ? `☀️ Daytime: solar panels make +${solar} ⚡. The ship uses −${load} ⚡.`
    : `🌙 Lunar night: no solar power. The ship and its heaters use −${load} ⚡.`;
  return { load, solar, sunlight, label };
}

/* ------------------------------------------------------------------ */
/* Ship terminals                                                      */
/* ------------------------------------------------------------------ */

/* Names match `shipStations` in ship.js. */
const STATIONS = ['Air recycling', 'Food & water', 'Power bay', 'Storm shelter', 'Water recovery', 'Flight deck'];

/* ------------------------------------------------------------------ */
/* The seven days                                                      */
/* ------------------------------------------------------------------ */
/*
 * Choice fields:
 *   id, label     a stable id and the button text
 *   summary       one short sentence shown before choosing
 *   effects       meter changes from the choice itself (shown as chips)
 *   sets, clears  flags this choice adds to / removes from state.flags
 *   kind          'repair' | 'science' | 'shelter' | 'garden' | 'comms' | 'rest'
 *                 (picks a matching hands-on mini-game in the 3D ship)
 *   result        what happened, shown after choosing
 *   reward        optional goal: if `needs` is met, add `sets` to the flags.
 *                 needs.flag = a flag that must be present,
 *                 needs.science = Science that must be collected.
 *                 good / miss = result text, goodAhead = preview text.
 *
 * Log notes look like { text, tone: 'good'|'bad'|'info', topic, cause?, ahead? }:
 *   topic  'choice' | 'goal' | 'budget' | 'risk'
 *   cause  for penalties: the id of the warning that announced it
 *   ahead  future-tense text for previews ("Tonight the storm hits...")
 */

const days = [
  {
    id: 'air-filter',
    title: 'Make the air safe',
    speaker: 'Maya · habitat engineer',
    briefing: 'We landed! Selene’s air filter is wearing out. I can service it today. Or I can help Leo start his first experiment. What comes first, Commander?',
    story: 'Air filters catch moon dust and pull out the carbon dioxide we breathe out. A worn filter still works for a little while. Then it clogs.',
    why: 'On the International Space Station, the life support system scrubs carbon dioxide out of the air and filters out dust. Astronauts clean and swap these parts on a schedule. Fixing a small problem early stops a bigger breakdown later.',
    source: { label: 'NASA: Environmental Control and Life Support Systems', url: 'https://www.nasa.gov/reference/environmental-control-and-life-support-systems-eclss/' },
    station: 'Air recycling',
    choices: [
      {
        id: 'service-filter',
        label: 'Service the air filter',
        summary: 'Put in a fresh filter so the air stays clean all week.',
        effects: { power: -8, life: 8, safety: 0, science: 0 },
        sets: ['filter-fresh'], clears: [],
        kind: 'repair',
        result: 'Maya slid a fresh filter into place. The air smells clean.',
      },
      {
        id: 'dust-experiment',
        label: 'Start the moon-dust experiment',
        summary: 'Collect science today. The worn filter will clog on Day 3 unless you fix it.',
        effects: { power: -6, life: 0, safety: 0, science: 20 },
        sets: ['filter-worn'], clears: [],
        kind: 'science',
        result: 'Leo’s dust samples are in the lab. The old filter is still working… for now.',
      },
    ],
  },
  {
    id: 'plants-or-shelter',
    title: 'Plants or protection?',
    speaker: 'Sam · mission specialist',
    briefing: 'News from Earth: the Sun has a big, busy sunspot. A solar storm may reach us on Day 4. We have one free work shift. Do we stack water bags around the storm shelter, or care for the greenhouse plants?',
    story: 'Water is great at blocking space radiation, and our water bags are stored here. The greenhouse plants also need care today if we want a harvest on Day 5.',
    why: 'NASA grows lettuce, kale and even flowers in a small space garden called Veggie. Red and blue LED lights help the plants grow. Plants need weeks of care before harvest, and fresh food is good for the crew’s health and mood.',
    source: { label: 'NASA: Growing Plants in Space', url: 'https://www.nasa.gov/exploration-research-and-technology/growing-plants-in-space/' },
    station: 'Food & water',
    choices: [
      {
        id: 'tend-greenhouse',
        label: 'Tend the greenhouse',
        summary: 'Water and trim the plants so they can be harvested on Day 5.',
        effects: { power: -6, life: 0, safety: 0, science: 0 },
        sets: ['plants-tended'], clears: [],
        kind: 'garden',
        result: 'Sam watered every plant pillow. Tiny new leaves are opening.',
      },
      {
        id: 'stock-shelter',
        label: 'Stack water bags in the shelter',
        summary: 'Line the shelter walls with water so it is ready for the storm.',
        effects: { power: -4, life: 0, safety: 5, science: 0 },
        sets: ['shelter-ready'], clears: [],
        kind: 'shelter',
        result: 'Water bags now line the shelter walls. It is ready for a storm.',
      },
    ],
  },
  {
    id: 'cold-crater',
    title: 'Is the discovery worth the power?',
    speaker: 'Leo · science lead',
    briefing: 'Mission control confirms it: the solar storm arrives tomorrow. I want to study the ice in a cold, dark crater. The instruments need heaters, and heaters drink a lot of Battery. Or we can catch up on safety jobs today.',
    story: 'The power bay sends Battery power to every machine on the ship. Today you choose where it goes.',
    why: 'Sunny ground on the Moon can be hotter than boiling water. Deep craters near the poles never see the Sun. NASA’s Lunar Reconnaissance Orbiter measured them colder than −400 °F (−240 °C). Machines working there need heaters, and heaters use lots of energy.',
    source: { label: 'NASA Science: Weather on the Moon', url: 'https://science.nasa.gov/moon/weather-on-the-moon/' },
    station: 'Power bay',
    choices: [
      {
        id: 'crater-experiment',
        label: 'Heat the crater instruments',
        summary: 'Big science from the icy crater. The heaters use lots of Battery.',
        effects: { power: -24, life: 0, safety: 0, science: 40 },
        sets: [], clears: [],
        kind: 'science',
        result: 'The warm instruments found ice in the crater! Leo is thrilled.',
      },
      {
        id: 'catch-up',
        label: 'Catch up on safety jobs',
        summary: 'Fix the air filter and finish the storm shelter, if they still need it.',
        effects: { power: -6, life: 4, safety: 4, science: 0 },
        sets: ['shelter-ready', 'filter-fresh'], clears: ['filter-worn'],
        kind: 'repair',
        result: 'The crew checked every system. The filter is fresh and the shelter is ready.',
      },
    ],
  },
  {
    id: 'solar-storm',
    title: 'Solar storm! Everyone to the shelter',
    speaker: 'Mission control · Earth',
    briefing: 'Particle alert! The solar storm has reached the Moon. All four crew, get into the storm shelter now. You can rest until it passes, or run Leo’s experiment by remote control.',
    story: 'Thick shelter walls keep most solar particles away from the crew. Machines outside can keep working while the crew hides.',
    why: 'Solar storms fling tiny particles across space, and some arrive in less than an hour. NASA space-weather scientists watch the Sun every day. On the Orion spacecraft, astronauts would build a shelter from stowage bags, food and water. More stuff between the crew and the storm means more protection.',
    source: { label: 'NASA Science: Protecting astronauts from space radiation at the Moon', url: 'https://science.nasa.gov/science-research/heliophysics/how-nasa-will-protect-astronauts-from-space-radiation-at-the-moon/' },
    station: 'Storm shelter',
    choices: [
      {
        id: 'rest-in-shelter',
        label: 'Rest until the storm passes',
        summary: 'The crew rests together and saves Battery.',
        effects: { power: 0, life: 0, safety: 5, science: 0 },
        sets: [], clears: [],
        kind: 'rest',
        result: 'The crew rested, told stories and waited out the storm.',
      },
      {
        id: 'remote-research',
        label: 'Run the experiment by remote control',
        summary: 'Keep collecting science from inside the shelter. Uses Battery.',
        effects: { power: -16, life: 0, safety: 0, science: 20 },
        sets: [], clears: [],
        kind: 'science',
        result: 'Leo steered the rover from the shelter and collected more data.',
      },
    ],
  },
  {
    id: 'water-recycler',
    title: 'Water for the crew or the crop?',
    speaker: 'Maya · habitat engineer',
    briefing: 'Last sunny day before sunset! Our water recycler is clogging with minerals. I can clean it, or we can send water and light to the greenhouse for a harvest. We can’t do both.',
    story: 'The recycler turns used water back into clean drinking water. The plants need water and their grow lights for one more day.',
    why: 'The space station recycles about 98% of its water, even water from sweat and urine! Recycling means rockets carry less water from Earth. The filters and machines still need cleaning to keep working.',
    source: { label: 'NASA: Water recovery milestone on the space station', url: 'https://www.nasa.gov/missions/station/iss-research/nasa-achieves-water-recovery-milestone-on-international-space-station/' },
    station: 'Water recovery',
    choices: [
      {
        id: 'clean-recycler',
        label: 'Clean the water recycler',
        summary: 'Scrub out the minerals so fresh water flows again.',
        effects: { power: -6, life: 12, safety: 0, science: 0 },
        sets: [], clears: [],
        kind: 'repair',
        result: 'Maya scrubbed the recycler. Clean water is flowing again.',
      },
      {
        id: 'harvest',
        label: 'Water the plants and harvest',
        summary: 'Grow lights on for one more day. Only works if the plants were tended on Day 2.',
        effects: { power: -14, life: 0, safety: 0, science: 0 },
        sets: [], clears: [],
        kind: 'garden',
        result: 'The grow lights glowed pink all day.',
        reward: {
          needs: { flag: 'plants-tended' },
          sets: ['harvest'],
          good: 'Fresh harvest! The crew picked crunchy lettuce. Your Day 2 care paid off.',
          goodAhead: 'Your plants are ready: this earns the Fresh harvest star!',
          miss: 'No harvest: the plants were not tended on Day 2, so they are not ready yet.',
        },
      },
    ],
  },
  {
    id: 'downlink',
    title: 'Send our discoveries home',
    speaker: 'Leo · science lead',
    briefing: 'The Sun sets today, and the long lunar night begins. A big dish antenna on Earth is listening for us. We can send our research now, or switch Selene to night power-saving.',
    story: 'From now on there is no solar power. Heaters switch on to keep the ship warm. Every bit of Battery counts.',
    why: 'NASA talks to faraway spacecraft with the Deep Space Network: giant dish antennas in California, Spain and Australia. As Earth spins, one site passes the signal to the next. A bigger dish can hear a quieter signal, so a spacecraft can send its data faster and use less energy.',
    source: { label: 'NASA: Deep Space Network', url: 'https://www.nasa.gov/communicating-with-missions/dsn/' },
    station: 'Flight deck',
    choices: [
      {
        id: 'send-research',
        label: 'Send the research home',
        summary: `Use the big dish. The research star needs at least ${RESEARCH_GOAL} 🔬 Science.`,
        effects: { power: -10, life: 0, safety: 0, science: 0 },
        sets: [], clears: [],
        kind: 'comms',
        result: 'The big dish on Earth locked onto Selene’s signal.',
        reward: {
          needs: { science: RESEARCH_GOAL },
          sets: ['research-sent'],
          good: 'Your research reached Earth! Scientists are already reading it.',
          goodAhead: 'You have enough 🔬: this earns the Research star!',
          miss: `Only a short status call went out. The research star needs ${RESEARCH_GOAL} 🔬 Science.`,
        },
      },
      {
        id: 'power-save',
        label: 'Switch to night power-saving',
        summary: 'Close the window covers and turn off extra lights. Saves Battery.',
        effects: { power: 10, life: 0, safety: 0, science: 0 },
        sets: ['power-saving'], clears: [],
        kind: 'rest',
        result: 'The window covers are shut and the extra lights are off. The heaters work less.',
      },
    ],
  },
  {
    id: 'long-night',
    title: 'Ready for the long night',
    speaker: 'Sam · mission specialist',
    briefing: 'Our last day! Our ride home arrives tonight. Selene must stay warm through two weeks of darkness for the next crew. Should we run the final safety checks, or use a small dish for one last downlink?',
    story: 'A night on the Moon lasts about two weeks and gets colder than −290 °F (−180 °C). After the crew leaves, Selene enters uncrewed sleep mode. Our game budgets 2 Battery per day for 14 days, plus 2 spare: 30 total. The occupied ship uses 20 per night shift. These are teaching units, not NASA power measurements.',
    why: 'A lunar night lasts about 14 Earth days. With no sunlight, solar-powered machines must live on their batteries, and the cold can crack parts. NASA is building new power systems, like small nuclear power sources, so Moon bases can keep running all night.',
    source: { label: 'NASA: Lunar Surface Technology', url: 'https://www.nasa.gov/lunar-surface-technology/' },
    station: 'Flight deck',
    choices: [
      {
        id: 'final-checks',
        label: 'Run the final safety checks',
        summary: 'Check the suits, seals and air tanks before the trip home.',
        effects: { power: -4, life: 6, safety: 6, science: 0 },
        sets: [], clears: [],
        kind: 'repair',
        result: 'Every suit, seal and tank passed its check. Selene is tucked in for the night.',
      },
      {
        id: 'late-downlink',
        label: 'Send research with the small dish',
        summary: 'A last chance to send research. The small dish needs more Battery.',
        effects: { power: -20, life: 0, safety: 0, science: 0 },
        sets: [], clears: [],
        kind: 'comms',
        result: 'A smaller dish on Earth picked up Selene’s signal.',
        reward: {
          needs: { science: RESEARCH_GOAL },
          sets: ['research-sent'],
          good: 'Your research reached Earth just in time!',
          goodAhead: 'You have enough 🔬: this earns the Research star!',
          miss: `Only a short status call went out. The research star needs ${RESEARCH_GOAL} 🔬 Science.`,
        },
      },
    ],
  },
];

const CHOICE_KINDS = ['repair', 'science', 'shelter', 'garden', 'comms', 'rest'];

/* ------------------------------------------------------------------ */
/* Risks: delayed problems, always shown as warnings first             */
/* ------------------------------------------------------------------ */
/*
 * A risk is "active" when its flag is present (`whenFlag`) or missing
 * (`unlessFlag`). It is shown as a warning from day `showFrom` until its
 * `dueDay`. If it is still active at the end of `dueDay`, it hits.
 * After `lastFixDay` the warning's fix text switches to `tooLate`.
 */
const RISKS = [
  {
    id: 'filter',
    whenFlag: 'filter-worn',
    showFrom: 1,
    dueDay: 3,
    lastFixDay: 3,
    text: 'Air filter worn. It will clog at the end of Day 3.',
    fix: 'Fix it on Day 3: choose “Catch up on safety jobs”.',
    hit: { life: -25 },
    hitNote: 'The worn air filter clogged on Day 3, because it was never serviced. The crew breathed stale air until Maya swapped it.',
    aheadNote: 'Tonight the worn air filter will clog.',
    after: { clears: ['filter-worn'], sets: ['filter-clogged'] },
  },
  {
    id: 'storm',
    unlessFlag: 'shelter-ready',
    showFrom: 2,
    dueDay: 4,
    lastFixDay: 3,
    text: 'Solar storm on Day 4! The shelter walls are thin.',
    fix: 'Day 2: “Stack water bags in the shelter”, or Day 3: “Catch up on safety jobs”.',
    tooLate: 'Too late to add water bags. Resting in the shelter adds 🛡️ +5 to help.',
    hit: { safety: -30 },
    hitNote: 'The solar storm hit, and the shelter had no water bags in its walls. More particles got through to the crew.',
    aheadNote: 'Tonight the solar storm hits, and the shelter walls are thin.',
    after: { clears: [], sets: ['storm-exposed'] },
  },
];

/* What happens if the Battery runs out (also shown in the battery warning). */
const BLACKOUT = { life: -20, safety: -20 };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/* Note: in the browser these helpers are globals too, so their names are specific. */
const clampMeter = n => Math.max(0, Math.min(100, Math.round(n)));
const hasFlag = (state, flag) => state.flags.includes(flag);
const cloneState = value => JSON.parse(JSON.stringify(value));

function addFlags(flags, list) {
  for (const flag of list || []) if (!flags.includes(flag)) flags.push(flag);
}
function removeFlags(flags, list) {
  return flags.filter(flag => !(list || []).includes(flag));
}
function riskActive(risk, state) {
  if (risk.whenFlag) return hasFlag(state, risk.whenFlag);
  if (risk.unlessFlag) return !hasFlag(state, risk.unlessFlag);
  return false;
}
/* "⚡ −15 💨 −15" style text for a set of meter changes. */
function effectText(effects) {
  return RESOURCE_KEYS
    .filter(key => effects[key])
    .map(key => `${RESOURCES[key].icon} ${effects[key] > 0 ? '+' : '−'}${Math.abs(effects[key])}`)
    .join(' ');
}

/**
 * Warnings for the day the crew is about to play (state.day).
 * Called by initial() and at the end of decide().
 */
function warningsFor(state) {
  const warnings = [];
  if (state.ended) return warnings;
  const dayNumber = state.day + 1;

  for (const risk of RISKS) {
    if (dayNumber >= risk.showFrom && dayNumber <= risk.dueDay && riskActive(risk, state)) {
      const fix = dayNumber > risk.lastFixDay ? risk.tooLate : risk.fix;
      warnings.push({ id: risk.id, text: risk.text, dueDay: risk.dueDay, fix });
    }
  }

  // Sunset is announced two days ahead, so there is time to save Battery.
  if (dayNumber >= SUNSET_DAY - 2 && dayNumber < SUNSET_DAY) {
    const nightNeed = NIGHT.load * (days.length - SUNSET_DAY + 1);
    warnings.push({
      id: 'sunset',
      text: `Sunset on Day ${SUNSET_DAY}. Then there is no solar power, and the heaters switch on.`,
      dueDay: SUNSET_DAY,
      fix: `Save ⚡ for the night. Days ${SUNSET_DAY}–${days.length} use ${nightNeed} ⚡ just to keep the ship running.`,
    });
  }

  // Look ahead: could any choice today empty the Battery?
  const day = days[state.day];
  const budget = dailyBudget(state.day);
  const risky = day.choices.filter(c => state.power + (c.effects.power || 0) + budget.solar - budget.load < 0);
  if (risky.length) {
    warnings.push({
      id: 'battery',
      text: `Battery very low! ${risky.length === day.choices.length ? 'Every job today' : 'Some jobs today'} would empty it. Then heaters and air pumps slow down (${effectText(BLACKOUT)}).`,
      dueDay: dayNumber,
      fix: risky.length === day.choices.length ? 'Pick the job that uses the least ⚡.' : 'Pick a job that uses less ⚡. Check the forecast.',
    });
  }
  return warnings;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/** A fresh mission. */
function initial() {
  const state = {
    day: 0,
    power: RESOURCES.power.start,
    life: RESOURCES.life.start,
    safety: RESOURCES.safety.start,
    science: RESOURCES.science.start,
    flags: [],
    warnings: [],
    log: [],
    ended: false,
  };
  state.warnings = warningsFor(state);
  return state;
}

/**
 * Play choice `index` for today. Pure: returns a new state, never changes `state`.
 * Returns `state` itself if the mission is over or the choice does not exist.
 */
function decide(state, index) {
  const day = days[state && state.day];
  if (!state || state.ended || !day || !day.choices[index]) return state;

  const s = cloneState(state);
  const choice = day.choices[index];
  const dayNumber = s.day + 1;
  const notes = [];
  const before = { power: s.power, life: s.life, safety: s.safety, science: s.science };

  // 1. The choice itself.
  for (const key of RESOURCE_KEYS) s[key] += choice.effects[key] || 0;
  s.flags = removeFlags(s.flags, choice.clears);
  addFlags(s.flags, choice.sets);
  if (choice.result) notes.push({ text: choice.result, tone: 'good', topic: 'choice' });

  // 2. Goals that depend on earlier choices (harvest, research).
  const reward = choice.reward;
  if (reward) {
    const ready = reward.needs.flag ? hasFlag(s, reward.needs.flag) : s.science >= reward.needs.science;
    if (reward.sets.every(flag => hasFlag(s, flag))) {
      notes.push({ text: 'That goal was already done, so this did not add anything new.', tone: 'info', topic: 'goal' });
    } else if (ready) {
      addFlags(s.flags, reward.sets);
      notes.push({ text: reward.good, ahead: reward.goodAhead, tone: 'good', topic: 'goal' });
    } else {
      notes.push({ text: reward.miss, tone: 'info', topic: 'goal' });
    }
  }

  // 3. The daily power budget.
  const budget = dailyBudget(s.day);
  s.power += budget.solar - budget.load;
  notes.push({
    text: budget.sunlight
      ? `Solar panels made +${budget.solar} ⚡. The ship used −${budget.load} ⚡.`
      : `Lunar night: no solar power. The ship and its heaters used −${budget.load} ⚡.`,
    tone: 'info',
    topic: 'budget',
  });

  // 4. Running out of Battery (always warned about the day before).
  if (s.power < 0) {
    s.power = 0;
    for (const key in BLACKOUT) s[key] += BLACKOUT[key];
    notes.push({
      text: `The Battery ran out! Heaters and air pumps slowed down. ${effectText(BLACKOUT)}.`,
      ahead: `Tonight the Battery would run out! Heaters and air pumps slow down. ${effectText(BLACKOUT)}.`,
      tone: 'bad',
      topic: 'risk',
      cause: 'battery',
    });
  }

  // 5. Delayed risks that are due today (each was a visible warning).
  for (const risk of RISKS) {
    if (risk.dueDay === dayNumber && riskActive(risk, s)) {
      for (const key in risk.hit) s[key] += risk.hit[key];
      s.flags = removeFlags(s.flags, risk.after.clears);
      addFlags(s.flags, risk.after.sets);
      notes.push({
        text: `${risk.hitNote} ${effectText(risk.hit)}.`,
        ahead: `${risk.aheadNote} ${effectText(risk.hit)}.`,
        tone: 'bad',
        topic: 'risk',
        cause: risk.id,
      });
    }
  }

  // Expedition supplies share the same path as forecasts: no hidden end-of-day cost.
  if (s.expedition) {
    const e = s.expedition;
    const shortage = e.oxygen < 4 || e.food < 1;
    e.oxygen = Math.max(0, e.oxygen - 4);
    e.food = Math.max(0, e.food - 1);
    if (choice.id === 'harvest' && hasFlag(s, 'harvest')) e.food += 2;
    notes.push({ text: 'Crew supplies: used 4 base oxygen and 1 meal-day.', tone: 'info', topic: 'budget' });
    if (shortage) {
      s.safety -= 5;
      notes.push({ text: 'Not enough oxygen or meals: lost 5 Crew Safety.',
        ahead: 'Not enough oxygen or meals tonight: lose 5 Crew Safety.', tone: 'bad', topic: 'risk' });
    }
  }

  // 6. Keep every meter a whole number from 0 to 100.
  for (const key of RESOURCE_KEYS) s[key] = clampMeter(s[key]);

  const deltas = {};
  for (const key of RESOURCE_KEYS) deltas[key] = s[key] - before[key];

  s.log.push({
    day: dayNumber,
    title: day.title,
    station: day.station,
    choice: choice.label,
    choiceId: choice.id,
    choiceIndex: index,
    kind: choice.kind,
    notes,
    why: day.why,
    source: day.source,
    deltas,
    after: { power: s.power, life: s.life, safety: s.safety, science: s.science },
  });

  s.day += 1;
  // The mission ends after Day 7, or early if Life Support or Crew Safety hits 0.
  s.ended = s.day >= days.length || s.life === 0 || s.safety === 0;
  s.warnings = warningsFor(s);
  return s;
}

/**
 * Preview choice `index` without playing it. Runs decide() on the state,
 * so the preview is exactly what would happen.
 * @returns {{deltas:object, notes:Array, warnings:Array, endsMission:boolean} | null}
 */
function forecast(state, index) {
  const next = decide(state, index);
  if (next === state) return null;
  const entry = next.log[next.log.length - 1];
  return { deltas: entry.deltas, notes: entry.notes, warnings: next.warnings, endsMission: next.ended };
}

/* Stars: the mission goals. Each `earned` test reads the final state. */
const STARS = [
  {
    id: 'research',
    label: 'Research reached Earth',
    how: `Collect at least ${RESEARCH_GOAL} 🔬 Science, then send it home on Day 6 or Day 7.`,
    earned: state => hasFlag(state, 'research-sent'),
    progress: state => hasFlag(state, 'research-sent')
      ? 'Sent to Earth!'
      : `${state.science} of ${RESEARCH_GOAL} 🔬 collected · not sent yet`,
  },
  {
    id: 'harvest',
    label: 'Fresh harvest',
    how: 'Tend the greenhouse on Day 2, then water the plants on Day 5.',
    earned: state => hasFlag(state, 'harvest'),
    progress: state => hasFlag(state, 'harvest')
      ? 'Harvested!'
      : hasFlag(state, 'plants-tended')
        ? (state.day < 5 ? 'Plants tended · water them on Day 5' : 'Plants tended · not harvested')
        : (state.day < 2 ? 'Plants need care on Day 2' : 'Plants were not tended on Day 2'),
  },
  {
    id: 'reserve',
    label: 'Battery reserve for the night',
    how: `Finish all 7 days with at least ${RESERVE_GOAL} ⚡ Battery, for uncrewed sleep mode: 14 days × 2 Battery, plus 2 spare. This is a simplified game budget.`,
    earned: state => state.day >= days.length && state.power >= RESERVE_GOAL,
    progress: state => `${state.power} ⚡ now · need ${RESERVE_GOAL} ⚡ after Day ${days.length}`,
  },
  {
    id: 'healthy',
    label: 'Healthy crew',
    how: `Finish with 💨 Life Support and 🛡️ Crew Safety both at ${HEALTHY_LEVEL} or more. Fix risks early and do repairs.`,
    earned: state => state.day >= days.length && state.life >= HEALTHY_LEVEL && state.safety >= HEALTHY_LEVEL,
    progress: state => `💨 ${state.life} · 🛡️ ${state.safety} now · need ${HEALTHY_LEVEL} each`,
  },
];

/**
 * Star progress at any point in the mission (for HUDs and the report).
 * @returns {Array<{id,label,earned:boolean,how,progress:string}>}
 */
function goals(state) {
  return STARS.map(star => ({ id: star.id, label: star.label, earned: star.earned(state), how: star.how, progress: star.progress(state) }));
}

/** True if a meter hit zero and the mission stopped before Day 7 ended. */
function endedEarly(state) {
  return state.ended && (state.life === 0 || state.safety === 0);
}

/**
 * The end-of-mission report.
 * @returns {{title:string, success:boolean, early:boolean, crewSafe:boolean,
 *            stars:Array<{id,label,earned,how,progress}>, summary:string}}
 */
function report(state) {
  const early = endedEarly(state);
  const crewSafe = !early && state.life >= SAFE_LEVEL && state.safety >= SAFE_LEVEL;
  const stars = goals(state);
  const starCount = stars.filter(star => star.earned).length;
  const success = crewSafe && starCount >= 2 && state.day >= days.length;

  let title, summary;
  if (early) {
    title = 'Mission ended early';
    const meter = state.life === 0 ? RESOURCES.life.label : RESOURCES.safety.label;
    summary = `${meter} reached zero on Day ${state.day}, so mission control brought the crew home early. Read the warnings, fix risks before they are due, and keep Battery for the night.`;
  } else if (success) {
    title = 'Mission success';
    summary = `The crew is safe and you earned ${starCount} of ${stars.length} stars. Great planning, Commander!`;
  } else if (!crewSafe) {
    title = 'Partial success';
    const low = [state.life < SAFE_LEVEL && RESOURCES.life.label, state.safety < SAFE_LEVEL && RESOURCES.safety.label].filter(Boolean).join(' and ');
    summary = `The crew made it through all 7 days and earned ${starCount} of ${stars.length} stars, but ${low} ended below ${SAFE_LEVEL}. A safe crew needs both at ${SAFE_LEVEL} or more. Try fixing risks before they are due.`;
  } else {
    title = 'Partial success';
    summary = `The crew is safe! You earned ${starCount} of ${stars.length} stars. Earn 2 stars for full mission success.`;
  }
  return { title, success, early, crewSafe, stars, summary };
}

/** Just the report title. Kept for older callers. */
function outcome(state) {
  return report(state).title;
}

if (typeof module !== 'undefined') {
  module.exports = {
    RESOURCES, RESOURCE_KEYS, STATIONS, CHOICE_KINDS, RISKS, STARS, BLACKOUT,
    DAYLIGHT, NIGHT, HIBERNATION, SAFE_LEVEL, RESEARCH_GOAL, RESERVE_GOAL, HEALTHY_LEVEL, SUNSET_DAY,
    days, dailyBudget, initial, decide, forecast, goals, report, outcome, effectText,
  };
}
