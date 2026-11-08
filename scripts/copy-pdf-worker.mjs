// Keeps public/pdf.worker.min.mjs in sync with the installed pdfjs-dist version.
import { copyFileSync, existsSync } from "node:fs";
const source = "node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
if (existsSync(source)) copyFileSync(source, "public/pdf.worker.min.mjs");
