# Word Tiles

Shared word-board tile game for Open Party Lab with phone rack controls and premium fields.

![In-game screenshot](docs/screenshots/host.png)

## Status

Alpha. The board and rack loop is playable. Needs dictionary/rules review, scoring polish, and UX passes for small phones.

## Run Through Open Party Lab

This repo is not a standalone app. Run it through the Open Party Lab platform.

Recommended layout:

```text
Open-Party-Lab/
  local-games/
    word-tiles/
```

From the Platform repo:

```bash
npm install
npm run games:sync-local
npm run dev:all
```

The Platform loads this game only when the repo exists locally and `npm run games:sync-local` links it. Missing optional games are skipped.

## GitHub Metadata

Description:

```text
Shared word-board tile game for Open Party Lab with phone rack controls and premium fields.
```

Suggested topics:

```text
open-party-lab party-game browser-game phaser typescript local-multiplayer word-game
```

## Package Entrypoints

- `@open-party-lab/game-word-tiles/manifest`
- `@open-party-lab/game-word-tiles/protocol`
- `@open-party-lab/game-word-tiles/server`
- `@open-party-lab/game-word-tiles/host`
- `@open-party-lab/game-word-tiles/controller`

The Platform should import only these public entrypoints.

## Development Checks

```bash
npm install
npm run typecheck
npm run build
npm run pack:dry-run
```

For visual checks, start Open Party Lab, add virtual controllers when needed, and capture host screenshots through a browser.

## License

Code is licensed under the Apache License 2.0. See [LICENSE](LICENSE).

Assets, generated media, word lists, prompts, and third-party references may need separate rights review before public store distribution.
