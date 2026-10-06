import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ThrottlerException } from '@nestjs/throttler';
import { errorEnvelope } from '@rbac/shared';
import { resolveRequestId } from '../interfaces/request.interface';
import { toStoredIp } from '../utils/client-ip.util';

/**
 * Machine-readable error codes.
 *
 * The HTTP status alone is not a stable contract for clients — proxies and CDNs
 * rewrite reason phrases — so every response carries an explicit code the web
 * client can branch on without parsing prose.
 */
const STATUS_CODES: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.GONE]: 'GONE',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_ERROR',
  [HttpStatus.NOT_IMPLEMENTED]: 'NOT_IMPLEMENTED',
  [HttpStatus.BAD_GATEWAY]: 'BAD_GATEWAY',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

/** Generic text returned for any 5xx so internals never reach the client. */
const GENERIC_SERVER_MESSAGE = 'An unexpected vault error occurred.';

/**
 * Global exception filter.
 *
 * Sanitisation contract:
 *  - stack traces, driver messages, SQL fragments and object shapes are captured
 *    **internally** (server log) and never serialised into the response;
 *  - 5xx responses always carry the same generic message, whatever the cause;
 *  - 4xx responses keep their operator-facing text — a caller needs to know that
 *    an invitation expired — but the `details` block is rebuilt field by field
 *    instead of echoing the raw exception object.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const requestId = resolveRequestId(request);

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const isServerError = statusCode >= HttpStatus.INTERNAL_SERVER_ERROR;

    /*
     * Guards run before interceptors in Nest, so a request rejected by
     * `JwtAuthGuard`/`RbacGuard` never reaches `RequestContextInterceptor`. The
     * header is therefore set here as well, which keeps the correlation id on
     * *every* response — including the ones that failed at the edge.
     */
    response.setHeader('X-Request-Id', requestId);

    // Internally: the full cause, including the stack, for operators.
    const logPayload = {
      requestId,
      statusCode,
      method: request.method,
      path: request.path,
      ip: toStoredIp(request),
      exception: describeException(exception),
      ...(isServerError && exception instanceof Error ? { stack: exception.stack } : {}),
    };

    if (isServerError) {
      this.logger.error(JSON.stringify(logPayload));
    } else {
      this.logger.warn(JSON.stringify(logPayload));
    }

    const envelope = errorEnvelope(
      statusCode,
      resolveErrorCode(exception, statusCode),
      isServerError ? GENERIC_SERVER_MESSAGE : extractClientMessage(exception, statusCode),
      { requestId },
      isServerError ? null : extractValidationDetails(exception)
    );

    response.status(statusCode).json(envelope);
  }
}

function resolveErrorCode(exception: unknown, statusCode: number): string {
  if (exception instanceof ThrottlerException) {
    return 'RATE_LIMITED';
  }
  return STATUS_CODES[statusCode] ?? 'REQUEST_FAILED';
}

/**
 * Extracts the human-readable message for a 4xx.
 *
 * `HttpException.getResponse()` is either a string or a `{ message, error, … }`
 * object; validation errors put an array of field messages in `message`.
 */
function extractClientMessage(exception: unknown, statusCode: number): string {
  // The throttler's default message embeds its exception class name.
  if (exception instanceof ThrottlerException) {
    return 'Too many requests. Please wait before trying again.';
  }

  if (!(exception instanceof HttpException)) {
    return GENERIC_SERVER_MESSAGE;
  }

  const payload = exception.getResponse();
  if (typeof payload === 'string') return payload;

  if (typeof payload === 'object' && payload !== null) {
    const message = (payload as Record<string, unknown>)['message'];
    if (typeof message === 'string' && message.length > 0) return message;
    if (Array.isArray(message) && message.length > 0) {
      return 'The request payload failed validation.';
    }
    const error = (payload as Record<string, unknown>)['error'];
    if (typeof error === 'string' && error.length > 0) return error;
  }

  return `${statusCode} request could not be completed.`;
}

/**
 * Re-emits validation failures as a `{ field: message }` map.
 *
 * Only `class-validator` output reaches this branch, and only the field names and
 * messages are kept — the raw constraint objects are dropped.
 */
function extractValidationDetails(exception: unknown): Record<string, unknown> | null {
  if (!(exception instanceof HttpException)) return null;

  const payload = exception.getResponse();
  if (typeof payload !== 'object' || payload === null) return null;

  const message = (payload as Record<string, unknown>)['message'];
  if (!Array.isArray(message) || message.length === 0) return null;

  const details: Record<string, unknown> = {};
  for (const entry of message) {
    if (typeof entry !== 'string') continue;
    const separator = entry.indexOf(' ');
    if (separator === -1) {
      details[entry] = 'is invalid';
      continue;
    }
    details[entry.slice(0, separator)] = entry.slice(separator + 1);
  }

  return Object.keys(details).length > 0 ? { validation: details } : null;
}

/** Safe, non-throwing description used for internal logging only. */
function describeException(exception: unknown): string {
  if (exception instanceof Error) {
    return `${exception.name}: ${exception.message}`;
  }
  if (typeof exception === 'string') return exception;
  return 'Non-error value thrown';
}