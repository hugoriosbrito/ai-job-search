import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..", "..");
const trackerPath = resolve(projectRoot, "job_search_tracker.csv");
const outputPath = resolve(scriptDir, "..", "public", "tracker.json");

function parseCsv(text) {
  const rows = [];
  let row = [];
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
      row.push(value.trim()); value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; value = "";
    } else value += char;
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

const slug = (value) => value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const trackerId = (company, role, sourceUrl) => {
  const sourceSuffix = slug(sourceUrl).split("-").slice(-5).join("-");
  return `tracker-${slug(company)}-${slug(role)}-${sourceSuffix || "sem-fonte"}`;
};
const scoreOf = (value) => {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
};
const priorityOf = (score) => score >= 90 ? "urgente" : score >= 80 ? "alta" : score >= 65 ? "normal" : "baixa";
const modeOf = (location) => {
  const value = location.toLocaleLowerCase("pt-BR");
  if (value.includes("remote") || value.includes("remoto")) return "Remoto";
  if (value.includes("hybrid") || value.includes("híbrido") || value.includes("hibrido")) return "Híbrido";
  if (value.includes("presencial")) return "Presencial";
  return "A confirmar";
};
const columnOf = (status, score) => {
  const value = status.toLocaleLowerCase("pt-BR");
  if (value.includes("closed") || value.includes("rejected") || value.includes("encerr")) return "encerrada";
  if (value.includes("interview") || value.includes("entrevista")) return "entrevista";
  if (value.includes("offer") || value.includes("oferta")) return "oferta";
  if (value.includes("pending") || value.includes("applied") || value.includes("submitted") || value.includes("candid")) return "candidatura";
  return score >= 80 ? "selecao" : "radar";
};

const rows = parseCsv(await readFile(trackerPath, "utf8").then((text) => text.replace(/^\uFEFF/, "")));
const headerIndex = rows.findIndex((row) => row.includes("company") && row.includes("role"));
if (headerIndex === -1) throw new Error("Cabeçalho moderno não encontrado no job_search_tracker.csv");
const header = rows[headerIndex];
const get = (row, key) => row[header.indexOf(key)] ?? "";
const cards = rows.slice(headerIndex + 1).filter((row) => row.length >= 11).map((row) => {
  const isModern = row.length >= 13;
  const company = isModern ? get(row, "company") : row[2] ?? "";
  const role = isModern ? get(row, "role") : row[1] ?? "";
  const location = isModern ? "A confirmar" : row[5] ?? "A confirmar";
  const portal = isModern ? get(row, "channel") || "Tracker" : row[4] || "Tracker";
  const score = scoreOf(isModern ? get(row, "fit_rating") : row[8] ?? "0");
  const status = isModern ? get(row, "status") : row[10] ?? "";
  const columnId = columnOf(status, score);
  const notes = isModern ? get(row, "notes") : row[9] ?? "";
  const sourceUrl = isModern ? get(row, "source") : row[3] ?? "";
  const skills = isModern ? [] : (row[6] ?? "").split(";").map((skill) => skill.trim()).filter(Boolean);
  return {
    id: trackerId(company, role, sourceUrl),
    company,
    role,
    location,
    mode: modeOf(location),
    portal,
    score,
    columnId,
    priority: priorityOf(score),
    tags: (isModern ? [get(row, "sector") || "Dados", get(row, "role_type") || "A avaliar"] : skills).filter(Boolean).slice(0, 3),
    nextAction: columnId === "encerrada" ? "Preservar no histórico" : columnId === "candidatura" ? "Acompanhar candidatura" : "Avaliar próxima ação",
    sourceUrl,
    fitSummary: notes || "Sem nota de aderência registrada.",
    notes: notes || "",
    cvFile: isModern ? get(row, "cv_file") || undefined : undefined,
    coverLetterFile: isModern ? get(row, "cover_letter_file") || undefined : undefined,
    origin: "tracker",
    updatedAt: (isModern ? get(row, "date") : row[0] ?? "") ? `${isModern ? get(row, "date") : row[0]}T12:00:00.000Z` : new Date().toISOString(),
  };
});

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(cards, null, 2), "utf8");
console.log(`Sincronizado: ${cards.length} cards -> ${outputPath}`);
