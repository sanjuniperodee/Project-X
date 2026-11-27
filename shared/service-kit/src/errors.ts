import type { ErrorCode } from '@px/contracts';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  bad_request: 400,
  validation_failed: 422,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  unavailable: 503,
  internal: 500,
};

/**
 * Expected, user-facing failure. Anything that is not an AppError is treated
 * as a bug: logged with a stack trace and returned as a generic 500.
 */
export class AppError extends Error {
  override readonly name = 'AppError';
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.status = STATUS_BY_CODE[code];
  }

  static badRequest(message: string) {
    return new AppError('bad_request', message);
  }
  static validation(fields: Record<string, string>, message = 'Проверьте заполненные поля') {
    return new AppError('validation_failed', message, fields);
  }
  static unauthorized(message = 'Требуется авторизация') {
    return new AppError('unauthorized', message);
  }
  static forbidden(message = 'Недостаточно прав') {
    return new AppError('forbidden', message);
  }
  static notFound(what: string) {
    return new AppError('not_found', `${what} не найден`);
  }
  static conflict(message: string) {
    return new AppError('conflict', message);
  }
  static unavailable(message: string) {
    return new AppError('unavailable', message);
  }
}
