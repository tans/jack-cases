CREATE TABLE `case_favorites` (
	`user_id` text NOT NULL,
	`case_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `case_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `page_views` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`requirement_id` text,
	`case_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`requirement_id`) REFERENCES `requirements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `page_views_created_idx` ON `page_views` (`created_at`);--> statement-breakpoint
CREATE INDEX `page_views_requirement_idx` ON `page_views` (`requirement_id`);--> statement-breakpoint
CREATE INDEX `page_views_case_idx` ON `page_views` (`case_id`);
