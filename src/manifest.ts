import type { GameManifest } from "@open-party-lab/game-core";

export const wordTilesManifest = {
  id: "word-tiles",
  displayName: "Word Tiles",
  description: "Lege Woerter auf ein gemeinsames Brett und nutze Premiumfelder geschickt.",
  minPlayers: 2,
  maxPlayers: 4,
  hostView: "WordTilesHostScene",
  controllerView: "word-tiles",
  controllerLayout: "word_tiles_board",
  supportsTeams: false,
  estimatedRoundDurationMs: 1_200_000,
  roundCompletionMode: "wait_for_ready",
  phaseDurations: {
    roundIntroMs: 1_500,
    countdownMs: 1_000,
    lockedMs: 3_000,
    resultMs: 5_000,
    scoreboardMs: 5_000
  },

  ownsScreens: ["round_intro", "result"],
  visual: { accent: "#7f7350", eyebrow: "Words" },
  audio: { track: { profile: "gentle", bpm: 104, rootMidi: 55, masterGain: 0.12 } },
  controllerChrome: { wide: true },
} as const satisfies GameManifest;

export const manifest = wordTilesManifest;
