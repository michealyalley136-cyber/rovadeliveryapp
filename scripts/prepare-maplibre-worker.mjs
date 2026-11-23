import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const maplibreDirectory = dirname(fileURLToPath(import.meta.resolve("maplibre-gl")));
const workerDirectory = resolve("public", "maplibre");

await mkdir(workerDirectory, { recursive: true });
await Promise.all([
  copyFile(resolve(maplibreDirectory, "maplibre-gl-worker.mjs"), resolve(workerDirectory, "maplibre-gl-worker.mjs")),
  copyFile(resolve(maplibreDirectory, "maplibre-gl-shared.mjs"), resolve(workerDirectory, "maplibre-gl-shared.mjs")),
]);
