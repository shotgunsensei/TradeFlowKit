import { errMsg } from "./errors";
import { storage } from "./storage";
import { getEnv } from "./env";
import { logger as rootLogger } from "./logger";

const log = rootLogger.child({ component: "purge-worker" });

const WORKER_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily

async function runPurge() {
  const env = getEnv();
  const retentionDays = env.SOFT_DELETE_RETENTION_DAYS;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  log.info({ retentionDays, cutoff: cutoff.toISOString() }, "Purging soft-deleted rows older than cutoff");

  // Purge jobs first so their FK-null updates run before any
  // referenced quotes/invoices/customers are themselves purged.
  try {
    const jobs = await storage.purgeSoftDeletedJobs(cutoff);
    if (jobs > 0) log.info({ count: jobs }, "Purged soft-deleted jobs");
  } catch (err) {
    log.error({ err, msg: errMsg(err) }, "Error purging soft-deleted jobs");
  }

  try {
    const invs = await storage.purgeSoftDeletedInvoices(cutoff);
    if (invs > 0) log.info({ count: invs }, "Purged soft-deleted invoices");
  } catch (err) {
    log.error({ err, msg: errMsg(err) }, "Error purging soft-deleted invoices");
  }

  try {
    const custs = await storage.purgeSoftDeletedCustomers(cutoff);
    if (custs > 0) log.info({ count: custs }, "Purged soft-deleted customers");
  } catch (err) {
    log.error({ err, msg: errMsg(err) }, "Error purging soft-deleted customers");
  }
}

export function startPurgeWorker() {
  runPurge().catch((err) => log.error({ err, msg: errMsg(err) }, "Initial purge run error"));
  const interval = setInterval(() => {
    runPurge().catch((err) => log.error({ err, msg: errMsg(err) }, "Purge run error"));
  }, WORKER_INTERVAL_MS);

  log.info({ intervalHours: WORKER_INTERVAL_MS / (60 * 60 * 1000) }, "Purge worker started");
  return interval;
}
