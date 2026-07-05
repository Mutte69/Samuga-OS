import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userAnalyticsTable = pgTable("user_analytics", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  userIdentifier: text("user_identifier").notNull(),
  actionPerformed: text("action_performed").notNull(),
  dataPayload: jsonb("data_payload"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserAnalyticSchema = createInsertSchema(userAnalyticsTable).omit({ id: true, timestamp: true });
export type InsertUserAnalytic = z.infer<typeof insertUserAnalyticSchema>;
export type UserAnalytic = typeof userAnalyticsTable.$inferSelect;
