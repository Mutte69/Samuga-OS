import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const websiteVisitsTable = pgTable("website_visits", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  pagePath: text("page_path").notNull(),
  referrer: text("referrer"),
  userAgent: text("user_agent"),
  country: text("country"),
  visitedAt: timestamp("visited_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWebsiteVisitSchema = createInsertSchema(websiteVisitsTable).omit({ id: true, visitedAt: true });
export type InsertWebsiteVisit = z.infer<typeof insertWebsiteVisitSchema>;
export type WebsiteVisit = typeof websiteVisitsTable.$inferSelect;
