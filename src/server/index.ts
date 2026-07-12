import {
  createBaseRoundState,
  roundPhaseDurations,
  transitionRoundState,
  type BaseRoundState,
  type ScoreEntry,
  type ServerGame,
  type ServerGameContext,
  type SupportedLanguage
} from "@open-party-lab/game-core";
import type {
  WordTilesActiveTurnState,
  WordTilesBoardCellState,
  WordTilesControllerState,
  WordTilesInput,
  WordTilesMoveSummaryState,
  WordTilesPendingMoveState,
  WordTilesPlacedTileState,
  WordTilesPlacementState,
  WordTilesPlayerPublicState,
  WordTilesPublicState,
  WordTilesRackTileState,
  WordTilesWordScoreState
} from "../protocol.js";
import { wordTilesManifest } from "../manifest.js";
import {
  createWordTilesBag,
  resolveWordTilesBonus,
  wordTilesBingoBonus,
  wordTilesBlankLettersFor,
  wordTilesBoardSize,
  wordTilesLetterValuesFor,
  wordTilesRackSize
} from "./wordTilesTiles.js";

// Frist, nach der ein getrennter Spieler automatisch uebersprungen wird
// (nur bei Disconnect - verbundene Spieler haben unbegrenzt Zeit).
const wordTilesDisconnectGraceMs = 60_000;

// Fisher-Yates-Shuffle.
function shuffle<T>(items: T[]): T[] {
  const nextItems = [...items];

  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [nextItems[index], nextItems[swapIndex]] = [nextItems[swapIndex], nextItems[index]];
  }

  return nextItems;
}

interface WordTilesRuntimePlayer {
  playerId: string;
  name: string;
  color: string;
  score: number;
  rack: WordTilesRackTileState[];
  connected: boolean;
}

interface WordTilesRuntimeState extends BaseRoundState {
  board: Array<Array<WordTilesPlacedTileState | null>>;
  players: Record<string, WordTilesRuntimePlayer>;
  playerOrder: string[];
  activePlayerIndex: number;
  bag: WordTilesRackTileState[];
  moveNumber: number;
  consecutivePasses: number;
  recentCellKeys: string[];
  gameOver: boolean;
  winnerPlayerId?: string;
  winnerName?: string;
  lastMove?: WordTilesMoveSummaryState;
  pendingMove?: WordTilesPendingMoveRuntimeState;
  activeTurn?: WordTilesActiveTurnRuntimeState;
  lastError?: string;
  lastErrorPlayerId?: string;
  disconnectedAtByPlayerId: Record<string, number>;
}

interface PreparedPlacement {
  x: number;
  y: number;
  rackTile: WordTilesRackTileState;
  tile: WordTilesPlacedTileState;
}

interface CollectedWord {
  word: string;
  cells: Array<{ x: number; y: number }>;
  includesNewTile: boolean;
}

interface MoveEvaluation {
  placements: PreparedPlacement[];
  words: WordTilesWordScoreState[];
  score: number;
}

interface WordTilesPendingMoveRuntimeState extends WordTilesPendingMoveState {
  preparedPlacements: PreparedPlacement[];
}

interface WordTilesActiveTurnRuntimeState extends WordTilesActiveTurnState {}

function normalizeWordTilesLetter(letter: string): string {
  return Array.from(letter.trim().toLocaleUpperCase("de-DE"))[0] ?? "";
}

const wordTilesText = {
  de: {
    intro: "Word Tiles: Lege Woerter auf dem gemeinsamen Brett.",
    start: (name: string) => `${name} beginnt. Erstes Wort muss ueber den Stern in der Mitte.`,
    notYourTurn: "Du bist gerade nicht am Zug.",
    pendingMoveActive: "Entscheidet zuerst den offenen Word-Tiles-Zug.",
    finishTurnFirst: "Schliesse deinen laufenden Zug erst mit Fertig ab.",
    noPendingMove: "Es liegt kein offener Zug vor.",
    stalePendingMove: "Dieser offene Zug ist nicht mehr aktuell.",
    cannotChallengeOwn: "Du kannst deinen eigenen Zug nicht anzweifeln.",
    cannotAcceptOwn: "Du musst deinen eigenen Zug nicht akzeptieren.",
    alreadyAccepted: "Du hast diesen Zug schon akzeptiert.",
    alreadyChallenged: "Dieser Zug wurde bereits angezweifelt.",
    notPendingPlayer: "Nur die legende Person kann diesen Zug entscheiden.",
    notChallenged: "Zuruecknehmen ist erst nach einer Anzweiflung moeglich.",
    noActiveTurn: "Lege zuerst ein akzeptiertes Wort oder passe.",
    noTiles: "Lege mindestens einen Stein.",
    badLine: "Neue Steine muessen in einer geraden Zeile oder Spalte liegen.",
    badGap: "Zwischen neuen Steinen darf kein leeres Feld entstehen.",
    occupied: "Dieses Feld ist schon belegt.",
    unknownTile: "Dieser Stein liegt nicht in deinem Rack.",
    duplicateTile: "Ein Stein wurde doppelt verwendet.",
    duplicateCell: "Zwei Steine liegen auf demselben Feld.",
    badBlank: "Waehle fuer den Joker einen gueltigen Buchstaben.",
    badLetter: "Der Buchstabe passt nicht zum Stein.",
    firstCenter: "Das erste Wort muss den Stern in der Mitte beruehren.",
    firstTooShort: "Das erste Wort braucht mindestens zwei Buchstaben.",
    mustConnect: "Dein Zug muss an mindestens einen vorhandenen Stein anschliessen.",
    noWord: "Aus diesen Steinen entsteht kein neues Wort.",
    pendingMove: (name: string, score: number, words: string[]) =>
      `${name} legt ${words.join(", ")} fuer ${score} Punkte. Andere koennen akzeptieren oder anzweifeln.`,
    acceptedWaiting: (name: string, accepted: number, required: number) =>
      `${name} akzeptiert. Warte auf ${accepted}/${required} Akzeptanzen.`,
    acceptedMove: (name: string, score: number) =>
      `Alle akzeptieren. ${name} kann weiterlegen oder mit Fertig ${score} Punkte abschliessen.`,
    challenged: (challengerName: string, playerName: string) =>
      `${challengerName} zweifelt ${playerName}s Wort an. Prueft extern und entscheidet.`,
    played: (name: string, score: number, words: string[]) =>
      `${name} legt ${words.join(", ")} fuer ${score} Punkte.`,
    finished: (name: string, score: number, words: string[]) =>
      `${name} beendet den Zug mit ${words.join(", ")} fuer ${score} Punkte.`,
    recalled: (name: string) => `${name} nimmt den Zug zurueck.`,
    bingo: "Bingo! Alle sieben Steine gelegt.",
    pass: (name: string) => `${name} passt.`,
    exchange: (name: string, count: number) => `${name} tauscht ${count} Stein${count === 1 ? "" : "e"}.`,
    exchangeEmpty: "Waehle mindestens einen Stein zum Tauschen.",
    exchangeBag: "Im Beutel sind nicht genug Steine zum Tauschen.",
    gameOver: (name: string) => `${name} gewinnt Word Tiles.`,
    draw: "Word Tiles endet unentschieden.",
    acceptNotRequired: "Deine Akzeptanz ist fuer diesen Zug nicht noetig.",
    disconnectTimeout: (name: string) => `${name} ist zu lange getrennt.`,
    turnSkipped: (name: string) => `${name}s Zug wird uebersprungen.`
  },
  en: {
    intro: "Word Tiles: Place words on the shared board.",
    start: (name: string) => `${name} starts. The first word must cross the center star.`,
    notYourTurn: "It is not your turn.",
    pendingMoveActive: "Resolve the open Word Tiles move first.",
    finishTurnFirst: "Finish your active turn first.",
    noPendingMove: "There is no open move.",
    stalePendingMove: "That open move is no longer current.",
    cannotChallengeOwn: "You cannot challenge your own move.",
    cannotAcceptOwn: "You do not need to accept your own move.",
    alreadyAccepted: "You already accepted this move.",
    alreadyChallenged: "This move has already been challenged.",
    notPendingPlayer: "Only the player who placed the move can resolve it.",
    notChallenged: "A move can only be recalled after it has been challenged.",
    noActiveTurn: "Place an accepted word first or pass.",
    noTiles: "Place at least one tile.",
    badLine: "New tiles must share one row or column.",
    badGap: "There cannot be an empty gap between new tiles.",
    occupied: "That square is already occupied.",
    unknownTile: "That tile is not in your rack.",
    duplicateTile: "A tile was used twice.",
    duplicateCell: "Two tiles are on the same square.",
    badBlank: "Choose a valid letter for the blank tile.",
    badLetter: "The letter does not match the tile.",
    firstCenter: "The first word must touch the center star.",
    firstTooShort: "The first word needs at least two letters.",
    mustConnect: "Your move must connect to at least one existing tile.",
    noWord: "These tiles do not create a new word.",
    pendingMove: (name: string, score: number, words: string[]) =>
      `${name} places ${words.join(", ")} for ${score} points. Other players may accept or challenge.`,
    acceptedWaiting: (name: string, accepted: number, required: number) =>
      `${name} accepts. Waiting for ${accepted}/${required} acceptances.`,
    acceptedMove: (name: string, score: number) =>
      `Everyone accepts. ${name} can continue placing or finish ${score} points.`,
    challenged: (challengerName: string, playerName: string) =>
      `${challengerName} challenges ${playerName}'s word. Check it externally and decide.`,
    played: (name: string, score: number, words: string[]) =>
      `${name} scores ${score} with ${words.join(", ")}.`,
    finished: (name: string, score: number, words: string[]) =>
      `${name} finishes the turn with ${words.join(", ")} for ${score} points.`,
    recalled: (name: string) => `${name} recalls the move.`,
    bingo: "Bingo! All seven tiles played.",
    pass: (name: string) => `${name} passes.`,
    exchange: (name: string, count: number) => `${name} exchanges ${count} tile${count === 1 ? "" : "s"}.`,
    exchangeEmpty: "Choose at least one tile to exchange.",
    exchangeBag: "There are not enough tiles left in the bag.",
    gameOver: (name: string) => `${name} wins Word Tiles.`,
    draw: "Word Tiles ends in a draw.",
    acceptNotRequired: "Your acceptance is not required for this move.",
    disconnectTimeout: (name: string) => `${name} has been disconnected for too long.`,
    turnSkipped: (name: string) => `${name}'s turn is skipped.`
  }
} satisfies Record<SupportedLanguage, Record<string, unknown>>;

function textFor(language: SupportedLanguage) {
  return wordTilesText[language] ?? wordTilesText.de;
}

function cellKey(x: number, y: number): string {
  return `${x}:${y}`;
}

function createEmptyBoard(): Array<Array<WordTilesPlacedTileState | null>> {
  return Array.from({ length: wordTilesBoardSize }, () =>
    Array.from({ length: wordTilesBoardSize }, () => null)
  );
}

function cloneBoard(
  board: Array<Array<WordTilesPlacedTileState | null>>
): Array<Array<WordTilesPlacedTileState | null>> {
  return board.map((row) => [...row]);
}

function getBoardTile(
  board: Array<Array<WordTilesPlacedTileState | null>>,
  x: number,
  y: number
): WordTilesPlacedTileState | null {
  if (x < 0 || y < 0 || x >= wordTilesBoardSize || y >= wordTilesBoardSize) {
    return null;
  }

  return board[y]?.[x] ?? null;
}

function hasAnyBoardTile(board: Array<Array<WordTilesPlacedTileState | null>>): boolean {
  return board.some((row) => row.some(Boolean));
}

function drawRack(
  rack: WordTilesRackTileState[],
  bag: WordTilesRackTileState[]
): { rack: WordTilesRackTileState[]; bag: WordTilesRackTileState[] } {
  const nextRack = [...rack];
  const nextBag = [...bag];

  while (nextRack.length < wordTilesRackSize && nextBag.length > 0) {
    const tile = nextBag.shift();

    if (tile) {
      nextRack.push(tile);
    }
  }

  return { rack: nextRack, bag: nextBag };
}

function createRuntimePlayers(context: ServerGameContext, bag: WordTilesRackTileState[]): {
  players: Record<string, WordTilesRuntimePlayer>;
  playerOrder: string[];
  bag: WordTilesRackTileState[];
} {
  const players: Record<string, WordTilesRuntimePlayer> = {};
  const playerOrder = context.players.map((player) => player.id);
  let nextBag = [...bag];

  for (const player of context.players) {
    const drawn = drawRack([], nextBag);
    nextBag = drawn.bag;
    players[player.id] = {
      playerId: player.id,
      name: player.name,
      color: player.color,
      score: 0,
      rack: drawn.rack,
      connected: player.connected
    };
  }

  return {
    players,
    playerOrder,
    bag: nextBag
  };
}

function resolveActivePlayer(state: WordTilesRuntimeState): WordTilesRuntimePlayer | null {
  const activePlayerId = state.playerOrder[state.activePlayerIndex] ?? null;
  return activePlayerId ? state.players[activePlayerId] ?? null : null;
}

function advanceTurn(state: WordTilesRuntimeState): number {
  if (state.playerOrder.length === 0) {
    return 0;
  }

  return (state.activePlayerIndex + 1) % state.playerOrder.length;
}

function rejectMove(
  state: WordTilesRuntimeState,
  message: string,
  now: number,
  playerId?: string
): WordTilesRuntimeState {
  // Fehler sind privat: nur der Verursacher sieht sie (siehe toControllerStateForPlayer).
  return {
    ...state,
    lastError: message,
    lastErrorPlayerId: playerId,
    updatedAt: now
  };
}

function preparePlacements(
  state: WordTilesRuntimeState,
  inputPlacements: WordTilesPlacementState[],
  player: WordTilesRuntimePlayer,
  language: SupportedLanguage
): { ok: true; placements: PreparedPlacement[] } | { ok: false; error: string } {
  const text = textFor(language);
  const rackById = new Map(player.rack.map((tile) => [tile.id, tile]));
  const usedTileIds = new Set<string>();
  const usedCells = new Set<string>();
  const placements: PreparedPlacement[] = [];

  if (inputPlacements.length === 0) {
    return { ok: false, error: text.noTiles as string };
  }

  for (const inputPlacement of inputPlacements) {
    const key = cellKey(inputPlacement.x, inputPlacement.y);
    const rackTile = rackById.get(inputPlacement.tileId);

    if (!rackTile) {
      return { ok: false, error: text.unknownTile as string };
    }

    if (usedTileIds.has(rackTile.id)) {
      return { ok: false, error: text.duplicateTile as string };
    }

    if (usedCells.has(key)) {
      return { ok: false, error: text.duplicateCell as string };
    }

    if (
      inputPlacement.x < 0 ||
      inputPlacement.y < 0 ||
      inputPlacement.x >= wordTilesBoardSize ||
      inputPlacement.y >= wordTilesBoardSize ||
      getBoardTile(state.board, inputPlacement.x, inputPlacement.y)
    ) {
      return { ok: false, error: text.occupied as string };
    }

    const normalizedLetter = normalizeWordTilesLetter(inputPlacement.letter);

    if (rackTile.isBlank) {
      if (!wordTilesBlankLettersFor(language).includes(normalizedLetter)) {
        return { ok: false, error: text.badBlank as string };
      }
    } else if (normalizedLetter !== rackTile.letter) {
      return { ok: false, error: text.badLetter as string };
    }

    usedTileIds.add(rackTile.id);
    usedCells.add(key);
    placements.push({
      x: inputPlacement.x,
      y: inputPlacement.y,
      rackTile,
      tile: {
        tileId: rackTile.id,
        letter: rackTile.isBlank ? normalizedLetter : rackTile.letter,
        score: rackTile.isBlank ? 0 : rackTile.score,
        playerId: player.playerId,
        isBlank: rackTile.isBlank
      }
    });
  }

  return { ok: true, placements };
}

function applyPlacementsToBoard(
  board: Array<Array<WordTilesPlacedTileState | null>>,
  placements: PreparedPlacement[]
): Array<Array<WordTilesPlacedTileState | null>> {
  const nextBoard = cloneBoard(board);

  for (const placement of placements) {
    nextBoard[placement.y][placement.x] = placement.tile;
  }

  return nextBoard;
}

function resolvePlacementOrientation(
  placements: PreparedPlacement[]
): "horizontal" | "vertical" | "single" | "invalid" {
  if (placements.length <= 1) {
    return "single";
  }

  const sameRow = placements.every((placement) => placement.y === placements[0].y);
  const sameColumn = placements.every((placement) => placement.x === placements[0].x);

  if (sameRow) {
    return "horizontal";
  }

  if (sameColumn) {
    return "vertical";
  }

  return "invalid";
}

function hasGapInMainLine(
  boardWithPlacements: Array<Array<WordTilesPlacedTileState | null>>,
  placements: PreparedPlacement[],
  orientation: "horizontal" | "vertical"
): boolean {
  if (orientation === "horizontal") {
    const y = placements[0].y;
    const minX = Math.min(...placements.map((placement) => placement.x));
    const maxX = Math.max(...placements.map((placement) => placement.x));

    for (let x = minX; x <= maxX; x += 1) {
      if (!getBoardTile(boardWithPlacements, x, y)) {
        return true;
      }
    }

    return false;
  }

  const x = placements[0].x;
  const minY = Math.min(...placements.map((placement) => placement.y));
  const maxY = Math.max(...placements.map((placement) => placement.y));

  for (let y = minY; y <= maxY; y += 1) {
    if (!getBoardTile(boardWithPlacements, x, y)) {
      return true;
    }
  }

  return false;
}

function collectWord(
  board: Array<Array<WordTilesPlacedTileState | null>>,
  placementKeys: Set<string>,
  x: number,
  y: number,
  dx: number,
  dy: number
): CollectedWord {
  let startX = x;
  let startY = y;

  while (getBoardTile(board, startX - dx, startY - dy)) {
    startX -= dx;
    startY -= dy;
  }

  const cells: Array<{ x: number; y: number }> = [];
  let word = "";
  let includesNewTile = false;
  let cursorX = startX;
  let cursorY = startY;

  while (true) {
    const tile = getBoardTile(board, cursorX, cursorY);

    if (!tile) {
      break;
    }

    word += tile.letter;
    cells.push({ x: cursorX, y: cursorY });
    includesNewTile = includesNewTile || placementKeys.has(cellKey(cursorX, cursorY));
    cursorX += dx;
    cursorY += dy;
  }

  return {
    word,
    cells,
    includesNewTile
  };
}

function collectMoveWords(
  boardWithPlacements: Array<Array<WordTilesPlacedTileState | null>>,
  placements: PreparedPlacement[],
  orientation: "horizontal" | "vertical" | "single"
): CollectedWord[] {
  const placementKeys = new Set(placements.map((placement) => cellKey(placement.x, placement.y)));
  const words = new Map<string, CollectedWord>();
  const addWord = (word: CollectedWord, direction: string) => {
    if (word.word.length < 2 || !word.includesNewTile) {
      return;
    }

    const first = word.cells[0];
    words.set(`${direction}:${first.x}:${first.y}`, word);
  };

  if (orientation === "horizontal") {
    addWord(collectWord(boardWithPlacements, placementKeys, placements[0].x, placements[0].y, 1, 0), "h");

    for (const placement of placements) {
      addWord(collectWord(boardWithPlacements, placementKeys, placement.x, placement.y, 0, 1), "v");
    }
  } else if (orientation === "vertical") {
    addWord(collectWord(boardWithPlacements, placementKeys, placements[0].x, placements[0].y, 0, 1), "v");

    for (const placement of placements) {
      addWord(collectWord(boardWithPlacements, placementKeys, placement.x, placement.y, 1, 0), "h");
    }
  } else {
    const placement = placements[0];
    addWord(collectWord(boardWithPlacements, placementKeys, placement.x, placement.y, 1, 0), "h");
    addWord(collectWord(boardWithPlacements, placementKeys, placement.x, placement.y, 0, 1), "v");
  }

  return [...words.values()];
}

function touchesExistingTile(
  board: Array<Array<WordTilesPlacedTileState | null>>,
  placements: PreparedPlacement[]
): boolean {
  return placements.some((placement) =>
    Boolean(
      getBoardTile(board, placement.x - 1, placement.y) ||
        getBoardTile(board, placement.x + 1, placement.y) ||
        getBoardTile(board, placement.x, placement.y - 1) ||
        getBoardTile(board, placement.x, placement.y + 1)
    )
  );
}

function scoreWord(
  boardWithPlacements: Array<Array<WordTilesPlacedTileState | null>>,
  placementKeys: Set<string>,
  word: CollectedWord
): WordTilesWordScoreState {
  let letterScore = 0;
  let wordMultiplier = 1;

  for (const cell of word.cells) {
    const tile = getBoardTile(boardWithPlacements, cell.x, cell.y);

    if (!tile) {
      continue;
    }

    let tileScore = tile.score;

    if (placementKeys.has(cellKey(cell.x, cell.y))) {
      const bonus = resolveWordTilesBonus(cell.x, cell.y);

      if (bonus === "double_letter") {
        tileScore *= 2;
      } else if (bonus === "triple_letter") {
        tileScore *= 3;
      } else if (bonus === "double_word" || bonus === "center") {
        wordMultiplier *= 2;
      } else if (bonus === "triple_word") {
        wordMultiplier *= 3;
      }
    }

    letterScore += tileScore;
  }

  return {
    word: word.word,
    score: letterScore * wordMultiplier,
    cells: word.cells
  };
}

function collectTurnWords(
  board: Array<Array<WordTilesPlacedTileState | null>>,
  turnCellKeys: Set<string>,
  turnCells: Array<{ x: number; y: number }>
): CollectedWord[] {
  const words = new Map<string, CollectedWord>();

  for (const cell of turnCells) {
    for (const [dx, dy, direction] of [
      [1, 0, "h"],
      [0, 1, "v"]
    ] as const) {
      const word = collectWord(board, turnCellKeys, cell.x, cell.y, dx, dy);

      if (word.word.length < 2 || !word.includesNewTile) {
        continue;
      }

      const first = word.cells[0];
      words.set(`${direction}:${first.x}:${first.y}`, word);
    }
  }

  return [...words.values()];
}

// Wertet alle in diesem Zug gelegten Steine gegen den uebergebenen Brettstand.
// Jedes Wort zaehlt genau einmal in seiner finalen Form; Praemienfelder gelten
// weiterhin nur fuer die in diesem Zug gelegten Steine.
function evaluateTurnPlacements(
  board: Array<Array<WordTilesPlacedTileState | null>>,
  turnPlacements: Array<{ x: number; y: number }>
): { words: WordTilesWordScoreState[]; score: number } {
  const turnCellKeys = new Set(turnPlacements.map((placement) => cellKey(placement.x, placement.y)));
  const collected = collectTurnWords(board, turnCellKeys, turnPlacements);
  const words = collected.map((word) => scoreWord(board, turnCellKeys, word));

  return {
    words,
    score: words.reduce((sum, word) => sum + word.score, 0)
  };
}

function evaluateMove(
  state: WordTilesRuntimeState,
  player: WordTilesRuntimePlayer,
  input: Extract<WordTilesInput, { type: "word-tiles:play" }>,
  context: ServerGameContext
): { ok: true; evaluation: MoveEvaluation } | { ok: false; error: string } {
  const text = textFor(context.language);
  const prepared = preparePlacements(state, input.placements, player, context.language);

  if (!prepared.ok) {
    return { ok: false, error: prepared.error };
  }

  const placements = prepared.placements;
  const orientation = resolvePlacementOrientation(placements);

  if (orientation === "invalid") {
    return { ok: false, error: text.badLine as string };
  }

  const boardWithPlacements = applyPlacementsToBoard(state.board, placements);

  if (orientation !== "single" && hasGapInMainLine(boardWithPlacements, placements, orientation)) {
    return { ok: false, error: text.badGap as string };
  }

  const boardHadTiles = hasAnyBoardTile(state.board);
  const centerTouched = placements.some((placement) => placement.x === 7 && placement.y === 7);

  if (!boardHadTiles && !centerTouched) {
    return { ok: false, error: text.firstCenter as string };
  }

  if (boardHadTiles && !touchesExistingTile(state.board, placements)) {
    return { ok: false, error: text.mustConnect as string };
  }

  const collectedWords = collectMoveWords(boardWithPlacements, placements, orientation);

  if (collectedWords.length === 0) {
    return { ok: false, error: boardHadTiles ? (text.noWord as string) : (text.firstTooShort as string) };
  }

  const placementKeys = new Set(placements.map((placement) => cellKey(placement.x, placement.y)));
  const words = collectedWords.map((word) => scoreWord(boardWithPlacements, placementKeys, word));
  // Der Zug wird erst am Ende ueber den finalen Brettstand gewertet. Die
  // Punktzahl dieses Teil-Zugs ist deshalb die Differenz zum bisherigen
  // Zug-Zwischenstand, nicht die Summe der Einzelwoerter.
  const previousTurnPlacements =
    state.activeTurn?.playerId === player.playerId ? state.activeTurn.placements : [];
  const turnScoreBefore =
    previousTurnPlacements.length > 0
      ? evaluateTurnPlacements(state.board, previousTurnPlacements).score
      : 0;
  const turnScoreAfter = evaluateTurnPlacements(boardWithPlacements, [
    ...previousTurnPlacements,
    ...placements
  ]).score;

  return {
    ok: true,
    evaluation: {
      placements,
      words,
      score: turnScoreAfter - turnScoreBefore
    }
  };
}

function resolveWinner(state: WordTilesRuntimeState): { winnerPlayerId?: string; winnerName?: string; draw: boolean } {
  const ranking = Object.values(state.players).sort((left, right) => right.score - left.score);
  const winner = ranking[0];
  const runnerUp = ranking[1];

  if (!winner) {
    return { draw: true };
  }

  if (runnerUp && runnerUp.score === winner.score) {
    return { draw: true };
  }

  return {
    winnerPlayerId: winner.playerId,
    winnerName: winner.name,
    draw: false
  };
}

function finishGame(state: WordTilesRuntimeState, context: ServerGameContext): WordTilesRuntimeState {
  const text = textFor(context.language);
  const winner = resolveWinner(state);

  return {
    ...state,
    gameOver: true,
    winnerPlayerId: winner.winnerPlayerId,
    winnerName: winner.winnerName,
    activePlayerIndex: state.activePlayerIndex,
    message: winner.draw || !winner.winnerName ? (text.draw as string) : (text.gameOver as (name: string) => string)(winner.winnerName),
    updatedAt: context.now
  };
}

function applyEndgameRackScores(
  state: WordTilesRuntimeState,
  finisherPlayerId: string
): WordTilesRuntimeState {
  let finisherBonus = 0;
  const players = Object.fromEntries(
    Object.values(state.players).map((player) => {
      if (player.playerId === finisherPlayerId) {
        return [player.playerId, player];
      }

      const rackPenalty = player.rack.reduce((sum, tile) => sum + tile.score, 0);
      finisherBonus += rackPenalty;
      return [
        player.playerId,
        {
          ...player,
          score: player.score - rackPenalty
        }
      ];
    })
  );
  const finisher = players[finisherPlayerId];

  if (finisher) {
    players[finisherPlayerId] = {
      ...finisher,
      score: finisher.score + finisherBonus
    };
  }

  return {
    ...state,
    players
  };
}

// Spielende durch Passen/Tauschen: Jeder Spieler bekommt die Punkte seiner
// verbliebenen Racksteine abgezogen (analog zum Ende durch Rack-Leeren, nur
// ohne Finisher-Bonus).
function applyPassOutRackScores(state: WordTilesRuntimeState): WordTilesRuntimeState {
  const players = Object.fromEntries(
    Object.values(state.players).map((player) => {
      const rackPenalty = player.rack.reduce((sum, tile) => sum + tile.score, 0);

      return [
        player.playerId,
        {
          ...player,
          score: player.score - rackPenalty
        }
      ];
    })
  );

  return {
    ...state,
    players
  };
}

function playerNameFor(state: WordTilesRuntimeState, context: ServerGameContext, playerId: string): string {
  return state.players[playerId]?.name ?? context.players.find((player) => player.id === playerId)?.name ?? playerId;
}

function requiredAcceptancePlayerIds(
  state: WordTilesRuntimeState,
  context: ServerGameContext,
  playerId: string
): string[] {
  return state.playerOrder.filter((candidatePlayerId) => {
    if (candidatePlayerId === playerId) {
      return false;
    }

    const livePlayer = context.players.find((player) => player.id === candidatePlayerId);
    const runtimePlayer = state.players[candidatePlayerId];

    return livePlayer?.connected ?? runtimePlayer?.connected ?? true;
  });
}

function createPendingMove(
  state: WordTilesRuntimeState,
  player: WordTilesRuntimePlayer,
  evaluation: MoveEvaluation,
  context: ServerGameContext
): WordTilesPendingMoveRuntimeState {
  const activeTurnPlacedTileCount = state.activeTurn?.playerId === player.playerId ? state.activeTurn.placedTileCount : 0;

  return {
    id: `word-tiles-${state.moveNumber + 1}-${context.now}-${player.playerId}`,
    playerId: player.playerId,
    playerName: player.name,
    score: evaluation.score,
    words: evaluation.words,
    placements: evaluation.placements.map((placement) => ({
      x: placement.x,
      y: placement.y,
      tileId: placement.rackTile.id,
      letter: placement.tile.letter,
      score: placement.tile.score,
      isBlank: placement.tile.isBlank
    })),
    preparedPlacements: evaluation.placements,
    bingo: activeTurnPlacedTileCount + evaluation.placements.length === wordTilesRackSize,
    createdAt: context.now,
    acceptedByPlayerIds: [],
    acceptedByNames: [],
    requiredAcceptancePlayerIds: requiredAcceptancePlayerIds(state, context, player.playerId)
  };
}

function toPublicPendingMove(pendingMove: WordTilesPendingMoveRuntimeState): WordTilesPendingMoveState {
  return {
    id: pendingMove.id,
    playerId: pendingMove.playerId,
    playerName: pendingMove.playerName,
    score: pendingMove.score,
    words: pendingMove.words,
    placements: pendingMove.placements,
    bingo: pendingMove.bingo,
    createdAt: pendingMove.createdAt,
    acceptedByPlayerIds: pendingMove.acceptedByPlayerIds,
    acceptedByNames: pendingMove.acceptedByNames,
    requiredAcceptancePlayerIds: pendingMove.requiredAcceptancePlayerIds,
    challengedByPlayerId: pendingMove.challengedByPlayerId,
    challengedByName: pendingMove.challengedByName,
    challengedAt: pendingMove.challengedAt
  };
}

function isPendingMoveAccepted(pendingMove: WordTilesPendingMoveRuntimeState): boolean {
  return pendingMove.requiredAcceptancePlayerIds.every((playerId) => pendingMove.acceptedByPlayerIds.includes(playerId));
}

function commitPendingMove(
  state: WordTilesRuntimeState,
  pendingMove: WordTilesPendingMoveRuntimeState,
  context: ServerGameContext
): WordTilesRuntimeState {
  const text = textFor(context.language);
  const activePlayer = state.players[pendingMove.playerId];

  if (!activePlayer) {
    return rejectMove(state, text.notYourTurn as string, context.now, pendingMove.playerId);
  }

  const board = applyPlacementsToBoard(state.board, pendingMove.preparedPlacements);
  const usedTileIds = new Set(pendingMove.preparedPlacements.map((placement) => placement.rackTile.id));
  const remainingRack = activePlayer.rack.filter((tile) => !usedTileIds.has(tile.id));
  const previousTurn = state.activeTurn?.playerId === activePlayer.playerId
    ? state.activeTurn
    : {
        playerId: activePlayer.playerId,
        playerName: activePlayer.name,
        score: 0,
        words: [],
        placements: [],
        acceptedMoveCount: 0,
        placedTileCount: 0,
        bingoEligible: false
      };
  const placedTileCount = previousTurn.placedTileCount + pendingMove.placements.length;
  const turnPlacements = [...previousTurn.placements, ...pendingMove.placements];
  // Zug-Ende-Wertung: Der gesamte Zug wird immer ueber den aktuellen Brettstand
  // neu berechnet. Dadurch zaehlt ein im selben Zug erweitertes Wort (HAUS ->
  // HAUSE -> HAUSES) nur einmal in seiner finalen Form.
  const turnEvaluation = evaluateTurnPlacements(board, turnPlacements);
  const activeTurn: WordTilesActiveTurnRuntimeState = {
    ...previousTurn,
    score: turnEvaluation.score,
    words: turnEvaluation.words,
    placements: turnPlacements,
    acceptedMoveCount: previousTurn.acceptedMoveCount + 1,
    placedTileCount,
    bingoEligible: placedTileCount === wordTilesRackSize
  };
  const nextPlayers = {
    ...state.players,
    [activePlayer.playerId]: {
      ...activePlayer,
      rack: remainingRack
    }
  };

  return {
    ...state,
    board,
    players: nextPlayers,
    pendingMove: undefined,
    activeTurn,
    recentCellKeys: pendingMove.placements.map((placement) => cellKey(placement.x, placement.y)),
    lastError: undefined,
    message: (text.acceptedMove as (name: string, score: number) => string)(activePlayer.name, activeTurn.score),
    updatedAt: context.now
  };
}

function handlePlay(
  state: WordTilesRuntimeState,
  input: Extract<WordTilesInput, { type: "word-tiles:play" }>,
  context: ServerGameContext
): WordTilesRuntimeState {
  const activePlayer = resolveActivePlayer(state);
  const text = textFor(context.language);

  if (!activePlayer || input.playerId !== activePlayer.playerId) {
    return rejectMove(state, text.notYourTurn as string, context.now, input.playerId);
  }

  if (state.pendingMove) {
    return rejectMove(state, text.pendingMoveActive as string, context.now, input.playerId);
  }

  const result = evaluateMove(state, activePlayer, input, context);

  if (!result.ok) {
    return rejectMove(state, result.error, context.now, input.playerId);
  }

  const pendingMove = createPendingMove(state, activePlayer, result.evaluation, context);

  if (pendingMove.requiredAcceptancePlayerIds.length === 0) {
    return commitPendingMove(
      {
        ...state,
        pendingMove,
        recentCellKeys: pendingMove.placements.map((placement) => cellKey(placement.x, placement.y))
      },
      pendingMove,
      context
    );
  }

  return {
    ...state,
    pendingMove,
    recentCellKeys: pendingMove.placements.map((placement) => cellKey(placement.x, placement.y)),
    lastError: undefined,
    message: [
      (text.pendingMove as (name: string, score: number, words: string[]) => string)(
        activePlayer.name,
        pendingMove.score,
        pendingMove.words.map((word) => word.word)
      )
    ].filter(Boolean).join(" "),
    updatedAt: context.now
  };
}

function handleChallenge(
  state: WordTilesRuntimeState,
  input: Extract<WordTilesInput, { type: "word-tiles:challenge" }>,
  context: ServerGameContext
): WordTilesRuntimeState {
  const text = textFor(context.language);
  const pendingMove = state.pendingMove;

  if (!pendingMove) {
    return rejectMove(state, text.noPendingMove as string, context.now, input.playerId);
  }

  if (input.pendingMoveId !== pendingMove.id) {
    return rejectMove(state, text.stalePendingMove as string, context.now, input.playerId);
  }

  if (input.playerId === pendingMove.playerId) {
    return rejectMove(state, text.cannotChallengeOwn as string, context.now, input.playerId);
  }

  if (pendingMove.acceptedByPlayerIds.includes(input.playerId)) {
    return rejectMove(state, text.alreadyAccepted as string, context.now, input.playerId);
  }

  if (pendingMove.challengedByPlayerId) {
    return rejectMove(state, text.alreadyChallenged as string, context.now, input.playerId);
  }

  const challenger = state.players[input.playerId];
  const challengerName =
    challenger?.name ??
    context.players.find((player) => player.id === input.playerId)?.name ??
    input.playerId;
  const challengedPendingMove: WordTilesPendingMoveRuntimeState = {
    ...pendingMove,
    challengedByPlayerId: input.playerId,
    challengedByName: challengerName,
    challengedAt: context.now
  };

  return {
    ...state,
    pendingMove: challengedPendingMove,
    lastError: undefined,
    message: (text.challenged as (challengerName: string, playerName: string) => string)(
      challengerName,
      pendingMove.playerName
    ),
    updatedAt: context.now
  };
}

function handleAcceptPendingMove(
  state: WordTilesRuntimeState,
  input: Extract<WordTilesInput, { type: "word-tiles:accept" }>,
  context: ServerGameContext
): WordTilesRuntimeState {
  const text = textFor(context.language);
  const pendingMove = state.pendingMove;

  if (!pendingMove) {
    return rejectMove(state, text.noPendingMove as string, context.now, input.playerId);
  }

  if (input.pendingMoveId !== pendingMove.id) {
    return rejectMove(state, text.stalePendingMove as string, context.now, input.playerId);
  }

  if (input.playerId === pendingMove.playerId) {
    return rejectMove(state, text.cannotAcceptOwn as string, context.now, input.playerId);
  }

  if (pendingMove.challengedByPlayerId) {
    return rejectMove(state, text.alreadyChallenged as string, context.now, input.playerId);
  }

  if (pendingMove.acceptedByPlayerIds.includes(input.playerId)) {
    return rejectMove(state, text.alreadyAccepted as string, context.now, input.playerId);
  }

  if (!pendingMove.requiredAcceptancePlayerIds.includes(input.playerId)) {
    return rejectMove(state, text.acceptNotRequired as string, context.now, input.playerId);
  }

  const acceptedPendingMove: WordTilesPendingMoveRuntimeState = {
    ...pendingMove,
    acceptedByPlayerIds: [...pendingMove.acceptedByPlayerIds, input.playerId],
    acceptedByNames: [...pendingMove.acceptedByNames, playerNameFor(state, context, input.playerId)]
  };

  if (isPendingMoveAccepted(acceptedPendingMove)) {
    return commitPendingMove(
      {
        ...state,
        pendingMove: acceptedPendingMove
      },
      acceptedPendingMove,
      context
    );
  }

  return {
    ...state,
    pendingMove: acceptedPendingMove,
    lastError: undefined,
    message: (text.acceptedWaiting as (name: string, accepted: number, required: number) => string)(
      playerNameFor(state, context, input.playerId),
      acceptedPendingMove.acceptedByPlayerIds.length,
      acceptedPendingMove.requiredAcceptancePlayerIds.length
    ),
    updatedAt: context.now
  };
}

function handleConfirmPendingMove(
  state: WordTilesRuntimeState,
  input: Extract<WordTilesInput, { type: "word-tiles:confirm" }>,
  context: ServerGameContext
): WordTilesRuntimeState {
  const text = textFor(context.language);
  const pendingMove = state.pendingMove;

  if (!pendingMove) {
    return rejectMove(state, text.noPendingMove as string, context.now, input.playerId);
  }

  if (input.pendingMoveId !== pendingMove.id) {
    return rejectMove(state, text.stalePendingMove as string, context.now, input.playerId);
  }

  if (input.playerId !== pendingMove.playerId) {
    return rejectMove(state, text.notPendingPlayer as string, context.now, input.playerId);
  }

  return commitPendingMove(state, pendingMove, context);
}

function handleRecallPendingMove(
  state: WordTilesRuntimeState,
  input: Extract<WordTilesInput, { type: "word-tiles:recall" }>,
  context: ServerGameContext
): WordTilesRuntimeState {
  const text = textFor(context.language);
  const pendingMove = state.pendingMove;

  if (!pendingMove) {
    return rejectMove(state, text.noPendingMove as string, context.now, input.playerId);
  }

  if (input.pendingMoveId !== pendingMove.id) {
    return rejectMove(state, text.stalePendingMove as string, context.now, input.playerId);
  }

  if (input.playerId !== pendingMove.playerId) {
    return rejectMove(state, text.notPendingPlayer as string, context.now, input.playerId);
  }

  if (!pendingMove.challengedByPlayerId) {
    return rejectMove(state, text.notChallenged as string, context.now, input.playerId);
  }

  return {
    ...state,
    pendingMove: undefined,
    recentCellKeys: [],
    lastError: undefined,
    message: (text.recalled as (name: string) => string)(pendingMove.playerName),
    updatedAt: context.now
  };
}

function handleFinishTurn(
  state: WordTilesRuntimeState,
  input: Extract<WordTilesInput, { type: "word-tiles:finish" }>,
  context: ServerGameContext
): WordTilesRuntimeState {
  const activePlayer = resolveActivePlayer(state);
  const text = textFor(context.language);

  if (!activePlayer || input.playerId !== activePlayer.playerId) {
    return rejectMove(state, text.notYourTurn as string, context.now, input.playerId);
  }

  if (state.pendingMove) {
    return rejectMove(state, text.pendingMoveActive as string, context.now, input.playerId);
  }

  if (!state.activeTurn || state.activeTurn.playerId !== activePlayer.playerId) {
    return rejectMove(state, text.noActiveTurn as string, context.now, input.playerId);
  }

  const bingo = state.activeTurn.bingoEligible;
  const score = state.activeTurn.score + (bingo ? wordTilesBingoBonus : 0);
  const drawn = drawRack(activePlayer.rack, state.bag);
  const nextPlayers = {
    ...state.players,
    [activePlayer.playerId]: {
      ...activePlayer,
      score: activePlayer.score + score,
      rack: drawn.rack
    }
  };
  const moveSummary: WordTilesMoveSummaryState = {
    playerId: activePlayer.playerId,
    playerName: activePlayer.name,
    score,
    words: state.activeTurn.words,
    placements: state.activeTurn.placements,
    bingo,
    reason: bingo ? (text.bingo as string) : undefined
  };
  const message = [
    (text.finished as (name: string, score: number, words: string[]) => string)(
      activePlayer.name,
      score,
      state.activeTurn.words.map((word) => word.word)
    ),
    bingo ? (text.bingo as string) : ""
  ].filter(Boolean).join(" ");
  let nextState: WordTilesRuntimeState = {
    ...state,
    players: nextPlayers,
    bag: drawn.bag,
    activePlayerIndex: advanceTurn(state),
    moveNumber: state.moveNumber + 1,
    consecutivePasses: 0,
    recentCellKeys: state.activeTurn.placements.map((placement) => cellKey(placement.x, placement.y)),
    lastMove: moveSummary,
    activeTurn: undefined,
    lastError: undefined,
    message,
    updatedAt: context.now
  };

  if (drawn.rack.length === 0 && drawn.bag.length === 0) {
    nextState = applyEndgameRackScores(nextState, activePlayer.playerId);
    return finishGame(nextState, context);
  }

  return nextState;
}

function handlePass(
  state: WordTilesRuntimeState,
  input: Extract<WordTilesInput, { type: "word-tiles:pass" }>,
  context: ServerGameContext
): WordTilesRuntimeState {
  const activePlayer = resolveActivePlayer(state);
  const text = textFor(context.language);

  if (!activePlayer || input.playerId !== activePlayer.playerId) {
    return rejectMove(state, text.notYourTurn as string, context.now, input.playerId);
  }

  if (state.pendingMove) {
    return rejectMove(state, text.pendingMoveActive as string, context.now, input.playerId);
  }

  if (state.activeTurn) {
    return rejectMove(state, text.finishTurnFirst as string, context.now, input.playerId);
  }

  const nextState: WordTilesRuntimeState = {
    ...state,
    activePlayerIndex: advanceTurn(state),
    consecutivePasses: state.consecutivePasses + 1,
    recentCellKeys: [],
    lastMove: {
      playerId: activePlayer.playerId,
      playerName: activePlayer.name,
      score: 0,
      words: [],
      placements: [],
      bingo: false,
      reason: "Pass"
    },
    lastError: undefined,
    message: (text.pass as (name: string) => string)(activePlayer.name),
    updatedAt: context.now
  };

  if (nextState.consecutivePasses >= Math.max(2, state.playerOrder.length * 2)) {
    return finishGame(applyPassOutRackScores(nextState), context);
  }

  return nextState;
}

function handleExchange(
  state: WordTilesRuntimeState,
  input: Extract<WordTilesInput, { type: "word-tiles:exchange" }>,
  context: ServerGameContext
): WordTilesRuntimeState {
  const activePlayer = resolveActivePlayer(state);
  const text = textFor(context.language);

  if (!activePlayer || input.playerId !== activePlayer.playerId) {
    return rejectMove(state, text.notYourTurn as string, context.now, input.playerId);
  }

  if (state.pendingMove) {
    return rejectMove(state, text.pendingMoveActive as string, context.now, input.playerId);
  }

  if (state.activeTurn) {
    return rejectMove(state, text.finishTurnFirst as string, context.now, input.playerId);
  }

  const tileIds = [...new Set(input.tileIds)];

  if (tileIds.length === 0) {
    return rejectMove(state, text.exchangeEmpty as string, context.now, input.playerId);
  }

  if (state.bag.length < tileIds.length) {
    return rejectMove(state, text.exchangeBag as string, context.now, input.playerId);
  }

  const rackById = new Map(activePlayer.rack.map((tile) => [tile.id, tile]));
  const exchangedTiles: WordTilesRackTileState[] = [];

  for (const tileId of tileIds) {
    const tile = rackById.get(tileId);

    if (!tile) {
      return rejectMove(state, text.unknownTile as string, context.now, input.playerId);
    }

    exchangedTiles.push(tile);
  }

  const remainingRack = activePlayer.rack.filter((tile) => !tileIds.includes(tile.id));
  const shuffledBag = shuffle(state.bag);
  const drawnTiles = shuffledBag.slice(0, tileIds.length);
  const nextBag = shuffle([...shuffledBag.slice(tileIds.length), ...exchangedTiles]);
  const nextPlayers = {
    ...state.players,
    [activePlayer.playerId]: {
      ...activePlayer,
      rack: [...remainingRack, ...drawnTiles]
    }
  };
  const nextState: WordTilesRuntimeState = {
    ...state,
    players: nextPlayers,
    bag: nextBag,
    activePlayerIndex: advanceTurn(state),
    consecutivePasses: state.consecutivePasses + 1,
    recentCellKeys: [],
    lastMove: {
      playerId: activePlayer.playerId,
      playerName: activePlayer.name,
      score: 0,
      words: [],
      placements: [],
      bingo: false,
      reason: "Exchange"
    },
    lastError: undefined,
    message: (text.exchange as (name: string, count: number) => string)(activePlayer.name, tileIds.length),
    updatedAt: context.now
  };

  if (nextState.consecutivePasses >= Math.max(2, state.playerOrder.length * 2)) {
    return finishGame(applyPassOutRackScores(nextState), context);
  }

  return nextState;
}

function createRuntimeState(context: ServerGameContext): WordTilesRuntimeState {
  const shuffledBag = shuffle(createWordTilesBag(context.language));
  const runtime = createRuntimePlayers(context, shuffledBag);
  const activePlayerName = context.players[0]?.name ?? (context.language === "en" ? "Player" : "Spieler");
  const text = textFor(context.language);

  return {
    ...createBaseRoundState("round_intro", context.now, {
      durationMs: roundPhaseDurations.roundIntroMs,
      message: text.intro as string
    }),
    board: createEmptyBoard(),
    players: runtime.players,
    playerOrder: runtime.playerOrder,
    activePlayerIndex: 0,
    bag: runtime.bag,
    moveNumber: 0,
    consecutivePasses: 0,
    recentCellKeys: [],
    gameOver: false,
    disconnectedAtByPlayerId: {},
    message: (text.start as (name: string) => string)(activePlayerName)
  };
}

function buildPublicState(state: WordTilesRuntimeState, context: ServerGameContext): WordTilesPublicState {
  const recentCells = new Set(state.recentCellKeys);
  const activePlayer = resolveActivePlayer(state);
  const playerSummaries = new Map(context.players.map((player) => [player.id, player]));
  const boardWithPendingMove = state.pendingMove
    ? applyPlacementsToBoard(state.board, state.pendingMove.preparedPlacements)
    : state.board;
  const board: WordTilesBoardCellState[] = [];

  for (let y = 0; y < wordTilesBoardSize; y += 1) {
    for (let x = 0; x < wordTilesBoardSize; x += 1) {
      board.push({
        x,
        y,
        bonus: resolveWordTilesBonus(x, y),
        tile: getBoardTile(boardWithPendingMove, x, y),
        recent: recentCells.has(cellKey(x, y))
      });
    }
  }

  const players: WordTilesPlayerPublicState[] = state.playerOrder.map((playerId) => {
    const player = state.players[playerId];
    const livePlayer = playerSummaries.get(playerId);
    const pendingRackTiles =
      state.pendingMove?.playerId === playerId ? state.pendingMove.placements.length : 0;

    return {
      playerId,
      name: livePlayer?.name ?? player?.name ?? playerId,
      color: livePlayer?.color ?? player?.color ?? "#38bdf8",
      score: player?.score ?? 0,
      rackCount: Math.max(0, (player?.rack.length ?? 0) - pendingRackTiles),
      connected: livePlayer?.connected ?? player?.connected ?? false
    };
  });

  return {
    boardSize: wordTilesBoardSize,
    board,
    players,
    activePlayerId: state.gameOver ? null : activePlayer?.playerId ?? null,
    activePlayerName: state.gameOver ? null : activePlayer?.name ?? null,
    moveNumber: state.moveNumber,
    bagCount: state.bag.length,
    consecutivePasses: state.consecutivePasses,
    gameOver: state.gameOver,
    winnerPlayerId: state.winnerPlayerId,
    winnerName: state.winnerName,
    lastMove: state.lastMove,
    pendingMove: state.pendingMove ? toPublicPendingMove(state.pendingMove) : undefined,
    activeTurn: state.activeTurn,
    // Fehler sind privat und werden nur dem Verursacher im Controller-State gezeigt.
    lastError: undefined,
    tileValues: wordTilesLetterValuesFor(context.language)
  };
}

function isDisconnectExpired(state: WordTilesRuntimeState, playerId: string, now: number): boolean {
  const disconnectedAt = state.disconnectedAtByPlayerId[playerId];
  return disconnectedAt !== undefined && now - disconnectedAt >= wordTilesDisconnectGraceMs;
}

function syncDisconnectTimestamps(
  state: WordTilesRuntimeState,
  context: ServerGameContext
): WordTilesRuntimeState {
  let changed = false;
  const next: Record<string, number> = { ...state.disconnectedAtByPlayerId };
  const liveById = new Map(context.players.map((player) => [player.id, player]));

  for (const playerId of state.playerOrder) {
    // Spieler, die den Raum ganz verlassen haben, gelten ebenfalls als getrennt.
    const connected = liveById.get(playerId)?.connected ?? false;

    if (connected) {
      if (next[playerId] !== undefined) {
        delete next[playerId];
        changed = true;
      }
    } else if (next[playerId] === undefined) {
      next[playerId] = context.now;
      changed = true;
    }
  }

  return changed ? { ...state, disconnectedAtByPlayerId: next } : state;
}

// Solange alle verbunden sind, gibt es keinerlei Zeitlimit. Erst wenn ein
// Spieler getrennt ist, laeuft eine 60s-Frist. Danach:
// - wird ein getrennter Pflicht-Akzeptierer aus der Required-Liste entfernt
//   (verhindert den Deadlock bei offenen Zuegen),
// - nimmt ein getrennter Besitzer einen angezweifelten Zug automatisch zurueck,
// - schliesst ein getrennter aktiver Spieler seinen Zug automatisch ab bzw. passt.
function handleTick(state: WordTilesRuntimeState, context: ServerGameContext): WordTilesRuntimeState {
  if (state.phase !== "playing" || state.gameOver) {
    return state;
  }

  const nextState = syncDisconnectTimestamps(state, context);
  const text = textFor(context.language);
  const pendingMove = nextState.pendingMove;

  if (pendingMove) {
    if (pendingMove.challengedByPlayerId) {
      if (!isDisconnectExpired(nextState, pendingMove.playerId, context.now)) {
        return nextState;
      }

      const recalled = handleRecallPendingMove(
        nextState,
        {
          type: "word-tiles:recall",
          playerId: pendingMove.playerId,
          pendingMoveId: pendingMove.id,
          sentAt: context.now
        },
        context
      );

      return {
        ...recalled,
        message: [
          (text.disconnectTimeout as (name: string) => string)(pendingMove.playerName),
          recalled.message
        ].filter(Boolean).join(" ")
      };
    }

    const requiredIds = pendingMove.requiredAcceptancePlayerIds.filter(
      (playerId) => !isDisconnectExpired(nextState, playerId, context.now)
    );

    if (requiredIds.length === pendingMove.requiredAcceptancePlayerIds.length) {
      return nextState;
    }

    const updatedPendingMove: WordTilesPendingMoveRuntimeState = {
      ...pendingMove,
      requiredAcceptancePlayerIds: requiredIds
    };

    if (isPendingMoveAccepted(updatedPendingMove)) {
      return commitPendingMove(
        { ...nextState, pendingMove: updatedPendingMove },
        updatedPendingMove,
        context
      );
    }

    return {
      ...nextState,
      pendingMove: updatedPendingMove,
      updatedAt: context.now
    };
  }

  const activePlayer = resolveActivePlayer(nextState);

  if (!activePlayer || !isDisconnectExpired(nextState, activePlayer.playerId, context.now)) {
    return nextState;
  }

  const timeoutPrefix = (text.disconnectTimeout as (name: string) => string)(activePlayer.name);

  if (nextState.activeTurn?.playerId === activePlayer.playerId) {
    const finished = handleFinishTurn(
      nextState,
      {
        type: "word-tiles:finish",
        playerId: activePlayer.playerId,
        sentAt: context.now
      },
      context
    );

    return {
      ...finished,
      message: [timeoutPrefix, finished.message].filter(Boolean).join(" ")
    };
  }

  const passed = handlePass(
    nextState,
    {
      type: "word-tiles:pass",
      playerId: activePlayer.playerId,
      sentAt: context.now
    },
    context
  );

  return {
    ...passed,
    message: passed.gameOver
      ? [timeoutPrefix, passed.message].filter(Boolean).join(" ")
      : [
          timeoutPrefix,
          (text.turnSkipped as (name: string) => string)(activePlayer.name)
        ].filter(Boolean).join(" ")
  };
}

export const serverGame: ServerGame<
  WordTilesRuntimeState,
  WordTilesInput,
  WordTilesPublicState
> = {
  manifest: wordTilesManifest,
  createInitialState(context) {
    return createRuntimeState(context);
  },
  startRound(_state, context) {
    const state = createRuntimeState(context);
    return transitionRoundState(state, "playing", context.now, {
      startedAt: context.now,
      message: state.message
    });
  },
  handleInput(state, input, context) {
    if (state.phase !== "playing" || state.gameOver) {
      return state;
    }

    if (input.type === "word-tiles:play") {
      return handlePlay(state, input, context);
    }

    if (input.type === "word-tiles:pass") {
      return handlePass(state, input, context);
    }

    if (input.type === "word-tiles:exchange") {
      return handleExchange(state, input, context);
    }

    if (input.type === "word-tiles:challenge") {
      return handleChallenge(state, input, context);
    }

    if (input.type === "word-tiles:accept") {
      return handleAcceptPendingMove(state, input, context);
    }

    if (input.type === "word-tiles:confirm") {
      return handleConfirmPendingMove(state, input, context);
    }

    if (input.type === "word-tiles:recall") {
      return handleRecallPendingMove(state, input, context);
    }

    if (input.type === "word-tiles:finish") {
      return handleFinishTurn(state, input, context);
    }

    return state;
  },
  tick(state, _deltaMs, context) {
    return handleTick(state, context);
  },
  isRoundFinished(state) {
    return state.phase === "playing" && state.gameOver;
  },
  buildScore(state): ScoreEntry[] {
    return state.winnerPlayerId
      ? [
          {
            playerId: state.winnerPlayerId,
            delta: 1,
            reason: "Word Tiles"
          }
        ]
      : [];
  },
  toPublicState(state, context) {
    return buildPublicState(state, context);
  },
  toControllerStateForPlayer(state, context, playerId): WordTilesControllerState {
    const publicState = buildPublicState(state, context);
    const activePlayer = resolveActivePlayer(state);
    const player = state.players[playerId];
    const pendingRackTileIds = new Set(
      state.pendingMove?.playerId === playerId
        ? state.pendingMove.preparedPlacements.map((placement) => placement.rackTile.id)
        : []
    );

    return {
      ...publicState,
      lastError: state.lastErrorPlayerId === playerId ? state.lastError : undefined,
      rack: player?.rack.filter((tile) => !pendingRackTileIds.has(tile.id)) ?? [],
      canAct: Boolean(activePlayer && activePlayer.playerId === playerId && !state.pendingMove && !state.gameOver),
      canAcceptPendingMove: Boolean(
        state.pendingMove &&
          state.pendingMove.playerId !== playerId &&
          !state.pendingMove.challengedByPlayerId &&
          state.pendingMove.requiredAcceptancePlayerIds.includes(playerId) &&
          !state.pendingMove.acceptedByPlayerIds.includes(playerId) &&
          !state.gameOver
      ),
      canChallenge: Boolean(
        state.pendingMove &&
          state.pendingMove.playerId !== playerId &&
          !state.pendingMove.challengedByPlayerId &&
          !state.pendingMove.acceptedByPlayerIds.includes(playerId) &&
          !state.gameO