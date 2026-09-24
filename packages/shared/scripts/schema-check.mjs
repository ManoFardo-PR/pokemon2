import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateSchemas } from "./schema-build.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaDir = path.resolve(__dirname, "../schema");

function checkSchemas() {
  if (!fs.existsSync(schemaDir)) {
    console.error(`Schema directory does not exist: ${schemaDir}`);
    process.exit(1);
  }

  const generated = generateSchemas();
  const existingFiles = fs.readdirSync(schemaDir).filter((f) => f.endsWith(".json"));

  let hasDiff = false;

  for (const [file, expectedContent] of generated.entries()) {
    const filePath = path.join(schemaDir, file);
    if (!fs.existsSync(filePath)) {
      console.error(`Missing schema file: ${file}`);
      hasDiff = true;
      continue;
    }
    const currentContent = fs.readFileSync(filePath, "utf8");
    if (currentContent !== expectedContent) {
      console.error(`Schema mismatch in ${file}`);
      hasDiff = true;
    }
  }

  for (const file of existingFiles) {
    if (!generated.has(file)) {
      console.error(`Orphaned schema file in schema/: ${file}`);
      hasDiff = true;
    }
  }

  if (hasDiff) {
    console.error("Schema check failed. Run 'pnpm --filter @pokesearch/shared schema:build' to update.");
    process.exit(1);
  }

  console.log("All schemas are up-to-date and deterministic.");
}

checkSchemas();
