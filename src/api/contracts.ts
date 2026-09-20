import { z } from "zod";

/**
 * Response shapes the orders API promises.
 *
 * These are `.strict()` on purpose: an unexpected field is a contract change, not
 * a harmless addition. A widened SELECT that leaks an internal column should fail
 * a test rather than pass silently.
 */
export const orderSchema = z
  .object({
    id: z.number().int().positive(),
    customer: z.string().min(1),
    item: z.string().min(1),
    createdAt: z.string().datetime(),
  })
  .strict();

export const apiErrorSchema = z
  .object({
    error: z.string().min(1),
  })
  .strict();

/** Derived from the schema so the compile-time type and the runtime check cannot drift apart. */
export type Order = z.infer<typeof orderSchema>;

export function assertMatchesContract<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`${label} did not match its contract -> ${detail}`);
  }
  return result.data;
}
