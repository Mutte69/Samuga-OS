import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectEventsTable = pgTable("project_events", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  eventType: text("event_type").notNull(),
  message: text("message").notNull(),
  metadata: jsonb("metadata"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProjectEventSchema = createInsertSchema(projectEventsTable).omit({ id: true, occurredAt: true });
export type InsertProjectEvent = z.infer<typeof insertProjectEventSchema>;
export type ProjectEvent = typeof projectEventsTable.$inferSelect;
