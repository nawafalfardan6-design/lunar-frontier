// Curated fields transcribed from the versioned NASA CCMC DONKI record.
// Archived evidence, not a live forecast or a lunar radiation-dose model.
export const SOLAR_EVENT = Object.freeze({
  id: "2024-05-10T06:27:00-FLR-001",
  catalog: "M2M_CATALOG",
  version: 2,
  classType: "X3.9",
  beginTime: "2024-05-10T06:27:00Z",
  peakTime: "2024-05-10T06:54:00Z",
  endTime: "2024-05-10T07:06:00Z",
  instrument: "GOES-P: EXIS 1.0-8.0",
  source: "https://ccmc.gsfc.nasa.gov/DONKI/events/30666/2/",
  retrieved: "2026-11-15",
});

export function stormEvidence(dayIndex) {
  if (dayIndex !== 3) return "";
  return `<aside class="why"><p><strong>Real Sun, practice mission.</strong> NASA's DONKI archive records an ${SOLAR_EVENT.classType} solar flare on ${SOLAR_EVENT.peakTime.slice(0, 10)}, peaking at 06:54 UTC. X-class means a strong burst of X-rays.</p><p>This record inspires today's shelter exercise. The Day 4 arrival and safety points are game rules, not measured radiation at the Moon. This is archived data, not a live alert.</p><p><a href="${SOLAR_EVENT.source}" target="_blank" rel="noopener">NASA DONKI record · ${SOLAR_EVENT.id} ↗</a></p></aside>`;
}

export const ONE_WAY_SECONDS = 1.3;
export const RADIO_SOURCE = "https://nightsky.jpl.nasa.gov/documents/344/0SolSysManual.pdf";

// Both renderers use the same demonstration. No score or save changes until
// acknowledgment; detached dialogs cancel their timer without applying a choice.
export function acknowledgeEarth(show, done) {
  show(`<section class="lf-panel"><h2 tabindex="-1">Waiting for Earth</h2><p>Radio takes about ${ONE_WAY_SECONDS} seconds each way. Our practice acknowledgment takes about ${2 * ONE_WAY_SECONDS} seconds. Real replies also need processing time; sending a whole research file takes longer.</p><p id="radio-status" role="status">Message travelling to Earth…</p><p><a href="${RADIO_SOURCE}" target="_blank" rel="noopener">NASA: communication travel times ↗</a></p><button id="radio-ack" disabled>Waiting for acknowledgment…</button></section>`);
  const button = document.getElementById("radio-ack");
  const status = document.getElementById("radio-status");
  const started = performance.now();
  document.querySelector("#radio-status")?.closest("section").querySelector("h2")?.focus();
  let submitted = false;
  const timer = setInterval(() => {
    if (!button.isConnected) { clearInterval(timer); return; }
    const elapsed = (performance.now() - started) / 1000;
    if (elapsed >= 2 * ONE_WAY_SECONDS) {
      clearInterval(timer);
      status.textContent = "Acknowledgment received from Earth.";
      button.textContent = "Earth replied — see the result →";
      button.disabled = false;
    } else if (elapsed >= ONE_WAY_SECONDS) {
      status.textContent = "Earth received the message. Reply travelling back…";
    }
  }, 100);
  button.onclick = () => {
    if (button.disabled || submitted) return;
    submitted = true;
    done();
  };
}
