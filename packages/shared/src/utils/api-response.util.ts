import type { ApiResponseEnvelope } from '../types/api-response.type';
import type { PaginationMeta } from './pagination.util';

/**
 * Factories for the unified transport envelope.
 *
 * Every response the API emits — success or failure — is produced here so that the
 * wire shape cannot drift between controllers, filters and interceptors.
 */

export interface EnvelopeContext {
  requestId: string;
  timestamp?: string;
}

export function successEnvelope<T>(
  data: T,
  { requestId, timestamp }: EnvelopeContext,
  statusCode = 200
): ApiResponseEnvelope<T> {
  return {
    success: true,
    statusCode,
    data,
    error: null,
    meta: { timestamp: timestamp ?? new Date().toISOString(), requestId },
  };
}

export function errorEnvelope(
  statusCode: number,
  code: string,
  message: string,
  { requestId, timestamp }: EnvelopeContext,
  details: Record<string, unknown> | null = null
): ApiResponseEnvelope<never> {
  return {
    success: false,
    statusCode,
    data: null,
    error: { code, message, details },
    meta: { timestamp: timestamp ?? new Date().toISOString(), requestId },
  };
}

/** Envelope for list endpoints, carrying pagination metadata. */
export function listEnvelope<T>(
  data: T[],
  pagination: PaginationMeta,
  { requestId, timestamp }: EnvelopeContext,
  statusCode = 200
): ApiResponseEnvelope<T[]> {
  return {
    success: true,
    statusCode,
    data,
    error: null,
    meta: {
      timestamp: timestamp ?? new Date().toISOString(),
      requestId,
      pagination,
    },
  };
}