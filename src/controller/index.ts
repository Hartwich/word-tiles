import { wordTilesManifest } from "../manifest.js";
import type {
  WordTilesActiveTurnState,
  WordTilesBoardCellState,
  WordTilesControllerState,
  WordTilesMoveSummaryState,
  WordTilesPendingMoveState,
  WordTilesPlacementState,
  WordTilesPlayerPublicState,
  WordTilesRackTileState
} from "../protocol.js";
import {
  createWordTilesAcceptInput,
  createWordTilesChallengeInput,
  createWordTilesConfirmInput,
  createWordTilesExchangeInput,
  createWordTilesFinishTurnInput,
  createWordTilesPassInput,
  createWordTilesPlayInput,
  createWordTilesRecallInput
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
  pendingMove?: WordTilesPendingMoveState;
  activeTurn?: WordTilesActiveTurnState;
  lastError?: string;
  tileValues: Record<string, number>;
  canAcceptPendingMove: boolean;
  canChallenge: boolean;
  canResolvePendingMove: boolean;
  canRecallPendingMove: boolean;
  canFinishTurn: boolean;
  onPlay: (placements: WordTilesPlacementState[]) => void;
  onPass: () => void;
  onExchange: (tileIds: string[]) => void;
  onAcceptPendingMove: (pendingMoveId: string) => void;
  onChallenge: (pendingMoveId: string) => void;
  onConfirmPendingMove: (pendingMoveId: string) => void;
  onRecallPendingMove: (pendingMoveId: string) => void;
  onFinishTurn: () => void;
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
  const pendingMove = gameState.pendingMove;
  const activeTurn = gameState.activeTurn;
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
      : pendingMove
        ? pendingMove.challengedByName
          ? `${en ? "Challenged" : "Angezweifelt"}: ${pendingMove.playerName}`
          : `${en ? "Open move" : "Offener Zug"}: ${pendingMove.playerName}`
      : activeTurn
        ? `${en ? "Turn score" : "Zugpunkte"}: ${activeTurn.score}`
      : `${en ? "Turn" : "Zug"}: ${activeName}`,
    helperText: state.game?.message ?? (en ? "Place a word." : "Lege ein Wort."),
    language: state.room?.language,
    disabled: state.game?.phase !== "playing" || !gameState.canAct,
    canAct: Boolean(gameState.canAct && state.game?.phase === "playing"),
    resetKey: [
      state.game?.roundNumber ?? 0,
      gameState.moveNumber ?? 0,
      gameState.activePlayerId ?? "none",
      pendingMove?.id ?? "none",
      pendingMove?.challengedByPlayerId ?? "none",
      pendingMove?.acceptedByPlayerIds.join(",") ?? "none",
      activeTurn?.acceptedMoveCount ?? 0,
      activeTurn?.placedTileCount ?? 0
    ].join(":"),
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
    pendingMove,
    activeTurn,
    lastError: gameState.lastError,
    tileValues: gameState.tileValues ?? {},
    canAcceptPendingMove: Boolean(gameState.canAcceptPendingMove && state.game?.phase === "playing"),
    canChallenge: Boolean(gameState.canChallenge && state.game?.phase === "playing"),
    canResolvePendingMove: Boolean(gameState.canResolvePendingMove && state.game?.phase === "playing"),
    canRecallPendingMove: Boolean(gameState.canRecallPendingMove && state.game?.phase === "playing"),
    canFinishTurn: Boolean(gameState.canFinishTurn && state.game?.phase === "playing"),
    onPlay: (placements) => onInput(createWordTilesPlayInput(playerId, placements)),
    onPass: () => onInput(createWordTilesPassInput(playerId)),
    onExchange: (tileIds) => onInput(createWordTilesExchangeInput(playerId, tileIds)),
    onAcceptPendingMove: (pendingMoveId) => onInput(createWordTilesAcceptInput(playerId, pendingMoveId)),
    onChallenge: (pendingMoveId) => onInput(createWordTilesChallengeInput(playerId, pendingMoveId)),
    onConfirmPendingMove: (pendingMoveId) => onInput(createWordTilesConfirmInput(playerId, pendingMoveId)),
    onRecallPendingMove: (pendingMoveId) => onInput(createWordTilesRecallInput(playerId, pendingMoveId)),
    onFinishTurn: () => onInput(createWordTilesFinishTurnInput(playerId))
  };
}

export const controllerGame = {
  id: wordTilesManifest.id,
  layoutKey: "word_tiles_board",
  buildLayout(context: ControllerGameRenderContext) {
    return buildWordTilesControllerModel(context);
  }
} as const;
