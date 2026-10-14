import { seal, unseal, type SealKeys } from "../seal.ts";

/**
 * Seals and opens one person's private text. Sealed text is bound to the
 * person and to the field it belongs in, so it cannot be moved to another row
 * or column and still open.
 */
export type Sealer = {
  seal(field: string, text: string | null): string | null;
  open(field: string, text: string | null): string | null;
};

export function sealerFor(keys: SealKeys, personId: string): Sealer {
  return {
    seal: (field, text) => (text ? seal(text, keys, `${personId}:${field}`) : null),
    open: (field, text) => {
      if (!text) return null;
      try {
        return unseal(text, keys, `${personId}:${field}`);
      } catch {
        return null;
      }
    },
  };
}
