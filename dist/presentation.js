// presentation.js: the touch-screen movement joystick, an analog {x, y} push read by
// controls.js. (Each day's briefing now lives in engine.js: days[i].speaker/.briefing.)

// Touch joystick. Writes an analog push into input: x is -1 (left) .. 1 (right),
// y is -1 (forward) .. 1 (back), and both are 0 when released. controls.js reads it.
const STICK_REACH = 40; // px from the centre for a full push
const KNOB_TRAVEL = 35; // px the knob can move from the centre

export function enableTouchStick(input) {
  const pad = document.querySelector("#touch > div");
  pad.innerHTML =
    '<div id="joystick" role="group" aria-label="Movement joystick"><span id="stick"></span><small>MOVE</small></div>';
  const joystick = document.getElementById("joystick");
  const stick = document.getElementById("stick");
  function reset() {
    input.x = input.y = 0;
    stick.style.transform = "translate(0,0)";
  }
  function move(event) {
    const rect = joystick.getBoundingClientRect();
    let x = (event.clientX - rect.left - rect.width / 2) / STICK_REACH;
    let y = (event.clientY - rect.top - rect.height / 2) / STICK_REACH;
    const length = Math.max(1, Math.hypot(x, y));
    input.x = x /= length;
    input.y = y /= length;
    stick.style.transform = `translate(${x * KNOB_TRAVEL}px,${y * KNOB_TRAVEL}px)`;
  }
  joystick.onpointerdown = (event) => {
    event.preventDefault();
    joystick.setPointerCapture(event.pointerId);
    move(event);
  };
  joystick.onpointermove = (event) => {
    if (joystick.hasPointerCapture(event.pointerId)) move(event);
  };
  joystick.onpointerup = reset;
  joystick.onpointercancel = reset;
  joystick.onlostpointercapture = reset;
}
