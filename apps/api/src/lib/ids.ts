import { ulid } from "ulid";
import { ID_PREFIXES, type IdKind } from "@cral/types";

/** Generates a fresh prefixed ULID for the given entity kind, e.g. "usr_01J8QM...". */
export function generateId(kind: IdKind): string {
  return `${ID_PREFIXES[kind]}_${ulid()}`;
}
