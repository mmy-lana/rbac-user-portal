import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { ApiResponseEnvelope } from '@rbac/shared';
import { toIsoString } from '@rbac/shared';
import type { RequestWithContext } from '../interfaces/request.interface';
import { toStoredIp } from '../utils/client-ip.util';

/**
 * Request transformation interceptor.
 *
 * Responsibilities, in order:
 *
 *  1. **Correlation.** Assign (or echo) a request id before any handler runs, so
 *     the envelope, the audit rows and the server log all share one identifier.
 *     A client-supplied `x-request-id` is honoured so a browser trace and a server
 *     trace can be joined, but it is length-bounded and pattern-checked before
 *     being trusted as a log field.
 *  2. **Envelope normalisation.** Handlers that already returned an
 *     `ApiResponseEnvelope` pass through untouched; anything else is wrapped. This
 *     guarantees the transport contract even for a handler that forgets.
 *  3. **Timing.** Log method, path, status and duration once the response is
 *     flushed, so slow endpoints are visible without a full APM stack.
 *
 * The interceptor never touches a response body on the error path — the
 * exception filter owns that, which keeps exactly one component responsible for
 * shaping failures.
 */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithContext>();
    const response = http.getResponse<Response>();

    request.requestId = resolveSafeRequestId(request.headers['x-request-id']);
    request.startedAt = performance.now();
    response.setHeader('X-Request-Id', request.requestId);

    return next.handle().pipe(
      tap((payload: unknown) => {
        const durationMs = Math.round(performance.now() - request.startedAt);
        const statusCode = response.statusCode;

        if (!isEnvelope(payload)) {
          // Wrap a bare return value so no endpoint can bypass the contract.
          response.json({
            success: true,
            statusCode,
            data: payload ?? null,
            error: null,
            meta: { timestamp: toIsoString(new Date()), requestId: request.requestId },
          } satisfies ApiResponseEnvelope<unknown>);
        }

        process.stdout.write(
          `${JSON.stringify({
            level: 'info',
            event: 'http_request',
            requestId: request.requestId,
            method: request.method,
            path: request.path,
            statusCode,
            durationMs,
            ip: toStoredIp(request),
            userId: request.user?.userId ?? null,
          })}\n`
        );
      })
    );
  }
}

/** Accepts a caller-supplied id only when it is safe to place in a log line. */
function resolveSafeRequestId(header: string | string[] | undefined): string {
  if (typeof header === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(header)) {
    return header;
  }
  return `req_${crypto.randomUUID()}`;
}

/** Structural check for the unified transport envelope. */
function isEnvelope(value: unknown): value is ApiResponseEnvelope<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    'statusCode' in value &&
    'data' in value &&
    'error' in value &&
    'meta' in value
  );
}