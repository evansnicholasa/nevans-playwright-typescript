import { parse as parseYaml } from "yaml";
import { z } from "zod";

export const layers = ["ui", "api", "db", "mq"] as const;

export const caseStepSchema = z
  .object({
    action: z.string().min(1),
    expected: z.string().min(1),
  })
  .strict();

export const testCaseSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    layer: z.enum(layers),
    steps: z.array(caseStepSchema).min(1),
  })
  .strict();

export const caseFileSchema = z
  .object({
    source: z
      .object({
        key: z.string().min(1),
        summary: z.string().min(1),
      })
      .strict(),
    cases: z.array(testCaseSchema).min(1),
  })
  .strict();

export type CaseFile = z.infer<typeof caseFileSchema>;

export function parseCaseFile(raw: string): CaseFile {
  return caseFileSchema.parse(parseYaml(raw));
}

export const caseFileExampleYaml = `source:
  key: ORD-1
  summary: Place an order with a customer name and item
cases:
  - id: ORD-1-C01
    title: Customer can place an order from the page
    layer: ui
    steps:
      - action: Open the orders page and submit a unique customer and item
        expected: The order appears in the list
  - id: ORD-1-C02
    title: API creates an order
    layer: api
    steps:
      - action: POST /api/orders with customer and item
        expected: Response is 201 and includes the created order
`;
