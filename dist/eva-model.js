// Surface resources use teaching units. No vacuum, radiation or ISRU engineering model.
export function newExpedition() {
  return { version: 1, complete: false, suited: false, outside: false, suit: 0,
    oxygen: 60, water: 20, food: 7, ice: 0, rocks: 0, iceLeft: 2, rocksLeft: 2,
    tripsDay: -1, scans: 0, melted: 0, position: [0, 18], notice: '' };
}

export const EVA_ACTIONS = {
  suit: ['Put on the spacesuit', 'Seal your helmet before going outside.'],
  fill: ['Fill the suit tank', 'Transfer up to 40 oxygen from the base. It is not free air.'],
  exit: ['Open airlock · go outside', 'At least 15 suit oxygen. One expedition per Earth-day shift.'],
  enter: ['Close airlock · return inside', 'Your suit stops using oxygen in the pressurized cabin.'],
  ice: ['Recover sealed ice', '8 suit oxygen. Bring back 2 ice samples from the science cache.'],
  rock: ['Collect a Moon rock', '8 suit oxygen. Analyse it inside for research.'],
  melt: ['Melt one ice sample', '6 Battery + 1 ice → 20 water.'],
  oxygen: ['Make breathing oxygen', '5 Battery + 10 water → 60 base oxygen.'],
  plants: ['Water the food plants', '4 Battery + 10 water → 2 meal-days. Growing time is compressed.'],
  scan: ['Analyse one Moon rock', '5 Battery + 1 rock → 10 Science.'],
  assist: ['Ask the crew to retrieve the ice', 'Accessibility / rescue option: up to 10 Battery and 5 Crew Safety.'],
};

export function evaAction(state, id) {
  const s = structuredClone(state), e = s.expedition;
  const fail = message => ({ state, message, ok: false });
  if (!e || s.ended) return fail('This expedition is not active.');
  if (!(id in EVA_ACTIONS)) return fail('Unknown action.');
  const indoor = ['suit', 'fill', 'exit', 'melt', 'oxygen', 'plants', 'scan', 'assist'];
  if (e.outside && indoor.includes(id)) return fail('Return to the airlock first.');
  if (!e.outside && ['ice', 'rock', 'enter'].includes(id)) return fail('Go through the airlock first.');
  const spend = (power, water = 0) => s.power >= power && e.water >= water;
  if (id === 'suit') e.suited = true;
  if (id === 'fill') {
    if (!e.suited) return fail('Put on the spacesuit first.');
    const amount = Math.min(40 - e.suit, e.oxygen);
    if (amount <= 0) return fail('Tank full, or no base oxygen. Make oxygen using water and Battery.');
    e.suit += amount; e.oxygen -= amount;
  }
  if (id === 'exit') {
    if (!e.suited || e.suit < 15) return fail('Wear the suit and fill at least 15 oxygen.');
    if (s.day === 3) return fail('Solar storm: stay inside today.');
    if (e.complete && e.tripsDay === s.day) return fail('Today’s expedition is used. Return next shift.');
    e.outside = true; e.tripsDay = s.day; e.position = [0, 18];
  }
  if (id === 'enter') e.outside = false;
  if (id === 'ice' || id === 'rock') {
    if (e.suit < 8) return fail('Not enough suit oxygen to collect safely. Return now.');
    if (id === 'ice' && !e.iceLeft) return fail('The ice cache is empty.');
    if (id === 'rock' && !e.rocksLeft) return fail('Both marked rocks have been collected.');
    e.suit -= 8;
    if (id === 'ice') { e.ice += e.iceLeft; e.iceLeft = 0; }
    else { e.rocks++; e.rocksLeft--; }
  }
  if (id === 'melt') {
    if (!e.ice || !spend(6)) return fail('Need 1 ice sample and 6 Battery.');
    e.ice--; e.melted++; s.power -= 6; e.water += 20;
  }
  if (id === 'oxygen') {
    if (!spend(5, 10)) return fail('Need 5 Battery and 10 water.');
    if (e.oxygen > 140) return fail('The base oxygen tank is nearly full.');
    s.power -= 5; e.water -= 10; e.oxygen += 60;
    if (!e.iceLeft && e.melted > 0 && e.oxygen >= 70) e.complete = true;
  }
  if (id === 'plants') {
    if (!e.complete) return fail('Restore the air reserve first.');
    if (!spend(4, 10)) return fail('Need 4 Battery and 10 water.');
    s.power -= 4; e.water -= 10; e.food += 2;
  }
  if (id === 'scan') {
    if (!e.rocks || !spend(5)) return fail('Need 1 Moon rock and 5 Battery.');
    e.rocks--; e.scans++; s.power -= 5; s.science = Math.min(100, s.science + 10);
  }
  if (id === 'assist') {
    if (!e.iceLeft || e.complete) return fail('The ice was already recovered.');
    s.power = Math.max(0, s.power - 10); s.safety = Math.max(1, s.safety - 5);
    e.ice += e.iceLeft; e.iceLeft = 0;
  }
  e.notice = EVA_ACTIONS[id][0];
  return { state: s, message: e.notice, ok: true };
}

export function evaTick(state, seconds, running = false) {
  const e = state.expedition;
  if (!e?.outside || state.ended) return state;
  const s = structuredClone(state), next = s.expedition;
  next.suit = Math.max(0, next.suit - Math.min(1, Math.max(0, seconds)) * (running ? 0.6 : 0.3));
  if (next.suit === 0) {
    next.outside = false;
    s.safety = Math.max(1, s.safety - 5);
    next.notice = 'Crew rescue: back inside. Lost 5 Crew Safety. Refill before another trip.';
  }
  return s;
}
