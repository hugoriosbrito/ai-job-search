import { columns } from "../data/demo";
import { cardStatusLabels, getCardStatus } from "./card-status";
import { getCardDocuments } from "./documents";
import type {
  Activity,
  AgentContext,
  AgentTool,
  AgentToolCall,
  BoardState,
  CardStatus,
  ColumnId,
  JobCard,
  Priority,
} from "../types";

export const agentTools: AgentTool[] = [
  {
    name: "get_board_context",
    description: "Lê o funil completo, o card aberto e as últimas ações feitas pelo usuário.",
    example: "get_board_context()",
    risk: "read",
  },
  {
    name: "move_card",
    description: "Move uma oportunidade entre as etapas do funil e registra a autoria da mudança.",
    example: 'move_card({ cardId: "...", columnId: "entrevista" })',
    risk: "write",
  },
  {
    name: "create_card",
    description: "Cria uma oportunidade a partir de uma vaga encontrada pelo scraper.",
    example: 'create_card({ company: "...", role: "...", score: 84 })',
    risk: "write",
  },
  {
    name: "update_card",
    description: "Atualiza notas, próxima ação, etiquetas, documentos ou detalhes da oportunidade.",
    example: 'update_card({ cardId: "...", nextAction: "..." })',
    risk: "write",
  },
  {
    name: "set_priority",
    description: "Define a prioridade operacional de uma candidatura.",
    example: 'set_priority({ cardId: "...", priority: "alta" })',
    risk: "write",
  },
  {
    name: "set_status",
    description: "Marca o resultado de uma oportunidade como encerrada, recusada, retirada ou contratada.",
    example: 'set_status({ cardId: "...", status: "rejected" })',
    risk: "write",
  },
  {
    name: "add_comment",
    description: "Registra uma observação da IA no histórico do card.",
    example: 'add_comment({ cardId: "...", comment: "..." })',
    risk: "write",
  },
  {
    name: "record_interview",
    description: "Registra uma etapa de entrevista, pauta e próximo passo.",
    example: 'record_interview({ cardId: "...", date: "2026-09-02", stage: "..." })',
    risk: "write",
  },
  {
    name: "archive_card",
    description: "Move uma oportunidade para o Arquivo sem apagar o histórico.",
    example: 'archive_card({ cardId: "..." })',
    risk: "write",
  },
  {
    name: "delete_card",
    description: "Exclui permanentemente uma oportunidade do quadro e registra a ação no histórico.",
    example: 'delete_card({ cardId: "..." })',
    risk: "write",
  },
];

const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const cardTitle = (card: JobCard) => `${card.company} · ${card.role}`;

const columnName = (id?: ColumnId) => columns.find((column) => column.id === id)?.title ?? "etapa desconhecida";

const activity = (
  actor: Activity["actor"],
  action: Activity["action"],
  card: JobCard | undefined,
  detail: string,
  extra: Pick<Activity, "fromColumn" | "toColumn"> = {},
): Activity => ({
  id: uid("activity"),
  actor,
  action,
  cardId: card?.id,
  cardTitle: card ? cardTitle(card) : "Pipeline",
  detail,
  createdAt: new Date().toISOString(),
  ...extra,
});

export function buildAgentContext(board: BoardState, selectedCardId?: string): AgentContext {
  const selectedCard = board.cards.find((card) => card.id === selectedCardId);
  const userMoves = board.activities.filter(
    (item) => item.actor === "user" && item.action === "move_card",
  );
  const openLoops = board.cards
    .filter((card) => card.columnId !== "encerrada" && getCardStatus(card) === "active" && card.nextAction)
    .sort((a, b) => {
      const priorityWeight: Record<Priority, number> = { urgente: 0, alta: 1, normal: 2, baixa: 3 };
      return priorityWeight[a.priority] - priorityWeight[b.priority];
    })
    .slice(0, 5);
  const boardSummary = columns.map((column) => ({
    columnId: column.id,
    title: column.title,
    count: board.cards.filter((card) => card.columnId === column.id).length,
  }));
  const selectedDocuments = selectedCard ? getCardDocuments(selectedCard) : [];

  const text = [
    `PIPELINE CONTEXT · gerado em ${new Date().toLocaleString("pt-BR")}`,
    `Cards ativos: ${board.cards.filter((card) => card.columnId !== "encerrada" && getCardStatus(card) === "active").length} de ${board.cards.length}`,
    `Resumo: ${boardSummary.map((item) => `${item.title}=${item.count}`).join(" | ")}`,
    selectedCard
      ? `Card em foco: ${cardTitle(selectedCard)} · etapa=${columnName(selectedCard.columnId)} · status=${cardStatusLabels[getCardStatus(selectedCard)]} · prioridade=${selectedCard.priority} · score=${selectedCard.score} · documentos=${selectedDocuments.length ? selectedDocuments.map((document) => `${document.label} (${document.href})`).join(", ") : "nenhum"}`
      : "Card em foco: nenhum",
    "ÚLTIMAS MOVIMENTAÇÕES FEITAS PELO USUÁRIO:",
    ...(userMoves.length
      ? userMoves.slice(0, 5).map((item) => `- ${item.cardTitle}: ${item.detail}`)
      : ["- Nenhuma movimentação manual registrada."]),
    "PRÓXIMOS PONTOS DE ATENÇÃO:",
    ...openLoops.map((card) => `- ${card.company}: ${card.nextAction} (${card.priority}, ${card.columnId})`),
  ].join("\n");

  return { generatedAt: new Date().toISOString(), selectedCard, userMoves, openLoops, boardSummary, text };
}

export function applyAgentTool(state: BoardState, call: AgentToolCall): { state: BoardState; message: string } {
  const now = new Date().toISOString();
  const args = call.args;
  const findCard = () => state.cards.find((card) => card.id === args.cardId);

  if (call.name === "get_board_context") {
    return { state, message: buildAgentContext(state, String(args.cardId ?? "")).text };
  }

  if (call.name === "create_card") {
    const company = String(args.company ?? "Nova empresa");
    const role = String(args.role ?? "Nova oportunidade");
    const newCard: JobCard = {
      id: uid("card"),
      company,
      role,
      location: String(args.location ?? "A confirmar"),
      mode: String(args.mode ?? "A confirmar"),
      portal: String(args.portal ?? "Importação IA"),
      score: Number(args.score ?? 0),
      columnId: (args.columnId as ColumnId) ?? "radar",
      status: "active",
      priority: (args.priority as Priority) ?? "normal",
      tags: Array.isArray(args.tags) ? args.tags.map(String) : ["Nova vaga"],
      nextAction: String(args.nextAction ?? "Avaliar aderência"),
      sourceUrl: String(args.sourceUrl ?? ""),
      fitSummary: String(args.fitSummary ?? "Aguardando avaliação de aderência."),
      notes: String(args.notes ?? ""),
      cvFile: typeof args.cvFile === "string" ? args.cvFile : undefined,
      coverLetterFile: typeof args.coverLetterFile === "string" ? args.coverLetterFile : undefined,
      documents: Array.isArray(args.documents) ? args.documents as JobCard["documents"] : undefined,
      origin: "tracker",
      updatedAt: now,
    };
    return {
      state: {
        ...state,
        cards: [newCard, ...state.cards],
        activities: [activity("agent", "create_card", newCard, "A IA criou este card a partir de uma oportunidade encontrada."), ...state.activities],
        lastSyncedAt: now,
      },
      message: `Card criado: ${cardTitle(newCard)}.`,
    };
  }

  const card = findCard();
  if (!card) return { state, message: "Não encontrei o card informado no contexto atual." };

  if (call.name === "move_card") {
    const target = args.columnId as ColumnId;
    if (!columns.some((column) => column.id === target)) return { state, message: "A etapa informada não existe." };
    const nextStatus: CardStatus = target === "encerrada" ? "archived" : getCardStatus(card) === "archived" ? "active" : getCardStatus(card);
    const updated = { ...card, columnId: target, status: nextStatus, updatedAt: now };
    return {
      state: {
        ...state,
        cards: state.cards.map((item) => (item.id === card.id ? updated : item)),
        activities: [
          activity("agent", "move_card", card, `A IA moveu o card de ${columnName(card.columnId)} para ${columnName(target)}.`, {
            fromColumn: card.columnId,
            toColumn: target,
          }),
          ...state.activities,
        ],
        lastSyncedAt: now,
      },
      message: `${card.company} foi movida para ${columnName(target)}.`,
    };
  }

  if (call.name === "set_priority") {
    const priority = args.priority as Priority;
    const updated = { ...card, priority, updatedAt: now };
    return {
      state: {
        ...state,
        cards: state.cards.map((item) => (item.id === card.id ? updated : item)),
        activities: [activity("agent", "set_priority", card, `A IA definiu a prioridade como ${priority}.`), ...state.activities],
        lastSyncedAt: now,
      },
      message: `Prioridade de ${card.company} definida como ${priority}.`,
    };
  }

  if (call.name === "set_status") {
    const status = args.status as CardStatus;
    if (!Object.prototype.hasOwnProperty.call(cardStatusLabels, status)) return { state, message: "O status informado não existe." };
    const nextColumn = status === "archived" ? "encerrada" : status === "active" && card.columnId === "encerrada" ? "radar" : card.columnId;
    const updated = { ...card, columnId: nextColumn, status, updatedAt: now };
    return {
      state: {
        ...state,
        cards: state.cards.map((item) => (item.id === card.id ? updated : item)),
        activities: [activity("agent", "set_status", card, `A IA marcou o card como ${cardStatusLabels[status]}.`), ...state.activities],
        lastSyncedAt: now,
      },
      message: `${card.company} agora está como ${cardStatusLabels[status]}.`,
    };
  }

  if (call.name === "archive_card") {
    const updated = { ...card, columnId: "encerrada" as const, status: "archived" as const, updatedAt: now };
    return {
      state: {
        ...state,
        cards: state.cards.map((item) => (item.id === card.id ? updated : item)),
        activities: [activity("agent", "archive_card", card, "A IA preservou o card no histórico e o moveu para o Arquivo."), ...state.activities],
        lastSyncedAt: now,
      },
      message: `${card.company} foi arquivada sem apagar o histórico.`,
    };
  }

  if (call.name === "delete_card") {
    return {
      state: {
        ...state,
        cards: state.cards.filter((item) => item.id !== card.id),
        activities: [activity("agent", "delete_card", card, "A IA excluiu permanentemente este card do quadro."), ...state.activities],
        lastSyncedAt: now,
      },
      message: `${card.company} foi excluída do quadro.`,
    };
  }

  if (call.name === "record_interview") {
    const updated = {
      ...card,
      columnId: "entrevista" as const,
      interview: {
        date: String(args.date ?? "A confirmar"),
        stage: String(args.stage ?? "Entrevista"),
        detail: String(args.detail ?? "Pauta a definir."),
        nextStep: String(args.nextStep ?? "Preparar perguntas."),
      },
      updatedAt: now,
    };
    return {
      state: {
        ...state,
        cards: state.cards.map((item) => (item.id === card.id ? updated : item)),
        activities: [activity("agent", "record_interview", card, `A IA registrou a etapa ${updated.interview.stage} e moveu o card para Entrevista.`), ...state.activities],
        lastSyncedAt: now,
      },
      message: `Entrevista registrada para ${card.company}.`,
    };
  }

  if (call.name === "add_comment") {
    const comment = String(args.comment ?? "Observação registrada pela IA.");
    const updated = { ...card, notes: `${card.notes}\n${comment}`.trim(), updatedAt: now };
    return {
      state: {
        ...state,
        cards: state.cards.map((item) => (item.id === card.id ? updated : item)),
        activities: [activity("agent", "add_comment", card, `A IA adicionou uma observação: ${comment}`), ...state.activities],
        lastSyncedAt: now,
      },
      message: `Observação adicionada em ${card.company}.`,
    };
  }

  if (call.name === "update_card") {
    const patch = Object.fromEntries(
      Object.entries(args).filter(([key]) => key !== "cardId"),
    ) as Partial<JobCard>;
    const updated = { ...card, ...patch, updatedAt: now };
    return {
      state: {
        ...state,
        cards: state.cards.map((item) => (item.id === card.id ? updated : item)),
        activities: [activity("agent", "update_card", card, "A IA atualizou os detalhes deste card."), ...state.activities],
        lastSyncedAt: now,
      },
      message: `Detalhes de ${card.company} atualizados.`,
    };
  }

  return { state, message: "Tool não implementada." };
}

export function parseCommand(input: string, cards: JobCard[]): AgentToolCall | undefined {
  const normalized = input.toLocaleLowerCase("pt-BR");
  const card = cards.find((item) => normalized.includes(item.company.toLocaleLowerCase("pt-BR")) || normalized.includes(item.role.toLocaleLowerCase("pt-BR")));
  if (!card) return undefined;

  if (normalized.includes("exclu") || normalized.includes("delet") || normalized.includes("apagu")) return { name: "delete_card", args: { cardId: card.id } };
  if (normalized.includes("arquiv")) return { name: "archive_card", args: { cardId: card.id } };
  if (normalized.includes("recus")) return { name: "set_status", args: { cardId: card.id, status: "rejected" } };
  if (normalized.includes("retir") || normalized.includes("desist")) return { name: "set_status", args: { cardId: card.id, status: "withdrawn" } };
  if (normalized.includes("contrat") || normalized.includes("aceit")) return { name: "set_status", args: { cardId: card.id, status: "hired" } };
  if (normalized.includes("encerr") || normalized.includes("fechad")) return { name: "set_status", args: { cardId: card.id, status: "closed" } };
  if (normalized.includes("em andamento") || normalized.includes("reativ")) return { name: "set_status", args: { cardId: card.id, status: "active" } };
  if (normalized.includes("entrevista")) return { name: "move_card", args: { cardId: card.id, columnId: "entrevista" } };
  if (normalized.includes("oferta")) return { name: "move_card", args: { cardId: card.id, columnId: "oferta" } };
  if (normalized.includes("prioridade") || normalized.includes("prioriz")) return { name: "set_priority", args: { cardId: card.id, priority: normalized.includes("urg") ? "urgente" : "alta" } };
  if (normalized.includes("nota") || normalized.includes("coment")) return { name: "add_comment", args: { cardId: card.id, comment: input } };
  return { name: "get_board_context", args: { cardId: card.id } };
}
