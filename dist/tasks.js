// tasks.js: short hands-on mini-games that match the job the commander picked.
// The choice's `kind` (from engine.js) picks the game:
//   repair → valves, science → power routing, shelter → lock sequence,
//   garden → water tanks, comms → signal tuning, rest → no game at all.
// Every game is randomized, so it is a little different each time, and takes about
// 20 seconds. Touch, mouse and keyboard all use native buttons and sliders.
// For automated tests, each game puts its answer in data-* attributes.

const GAMES = {
  repair: "valves",
  science: "power",
  shelter: "locks",
  garden: "water",
  comms: "signal",
};

// One line per choice that says how the game connects to the job. {n} is the
// randomized target (units of power, or the radio channel).
const LINES = {
  "service-filter": "Fit the fresh filter: turn each valve until its arrow points up.",
  "dust-experiment": "Power the dust experiment: send exactly {n} units to the lab.",
  "tend-greenhouse": "Water the plants: fill each tank to its green band.",
  "stock-shelter": "Stack the water bags: lock the racks in order, 1 to 4.",
  "crater-experiment": "Warm the crater instruments: send exactly {n} units to the heaters.",
  "catch-up": "Fix the filter and the shelter: turn each valve until its arrow points up.",
  "remote-research": "Drive the rover from the shelter: send exactly {n} units to it.",
  "clean-recycler": "Flush out the minerals: turn each valve until its arrow points up.",
  harvest: "Water the plants: fill each tank to its green band.",
  "send-research": "Aim at the big dish on Earth: tune the radio to channel {n}.",
  "final-checks": "Check the air tanks: turn each valve until its arrow points up.",
  "late-downlink": "Reach the small dish on Earth: tune the radio to channel {n}.",
};
const DEFAULT_LINES = {
  valves: "Turn each valve until its arrow points up.",
  power: "Send exactly {n} units of power to the job.",
  locks: "Lock the racks in order, 1 to 4.",
  water: "Fill each tank to its green band.",
  signal: "Tune the radio to channel {n}.",
};

const randomInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
// A slider target from min to max in steps of 5, at least `gap` away from `avoid`.
function sliderTarget(min, max, avoid = [], gap = 15) {
  let target;
  do target = randomInt(min / 5, max / 5) * 5;
  while (avoid.some((other) => Math.abs(other - target) < gap));
  return target;
}

/**
 * Show the mini-game for `choice` (an engine choice object) on mission day `dayNumber`.
 * show(html) opens the dialog, done() applies the choice, cancel() goes back.
 * Jobs of kind "rest" have no game: done() is called straight away.
 */
export function startTask(choice, dayNumber, show, done, cancel) {
  const game = GAMES[choice.kind];
  if (!game) {
    done();
    return;
  }
  const setup = SETUPS[game]();
  const line = (LINES[choice.id] || DEFAULT_LINES[game]).replace("{n}", setup.target);
  show(
    `<section class="repair repair-${game}"><span class="kicker">HANDS ON · DAY ${dayNumber}</span><h2>${choice.label}</h2><p class="task-line">${line}</p><div id="apparatus"></div><p id="task-feedback" role="status" aria-live="polite"></p><button type="button" id="finish-task" disabled>Done! See what happens →</button><button type="button" class="secondary" id="cancel-task">← Pick a different job</button></section>`,
  );
  const area = document.getElementById("apparatus");
  const feedback = document.getElementById("task-feedback");
  const finish = document.getElementById("finish-task");
  let ready = false;
  let submitted = false;
  const update = (ok, text) => {
    ready = ok;
    finish.disabled = !ok;
    feedback.textContent = ok ? `✅ ${text}` : text;
    area.classList.toggle("ready", ok);
  };
  finish.onclick = () => {
    if (ready && !submitted) {
      submitted = true;
      done();
    }
  };
  document.getElementById("cancel-task").onclick = cancel;
  setup.build(area, update);
}

// Each setup picks random numbers, then build(area, update) draws the controls and
// calls update(ready, text) after every move.
const SETUPS = {
  // Three valves, each 1 to 3 quarter turns away from pointing up.
  valves() {
    const turns = shuffle([randomInt(1, 3), randomInt(1, 3), randomInt(2, 3)]);
    return {
      target: "",
      build(area, update) {
        area.innerHTML = turns
          .map(
            (_, i) =>
              `<button type="button" class="valve" aria-label="Turn valve ${i + 1}" data-valve="${i}"><span>↑</span><small>${i + 1}</small></button>`,
          )
          .join("");
        const render = () => {
          area.querySelectorAll("[data-valve]").forEach((button, i) => {
            button.querySelector("span").style.transform = `rotate(${turns[i] * 90}deg)`;
            button.setAttribute("aria-pressed", String(turns[i] === 0));
          });
          const up = turns.filter((n) => n === 0).length;
          update(
            up === turns.length,
            up === turns.length
              ? "All valves point up!"
              : `${up} of ${turns.length} valves point up`,
          );
        };
        area.querySelectorAll("[data-valve]").forEach((button, i) => {
          button.onclick = () => {
            turns[i] = (turns[i] + 1) % 4;
            render();
          };
        });
        render();
      },
    };
  },

  // Four locks in a random order; press them 1, 2, 3, 4.
  locks() {
    const order = shuffle([1, 2, 3, 4]);
    return {
      target: "",
      build(area, update) {
        let step = 0;
        area.innerHTML = order
          .map(
            (n) =>
              `<button type="button" class="lock" data-lock="${n}" aria-label="Lock rack ${n}">${n}<small>OPEN</small></button>`,
          )
          .join("");
        area.querySelectorAll("[data-lock]").forEach((button) => {
          button.onclick = () => {
            if (Number(button.dataset.lock) !== step + 1) {
              update(false, `Not yet! Find number ${step + 1}.`);
              return;
            }
            step++;
            button.disabled = true;
            button.querySelector("small").textContent = "LOCKED";
            update(step === order.length, `${step} of ${order.length} racks locked`);
          };
        });
        update(false, "Start with number 1.");
      },
    };
  },

  // Four breakers with random sizes; switch on some that add up to the target.
  power() {
    const sizes = shuffle([1, 2, 3, 4, 5, 6]).slice(0, 4);
    const used = shuffle(sizes).slice(0, randomInt(2, 3));
    const target = used.reduce((sum, n) => sum + n, 0);
    return {
      target,
      build(area, update) {
        area.dataset.target = target;
        const on = new Set();
        area.innerHTML = sizes
          .map(
            (n, i) =>
              `<button type="button" class="breaker" data-breaker="${i}" data-units="${n}" aria-pressed="false"><span>${n}</span> units</button>`,
          )
          .join("");
        area.querySelectorAll("[data-breaker]").forEach((button) => {
          button.onclick = () => {
            const i = Number(button.dataset.breaker);
            on.has(i) ? on.delete(i) : on.add(i);
            button.setAttribute("aria-pressed", String(on.has(i)));
            const total = [...on].reduce((sum, j) => sum + sizes[j], 0);
            const text =
              total === target
                ? `Exactly ${target} units. Power is flowing!`
                : total > target
                  ? `${total} units is too much! Switch one off.`
                  : `${total} of ${target} units`;
            update(total === target, text);
          };
        });
        update(false, `0 of ${target} units`);
      },
    };
  },

  // Two water tanks with random target bands.
  water() {
    const first = sliderTarget(30, 85, [10]);
    const second = sliderTarget(30, 85, [10, first]);
    return {
      target: "",
      build(area, update) {
        sliders(area, update, [first, second], (i) => `Tank ${i + 1}`, "Both tanks are full!");
      },
    };
  },

  // One radio dial with a random target channel.
  signal() {
    const target = sliderTarget(30, 90, [10]);
    return {
      target,
      build(area, update) {
        sliders(
          area,
          update,
          [target],
          () => "Radio channel",
          "Signal locked! Earth can hear you.",
        );
      },
    };
  },
};

// Sliders that start at 10 and must each sit within ±TOLERANCE of their target.
const TOLERANCE = 4;
function sliders(area, update, targets, name, doneText) {
  area.innerHTML = targets
    .map(
      (n, i) =>
        `<label class="tuner">${name(i)} · aim for <b>${n}</b><output id="reading-${i}">10</output><input type="range" min="0" max="100" value="10" aria-label="${name(i)}, aim for ${n}" data-target="${n}" style="--t:${n / 100};--b:${TOLERANCE / 100}"></label>`,
    )
    .join("");
  const inputs = [...area.querySelectorAll("input")];
  const check = () => {
    const near = inputs.filter(
      (input, i) => Math.abs(Number(input.value) - targets[i]) <= TOLERANCE,
    );
    const ok = near.length === inputs.length;
    update(
      ok,
      ok
        ? doneText
        : inputs.length > 1
          ? `${near.length} of ${inputs.length} in the band`
          : "Slide into the green band",
    );
  };
  inputs.forEach((input, i) => {
    input.oninput = () => {
      document.getElementById(`reading-${i}`).value = input.value;
      check();
    };
  });
  check();
}
