# Lunar Frontier

A browser game for ages 7–12 built for the NASA Space Apps
[Junior Astronaut Mission Trainer](https://www.spaceappschallenge.org/2026/challenges/junior-astronaut-mission-trainer/)
challenge. You command **Selene**, a spacecraft landed on the Moon with four crew, for
seven days. Each day you walk to a station, make one engineering decision, and see
what it does to the ship.

**Play it:** https://nawafalfardan6-design.github.io/lunar-frontier/
(a simpler 2D version is at `/mission.html`)

## How the mission works

- **Four meters:**
  - ⚡ **Battery**: everything needs power.
  - 💨 **Air & Water**: life support.
  - 🛡️ **Crew Safety**: protection from radiation and accidents.
  - 🔬 **Science**: the research you collect.
- **Daily budget.** The ship uses power every day. Solar panels recharge it while the
  Sun is up. **The Sun sets on Day 6**, and after that the heaters need extra power,
  so you have to plan your battery.
- **No hidden surprises.** Risky choices create a ⚠ warning that says what will
  happen and how to fix it. Mission Control warns about the solar storm in advance.
- **Stars instead of one right answer:**
  - Research reached Earth
  - Fresh harvest
  - Battery reserve for the night
  - Healthy crew

  Keep the crew safe and earn at least two stars for **Mission success**. About half
  of all possible choice paths succeed, so there are many ways to win, but careless
  play doesn't.
- Every day ends with a short science explanation and a link to a NASA source.
  Resource numbers are simplified for play.

## Controls

| Action | Keyboard and mouse | Touch |
| --- | --- | --- |
| Move | WASD or arrow keys (Shift to run) | Joystick |
| Look | Click, then move the mouse (Esc to pause) | Drag |
| Use a terminal | E | Use button |
| Jump (a slow Moon hop) | Space | Jump button |

The game also supports the Meta Quest browser (WebXR).

## Run it locally

```bash
python3 -m http.server 8765 --directory dist
```

Then open http://localhost:8765. There is no build step and nothing to install.
Opening the HTML file directly won't work, because JavaScript modules need a server.

## Working on it

Read **[CONTRIBUTING.md](CONTRIBUTING.md)** first. It covers working from any
laptop, using Codex with your own account, avoiding conflicts, and how the live site
updates. AI coding tools read **[AGENTS.md](AGENTS.md)** for the project rules and
the map of which file owns what.

Check the mission logic with:

```bash
node tests/engine.test.js
```

Every push to `main` runs this test and then publishes `dist/` to GitHub Pages.

Three.js r170 is vendored in `dist/vendor/` (MIT license). The procedural textures
are artistic approximations, not NASA imagery.
