import type { Express } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "../db";
import { getSessionSecret } from "../env";

import authRouter from "./auth";
import ssoRouter from "./sso";
import orgsRouter from "./orgs";
import customersRouter from "./customers";
import jobsRouter from "./jobs";
import quotesRouter from "./quotes";
import invoicesRouter from "./invoices";
import subscriptionsRouter from "./subscriptions";
import callRecoveryRouter from "./callRecovery";
import adminRouter from "./admin";
import wellKnownRouter from "./wellKnown";
import analyticsRouter from "./analytics";
import stripeConnectRouter from "./stripeConnect";
import reviewRequestsRouter from "./reviewRequests";
import automationsRouter from "./automations";
import portalRouter from "./portal";
import searchRouter from "./search";
import twoFactorRouter from "./twoFactor";
import exportsRouter from "./exports";
import auditLogRouter from "./auditLog";
import operatorosRouter from "./operatoros";
import entitlementsRouter from "./entitlements";
import trashRouter from "./trash";
import leadsRouter from "./leads";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    orgId?: string;
    pending2faUserId?: string;
  }
}

const PgSession = connectPgSimple(session);

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  const isProduction = process.env.NODE_ENV === "production";

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
    ) WITH (OIDS=FALSE);
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
  `);

  app.use(
    session({
      store: new PgSession({
        pool: pool as any,
        createTableIfMissing: true,
      }),
      secret: getSessionSecret(),
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
      },
    })
  );

  app.use(wellKnownRouter);
  app.use(authRouter);
  app.use(ssoRouter);
  app.use(orgsRouter);
  app.use(customersRouter);
  app.use(jobsRouter);
  app.use(quotesRouter);
  app.use(invoicesRouter);
  app.use(subscriptionsRouter);
  app.use(callRecoveryRouter);
  app.use(analyticsRouter);
  app.use(stripeConnectRouter);
  app.use(reviewRequestsRouter);
  app.use(adminRouter);
  app.use(automationsRouter);
  app.use(portalRouter);
  app.use(searchRouter);
  app.use(twoFactorRouter);
  app.use(exportsRouter);
  app.use(auditLogRouter);
  app.use(operatorosRouter);
  app.use(entitlementsRouter);
  app.use(trashRouter);
  app.use(leadsRouter);

  return httpServer;
}
