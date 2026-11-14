# Lunar Frontier

Lunar Frontier is a first-person browser survival game aboard Selene, a spacecraft landed on the Moon. Explore six compartments, complete interactive system repairs, and manage power, life support, and crew safety over seven days.

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

## Current source layout

- `dist/ship.js`: ship compartments, equipment and collision layout.
- `dist/tasks.js`: valve, lock, power-routing, fluid and signal interactions.
- `dist/surfaces.js`: locally generated metal-panel and lunar surface textures.
- `dist/flight.css`: current neutral spacecraft interface styling, applied after legacy layout styles.
- `dist/companion.js`: Nora and optional mission guidance.
- `dist/xr.js`: experimental WebXR support; real headset verification remains outstanding.

The ZIP includes all project source, bundled Three.js, its license, and hosting configuration. No build or package installation is required. Extract the ZIP before running the local server; opening the HTML directly as a file will not load JavaScript modules correctly. The main game is `dist/index.html`. Procedural surfaces are artistic approximations, not NASA imagery. Legacy CSS filenames are retained for layout compatibility.
