import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const target = path.resolve(process.cwd(), `${specifier.slice(2)}.ts`);
    return { url: pathToFileURL(target).href, shortCircuit: true };
  }

  if (/^\.{1,2}\//.test(specifier) && !path.extname(specifier) && context.parentURL?.startsWith("file:")) {
    const parentDirectory = path.dirname(fileURLToPath(context.parentURL));
    const target = path.resolve(parentDirectory, `${specifier}.ts`);
    return { url: pathToFileURL(target).href, shortCircuit: true };
  }

  return nextResolve(specifier, context);
}
