const assert = require('node:assert/strict');
const engine = require('../dist/engine.js');

(async () => {
  const { SOLAR_EVENT, stormEvidence, acknowledgeEarth } = await import('../dist/mission-evidence.js');
  assert.equal(SOLAR_EVENT.id, '2024-05-10T06:27:00-FLR-001');
  assert.equal(SOLAR_EVENT.classType, 'X3.9');
  assert.equal(Date.parse(SOLAR_EVENT.peakTime) - Date.parse(SOLAR_EVENT.beginTime), 27 * 60000);
  assert.equal(stormEvidence(2), '');
  assert.match(stormEvidence(3), /archived data, not a live alert/);
  assert.equal(engine.RESERVE_GOAL, engine.HIBERNATION.days * engine.HIBERNATION.dailyLoad + engine.HIBERNATION.margin);

  // Exercise the real acknowledgment handler with a controlled clock and tiny DOM.
  let now = 0, tick, cleared = 0, applied = 0;
  const button = { disabled: true, isConnected: true };
  const status = {};
  const original = { document: global.document, performance: global.performance, setInterval, clearInterval };
  try {
    global.document = { getElementById: id => id === 'radio-ack' ? button : status, querySelector: () => null };
    global.performance = { now: () => now };
    global.setInterval = callback => { tick = callback; return 1; };
    global.clearInterval = () => { cleared++; };
    acknowledgeEarth(() => {}, () => { applied++; });
    button.onclick();
    assert.equal(applied, 0);
    now = 1300; tick();
    assert.match(status.textContent, /Reply travelling back/);
    assert.equal(button.disabled, true);
    now = 2599; tick();
    assert.equal(button.disabled, true);
    now = 2600; tick();
    assert.equal(button.disabled, false);
    button.onclick(); button.onclick();
    assert.equal(applied, 1);
    acknowledgeEarth(() => {}, () => { applied++; });
    button.isConnected = false; tick();
    assert.equal(applied, 1);
    assert.equal(cleared, 2);
  } finally { Object.assign(global, original); }
  console.log('Archive, hibernation and acknowledgment timing checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
