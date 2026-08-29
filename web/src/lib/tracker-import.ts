import type { CardStatus, ColumnId, JobCard, JobDocument, Priority } from "../types";
import { sourceUrlForCard } from "./source-links";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

const slug = (value: string) => value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function trackerId(company: string, role: string, sourceUrl: string) {
  const sourceSuffix = slug(sourceUrl).split("-").slice(-5).join("-");
  return `tracker-${slug(company)}-${slug(role)}-${sourceSuffix || "sem-fonte"}`;
}

function toScore(value: string) {
  const score = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(score) ? Math.round(score) : 0;
}

function mapStatus(status: string): CardStatus {
  const normalized = status.toLocaleLowerCase("pt-BR");
  if (normalized.includes("rejected") || normalized.includes("recus")) return "rejected";
  if (normalized.includes("withdraw") || normalized.includes("retir") || normalized.includes("desist") || normalized.includes("cancel")) return "withdrawn";
  if (normalized.includes("hired") || normalized.includes("contrat") || normalized.includes("accepted") || normalized.includes("aceit")) return "hired";
  if (normalized.includes("closed") || normalized.includes("encerr") || normalized.includes("expired") || normalized.includes("expirad")) return "closed";
  return "active";
}

function mapColumn(status: string, score: number): ColumnId {
  if (mapStatus(status) !== "active") return "encerrada";
  const normalized = status.toLocaleLowerCase("pt-BR");
  if (normalized.includes("interview") || normalized.includes("entrevista")) return "entrevista";
  if (normalized.includes("offer") || normalized.includes("oferta")) return "oferta";
  if (normalized.includes("pending") || normalized.includes("applied") || normalized.includes("submitted") || normalized.includes("candid")) return "candidatura";
  return score >= 80 ? "selecao" : "radar";
}

function mapPriority(score: number): Priority {
  if (score >= 90) return "urgente";
  if (score >= 80) return "alta";
  if (score >= 65) return "normal";
  return "baixa";
}

function inferMode(location: string) {
  const normalized = location.toLocaleLowerCase("pt-BR");
  if (normalized.includes("remote") || normalized.includes("remoto")) return "Remoto";
  if (normalized.includes("hybrid") || normalized.includes("híbrido") || normalized.includes("hibrido")) return "Híbrido";
  if (normalized.includes("presencial")) return "Presencial";
  return "A confirmar";
}

function parseDocuments(value: string): JobDocument[] | undefined {
  const files = value.split(";").map((file) => file.trim()).filter(Boolean);
  if (!files.length) return undefined;
  return files.map((file) => {
    const normalized = file.toLocaleLowerCase("pt-BR");
    const kind = normalized.includes("carta") || normalized.includes("cover") ? "cover_letter" : normalized.includes("cv") || normalized.includes("curr") || normalized.includes("resume") ? "cv" : "other";
    return { kind, file } satisfies JobDocument;
  });
}

export function parseTracker(text: string): JobCard[] {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  const headerIndex = rows.findIndex((row) => row.includes("company") && row.includes("role"));
  if (headerIndex === -1) throw new Error("Não encontrei o cabeçalho moderno do tracker.");
  const header = rows[headerIndex];
  const indexOf = (key: string) => header.indexOf(key);
  const get = (row: string[], key: string) => row[indexOf(key)] ?? "";

  return rows.slice(headerIndex + 1).filter((row) => row.length >= 11).map((row) => {
    const isModern = row.length >= 13;
    const company = isModern ? get(row, "company") : row[2] ?? "";
    const role = isModern ? get(row, "role") : row[1] ?? "";
    const location = isModern ? "A confirmar" : row[5] ?? "A confirmar";
    const portal = isModern ? get(row, "channel") || "Tracker" : row[4] || "Tracker";
    const score = toScore(isModern ? get(row, "fit_rating") : row[8] ?? "0");
    const status = isModern ? get(row, "status") : row[10] ?? "";
    const cardStatus = mapStatus(status);
    const notes = isModern ? get(row, "notes") : row[9] ?? "";
    const sourceUrl = isModern ? get(row, "source") : row[3] ?? "";
    const documents = isModern ? parseDocuments(get(row, "documents") || get(row, "document_files") || get(row, "generated_documents")) : undefined;
    const rawSkills = isModern ? "" : row[6] ?? "";
    const columnId = mapColumn(status, score);
    const card = {
      id: trackerId(company, role, sourceUrl),
      company,
      role,
      location,
      mode: inferMode(location),
      portal,
      score,
      columnId,
      status: cardStatus,
      priority: mapPriority(score),
      tags: (isModern ? [get(row, "sector") || "Dados", get(row, "role_type") || "A avaliar"] : rawSkills.split(";").map((skill) => skill.trim()).filter(Boolean)).slice(0, 3),
      nextAction: columnId === "encerrada" ? "Preservar no histórico" : columnId === "candidatura" ? "Acompanhar candidatura" : "Avaliar próxima ação",
      sourceUrl,
      fitSummary: notes || "Sem nota de aderência registrada.",
      notes: notes || "",
      cvFile: isModern ? get(row, "cv_file") || undefined : undefined,
      coverLetterFile: isModern ? get(row, "cover_letter_file") || undefined : undefined,
      documents,
      origin: "tracker",
      updatedAt: (isModern ? get(row, "date") : row[0] ?? "") ? `${isModern ? get(row, "date") : row[0]}T12:00:00.000Z` : new Date().toISOString(),
    } satisfies JobCard;
    return { ...card, sourceUrl: sourceUrlForCard(card) ?? "" };
  });
}
