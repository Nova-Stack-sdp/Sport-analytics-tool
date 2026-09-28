/**
 * Cursor pagination for v1 list endpoints.
 *
 * A cursor is an opaque token (base64url of the last row's id). Consumers
 * pass back `page.nextCursor` to get the next page. Unlike page numbers,
 * a cursor doesn't skip or repeat rows when new data arrives between two
 * requests, and it stays fast however deep into the results you go.
 *
 * Each endpoint orders by a stable key ending in `id`, so the id alone
 * pins the position — which is what Prisma's `cursor` option needs.
 */

export function encodeCursor(id) {
  return Buffer.from(String(id), 'utf8').toString('base64url');
}

export function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const id = Buffer.from(cursor, 'base64url').toString('utf8');
    return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** Prisma args for one page: fetch one extra row to know if there's more. */
export function pageArgs({ limit, cursorId }) {
  return {
    take: limit + 1,
    ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
  };
}

/** Trims the extra row and builds the `page` block of the response. */
export function buildPage(rows, limit) {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  return {
    data,
    page: {
      limit,
      hasMore,
      nextCursor: hasMore ? encodeCursor(data[data.length - 1].id) : null,
    },
  };
}
