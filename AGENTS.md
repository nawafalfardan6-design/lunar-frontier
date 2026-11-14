# Instructions for AI coding agents (Codex, Claude, Copilot…)

Lunar Frontier is a browser game for kids aged 7–12, built for the NASA Space Apps
"Junior Astronaut Mission Trainer" challenge. The player commands a landed lunar
spacecraft for seven days and makes simplified **engineering decisions** about
power, air & water, crew safety and science. Keep that goal in mind: every feature
should help a child understand a real trade-off, not just look cool.

## Project facts
- No build step and no npm dependencies. Everything that ships is in `dist/`.
- Three.js r170 is vendored at `dist/vendor/three.module.js`. Do not swap it for a CDN.
- `dist/engine.js` is a classic script that exposes globals (`days`, `initial`,
  `decide`, `forecast`, `report`, `outcome`, `dailyBudget`, `RESOURCES`, `STATIONS`).
  All other `dist/*.js` files are ES modules.
- Run locally: `python3 -m http.server 8765 --directory dist`, then open
  http://localhost:8765 (opening the HTML file directly will not work).

## Where things live
| Area | Files |
| --- | --- |
| Mission days, choices, consequences, scoring | `dist/engine.js`, `tests/engine.test.js` |
| Movement, mouse/touch look, jumping, collision | `dist/controls.js`, touch joystick in `dist/presentation.js` |
| Dialogs, HUD, menus, settings | `dist/hud.js`, `dist/index.html`, `dist/*.css` |
| Renderer, lighting, materials, gloves, beacon | `dist/scene.js`, `dist/surfaces.js` |
| Moon terrain, rocks, sky, Earth, title-screen Moon | `dist/landscape.js` |
| Spacecraft layout and stations | `dist/ship.js` |
| Hands-on mini-games | `dist/tasks.js` |
| Nora's hints | `dist/companion.js` |
| Game loop and wiring | `dist/world.js` |
| Simple 2D version | `dist/mission.html`, `dist/app.js`, `dist/mission.css` |
| VR (Quest browser) | `dist/xr.js` |

## Rules
1. Change only what the prompt asks for. Keep each change small and focused on one area.
2. Never minify or squash code onto one line. Use readable formatting and short comments.
   The repo's `.prettierrc.json` (100 columns) is the formatting standard. Don't reformat
   files you aren't otherwise changing, because that causes merge conflicts for teammates.
3. Never put the whole game back into one file. Put new code in the file that owns that area.
4. If you change `dist/engine.js`, run `node tests/engine.test.js` and make it pass.
   Update the test only when the design itself changed on purpose, and say so.
5. Before finishing, run `node --input-type=module --check < file.js` on every JS file you touched.
6. Text the player sees must be short sentences a 9-year-old can read. Science facts
   must be accurate and should link to a nasa.gov source.
7. Effects shown to the player before a choice must match what actually happens.
   No hidden penalties: warn about every risk before it causes damage.
8. Keep the game working on keyboard + mouse, touch screens and the Quest browser.
9. Commit with a clear message describing what changed. Do not invent an author
   identity. Use the git identity that is already configured.
