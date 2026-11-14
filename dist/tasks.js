// Short, untimed repairs: touch, mouse and keyboard all use native controls.
export function startTask(day, choice, title, show, done, cancel) {
  const kinds = [
    ["valves", "signal"],
    ["sequence", "water"],
    ["power", "power"],
    ["sequence", "power"],
    ["water", "valves"],
    ["signal", "water"],
    ["sequence", "signal"],
  ];
  const kind = kinds[day][choice];
  const instructions = {
    valves: "Turn all three valves upright to restore airflow.",
    sequence: "Secure the locks in the numbered order.",
    power: "Route exactly 6 units to the selected operation.",
    water: "Balance both levels inside the marked bands.",
    signal: "Match the receiver to the target frequency.",
  };
  show(
    `<section class="repair repair-${kind}"><span class="kicker">HANDS ON / ${day + 1}</span><h2>${title}</h2><p>${instructions[kind]}</p><div id="apparatus"></div><p id="task-feedback" role="status" aria-live="polite">System awaiting input</p><button id="finish-task" disabled>Apply & continue</button><button class="secondary" id="cancel-task">Leave terminal</button></section>`,
  );
  const area = document.getElementById("apparatus"),
    feedback = document.getElementById("task-feedback"),
    finish = document.getElementById("finish-task");
  let ready = false,
    submitted = false;
  const update = (ok, text) => {
    ready = ok;
    finish.disabled = !ok;
    feedback.textContent = text;
    area.classList.toggle("ready", ok);
  };
  finish.onclick = () => {
    if (ready && !submitted) {
      submitted = true;
      done();
    }
  };
  document.getElementById("cancel-task").onclick = cancel;
  if (kind === "valves") {
    const turns = [1, 3, 2];
    area.innerHTML = turns
      .map(
        (n, i) =>
          `<button class="valve" aria-label="Turn valve ${i + 1}" data-valve="${i}"><span>↟</span><small>0${i + 1}</small></button>`,
      )
      .join("");
    const render = () => {
      area.querySelectorAll("[data-valve]").forEach((b, i) => {
        b.querySelector("span").style.transform = `rotate(${turns[i] * 90}deg)`;
        b.setAttribute("aria-pressed", String(turns[i] === 0));
      });
      update(
        turns.every((n) => n === 0),
        `${turns.filter((n) => n === 0).length} / 3 valves aligned`,
      );
    };
    area.querySelectorAll("[data-valve]").forEach(
      (b, i) =>
        (b.onclick = () => {
          turns[i] = (turns[i] + 1) % 4;
          render();
        }),
    );
    render();
  } else if (kind === "sequence") {
    let step = 0;
    const order = [3, 1, 4, 2];
    area.innerHTML = order
      .map(
        (n) =>
          `<button class="lock" data-lock="${n}" aria-label="Secure lock ${n}">${n}<small>OPEN</small></button>`,
      )
      .join("");
    area.querySelectorAll("[data-lock]").forEach(
      (b) =>
        (b.onclick = () => {
          if (Number(b.dataset.lock) !== step + 1) {
            update(false, "Start at 1, then follow the numbers.");
            return;
          }
          step++;
          b.disabled = true;
          b.querySelector("small").textContent = "SEALED";
          update(step === 4, `${step} / 4 locks secured`);
        }),
    );
  } else if (kind === "power") {
    const weights = [1, 2, 3, 4],
      on = new Set();
    area.innerHTML = weights
      .map(
        (n) =>
          `<button class="breaker" data-units="${n}" aria-pressed="false"><span>${n}</span> units</button>`,
      )
      .join("");
    area.querySelectorAll("[data-units]").forEach(
      (b) =>
        (b.onclick = () => {
          const n = Number(b.dataset.units);
          on.has(n) ? on.delete(n) : on.add(n);
          b.setAttribute("aria-pressed", String(on.has(n)));
          const total = [...on].reduce((a, b) => a + b, 0);
          update(
            total === 6,
            `${total} / 6 units routed${total > 6 ? " — overload, disconnect a circuit" : ""}`,
          );
        }),
    );
  } else {
    const targets = kind === "signal" ? [72] : [40, 65];
    area.innerHTML = targets
      .map(
        (n, i) =>
          `<label class="tuner">${kind === "signal" ? "Receiver" : "Tank " + (i + 1)} · target ${n}<output id="reading-${i}">10</output><input aria-label="${kind === "signal" ? "Receiver frequency" : "Tank " + (i + 1) + " level"}" type="range" min="0" max="100" value="10" data-tuner="${i}" style="--target:${n}%"></label>`,
      )
      .join("");
    const inputs = [...area.querySelectorAll("input")];
    inputs.forEach(
      (input, i) =>
        (input.oninput = () => {
          document.getElementById(`reading-${i}`).value = input.value;
          const ok = inputs.every((v, j) => Math.abs(Number(v.value) - targets[j]) <= 3);
          update(ok, ok ? "Stable — ready to apply" : "Adjust into the target band (±3)");
        }),
    );
  }
}
