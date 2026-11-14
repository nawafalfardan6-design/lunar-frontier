# Lunar Frontier

Lunar Frontier is a browser game for ages 7–12 about running a lunar outpost. Explore in first person, walk up to mission terminals, and make decisions about power, life support, and crew safety over a seven-day expedition.

## Run locally

From the repository folder, run `python -m http.server 8765 --directory dist`, then open [http://localhost:8765](http://localhost:8765). The game uses WebGL 2. A simpler dashboard is available at `/mission.html`.

Use **WASD** or arrow keys to walk, drag to look, **E** to use a nearby terminal, **Space** to jump, and **Esc** to pause. Touch screens provide on-screen controls.

## Work on the game

Edit the files in `dist/` directly. The project has no build step.

- `dist/index.html`, `dist/world.css`, and `dist/indie.css` define the main interface and layout.
- `dist/world.js` handles the 3D scene, movement, settings, and mission interface.
- `dist/engine.js` defines the seven mission days, choices, and consequences.
- `dist/vendor/` contains Three.js and its license.

Create a branch from `main`, test your changes locally, and open a pull request describing what changed and how you tested it. Coordinate changes to `world.js` or `engine.js` when multiple people are editing them.

The in-game science cards link to NASA sources. Game resource values and scenario events are simplified for play. This project was built for the [NASA Space Apps Junior Astronaut Mission Trainer challenge](https://www.spaceappschallenge.org/2026/challenges/junior-astronaut-mission-trainer/).
