/**
 * Custom Error class for API failures.
 *
 * `status` is the HTTP status code (or `0` for client-side failures);
 * `code` is the machine-readable error code from the response body
 * (`docs/frontend/api/api-spec.md` §1).
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface ApiErrorBody {
  error?: string;
  message?: string;
  details?: unknown;
}