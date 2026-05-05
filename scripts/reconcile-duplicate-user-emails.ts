import { sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { users } from "@shared/schema";

async function main() {
  console.log("[reconcile-emails] scanning for duplicate user emails…");

  await db.execute(sql`
    UPDATE ${users}
    SET email = lower(trim(email))
    WHERE email IS NOT NULL
      AND email <> ''
      AND email <> lower(trim(email))
  `);

  const duplicates = await db.execute<{ email: string; count: number }>(sql`
    SELECT lower(trim(email)) AS email, COUNT(*)::int AS count
    FROM ${users}
    WHERE email IS NOT NULL AND length(trim(email)) > 0
    GROUP BY lower(trim(email))
    HAVING COUNT(*) > 1
  `);

  if (duplicates.rows.length === 0) {
    console.log("[reconcile-emails] no duplicates found.");
    await pool.end();
    return;
  }

  console.log(`[reconcile-emails] found ${duplicates.rows.length} duplicated email(s).`);

  for (const row of duplicates.rows) {
    const winners = await db.execute<{ id: string }>(sql`
      SELECT id FROM ${users}
      WHERE lower(trim(email)) = ${row.email}
      ORDER BY id ASC
    `);
    if (winners.rows.length <= 1) continue;

    const [keep, ...losers] = winners.rows;
    console.log(
      `[reconcile-emails] email=${row.email} keep=${keep.id} blanking=${losers.map((l) => l.id).join(",")}`
    );

    for (const loser of losers) {
      await db.execute(sql`
        UPDATE ${users} SET email = '' WHERE id = ${loser.id}
      `);
    }
  }

  console.log("[reconcile-emails] done. Re-run drizzle push now to add the unique index.");
  await pool.end();
}

main().catch(async (err) => {
  console.error("[reconcile-emails] failed:", err);
  await pool.end();
  process.exit(1);
});
