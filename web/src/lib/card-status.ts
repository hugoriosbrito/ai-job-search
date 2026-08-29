import type { CardStatus, JobCard } from "../types";

export const cardStatusLabels: Record<CardStatus, string> = {
  active: "Em andamento",
  closed: "Encerrada",
  rejected: "Recusada",
  withdrawn: "Retirada",
  hired: "Contratada",
  archived: "Arquivada",
};

export const cardStatusOptions = Object.entries(cardStatusLabels).map(([value, label]) => ({
  value: value as CardStatus,
  label,
}));

export function getCardStatus(card: Pick<JobCard, "status" | "columnId">): CardStatus {
  return card.status ?? (card.columnId === "encerrada" ? "archived" : "active");
}

export function isFinalCardStatus(status: CardStatus) {
  return status !== "active";
}
