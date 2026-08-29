import type { JobCard } from "../types";

const verifiedSourceUrls: Record<string, string> = {
  "CIDACS|Engenheiro(a) de Dados Júnior": "https://cidacs.gupy.io/jobs/11449871?jobBoardSource=gupy_public_page",
  "Minsait|Analista de Dados Júnior": "https://minsait.gupy.io/job/eyJqb2JJZCI6MTEwMDUxODAsInNvdXJjZSI6Imd1cHlfcG9ydGFsIn0%3D?jobBoardSource=gupy_portal",
  "Jobgether|Digital Analytics JR": "https://br.linkedin.com/jobs/view/analista-de-digital-analytics-jr-at-jobgether-4453037760",
  "B Lab|Junior Data Engineer": "https://job-boards.greenhouse.io/blab/jobs/8688848002",
  "Wellhub|Credit Data Science Specialist": "https://job-boards.greenhouse.io/gympass/jobs/8705193002?gh_src=709aee8b2us",
  "C6 Bank|Pessoa Estagiária de Dados": "https://job-boards.greenhouse.io/c6bank/jobs/4717144005?gh_src=qvw9fybi5us",
  "Stefanini Group|Analista machine learning/python (1)": "https://www.netvagas.com.br/empresa/anuncios/a1011300/analista-machine-learning-python-1/",
  "Sanar|Estágio em Engenharia de Software e IA": "https://br.linkedin.com/jobs/view/est%C3%A1gio-em-engenharia-de-software-e-ia-at-sanar-4453757283",
  "Localiza&Co|Engenheiro de Dados Júnior": "https://localiza.gupy.io/jobs/11925744?jobBoardSource=gupy_public_page",
  "CI&T|Programa de Estágio Next Gen AI": "https://ciandt.com/br/pt-br/carreiras/programa-de-estagio",
  "HEINEKEN|Estágio CDA Salvador": "https://careers.theheinekencompany.com/job/heineken-brazil/brazil/estagio-na-area-cda-salvadorba",
  "Oficial Atakarejo|Assistente de Inteligência de Dados": "https://br.linkedin.com/jobs/view/assistente-de-intelig%C3%AAncia-de-dados-at-oficial-atakarejo-4450166226",
};

const genericPortalUrls = [
  /^https?:\/\/(?:www\.)?br\.linkedin\.com\/?$/i,
  /^https?:\/\/(?:www\.)?linkedin\.com\/?$/i,
  /^https?:\/\/(?:www\.)?jobgether\.com\/?$/i,
  /^https?:\/\/job-boards\.greenhouse\.io\/[^/]+\/?$/i,
  /^https?:\/\/(?:www\.)?minsait\.gupy\.io\/?$/i,
  /^https?:\/\/portal\.cidacs\.bahia\.fiocruz\.br\/?$/i,
];

function cardKey(card: Pick<JobCard, "company" | "role">) {
  return `${card.company}|${card.role}`;
}

export function sourceUrlForCard(card: Pick<JobCard, "company" | "role" | "sourceUrl">) {
  const verified = verifiedSourceUrls[cardKey(card)];
  if (verified) return verified;

  const sourceUrl = String(card.sourceUrl ?? "").trim();
  if (!sourceUrl) return undefined;
  try {
    const url = new URL(sourceUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    if (genericPortalUrls.some((pattern) => pattern.test(url.toString()))) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}
