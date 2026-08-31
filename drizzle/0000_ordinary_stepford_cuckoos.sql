CREATE TABLE `tasks` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`title` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`deadline` text NOT NULL,
	`target_minutes` integer NOT NULL,
	`focused_seconds` integer NOT NULL,
	`importance` text NOT NULL,
	`reminder_minutes` integer NOT NULL,
	`next_reminder_at` integer NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`source` text,
	`source_uid` text,
	`course` text,
	`assessment_type` text,
	`original_deadline` text,
	`planned_date` text,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	PRIMARY KEY(`user_id`, `id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_user_updated` ON `tasks` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
