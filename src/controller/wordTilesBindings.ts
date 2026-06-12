import type {
  WordTilesAcceptInput,
  WordTilesChallengeInput,
  WordTilesConfirmInput,
  WordTilesExchangeInput,
  WordTilesFinishTurnInput,
  WordTilesPassInput,
  WordTilesPlacementState,
  WordTilesPlayInput,
  WordTilesRecallInput
} from "../protocol.js";

export function createWordTilesPlayInput(
  playerId: string,
  placements: WordTilesPlacementState[]
): WordTilesPlayInput {
  return {
    type: "word-tiles:play",
    playerId,
    placements,
    sentAt: Date.now()
  };
}

export function createWordTilesPassInput(playerId: string): WordTilesPassInput {
  return {
    type: "word-tiles:pass",
    playerId,
    sentAt: Date.now()
  };
}

export function createWordTilesExchangeInput(
  playerId: string,
  tileIds: string[]
): WordTilesExchangeInput {
  return {
    type: "word-tiles:exchange",
    playerId,
    tileIds,
    sentAt: Date.now()
  };
}

export function createWordTilesChallengeInput(
  playerId: string,
  pendingMoveId: string
): WordTilesChallengeInput {
  return {
    type: "word-tiles:challenge",
    playerId,
    pendingMoveId,
    sentAt: Date.now()
  };
}

export function createWordTilesAcceptInput(
  playerId: string,
  pendingMoveId: string
): WordTilesAcceptInput {
  return {
    type: "word-tiles:accept",
    playerId,
    pendingMoveId,
    sentAt: Date.now()
  };
}

export function createWordTilesConfirmInput(
  playerId: string,
  pendingMoveId: string
): WordTilesConfirmInput {
  return {
    type: "word-tiles:confirm",
    playerId,
    pendingMoveId,
    sentAt: Date.now()
  };
}

export function createWordTilesFinishTurnInput(playerId: string): WordTilesFinishTurnInput {
  return {
    type: "word-tiles:finish",
    playerId,
    sentAt: Date.now()
  };
}

export function createWordTilesRecallInput(
  playerId: string,
  pendingMoveId: string
): WordTilesRecallInput {
  return {
    type: "word-tiles:recall",
    playerId,
    pendingMoveId,
    sentAt: Date.now()
  };
}
