import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes/index";
import { serveStatic } from "./static";
import { createServer } from "http";
import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient";
import { WebhookHandlers } from "./webhookHandlers";
import { getEnv, assertSsoConfigForProduction } from "./env";
import { isAppError, errMsg } from "./errors";
import { logger, httpLogger, requestIdMiddleware } from "./logger";

const app = express();
const httpServer = createServer(app);

app.set("trust proxy", 1);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

const env = getEnv();
assertSsoConfigForProduction();

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests, please try again later.",
  skip: () => env.NODE_ENV !== "production",
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many webhook requests.",
  skip: () => env.NODE_ENV !== "production",
});

app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/sso", authLimiter);
app.use("/api/stripe/webhook", webhookLimiter);
app.use("/api/call-recovery/webhook", webhookLimiter);

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.warn("DATABASE_URL not set, skipping Stripe init");
    return;
  }

  try {
    logger.info("Initializing Stripe schema...");
    await runMigrations({ databaseUrl });
    logger.info("Stripe schema ready");

    const stripeSync = await getStripeSync();

    const replitDomains = process.env.REPLIT_DOMAINS;
    if (replitDomains) {
      logger.info("Setting up managed webhook...");
      const webhookBaseUrl = `https://${replitDomains.split(",")[0]}`;
      try {
        const result = await stripeSync.findOrCreateManagedWebhook(
          `${webhookBaseUrl}/api/stripe/webhook`
        );
        logger.info({ url: result?.webhook?.url }, "Webhook configured");
      } catch (whErr) {
        logger.warn({ err: errMsg(whErr) }, "Webhook setup warning (non-fatal)");
      }
    } else {
      logger.warn("REPLIT_DOMAINS not set, skipping webhook setup");
    }

    logger.info("Syncing Stripe data...");
    stripeSync
      .syncBackfill()
      .then(() => logger.info("Stripe data synced"))
      .catch((err: unknown) => logger.error({ err: errMsg(err) }, "Error syncing Stripe data"));
  } catch (error) {
    logger.error({ err: errMsg(error) }, "Failed to initialize Stripe");
  }
}

initStripe().catch((err) => logger.error({ err: err?.message || err }, "Stripe init error"));

app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  requestIdMiddleware,
  async (req, res) => {
    const reqLog = logger.child({ requestId: (req as any).id, route: "/api/stripe/webhook" });
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      reqLog.warn("Missing stripe-signature header");
      return res.status(400).json({ error: "Missing stripe-signature" });
    }

    const sig = Array.isArray(signature) ? signature[0] : signature;
    if (!Buffer.isBuffer(req.body)) {
      reqLog.error("STRIPE WEBHOOK ERROR: req.body is not a Buffer");
      return res.status(500).json({ error: "Webhook processing error" });
    }

    try {
      await WebhookHandlers.processWebhook(req.body as Buffer, sig, reqLog);
      res.status(200).json({ received: true });
    } catch (error) {
      const isSignatureError = (err: any) => 
        err?.code === "signature_verification_failed" || 
        err?.type === "signature_verification_failed" ||
        err?.message?.includes("No signatures found matching");

      if (isSignatureError(error)) {
        reqLog.warn({ err: errMsg(error) }, "Webhook signature verification failed");
        return res.status(400).json({ error: "Invalid signature" });
      }

      // Processing errors → 500 so Stripe retries
      reqLog.error({ err: errMsg(error) }, "Webhook processing error");
      res.status(500).json({ error: "Webhook processing error" });
    }
  }
);

const publicLeadJsonParser = express.json({
  limit: "64kb",
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
});

app.use("/api/public/lead-capture", publicLeadJsonParser);
app.use("/api/public/lead-source", publicLeadJsonParser);

app.use(
  express.json({
    limit: "5mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.use(express.urlencoded({ extended: false, limit: "5mb" }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  // Startup banner — keep as-is in dev so the workflow detector sees the URL
  // eslint-disable-next-line no-console
  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use(httpLogger);

(async () => {
  const { seedDatabase, ensureSuperAdmin, ensureDemoAccount, ensureReviewerAccount } = await import("./seed");
  await seedDatabase();
  await ensureSuperAdmin();
  await ensureDemoAccount();
  await ensureReviewerAccount();

  const { seedStripeProducts } = await import("./seedProducts");
  await seedStripeProducts();

  await registerRoutes(httpServer, app);

  const { startReminderWorker } = await import("./reminderWorker");
  startReminderWorker();

  const { startPurgeWorker } = await import("./purgeWorker");
  startPurgeWorker();

  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      return next(err);
    }

    const errorType = (err as { type?: string })?.type;
    if (errorType === "entity.too.large") {
      return res.status(413).json({
        error: "payload_too_large",
        message: "Lead submissions must be 64 KB or smaller.",
      });
    }

    const isProduction = process.env.NODE_ENV === "production";

    if (isAppError(err)) {
      return res.status(err.statusCode).json({
        message: errMsg(err),
      });
    }

    const status = (err as { status?: number; statusCode?: number })?.status
      ?? (err as { status?: number; statusCode?: number })?.statusCode
      ?? 500;

    const message = isProduction
      ? "An unexpected error occurred"
      : (err instanceof Error ? errMsg(err) : "Internal Server Error");

    const reqLog = (req as any).log || logger;
    reqLog.error({ err: err instanceof Error ? err.message : err, stack: err instanceof Error ? err.stack : undefined }, "Unhandled error");
    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    }
  );
})();
