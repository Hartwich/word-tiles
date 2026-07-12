import type { WordTilesBonusType, WordTilesRackTileState } from "../protocol.js";

export const wordTilesBoardSize = 15;
export const wordTilesRackSize = 7;
export const wordTilesBingoBonus = 50;

export type WordTilesLanguage = "de" | "en";

const letterValuesDe: Record<string, number> = {
  A: 1,
  B: 3,
  C: 4,
  D: 1,
  E: 1,
  F: 4,
  G: 2,
  H: 2,
  I: 1,
  J: 6,
  K: 4,
  L: 2,
  M: 3,
  N: 1,
  O: 2,
  P: 4,
  Q: 10,
  R: 1,
  S: 1,
  T: 1,
  U: 1,
  V: 6,
  W: 3,
  X: 8,
  Y: 10,
  Z: 3,
  Ä: 6,
  Ö: 8,
  Ü: 6,
  "?": 0
};

const letterValuesEn: Record<string, number> = {
  A: 1,
  B: 3,
  C: 3,
  D: 2,
  E: 1,
  F: 4,
  G: 2,
  H: 4,
  I: 1,
  J: 8,
  K: 5,
  L: 1,
  M: 3,
  N: 1,
  O: 1,
  P: 3,
  Q: 10,
  R: 1,
  S: 1,
  T: 1,
  U: 1,
  V: 4,
  W: 4,
  X: 8,
  Y: 4,
  Z: 10,
  "?": 0
};

const tileDistributionDe: Array<{ letter: string; count: number }> = [
  { letter: "E", count: 15 },
  { letter: "N", count: 9 },
  { letter: "S", count: 7 },
  { letter: "I", count: 6 },
  { letter: "R", count: 6 },
  { letter: "T", count: 6 },
  { letter: "U", count: 6 },
  { letter: "A", count: 5 },
  { letter: "D", count: 4 },
  { letter: "H", count: 4 },
  { letter: "M", count: 4 },
  { letter: "G", count: 3 },
  { letter: "L", count: 3 },
  { letter: "O", count: 3 },
  { letter: "B", count: 2 },
  { letter: "C", count: 2 },
  { letter: "F", count: 2 },
  { letter: "K", count: 2 },
  { letter: "P", count: 1 },
  { letter: "W", count: 1 },
  { letter: "Z", count: 1 },
  { letter: "Ä", count: 1 },
  { letter: "J", count: 1 },
  { letter: "Ü", count: 1 },
  { letter: "V", count: 1 },
  { letter: "Ö", count: 1 },
  { letter: "X", count: 1 },
  { letter: "Q", count: 1 },
  { letter: "Y", count: 1 },
  { letter: "?", count: 2 }
];

const tileDistributionEn: Array<{ letter: string; count: number }> = [
  { letter: "E", count: 12 },
  { letter: "A", count: 9 },
  { letter: "I", count: 9 },
  { letter: "O", count: 8 },
  { letter: "N", count: 6 },
  { letter: "R", count: 6 },
  { letter: "T", count: 6 },
  { letter: "L", count: 4 },
  { letter: "S", count: 4 },
  { letter: "U", count: 4 },
  { letter: "D", count: 4 },
  { letter: "G", count: 3 },
  { letter: "B", count: 2 },
  { letter: "C", count: 2 },
  { letter: "M", count: 2 },
  { letter: "P", count: 2 },
  { letter: "F", count: 2 },
  { letter: "H", count: 2 },
  { letter: "V", count: 2 },
  { letter: "W", count: 2 },
  { letter: "Y", count: 2 },
  { letter: "K", count: 1 },
  { letter: "J", count: 1 },
  { letter: "X", count: 1 },
  { letter: "Q", count: 1 },
  { letter: "Z", count: 1 },
  { letter: "?", count: 2 }
];

function resolveLanguage(language?: string): WordTilesLanguage {
  return language === "en" ? "en" : "de";
}

export function wordTilesLetterValuesFor(language?: string): Record<string, number> {
  return resolveLanguage(language) === "en" ? letterValuesEn : letterValuesDe;
}

export function wordTilesBlankLettersFor(language?: string): string[] {
  const base = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return (resolveLanguage(language) === "en" ? base : `${base}ÄÖÜ`).split("");
}

// Rueckwaertskompatibler Alias (deutsche Werte).
export const wordTilesLetterValues = letterValuesDe;

export function createWordTilesBag(language?: string): WordTilesRackTileState[] {
  const distribution = resolveLanguage(language) === "en" ? tileDistributionEn : tileDistributionDe;
  const values = wordTilesLetterValuesFor(language);
  const tiles: WordTilesRackTileState[] = [];
  let cursor = 1;

  for (const entry of distribution) {
    for (let index = 0; index < entry.count; index += 1) {
      tiles.push({
        id: `tile-${cursor}`,
        letter: entry.letter,
        score: values[entry.letter] ?? 0,
        isBlank: entry.letter === "?"
      });
      cursor += 1;
    }
  }

  return tiles;
}

export function resolveWordTilesBonus(x: number, y: number): WordTilesBonusType {
  const tripleWord = new Set([
    "0:0",
    "7:0",
    "14:0",
    "0:7",
    "14:7",
    "0:14",
    "7:14",
    "14:14"
  ]);
  const doubleWord = new Set([
    "1:1",
    "2:2",
    "3:3",
    "4:4",
    "10:10",
    "11:11",
    "12:12",
    "13:13",
    "13:1",
    "12:2",
    "11:3",
    "10:4",
    "4:10",
    "3:11",
    "2:12",
    "1:13"
  ]);
  const tripleLetter = new Set([
    "5:1",
    "9:1",
    "1:5",
    "5:5",
    "9:5",
    "13:5",
    "1:9",
    "5:9",
    "9:9",
    "13:9",
    "5:13",
    "9:13"
  ]);
  const doubleLetter = new Set([
    "3:0",
    "11:0",
    "6:2",
    "8:2",
    "0:3",
    "7:3",
    "14:3",
    "2:6",
    "6:6",
    "8:6",
    "12:6",
    "3:7",
    "11:7",
    "2:8",
    "6:8",
    "8:8",
    "12:8",
    "0:11",
    "7:11",
    "14:11",
    "6:12",
    "8:12",
    "3:14",
    "11:14"
  ]);
  const key = `${x}:${y}`;

  if (x === 7 && y === 7) {
    return "center";
  }

  if (tripleWord.has(key)) {
    return "triple_word";
  }

  if (doubleWord.has(key)) {
    return "double_word";
  }

  if (tripleLetter.has(key)) {
    return "triple_letter";
  }

  if (doubleLetter.has(key)) {
    return "double_letter";
  }

  return "normal";
}
