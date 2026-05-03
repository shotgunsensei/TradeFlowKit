import { eq } from "drizzle-orm";
import { db } from "../db";
import { processedStripeEvents } from "@shared/schema";

export const billingStorage = {
  async recordProcessedStripeEvent(eventId: string, type: string): Promise<boolean> {
    const [result] = await db
      .insert(processedStripeEvents)
      .values({ eventId, type })
      .onConflictDoNothing()
      .returning();
    return !!result;
  },

  async deleteProcessedStripeEvent(eventId: string): Promise<void> {
    await db.delete(processedStripeEvents).where(eq(processedStripeEvents.eventId, eventId));
  },
};
