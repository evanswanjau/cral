import pino, { type LoggerOptions } from "pino";
import type { IncomingMessage, ServerResponse } from "node:http";

const isProduction = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

/**
 * Request logging, deliberately narrow.
 *
 * pino-http's default serializers dump the whole `req`/`res` - every request
 * header, every response header - as one JSON line per request. In a terminal
 * that is unreadable, and it also writes the caller's `Authorization: Bearer
 * <access token>` to disk on every authenticated hit, where anything that can
 * read the log can replay a live session. So: our own serializers, plus
 * redaction as a backstop for anything a future serializer re-adds.
 *
 * In development the lines go through pino-pretty as one line each
 * (`GET /bookings/bkg_… 304 71ms`); in production they stay newline-delimited
 * JSON, which is what a log shipper wants.
 */
const REDACT = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-api-key"]',
  "res.headers[\"set-cookie\"]",
];

const transport: LoggerOptions["transport"] =
  isProduction || isTest
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          // The message we build already carries method/url/status/duration,
          // so everything structural is noise on a dev terminal.
          ignore: "pid,hostname,req,res,responseTime,reqId",
          messageFormat: "{msg}",
          singleLine: true,
        },
      };

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isTest ? "silent" : "info"),
  redact: { paths: REDACT, remove: true },
  ...(transport ? { transport } : {}),
});

/** Only what a reader of a request line actually needs. */
export const httpSerializers = {
  req(req: IncomingMessage & { id?: string; url?: string; method?: string }) {
    return { id: req.id, method: req.method, url: req.url };
  },
  res(res: ServerResponse) {
    return { statusCode: res.statusCode };
  },
};

export function requestLine(
  req: IncomingMessage & { method?: string; url?: string },
  res: ServerResponse,
  responseTime?: number,
): string {
  const ms = responseTime === undefined ? "" : ` ${Math.round(responseTime)}ms`;
  return `${req.method ?? "?"} ${req.url ?? "?"} ${res.statusCode}${ms}`;
}
