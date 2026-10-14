import { HTTPException } from "hono/http-exception";
import type { z } from "zod";

/* Small pieces every route uses: plain refusals, checked input, and plain text. */

export type Vars = { userId: string; personId: string; email: string; requestId: string };

export function bad(message: string, status: 400 | 401 | 404 | 409 | 413 | 429 = 400): never {
  throw new HTTPException(status, { message });
}

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) bad(result.error.issues[0]?.message ?? "Something in the form is not right.");
  return result.data;
}
