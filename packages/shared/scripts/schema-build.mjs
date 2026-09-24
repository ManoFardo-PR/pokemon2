import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import { CONTRACTS } from "../src/registry.js";
import { CONTRACT_MAJOR } from "../src/version.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaDir = path.resolve(__dirname, "../schema");

function sortKeys(obj) {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortKeys);
  }
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeys(obj[key]);
  }
  return sorted;
}

export function generateSchemas() {
  const result = new Map();
  for (const contract of CONTRACTS) {
    const rawSchema = zodToJsonSchema(contract.schema, {
      name: contract.name,
      target: "jsonSchema2020-12",
      $refStrategy: "none",
    });

    const schemaDefinition = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: `https://pokesearch.invalid/schema/v${CONTRACT_MAJOR}/${contract.file}`,
      ...rawSchema,
    };

    const sorted = sortKeys(schemaDefinition);
    const content = JSON.stringify(sorted, null, 2) + "\n";
    result.set(contract.file, content);
  }
  return result;
}

export function writeSchemas() {
  if (!fs.existsSync(schemaDir)) {
    fs.mkdirSync(schemaDir, { recursive: true });
  }

  const generated = generateSchemas();
  for (const [file, content] of generated.entries()) {
    const filePath = path.join(schemaDir, file);
    fs.writeFileSync(filePath, content, "utf8");
    console.log(`Generated schema: ${file}`);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
  writeSchemas();
}
