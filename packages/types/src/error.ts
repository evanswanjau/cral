import { z } from "zod";

/**
 * The single error envelope shape from spec §2. Every 4xx/5xx response uses
 * this — `code` is stable and safe to switch on, `message` is for humans.
 */
export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    type: z.string(),
    code: z.string(),
    message: z.string(),
    field: z.string().optional(),
    doc_url: z.string().url().optional(),
    request_id: z.string(),
  }),
});

export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

export type ErrorType =
  | "validation_error"
  | "auth_error"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "server_error";

export interface ApiErrorOptions {
  status: number;
  type: ErrorType;
  code: string;
  message: string;
  field?: string;
  docUrl?: string;
}

/** Thrown by route handlers; the error-handler middleware turns it into an envelope. */
export class ApiError extends Error {
  readonly status: number;
  readonly type: ErrorType;
  readonly code: string;
  readonly field: string | undefined;
  readonly docUrl: string | undefined;

  constructor(options: ApiErrorOptions) {
    super(options.message);
    this.name = "ApiError";
    this.status = options.status;
    this.type = options.type;
    this.code = options.code;
    this.field = options.field;
    this.docUrl = options.docUrl;
  }
}
