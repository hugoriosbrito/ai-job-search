import type { JobCard, JobDocument, JobDocumentKind } from "../types";

export interface ResolvedJobDocument extends JobDocument {
  label: string;
  href: string;
  downloadName: string;
}

const kindLabels: Record<JobDocumentKind, string> = {
  cv: "Currículo",
  cover_letter: "Carta de apresentação",
  interview: "Preparação da entrevista",
  portfolio: "Portfólio",
  other: "Documento da candidatura",
};

function normalizedFile(file: string) {
  return file.trim().replaceAll("\\", "/").replace(/^\.\//, "");
}

function fileName(file: string) {
  return normalizedFile(file).split("/").pop() || "documento";
}

function inferredKind(file: string): JobDocumentKind {
  const value = file.toLocaleLowerCase("pt-BR");
  if (value.includes("carta") || value.includes("cover_letter") || value.includes("cover-letter")) return "cover_letter";
  if (value.includes("curriculo") || value.includes("currículo") || value.includes("resume") || value.includes("cv")) return "cv";
  if (value.includes("entrevista") || value.includes("interview")) return "interview";
  if (value.includes("portfolio") || value.includes("portfólio")) return "portfolio";
  return "other";
}

function publicPath(file: string, kind: JobDocumentKind) {
  const normalized = normalizedFile(file);
  if (/^(https?:|blob:|data:)/i.test(normalized) || normalized.startsWith("/")) return normalized;

  const withoutPublicPrefix = normalized.replace(/^web\/public\//i, "");
  if (withoutPublicPrefix.startsWith("documents/")) {
    return `/${withoutPublicPrefix}`;
  }

  const resolvedName = withoutPublicPrefix.toLocaleLowerCase("pt-BR").endsWith(".tex")
    ? withoutPublicPrefix.slice(0, -4) + ".pdf"
    : withoutPublicPrefix;
  const name = fileName(resolvedName);
  const folder = kind === "cover_letter" ? "cover_letters" : kind === "cv" ? "cv" : "other";
  return `/documents/${folder}/${encodeURIComponent(name)}`;
}

function documentLabel(document: JobDocument, kind: JobDocumentKind) {
  return document.label?.trim() || kindLabels[kind];
}

export function getCardDocuments(card: JobCard): ResolvedJobDocument[] {
  const documents: JobDocument[] = [
    ...(card.documents ?? []),
    ...(card.cvFile ? [{ kind: "cv" as const, label: "Currículo", file: card.cvFile }] : []),
    ...(card.coverLetterFile ? [{ kind: "cover_letter" as const, label: "Carta de apresentação", file: card.coverLetterFile }] : []),
  ];
  const seen = new Set<string>();

  return documents.flatMap((document) => {
    const file = normalizedFile(document.file);
    if (!file || seen.has(file.toLocaleLowerCase("pt-BR"))) return [];
    seen.add(file.toLocaleLowerCase("pt-BR"));
    const kind = document.kind || inferredKind(file);
    const normalizedName = fileName(file.toLocaleLowerCase("pt-BR").endsWith(".tex") ? `${file.slice(0, -4)}.pdf` : file);
    return [{
      ...document,
      kind,
      label: documentLabel(document, kind),
      href: publicPath(file, kind),
      downloadName: normalizedName,
    }];
  });
}
