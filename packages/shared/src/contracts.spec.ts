import { describe, it, expect } from "vitest";
import { z, type ZodTypeAny, ZodObject, ZodDiscriminatedUnion } from "zod";
import { CONTRACTS } from "./registry.js";
import { CONTRACT_MAJOR } from "./version.js";

describe("shared contracts invariant suite", () => {
  it("registry has entries for all 8 core contracts", () => {
    expect(CONTRACTS).toBeDefined();
    expect(Array.isArray(CONTRACTS)).toBe(true);
    expect(CONTRACTS.length).toBe(8);

    const expectedFiles = [
      "search-query.json",
      "decklist.json",
      "validation-report.json",
      "effect-ir.json",
      "job-request.json",
      "job-event.json",
      "scenario.json",
      "card-def.json",
    ];

    const actualFiles = CONTRACTS.map((c) => c.file).sort();
    expect(actualFiles).toEqual(expectedFiles.sort());
  });

  describe("BR-S01.T05-05: round-trip per contract sample", () => {
    for (const contract of CONTRACTS ?? []) {
      it(`contract ${contract.name} sample parses and round-trips cleanly`, () => {
        const parsed = contract.schema.parse(contract.sample);
        const jsonRoundtrip = JSON.parse(JSON.stringify(parsed));
        expect(contract.schema.parse(jsonRoundtrip)).toEqual(parsed);
      });
    }
  });

  describe("BR-S01.T05-04: strictness - rejects unknown keys on objects", () => {
    for (const contract of CONTRACTS ?? []) {
      it(`contract ${contract.name} rejects unknown keys`, () => {
        const sampleObj = (typeof contract.sample === "object" && contract.sample !== null)
          ? contract.sample
          : {};
        const sampleWithExtra = {
          ...sampleObj,
          __unauthorized_extra_key__: "should_fail",
        };
        expect(() => contract.schema.parse(sampleWithExtra)).toThrow();
      });
    }
  });

  describe("BR-S01.T05-05: no non-JSON types (Date, BigInt, Map, Set, undefined)", () => {
    function walkSchema(schema: ZodTypeAny, path = ""): void {
      const typeName = (schema._def as any)?.typeName;
      expect(
        ["ZodDate", "ZodBigInt", "ZodMap", "ZodSet", "ZodUndefined"],
        `Disallowed non-JSON type ${typeName} at ${path}`
      ).not.toContain(typeName);

      if (typeName === "ZodObject") {
        const shape = (schema as ZodObject<any>).shape;
        for (const [key, child] of Object.entries(shape)) {
          walkSchema(child as ZodTypeAny, `${path}.${key}`);
        }
      } else if (typeName === "ZodArray") {
        walkSchema((schema as any)._def.type, `${path}[]`);
      } else if (typeName === "ZodOptional" || typeName === "ZodNullable" || typeName === "ZodDefault") {
        walkSchema((schema as any)._def.innerType, path);
      } else if (typeName === "ZodDiscriminatedUnion") {
        for (const option of (schema as ZodDiscriminatedUnion<any, any>).options) {
          walkSchema(option, `${path}[union]`);
        }
      } else if (typeName === "ZodUnion") {
        for (const option of (schema as any)._def.options) {
          walkSchema(option, `${path}[union]`);
        }
      }
    }

    for (const contract of CONTRACTS ?? []) {
      it(`contract ${contract.name} uses only pure JSON serializable schema types`, () => {
        walkSchema(contract.schema, contract.name);
      });
    }
  });

  describe("BR-S01.T05-07: field descriptions survive for every top-level field", () => {
    for (const contract of CONTRACTS ?? []) {
      it(`contract ${contract.name} top-level object fields have descriptions`, () => {
        const schema = contract.schema;
        const typeName = (schema._def as any)?.typeName;

        if (typeName === "ZodObject") {
          const shape = (schema as ZodObject<any>).shape;
          for (const [key, field] of Object.entries(shape)) {
            const description = (field as ZodTypeAny).description;
            expect(
              Boolean(description && description.trim().length > 0),
              `Field ${contract.name}.${key} is missing a .describe() description`
            ).toBe(true);
          }
        } else if (typeName === "ZodDiscriminatedUnion") {
          for (const option of (schema as ZodDiscriminatedUnion<any, any>).options) {
            const shape = option.shape;
            for (const [key, field] of Object.entries(shape)) {
              const description = (field as ZodTypeAny).description;
              expect(
                Boolean(description && description.trim().length > 0),
                `Field in union branch of ${contract.name}.${key} is missing a .describe() description`
              ).toBe(true);
            }
          }
        }
      });
    }
  });

  describe("BR-S01.T05-08: unions crossing boundaries are tagged with discriminator", () => {
    it("jobEventSchema is a discriminated union on 'type'", () => {
      const jobEventContract = CONTRACTS?.find((c) => c.file === "job-event.json");
      expect(jobEventContract).toBeDefined();
      const schemaDef = jobEventContract!.schema._def as any;
      expect(schemaDef.typeName).toBe("ZodDiscriminatedUnion");
      expect(schemaDef.discriminator).toBe("type");
    });
  });

  describe("BR-S01.T05-02 & BR-S01.T05-06: schema directory and $id major version agreement", () => {
    it("schema directory has exactly one file per registry entry and $id major matches CONTRACT_MAJOR", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const schemaDir = path.resolve(__dirname, "../schema");

      expect(fs.existsSync(schemaDir)).toBe(true);
      const files = fs.readdirSync(schemaDir).filter((f) => f.endsWith(".json"));
      expect(files.sort()).toEqual(CONTRACTS.map((c) => c.file).sort());

      for (const contract of CONTRACTS) {
        const filePath = path.join(schemaDir, contract.file);
        const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
        expect(content.$id).toBe(`https://pokesearch.invalid/schema/v${CONTRACT_MAJOR}/${contract.file}`);
      }
    });
  });
});
