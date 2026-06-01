import { wordTilesManifest } from "../manifest.js";
import type {
  WordTilesBoardCellState,
  WordTilesControllerState,
  WordTilesMoveSummaryState,
  WordTilesPlacementState,
  WordTilesPlayerPublicState,
  WordTilesRackTileState
} from "../protocol.js";
import {
  createWordTilesExchangeInput,
  createWordTilesPassInput,
  createWordTilesPlayInput
} from "./wordTilesBindings.js";

type SupportedLanguage = "de" | "en";

interface WordTilesLayoutModel {
  kind: "word_tiles_board";
  title: string;
  subtitle: string;
  helperText: string;
  language?: SupportedLanguage;
  disabled: boolean;
  canAct: boolean;
  resetKey: string;
  boardSize: number;
  board: WordTilesBoardCellState[];
  rack: WordTilesRackTileState[];
  players: WordTilesPlayerPublicState[];
  currentPlayerId: string;
  bagCount: number;
  moveNumber: number;
  ownScore: number;
  activePlayerId: string | null;
  activePlayerName: string | null;
  lastMove?: WordTilesMoveSummaryState;
  lastError?: string;
  tileValues: Record<string, number>;
  onPlay: (placements: WordTilesPlacementState[]) => void;
  onPass: () => void;
  onExchange: (tileIds: string[]) => void;
}

interface ControllerGameRenderContext {
  state: {
    room?: {
      language?: SupportedLanguage;
    } | null;
    player?: {
      id: string;
      score?: number;
    } | null;
    game?: {
      phase?: string;
      roundNumber?: number;
      message?: string;
      state?: unknown;
    } | null;
    scoreboard?: {
      entries: Array<{ playerId: string; total: number }>;
    } | null;
  };
  onInput(input: unknown): void;
}

export function buildWordTilesControllerModel(context: ControllerGameRenderContext): WordTilesLayoutModel {
  const { state, onInput } = context;
  const playerId = state.player?.id ?? "";
  const gameState = (state.game?.state ?? {}) as Partial<WordTilesControllerState>;
  const en = state.room?.language === "en";
  const activeName = gameState.activePlayerName ?? (en ? "waiting" : "warte");
  const score =
    gameState.players?.find((player) => player.playerId === playerId)?.score ??
    state.scoreboard?.entries.find((entry) => entry.playerId === playerId)?.total ??
    state.player?.score ??
    0;

  return {
    kind: "word_tiles_board",
    title: "Word Tiles",
    subtitle: gameState.gameOver
      ? gameState.winnerName
        ? `${en ? "Winner" : "Gewinner"}: ${gameState.winnerName}`
        : en ? "Draw" : "Unentschieden"
      : `${en ? "Turn" : "Zug"}: ${activeName}`,
    helperText: state.game?.message ?? (en ? "Place a valid word." : "Lege ein gueltiges Wort."),
    language: state.room?.language,
    disabled: state.game?.phase !== "playing" || !gameState.canAct,
    canAct: Boolean(gameState.canAct && state.game?.phase === "playing"),
    resetKey: `${state.game?.roundNumber ?? 0}:${gameState.moveNumber ?? 0}:${gameState.activePlayerId ?? "none"}`,
    boardSize: gameState.boardSize ?? 15,
    board: gameState.board ?? [],
    rack: gameState.rack ?? [],
    players: gameState.players ?? [],
    currentPlayerId: playerId,
    bagCount: gameState.bagCount ?? 0,
    moveNumber: gameState.moveNumber ?? 0,
    ownScore: score,
    activePlayerId: gameState.activePlayerId ?? null,
    activePlayerName: gameState.activePlayerName ?? null,
    lastMove: gameState.lastMove,
    lastError: gameState.lastError,
    tileValues: gameState.tileValues ?? {},
    onPlay: (placements) => onInput(createWordTilesPlayInput(playerId, placements)),
    onPass: () => onInput(createWordTilesPassInput(playerId)),
    onExchange: (tileIds) => onInput(createWordTilesExchangeInput(playerId, tileIds))
  };
}

export const controllerGame = {
  id: wordTilesManifest.id,
  layoutKey: "word_tiles_board",
  buildLayout(context: ControllerGameRenderContext) {
    return buildWordTilesControllerModel(context);
  }
} as const;
