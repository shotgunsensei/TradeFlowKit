import pino from "pino";
import pinoHttp from "pino-http";
import { randomUUID } from "crypto";
import type { Request, Response, NextFunction } from "express";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      }),
});

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const existing = (req.headers["x-request-id"] as string) || undefined;
    const id = existing || randomUUID();
    res.setHeader("x-request-id", id);
    return id;
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  customProps: (req) => {
    const r = req as Request;
    return {
      requestId: (req as any).id,
      orgId: r.session?.orgId,
      userId: r.session?.userId,
      route: r.path,
    };
  },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
    }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
  autoLogging: {
    ignore: (req) => !req.url?.startsWith("/api"),
  },
});

declare module "http" {
  interface IncomingMessage {
    log: pino.Logger;
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const existing = (req.headers["x-request-id"] as string) || undefined;
  const id = existing || randomUUID();
  (req as any).id = id;
  res.setHeader("x-request-id", id);
  next();
}
