import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const tasks = sqliteTable("tasks", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  id: text("id").notNull(),
  title: text("title").notNull(),
  notes: text("notes").notNull().default(""),
  deadline: text("deadline").notNull(),
  targetMinutes: integer("target_minutes").notNull(),
  focusedSeconds: integer("focused_seconds").notNull(),
  importance: text("importance").notNull(),
  reminderMinutes: integer("reminder_minutes").notNull(),
  nextReminderAt: integer("next_reminder_at").notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  completedAt: integer("completed_at"),
  createdAt: integer("created_at").notNull(),
  source: text("source"),
  sourceUid: text("source_uid"),
  course: text("course"),
  assessmentType: text("assessment_type"),
  originalDeadline: text("original_deadline"),
  plannedDate: text("planned_date"),
  updatedAt: integer("updated_at").notNull(),
  deletedAt: integer("deleted_at"),
}, (table) => [
  primaryKey({ columns: [table.userId, table.id] }),
  index("idx_tasks_user_updated").on(table.userId, table.updatedAt),
]);
