import { pgTable, serial, integer, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectMetricsTable = pgTable("project_metrics", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  metricName: text("metric_name").notNull(),
  value: numeric("value").notNull(),
  unit: text("unit"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProjectMetricSchema = createInsertSchema(projectMetricsTable).omit({ id: true, recordedAt: true });
export type InsertProjectMetric = z.infer<typeof insertProjectMetricSchema>;
export type ProjectMetric = typeof projectMetricsTable.$inferSelect;
