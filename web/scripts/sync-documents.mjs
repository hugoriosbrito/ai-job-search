import { cp, mkdir, readdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const webRoot = resolve(import.meta.dirname, "..");
const canonicalRoot = resolve(webRoot, "..");
const publicDocuments = join(webRoot, "public", "documents");

async function copyPdfFiles(sourceDirectory, targetDirectory, shouldUseTarget) {
  const sourcePath = join(canonicalRoot, sourceDirectory);
  const targetPath = join(publicDocuments, targetDirectory);
  await mkdir(targetPath, { recursive: true });

  let files;
  try {
    files = await readdir(sourcePath, { withFileTypes: true });
  } catch {
    return 0;
  }

  let copied = 0;
  for (const file of files) {
    if (!file.isFile() || extname(file.name).toLocaleLowerCase() !== ".pdf") continue;
    const destination = shouldUseTarget(file.name) ? "cover_letters" : targetDirectory;
    const destinationPath = join(publicDocuments, destination, file.name);
    await mkdir(join(publicDocuments, destination), { recursive: true });
    await cp(join(sourcePath, file.name), destinationPath, { force: true });
    copied += 1;
  }
  return copied;
}

const cvCount = await copyPdfFiles("cv", "cv", (name) => /carta|cover/i.test(name));
const coverLetterCount = await copyPdfFiles("cover_letters", "cover_letters", () => true);
console.log(`Documentos publicados: ${cvCount + coverLetterCount} PDF(s).`);
