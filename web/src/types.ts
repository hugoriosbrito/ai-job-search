export type ColumnId =
  | "radar"
  | "selecao"
  | "candidatura"
  | "entrevista"
  | "oferta"
  | "encerrada";

export type Priority = "urgente" | "alta" | "normal" | "baixa";
export type CardStatus = "active" | "closed" | "rejected" | "withdrawn" | "hired" | "archived";
export type Actor = "user" | "agent" | "system";
export type AppView = "board" | "activity";
export type Availability = "available" | "blocked";

export interface Column {
  id: ColumnId;
  title: string;
  shortTitle: string;
  accent: string;
  helper: string;
}

export interface InterviewNote {
  date: string;
  stage: string;
  detail: string;
  nextStep: string;
}

export type JobDocumentKind = "cv" | "cover_letter" | "interview" | "portfolio" | "other";

export interface JobDocument {
  kind: JobDocumentKind;
  label?: string;
  file: string;
}

export interface JobCard {
  id: string;
  company: string;
  role: string;
  location: string;
  mode: string;
  portal: string;
  score: number;
  columnId: ColumnId;
  status: CardStatus;
  priority: Priority;
  tags: string[];
  nextAction: string;
  dueDate?: string;
  salary?: string;
  sourceUrl: string;
  availability?: Availability;
  blockReason?: string;
  fitSummary: string;
  notes: string;
  cvFile?: string;
  coverLetterFile?: string;
  documents?: JobDocument[];
  interview?: InterviewNote;
  origin: "demo" | "tracker";
  updatedAt: string;
}

export interface Activity {
  id: string;
  actor: Actor;
  action:
    | "move_card"
    | "create_card"
    | "update_card"
    | "set_priority"
    | "add_comment"
    | "record_interview"
    | "set_status"
    | "archive_card"
    | "delete_card"
    | "import_tracker";
  cardId?: string;
  cardTitle: string;
  detail: string;
  fromColumn?: ColumnId;
  toColumn?: ColumnId;
  createdAt: string;
}

export interface BoardState {
  cards: JobCard[];
  activities: Activity[];
  lastSyncedAt: string;
}

export interface AgentTool {
  name: string;
  description: string;
  example: string;
  risk: "read" | "write";
}

export interface AgentContext {
  generatedAt: string;
  selectedCard?: JobCard;
  userMoves: Activity[];
  openLoops: JobCard[];
  boardSummary: Array<{ columnId: ColumnId; title: string; count: number }>;
  text: string;
}

export interface AgentToolCall {
  name:
    | "get_board_context"
    | "move_card"
    | "create_card"
    | "update_card"
    | "set_priority"
    | "add_comment"
    | "record_interview"
    | "set_status"
    | "archive_card"
    | "delete_card";
  args: Record<string, unknown>;
}
