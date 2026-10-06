import type { ApiResponseEnvelope } from '../types/api-response.type';

/**
 * Pagination contract shared by list endpoints and the client's TanStack Query
 * hooks. Offsets are always 1-based on the wire and clamped to safe bounds so a
 * hostile `?limit=1000000` cannot be used to exhaust database memory.
 */
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface PaginationMeta {
  totalRecords: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginationInput {
  page?: number | string;
  limit?: number | string;
}

function toPositiveInteger(value: number | string | undefined, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

/** Normalises raw query-string values into a safe `{ page, limit, offset }`. */
export function normalizePagination(input?: PaginationInput): {
  page: number;
  limit: number;
  offset: number;
} {
  const page = Math.max(1, toPositiveInteger(input?.page, DEFAULT_PAGE));
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, toPositiveInteger(input?.limit, DEFAULT_PAGE_SIZE))
  );
  return { page, limit, offset: (page - 1) * limit };
}

/** Builds the `meta.pagination` block from a total row count. */
export function buildPaginationMeta(totalRecords: number, page: number, limit: number): PaginationMeta {
  const safeTotal = Math.max(0, totalRecords);
  return {
    totalRecords: safeTotal,
    page,
    limit,
    totalPages: limit > 0 ? Math.ceil(safeTotal / limit) : 0,
  };
}

/** Wraps a page of rows in the unified transport envelope. */
export function paginatedEnvelope<T>(
  data: T[],
  meta: PaginationMeta,
  requestId: string,
  timestamp: string = new Date().toISOString()
): ApiResponseEnvelope<T[]> {
  return {
    success: true,
    statusCode: 200,
    data,
    error: null,
    meta: { timestamp, requestId, pagination: meta },
  };
}