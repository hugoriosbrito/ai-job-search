import type { JobCard } from "../types";
import { getCardStatus } from "./card-status";

const blockedSignals: Array<[RegExp, string]> = [
  [/bloquead|block(ed)?/i, "Bloqueada na busca"],
  [/indispon|encerrad|closed|expired|expirad|rejeitad|rejected/i, "Vaga encerrada"],
  [/reloca|localiza(ção|cao)|presencial|fora de salvador/i, "Localização"],
  [/idioma|language|ingl[eê]s fluente|portugu[eê]s fluente/i, "Idioma exigido"],
  [/n[aã]o eleg[ií]vel|ineligible|fora do perfil/i, "Fora dos critérios"],
];

export function getAvailability(card: JobCard): "available" | "blocked" {
  if (card.columnId === "encerrada" || getCardStatus(card) !== "active") return "blocked";
  if (card.availability) return card.availability;
  const text = `${card.location} ${card.fitSummary} ${card.notes}`;
  return blockedSignals.some(([signal]) => signal.test(text)) ? "blocked" : "available";
}

export function getBlockReason(card: JobCard) {
  if (card.blockReason) return card.blockReason;
  if (card.columnId === "encerrada") return getCardStatus(card) === "archived" ? "Arquivada" : "Vaga encerrada";
  if (getCardStatus(card) !== "active") return getCardStatus(card) === "rejected" ? "Vaga recusada" : getCardStatus(card) === "withdrawn" ? "Candidatura retirada" : getCardStatus(card) === "hired" ? "Contratação concluída" : "Vaga encerrada";
  const text = `${card.location} ${card.fitSummary} ${card.notes}`;
  return blockedSignals.find(([signal]) => signal.test(text))?.[1] ?? "Bloqueada na busca";
}
