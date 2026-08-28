import type { BoardState } from "../types";

const STORAGE_KEY = "ai-job-search-kanban:v1";

function normalizeCards(cards: BoardState["cards"]) {
  const usedIds = new Set<string>();
  return cards.map((card) => {
    let nextId = card.id;
    if (usedIds.has(nextId)) {
      const sourceSuffix = card.sourceUrl.split("/").filter(Boolean).pop()?.replace(/[^a-z0-9]+/gi, "-").slice(-24) || "duplicado";
      nextId = `${nextId}-${sourceSuffix}`;
      let copy = 2;
      while (usedIds.has(nextId)) nextId = `${card.id}-${sourceSuffix}-${copy++}`;
    }
    usedIds.add(nextId);
    return nextId === card.id ? card : { ...card, id: nextId };
  });
}

export function loadBoard(fallback: BoardState): BoardState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const value = JSON.parse(raw) as BoardState;
    if (!Array.isArray(value.cards) || !Array.isArray(value.activities)) return fallback;
    return { ...value, cards: normalizeCards(value.cards) };
  } catch {
    return fallback;
  }
}

export function saveBoard(board: BoardState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
  } catch {
    // A interface em memória continua operando mesmo se o navegador bloquear o storage.
  }
}

export function clearBoard() {
  window.localStorage.removeItem(STORAGE_KEY);
}
