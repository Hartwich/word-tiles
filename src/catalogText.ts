import type { LocalizedGameTextMap } from "@open-party-lab/game-core";

export const wordTilesText = {
  "de": {
    "displayName": "Word Tiles",
    "description": "Lege Woerter auf ein gemeinsames Brett und nutze Premiumfelder geschickt.",
    "visual": {
      "eyebrow": "Wörter"
    }
  },
  "en": {
    "displayName": "Word Tiles",
    "description": "Place words on a shared board and use premium squares well.",
    "visual": {
      "eyebrow": "Words"
    }
  }
} as const satisfies LocalizedGameTextMap;
