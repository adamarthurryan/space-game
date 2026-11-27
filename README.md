# Space Game

A space exploration game and orbital mechanics simulator that runs in the browser. It is a roguelike: each run is a randomly generated scenario, set in the real solar system or a fictional one. The core of the game is planning orbits and maneuvers on a 3D map of the system.

The project is in early development. The toolchain, the core math library and an empty app shell are in place; the simulation and gameplay are still to come. The design is documented in [`docs/`](docs/) and the development plan in [`planning/`](planning/).

Built with TypeScript, React, Three.js and React Three Fiber. Everything runs client-side.

## Running in dev mode

You need [Node.js](https://nodejs.org/) 24 or later. The version used for development is in [`.nvmrc`](.nvmrc); with nvm, run `nvm use`.

```bash
npm ci        # install dependencies
npm run dev   # start the dev server
```

Then open http://localhost:5173. The page reloads as you edit the source.

## Other scripts

| Command                | What it does                                                    |
| ---------------------- | --------------------------------------------------------------- |
| `npm test`             | Run the unit tests once (`npm run test:watch` to watch)         |
| `npm run lint`         | Lint, including the rules that enforce the code's layering      |
| `npm run format`       | Format the code with Prettier (`format:check` to check only)    |
| `npm run build`        | Type check and build for production into `dist/`                |
| `npm run preview`      | Serve the production build                                      |
| `npm run smoke`        | Check the running app in headless Chrome (needs Google Chrome)  |
