import type { Knex } from "knex";
import type { PaginatedResult } from "@cral/types";

/**
 * Cursor-based pagination helper (spec §2). The cursor opaquely encodes the
 * last row's (sortValue, id) pair so paging stays correct even as rows are
 * inserted or removed between requests — unlike offset paging, which the
 * spec explicitly forbids because review queues change under the reader.
 */

interface CursorPayload {
  v: string | number; // the sort column's value on the last row of the previous page
  id: string; // tie-breaker, since sort values are not guaranteed unique
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof parsed?.id !== "string") return null;
    if (typeof parsed?.v !== "string" && typeof parsed?.v !== "number") return null;
    return parsed as CursorPayload;
  } catch {
    return null;
  }
}

export interface PaginateOptions {
  /** Column used for ordering; must be unique-enough combined with `id`, e.g. "created_at". */
  sortColumn: string;
  /** "asc" | "desc" — "desc" matches sort=-created_at ordering. */
  direction?: "asc" | "desc";
  limit: number;
  cursor?: string;
}

/**
 * Applies a keyset (cursor) WHERE + ORDER BY + LIMIT to a query builder and
 * returns a function that trims the fetched rows into a PaginatedResult.
 * Callers should fetch `limit + 1` rows and pass them to `toResult`.
 */
export function applyCursor<TRecord extends object>(
  query: Knex.QueryBuilder<TRecord>,
  options: PaginateOptions,
): Knex.QueryBuilder<TRecord> {
  const { sortColumn, direction = "desc", limit, cursor } = options;
  const op = direction === "desc" ? "<" : ">";

  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      query = query.where((builder) => {
        builder
          .where(sortColumn, op, decoded.v)
          .orWhere((inner) => {
            inner.where(sortColumn, "=", decoded.v).andWhere("id", op, decoded.id);
          });
      });
    }
  }

  return query.orderBy(sortColumn, direction).orderBy("id", direction).limit(limit + 1);
}

export function toPaginatedResult<T extends { id: string }>(
  rows: T[],
  limit: number,
  sortColumn: keyof T,
): PaginatedResult<T> {
  const has_more = rows.length > limit;
  const data = has_more ? rows.slice(0, limit) : rows;
  const last = data[data.length - 1];
  const next_cursor =
    has_more && last ? encodeCursor({ v: last[sortColumn] as unknown as string | number, id: last.id }) : null;

  return { data, next_cursor, has_more };
}
