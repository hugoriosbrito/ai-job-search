import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent } from "react";
import { Icon } from "./components/Icon";
import { columns, demoBoard } from "./data/demo";
import { applyAgentTool, buildAgentContext, parseCommand } from "./lib/agent-tools";
import { getAvailability, getBlockReason } from "./lib/availability";
import { cardStatusLabels, cardStatusOptions, getCardStatus } from "./lib/card-status";
import { getCardDocuments } from "./lib/documents";
import type { ResolvedJobDocument } from "./lib/documents";
import { sourceUrlForCard } from "./lib/source-links";
import { parseTracker } from "./lib/tracker-import";
import { loadBoard, saveBoard } from "./lib/storage";
import type {
  Activity,
  AppView,
  BoardState,
  CardStatus,
  ColumnId,
  JobCard,
  Priority,
} from "./types";

const STORAGE_KEY = "ai-job-search-kanban:v1";
const COLUMN_WIDTH_KEY = "ai-job-search-kanban:column-widths:v1";
const DEFAULT_COLUMN_WIDTH = 236;
const COLUMN_GAP = 14;
const MIN_COLUMN_WIDTH = 140;
const MAX_COLUMN_WIDTH = 420;

const priorityLabels: Record<Priority, string> = {
  urgente: "Urgente",
  alta: "Alta",
  normal: "Normal",
  baixa: "Baixa",
};

const actorLabels = { user: "Você", agent: "IA", system: "Sistema" } as const;

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function columnTitle(columnId: ColumnId) {
  return columns.find((column) => column.id === columnId)?.title ?? columnId;
}

function formatDate(value?: string) {
  if (!value) return "Sem prazo";
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date).replace(" de ", " ");
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "agora";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date).replace(" de ", " ");
}

function initials(company: string) {
  return company.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function availabilityLabel(card: JobCard) {
  return getAvailability(card) === "available" ? "Disponível" : getBlockReason(card);
}

function faviconUrl(sourceUrl?: string) {
  if (!sourceUrl) return undefined;
  try {
    const hostname = new URL(sourceUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
  } catch {
    return undefined;
  }
}

function usableSourceUrl(sourceUrl?: string) {
  if (!sourceUrl) return undefined;
  try {
    const url = new URL(sourceUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function sourceLinkLabel(sourceUrl?: string) {
  const usable = usableSourceUrl(sourceUrl);
  if (!usable) return "Link indisponível";
  try {
    const url = new URL(usable);
    return url.pathname === "/" || url.pathname === "" ? "Abrir fonte" : "Abrir vaga";
  } catch {
    return "Abrir fonte";
  }
}

function loadColumnWidths(): Record<ColumnId, number> {
  const defaults = Object.fromEntries(columns.map((column) => [column.id, DEFAULT_COLUMN_WIDTH])) as Record<ColumnId, number>;
  try {
    const saved = JSON.parse(window.localStorage.getItem(COLUMN_WIDTH_KEY) ?? "{}");
    for (const column of columns) {
      const width = Number(saved?.[column.id]);
      if (Number.isFinite(width)) defaults[column.id] = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, width));
    }
  } catch {
    return defaults;
  }
  return defaults;
}

function fitColumnWidths(widths: Record<ColumnId, number>, containerWidth: number) {
  if (!containerWidth) return widths;
  const availableWidth = Math.max(0, containerWidth - COLUMN_GAP * (columns.length - 1));
  const totalWidth = columns.reduce((total, column) => total + (widths[column.id] ?? DEFAULT_COLUMN_WIDTH), 0);
  if (totalWidth <= availableWidth) return widths;
  const scale = availableWidth / totalWidth;
  return columns.reduce((fitted, column) => {
    fitted[column.id] = Math.max(1, Math.floor((widths[column.id] ?? DEFAULT_COLUMN_WIDTH) * scale));
    return fitted;
  }, {} as Record<ColumnId, number>);
}

function addActivity(state: BoardState, item: Omit<Activity, "id" | "createdAt">): BoardState {
  const timestamp = now();
  return {
    ...state,
    lastSyncedAt: timestamp,
    activities: [{ ...item, id: id("activity"), createdAt: timestamp }, ...state.activities].slice(0, 80),
  };
}

function App() {
  const [board, setBoard] = useState<BoardState>(() => loadBoard(demoBoard));
  const [view, setView] = useState<AppView>("board");
  const [query, setQuery] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState<"all" | "available" | "blocked">("all");
  const [priorityOnly, setPriorityOnly] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [columnWidths, setColumnWidths] = useState<Record<ColumnId, number>>(loadColumnWidths);
  const [kanbanWidth, setKanbanWidth] = useState(0);
  const [selectedCardId, setSelectedCardId] = useState<string | undefined>("localiza-engenheiro-dados");
  const [draggingId, setDraggingId] = useState<string | undefined>();
  const [isComposerOpen, setComposerOpen] = useState(false);
  const [composerColumn, setComposerColumn] = useState<ColumnId>("radar");
  const [isContextOpen, setContextOpen] = useState(false);
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [command, setCommand] = useState("");
  const [toast, setToast] = useState<string | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const kanbanScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.localStorage.getItem(STORAGE_KEY)) return;
    fetch("/tracker.json")
      .then((response) => (response.ok ? response.json() as Promise<JobCard[]> : Promise.reject(new Error("tracker ausente"))))
      .then((importedCards) => {
        if (!importedCards.length) return;
        const normalizedCards = importedCards.map((card) => ({
          ...card,
          sourceUrl: sourceUrlForCard(card) ?? "",
          status: getCardStatus(card),
        }));
        setBoard((current) => ({
          ...current,
          cards: normalizedCards,
          activities: [{ id: id("activity"), actor: "system", action: "import_tracker", cardTitle: "Importação inicial", detail: `${normalizedCards.length} oportunidades carregadas do arquivo local.`, createdAt: now() }, ...current.activities],
          lastSyncedAt: now(),
        }));
        setToast(`${importedCards.length} oportunidades carregadas.`);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => saveBoard(board), [board]);

  useEffect(() => {
    window.localStorage.setItem(COLUMN_WIDTH_KEY, JSON.stringify(columnWidths));
  }, [columnWidths]);

  useEffect(() => {
    const element = kanbanScrollRef.current;
    if (!element) return;
    const updateWidth = () => setKanbanWidth(element.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(undefined), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen(true);
      }
      if (event.key === "Escape") setCommandPaletteOpen(false);
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const selectedCard = board.cards.find((card) => card.id === selectedCardId);
  const agentContext = useMemo(() => buildAgentContext(board, selectedCardId), [board, selectedCardId]);
  const fittedColumnWidths = useMemo(() => fitColumnWidths(columnWidths, kanbanWidth), [columnWidths, kanbanWidth]);
  const userMoves = board.activities.filter((activity) => activity.actor === "user" && activity.action === "move_card");

  const filteredCards = (columnId: ColumnId) => board.cards
    .filter((card) => card.columnId === columnId)
    .filter((card) => {
      const haystack = `${card.company} ${card.role}`.toLocaleLowerCase("pt-BR");
      const matchesQuery = !query || haystack.includes(query.toLocaleLowerCase("pt-BR"));
      const matchesAvailability = availabilityFilter === "all" || getAvailability(card) === availabilityFilter;
      const hasUserActivity = board.activities.some((activity) => activity.actor === "user" && activity.cardId === card.id);
      const matchesPriority = !priorityOnly || card.priority === "alta" || card.priority === "urgente";
      const matchesMine = !mineOnly || hasUserActivity;
      return matchesQuery && matchesAvailability && matchesPriority && matchesMine;
    });

  const visibleCardCount = columns.reduce((total, column) => total + filteredCards(column.id).length, 0);

  const showToast = (message: string) => setToast(message);

  const moveCard = (cardId: string, targetColumnId: ColumnId, actor: "user" | "agent" = "user") => {
    setBoard((current) => {
      const card = current.cards.find((item) => item.id === cardId);
      if (!card || card.columnId === targetColumnId) return current;
      const status = targetColumnId === "encerrada" ? "archived" : getCardStatus(card) === "archived" ? "active" : getCardStatus(card);
      const updatedCard = { ...card, columnId: targetColumnId, status, updatedAt: now() };
      const updated = { ...current, cards: current.cards.map((item) => item.id === cardId ? updatedCard : item) };
      return addActivity(updated, {
        actor,
        action: "move_card",
        cardId,
        cardTitle: `${card.company} · ${card.role}`,
        detail: actor === "user" ? `Você moveu o card de ${columnTitle(card.columnId)} para ${columnTitle(targetColumnId)}.` : `A IA moveu o card de ${columnTitle(card.columnId)} para ${columnTitle(targetColumnId)}.`,
        fromColumn: card.columnId,
        toColumn: targetColumnId,
      });
    });
    setSelectedCardId(cardId);
    showToast(`${actor === "user" ? "Você moveu" : "A IA moveu"} o card para ${columnTitle(targetColumnId)}.`);
  };

  const executeTool = (name: Parameters<typeof applyAgentTool>[1]["name"], args: Record<string, unknown>) => {
    const result = applyAgentTool(board, { name, args });
    setBoard(result.state);
    if (name === "delete_card" && args.cardId === selectedCardId) setSelectedCardId(undefined);
    showToast(result.message);
  };

  const runCommand = (event: FormEvent) => {
    event.preventDefault();
    if (!command.trim()) return;
    const call = parseCommand(command, board.cards);
    if (!call) {
      showToast("Mencione o nome da empresa ou cargo para eu localizar o card.");
      return;
    }
    if (call.name === "get_board_context") {
      setContextOpen(true);
      setCommandPaletteOpen(false);
      setCommand("");
      return;
    }
    executeTool(call.name, call.args);
    setCommandPaletteOpen(false);
    setCommand("");
  };

  const updatePriority = (cardId: string, priority: Priority, actor: "user" | "agent" = "user") => {
    setBoard((current) => {
      const card = current.cards.find((item) => item.id === cardId);
      if (!card || card.priority === priority) return current;
      const updatedCard = { ...card, priority, updatedAt: now() };
      const updated = { ...current, cards: current.cards.map((item) => item.id === cardId ? updatedCard : item) };
      return addActivity(updated, {
        actor,
        action: "set_priority",
        cardId,
        cardTitle: `${card.company} · ${card.role}`,
        detail: `${actor === "user" ? "Você definiu" : "A IA definiu"} a prioridade como ${priorityLabels[priority]}.`,
      });
    });
    showToast(`Prioridade ${priorityLabels[priority].toLocaleLowerCase("pt-BR")} definida.`);
  };

  const updateStatus = (cardId: string, status: CardStatus) => {
    setBoard((current) => {
      const card = current.cards.find((item) => item.id === cardId);
      if (!card || getCardStatus(card) === status) return current;
      const nextColumn = status === "archived" ? "encerrada" : status === "active" && card.columnId === "encerrada" ? "radar" : card.columnId;
      const updatedCard = { ...card, status, columnId: nextColumn, updatedAt: now() };
      const updated = { ...current, cards: current.cards.map((item) => item.id === cardId ? updatedCard : item) };
      return addActivity(updated, {
        actor: "user",
        action: "set_status",
        cardId,
        cardTitle: `${card.company} · ${card.role}`,
        detail: `Você marcou o card como ${cardStatusLabels[status]}.`,
      });
    });
    showToast(`Status definido como ${cardStatusLabels[status].toLocaleLowerCase("pt-BR")}.`);
  };

  const archiveCard = (cardId: string) => {
    setBoard((current) => {
      const card = current.cards.find((item) => item.id === cardId);
      if (!card) return current;
      const updatedCard = { ...card, columnId: "encerrada" as const, status: "archived" as const, updatedAt: now() };
      const updated = { ...current, cards: current.cards.map((item) => item.id === cardId ? updatedCard : item) };
      return addActivity(updated, {
        actor: "user",
        action: "archive_card",
        cardId,
        cardTitle: `${card.company} · ${card.role}`,
        detail: "Você arquivou o card e preservou seu histórico.",
        fromColumn: card.columnId,
        toColumn: "encerrada",
      });
    });
    setSelectedCardId(undefined);
    showToast("Card arquivado no histórico.");
  };

  const deleteCard = (cardId: string) => {
    const card = board.cards.find((item) => item.id === cardId);
    if (!card || !window.confirm(`Excluir permanentemente ${card.company} · ${card.role}?`)) return;
    setBoard((current) => addActivity({ ...current, cards: current.cards.filter((item) => item.id !== cardId) }, {
      actor: "user",
      action: "delete_card",
      cardId,
      cardTitle: `${card.company} · ${card.role}`,
      detail: "Você excluiu permanentemente este card do quadro.",
    }));
    setSelectedCardId(undefined);
    showToast("Card excluído do quadro.");
  };

  const updateTags = (cardId: string, tags: string[]) => {
    const normalizedTags = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 12);
    setBoard((current) => {
      const card = current.cards.find((item) => item.id === cardId);
      if (!card || card.tags.join("|") === normalizedTags.join("|")) return current;
      const updatedCard = { ...card, tags: normalizedTags, updatedAt: now() };
      const updated = { ...current, cards: current.cards.map((item) => item.id === cardId ? updatedCard : item) };
      return addActivity(updated, {
        actor: "user",
        action: "update_card",
        cardId,
        cardTitle: `${card.company} · ${card.role}`,
        detail: normalizedTags.length ? `Você atualizou as tags: ${normalizedTags.join(", ")}.` : "Você removeu as tags deste card.",
      });
    });
    showToast("Tags atualizadas.");
  };

  const createCard = (values: { company: string; role: string; columnId: ColumnId; score: number }) => {
    const created: JobCard = {
      id: id("card"),
      company: values.company,
      role: values.role,
      location: "A confirmar",
      mode: "A confirmar",
      portal: "Entrada manual",
      score: values.score,
      columnId: values.columnId,
      status: "active",
      priority: values.score >= 85 ? "alta" : "normal",
      tags: ["Nova oportunidade"],
      nextAction: "Avaliar aderência",
      sourceUrl: "",
      fitSummary: "Card criado manualmente. Adicione uma nota de aderência para orientar a IA.",
      notes: "",
      origin: "demo",
      updatedAt: now(),
    };
    setBoard((current) => addActivity({ ...current, cards: [created, ...current.cards] }, {
      actor: "user",
      action: "create_card",
      cardId: created.id,
      cardTitle: `${created.company} · ${created.role}`,
      detail: "Você criou este card manualmente.",
    }));
    setSelectedCardId(created.id);
    setComposerOpen(false);
    showToast(`Nova oportunidade adicionada em ${columnTitle(values.columnId)}.`);
  };

  const handleImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = parseTracker(String(reader.result ?? ""));
        setBoard((current) => {
          const existingByKey = new Map(current.cards.map((card) => [`${card.company}|${card.role}`, card]));
          const merged = imported.map((card) => {
            const previous = existingByKey.get(`${card.company}|${card.role}`);
            return previous ? { ...card, id: previous.id, columnId: previous.columnId, status: previous.status, priority: previous.priority, notes: previous.notes || card.notes, interview: previous.interview, updatedAt: now() } : card;
          });
          return addActivity({ ...current, cards: merged }, {
            actor: "system",
            action: "import_tracker",
            cardTitle: "Importação CSV",
            detail: `Importação manual concluída com ${merged.length} oportunidades.`,
          });
        });
        showToast(`${imported.length} oportunidades importadas. O histórico foi preservado.`);
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Não foi possível importar o tracker.");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file, "utf-8");
  };

  const handleDragStart = (event: DragEvent<HTMLDivElement>, cardId: string) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", cardId);
    setDraggingId(cardId);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, columnId: ColumnId) => {
    event.preventDefault();
    const cardId = event.dataTransfer.getData("text/plain") || draggingId;
    if (cardId) moveCard(cardId, columnId);
    setDraggingId(undefined);
  };

  const startColumnResize = (event: React.PointerEvent<HTMLButtonElement>, columnId: ColumnId) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = fittedColumnWidths[columnId] ?? columnWidths[columnId] ?? DEFAULT_COLUMN_WIDTH;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, startWidth + moveEvent.clientX - startX));
      setColumnWidths((current) => current[columnId] === nextWidth ? current : { ...current, [columnId]: nextWidth });
    };
    const handlePointerUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
  };

  const adjustColumnWidth = (columnId: ColumnId, amount: number) => {
    setColumnWidths((current) => ({ ...current, [columnId]: Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, current[columnId] + amount)) }));
  };

  return (
    <div className="app-shell">
      <main className="main-content">
        <header className="site-header">
          <strong className="site-header-name">Candidaturas</strong>
          <div className="header-actions">
            <button className="command-launcher" onClick={() => setCommandPaletteOpen(true)}><Icon name="search" size={15} /> Comandos <kbd>⌘K</kbd></button>
            <button className="theme-toggle" onClick={() => setTheme((value) => value === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}><Icon name={theme === "dark" ? "sun" : "moon"} size={16} /></button>
          </div>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div className="intro-copy"><span className="intro-count">{view === "board" ? `${visibleCardCount} oportunidades` : `${board.activities.length} alterações`}</span><h1>{view === "board" ? "Oportunidades" : "Atividade"}</h1></div>
            {view === "board" && <div className="heading-actions"><input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleImport} hidden /><button className="button button--quiet" onClick={() => fileInputRef.current?.click()}><Icon name="upload" size={16} /> Importar CSV</button><button className="button button--primary" onClick={() => { setComposerColumn("radar"); setComposerOpen(true); }}><Icon name="plus" size={16} /> Nova inscrição</button></div>}
          </section>

          {view === "board" && <>
            <section className="board-toolbar">
              <div className="board-toolbar-label">Quadro de candidaturas</div>
              <div className="board-controls"><label className="search-field"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar empresa ou cargo" /></label><div className="filter-select"><span>Disponibilidade</span><Dropdown ariaLabel="Disponibilidade" value={availabilityFilter} options={[{ value: "all", label: "Todas" }, { value: "available", label: "Disponíveis" }, { value: "blocked", label: "Bloqueadas" }]} onChange={setAvailabilityFilter} /></div><button className={priorityOnly ? "filter-pill filter-pill--active" : "filter-pill"} onClick={() => setPriorityOnly((value) => !value)}><Icon name="flag" size={14} /> Prioridade</button><button className={mineOnly ? "filter-pill filter-pill--active" : "filter-pill"} onClick={() => setMineOnly((value) => !value)}><Icon name="user" size={14} /> Movidos por mim</button></div>
            </section>

            <section className="kanban-wrap" aria-label="Quadro kanban">
              <div className="kanban-header"><strong>{visibleCardCount} oportunidades</strong><span>Arraste os cards para mudar de etapa</span></div>
              <div className="kanban-scroll" ref={kanbanScrollRef}>
                <div className="kanban-board" style={{ gridTemplateColumns: columns.map((column) => `${fittedColumnWidths[column.id]}px`).join(" ") }}>
                  {columns.map((column) => <KanbanColumn key={column.id} column={column} cards={filteredCards(column.id)} draggingId={draggingId} selectedCardId={selectedCardId} onCardClick={setSelectedCardId} onDragStart={handleDragStart} onDrop={handleDrop} onDragEnd={() => setDraggingId(undefined)} onAdd={(columnId) => { setComposerColumn(columnId); setComposerOpen(true); }} onResizeStart={startColumnResize} onResizeKey={(columnId, amount) => adjustColumnWidth(columnId, amount)} />)}
                </div>
              </div>
            </section>
          </>}

          {view === "activity" && <ActivityView activities={board.activities} onCardClick={(cardId) => { if (board.cards.some((card) => card.id === cardId)) { setSelectedCardId(cardId); setView("board"); } else showToast("O card não está mais no quadro; a atividade foi preservada no histórico."); }} />}
        </div>

        <nav className="portfolio-dock" aria-label="Navegação do quadro">
          <button className={view === "board" ? "dock-item dock-item--active" : "dock-item"} onClick={() => setView("board")}><Icon name="grid" size={16} /> Quadro</button>
          <button className={view === "activity" ? "dock-item dock-item--active" : "dock-item"} onClick={() => setView("activity")}><Icon name="activity" size={16} /> Atividade <span>{board.activities.length}</span></button>
          <button className="dock-item" onClick={() => setContextOpen(true)}><Icon name="spark" size={16} /> Contexto</button>
        </nav>
      </main>

      {selectedCard && <CardDrawer card={selectedCard} onClose={() => setSelectedCardId(undefined)} onMove={(target) => moveCard(selectedCard.id, target)} onPriority={(priority) => updatePriority(selectedCard.id, priority)} onStatus={(status) => updateStatus(selectedCard.id, status)} onTags={(tags) => updateTags(selectedCard.id, tags)} onArchive={() => archiveCard(selectedCard.id)} onDelete={() => deleteCard(selectedCard.id)} />}
      {isComposerOpen && <CreateCardModal initialColumnId={composerColumn} onClose={() => setComposerOpen(false)} onCreate={createCard} />}
      {isContextOpen && <ContextModal context={agentContext} onClose={() => setContextOpen(false)} />}
      {isCommandPaletteOpen && <CommandPalette selectedCard={selectedCard} command={command} onCommandChange={setCommand} onSubmit={runCommand} onClose={() => setCommandPaletteOpen(false)} />}
      {toast && <div className="toast"><span className="toast-icon"><Icon name="check" size={15} /></span>{toast}</div>}
    </div>
  );
}

function KanbanColumn({ column, cards, draggingId, selectedCardId, onCardClick, onDragStart, onDrop, onDragEnd, onAdd, onResizeStart, onResizeKey }: { column: typeof columns[number]; cards: JobCard[]; draggingId?: string; selectedCardId?: string; onCardClick: (id: string) => void; onDragStart: (event: DragEvent<HTMLDivElement>, cardId: string) => void; onDrop: (event: DragEvent<HTMLDivElement>, columnId: ColumnId) => void; onDragEnd: () => void; onAdd: (columnId: ColumnId) => void; onResizeStart: (event: React.PointerEvent<HTMLButtonElement>, columnId: ColumnId) => void; onResizeKey: (columnId: ColumnId, amount: number) => void }) {
  return <div className={`kanban-column ${draggingId ? "kanban-column--ready" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDrop(event, column.id)}>
    <div className="column-heading"><div><strong>{column.title}</strong><b>{cards.length}</b></div><button className="icon-button icon-button--small" onClick={() => onAdd(column.id)} aria-label={`Adicionar em ${column.title}`}><Icon name="plus" size={15} /></button></div>
    <p className="column-helper">{column.helper}</p>
    <div className="column-cards">{cards.map((card) => <KanbanCard key={card.id} card={card} selected={card.id === selectedCardId} dragging={card.id === draggingId} onClick={() => onCardClick(card.id)} onDragStart={onDragStart} onDragEnd={onDragEnd} />)}{cards.length === 0 && <button className="empty-column" onClick={() => onAdd(column.id)}><Icon name="plus" size={15} /> Adicionar oportunidade</button>}</div>
    <button type="button" className="column-resize-handle" aria-label={`Redimensionar coluna ${column.title}`} title="Arraste para redimensionar" onPointerDown={(event) => onResizeStart(event, column.id)} onKeyDown={(event) => { if (event.key === "ArrowLeft") { event.preventDefault(); onResizeKey(column.id, -12); } if (event.key === "ArrowRight") { event.preventDefault(); onResizeKey(column.id, 12); } }} />
  </div>;
}

function CompanyAvatar({ card, large = false }: { card: JobCard; large?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  const iconUrl = faviconUrl(card.sourceUrl);
  return <span className={`company-avatar ${large ? "company-avatar--large" : ""}`} aria-label={`Ícone de ${card.company}`}>
    {iconUrl && !imageFailed ? <img src={iconUrl} alt="" loading="lazy" decoding="async" onError={() => setImageFailed(true)} /> : initials(card.company)}
  </span>;
}

function Dropdown<T extends string>({ value, options, onChange, ariaLabel }: { value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void; ariaLabel: string }) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return <div className="dropdown" ref={dropdownRef}>
    <button type="button" className="dropdown-trigger" aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel} onClick={() => setOpen((current) => !current)}>
      <span>{selected?.label}</span><Icon name="chevron-down" size={14} />
    </button>
    {open && <div className="dropdown-menu" role="listbox" aria-label={ariaLabel}>{options.map((option) => <button type="button" role="option" aria-selected={option.value === value} className={option.value === value ? "dropdown-option dropdown-option--selected" : "dropdown-option"} key={option.value} onClick={() => { onChange(option.value); setOpen(false); }}>{option.label}</button>)}</div>}
  </div>;
}

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const addTag = () => {
    const tag = draft.trim();
    if (!tag || tags.includes(tag)) return;
    onChange([...tags, tag]);
    setDraft("");
  };
  return <div className="drawer-block tag-editor"><div className="drawer-block-title"><span>Tags</span><span>{tags.length}</span></div><div className="tag-list">{tags.map((tag) => <span className="tag-chip" key={tag}>{tag}<button type="button" onClick={() => onChange(tags.filter((item) => item !== tag))} aria-label={`Remover tag ${tag}`}><Icon name="x" size={12} /></button></span>)}</div><form className="tag-form" onSubmit={(event) => { event.preventDefault(); addTag(); }}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Adicionar tag" aria-label="Nova tag" /><button type="submit" className="tag-add">Adicionar</button></form></div>;
}

function DocumentDownloadLink({ document, compact = false }: { document: ResolvedJobDocument; compact?: boolean }) {
  const external = /^(https?:|blob:|data:)/i.test(document.href);
  const shortLabel = document.kind === "cv" ? "CV" : document.kind === "cover_letter" ? "Carta" : document.label;
  return <a className={compact ? "card-document-link" : "document-link"} href={document.href} download={external ? undefined : document.downloadName} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} draggable={false} aria-label={`Baixar ${document.label}`} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>{compact ? <><Icon name="download" size={12} /> {shortLabel}</> : <><span className="document-link-icon"><Icon name="download" size={15} /></span><span className="document-link-copy"><strong>{document.label}</strong><small>{document.downloadName}</small></span><Icon name="arrow-up-right" size={14} /></>}</a>;
}

function KanbanCard({ card, selected, dragging, onClick, onDragStart, onDragEnd }: { card: JobCard; selected: boolean; dragging: boolean; onClick: () => void; onDragStart: (event: DragEvent<HTMLDivElement>, cardId: string) => void; onDragEnd: () => void }) {
  const scoreClass = card.score >= 85 ? "score--strong" : card.score >= 70 ? "score--good" : "score--weak";
  const status = getCardStatus(card);
  const documents = getCardDocuments(card);
  return <div className={`kanban-card ${selected ? "kanban-card--selected" : ""} ${dragging ? "kanban-card--dragging" : ""}`} draggable onClick={onClick} onDragStart={(event) => onDragStart(event, card.id)} onDragEnd={onDragEnd} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onClick(); }}>
    <div className="card-topline"><CompanyAvatar card={card} /><span className="card-company">{card.company}</span><span className={`priority-indicator priority-indicator--${card.priority}`} title={`Prioridade ${priorityLabels[card.priority]}`}><Icon name="flag" size={12} /></span><Icon name="more" size={16} /></div>
    <h3>{card.role}</h3>
    <div className="card-meta"><span><Icon name="link" size={12} /> {card.portal}</span><span><Icon name="clock" size={12} /> {card.mode}</span></div>
    <div className="fit-line"><span>Aderência</span><strong className={scoreClass}>{card.score}<small>/100</small></strong><div className="fit-track"><i style={{ width: `${Math.min(card.score, 100)}%` }} /></div></div>
    {documents.length > 0 && <div className="card-document-links" aria-label="Arquivos da candidatura">{documents.map((document) => <DocumentDownloadLink key={`${document.kind}-${document.file}`} document={document} compact />)}</div>}
    {status !== "active" && <div className={`card-status card-status--${status}`}>{cardStatusLabels[status]}</div>}
    <div className="card-footer"><span className={card.dueDate ? "due-date" : "due-date due-date--muted"}><Icon name="calendar" size={13} /> {formatDate(card.dueDate)}</span><span className={`availability availability--${getAvailability(card)}`}>{availabilityLabel(card)}</span></div>
  </div>;
}

function ActivityView({ activities, onCardClick }: { activities: Activity[]; onCardClick: (cardId: string) => void }) {
  return <section className="activity-page"><div className="activity-summary">{activities.length} alterações registradas</div><div className="activity-list">{activities.map((item) => <div className={`activity-row activity-row--${item.actor}`} key={item.id}><div className="activity-time">{formatTimestamp(item.createdAt)}</div><div className={`activity-avatar activity-avatar--${item.actor}`}><Icon name={item.actor === "user" ? "user" : item.actor === "agent" ? "spark" : "activity"} size={14} /></div><div className="activity-copy"><div><strong>{actorLabels[item.actor]}</strong><span className="activity-action">{item.action.replace("_", " ")}</span></div><p>{item.detail}</p>{item.cardId && <button className="activity-card-link" onClick={() => onCardClick(item.cardId!)}>{item.cardTitle} <Icon name="arrow-up-right" size={13} /></button>}</div></div>)}</div></section>;
}


function CardDrawer({ card, onClose, onMove, onPriority, onStatus, onTags, onArchive, onDelete }: { card: JobCard; onClose: () => void; onMove: (columnId: ColumnId) => void; onPriority: (priority: Priority) => void; onStatus: (status: CardStatus) => void; onTags: (tags: string[]) => void; onArchive: () => void; onDelete: () => void }) {
  const documents = getCardDocuments(card);
  const sourceUrl = usableSourceUrl(sourceUrlForCard(card));
  const status = getCardStatus(card);
  return <div className="drawer-backdrop" onClick={onClose}><aside className="card-drawer" onClick={(event) => event.stopPropagation()}><div className="drawer-top"><strong>Detalhes da oportunidade</strong><button className="icon-button" onClick={onClose} aria-label="Fechar detalhes"><Icon name="x" size={18} /></button></div><div className="drawer-company"><CompanyAvatar card={card} large /><div><strong>{card.company}</strong><small>{card.portal} · {card.location}</small></div></div><h2>{card.role}</h2><div className="drawer-score"><div><span>Score de aderência</span><strong>{card.score}<small>/100</small></strong></div><div className="drawer-score-bar"><i style={{ width: `${card.score}%` }} /></div></div><div className="drawer-fields"><div><span>Etapa</span><Dropdown ariaLabel="Etapa" value={card.columnId} options={columns.map((column) => ({ value: column.id, label: column.title }))} onChange={onMove} /></div><div><span>Status</span><Dropdown ariaLabel="Status" value={status} options={cardStatusOptions} onChange={onStatus} /></div><div><span>Prioridade</span><Dropdown ariaLabel="Prioridade" value={card.priority} options={Object.entries(priorityLabels).map(([value, label]) => ({ value: value as Priority, label }))} onChange={onPriority} /></div><div><span>Próxima ação</span><strong>{card.nextAction}</strong></div><div><span>Disponibilidade</span><strong className={`availability availability--${getAvailability(card)}`}>{availabilityLabel(card)}</strong></div></div><div className="drawer-block"><div className="drawer-block-title"><span>Leitura de aderência</span><span className="score-chip">{card.score} pts</span></div><p>{card.fitSummary}</p></div>{card.interview && <div className="drawer-block drawer-block--interview"><div className="drawer-block-title"><span><Icon name="calendar" size={13} /> {card.interview.stage}</span><span>{formatDate(card.interview.date)}</span></div><p>{card.interview.detail}</p><small>Próximo passo: {card.interview.nextStep}</small></div>}<div className="drawer-block"><div className="drawer-block-title"><span>Notas</span><Icon name="comment" size={14} /></div><p className="drawer-notes">{card.notes || "Nenhuma nota registrada."}</p></div>{documents.length > 0 && <div className="drawer-block drawer-documents"><div className="drawer-block-title"><span><Icon name="file" size={14} /> Documentos da candidatura</span><span>{documents.length}</span></div><div className="document-list">{documents.map((document) => <DocumentDownloadLink key={`${document.kind}-${document.file}`} document={document} />)}</div></div>}<TagEditor tags={card.tags} onChange={onTags} /><div className="drawer-actions">{sourceUrl ? <a className="button button--quiet" href={sourceUrl} target="_blank" rel="noreferrer"><Icon name="external" size={15} /> {sourceLinkLabel(sourceUrl)}</a> : <span className="button button--disabled">Link indisponível</span>}<button type="button" className="button button--quiet" onClick={onArchive}><Icon name="archive" size={15} /> Arquivar</button><button type="button" className="button button--danger" onClick={onDelete}><Icon name="trash" size={15} /> Excluir</button></div><div className="drawer-footer"><span>Atualizado {formatTimestamp(card.updatedAt)}</span></div></aside></div>;
}

function CreateCardModal({ initialColumnId = "radar", onClose, onCreate }: { initialColumnId?: ColumnId; onClose: () => void; onCreate: (values: { company: string; role: string; columnId: ColumnId; score: number }) => void }) {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [columnId, setColumnId] = useState<ColumnId>(initialColumnId);
  const [score, setScore] = useState("0");
  return <div className="modal-backdrop" onClick={onClose}><form className="modal-card" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); if (company.trim() && role.trim()) onCreate({ company: company.trim(), role: role.trim(), columnId, score: Number(score) || 0 }); }}><div className="modal-head"><h2>Adicionar oportunidade</h2><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar formulário"><Icon name="x" size={18} /></button></div><label>Empresa<input autoFocus value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Ex.: Empresa de tecnologia" /></label><label>Cargo<input value={role} onChange={(event) => setRole(event.target.value)} placeholder="Ex.: Analista de Dados Júnior" /></label><div className="form-grid"><div className="form-field"><span>Etapa</span><Dropdown ariaLabel="Etapa" value={columnId} options={columns.map((column) => ({ value: column.id, label: column.title }))} onChange={setColumnId} /></div><label>Score inicial<input type="number" min="0" max="100" value={score} onChange={(event) => setScore(event.target.value)} /></label></div><div className="modal-footer"><button type="button" className="button button--quiet" onClick={onClose}>Cancelar</button><button type="submit" className="button button--primary">Criar card <Icon name="plus" size={15} /></button></div></form></div>;
}

function ContextModal({ context, onClose }: { context: ReturnType<typeof buildAgentContext>; onClose: () => void }) {
  return <div className="modal-backdrop" onClick={onClose}><div className="modal-card context-modal" onClick={(event) => event.stopPropagation()}><div className="modal-head"><h2>Contexto do quadro</h2><button className="icon-button" onClick={onClose} aria-label="Fechar contexto"><Icon name="x" size={18} /></button></div><div className="context-pills"><span>{context.boardSummary.reduce((sum, item) => sum + item.count, 0)} cards</span><span>{context.userMoves.length} movimentos seus</span><span>{context.openLoops.length} próximos passos</span></div><pre>{context.text}</pre><div className="modal-footer"><span>Gerado {formatTimestamp(context.generatedAt)}</span><button className="button button--primary" onClick={onClose}>Fechar</button></div></div></div>;
}

function CommandPalette({ selectedCard, command, onCommandChange, onSubmit, onClose }: { selectedCard?: JobCard; command: string; onCommandChange: (value: string) => void; onSubmit: (event: FormEvent) => void; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  return <div className="command-backdrop" onClick={onClose}><div className="command-palette" onClick={(event) => event.stopPropagation()}><div className="command-palette-head"><strong>Comandos do quadro</strong><button className="icon-button" onClick={onClose} aria-label="Fechar comandos"><Icon name="x" size={16} /></button></div><form className="command-palette-form" onSubmit={onSubmit}><Icon name="search" size={16} /><input ref={inputRef} value={command} onChange={(event) => onCommandChange(event.target.value)} placeholder={selectedCard ? `Ex.: priorize ${selectedCard.company}` : "Ex.: mova CIDACS para entrevista"} /><kbd>Enter</kbd></form><div className="command-palette-foot"><span>Digite uma ação e pressione Enter</span><span><kbd>Esc</kbd> fechar</span></div></div></div>;
}

export default App;
