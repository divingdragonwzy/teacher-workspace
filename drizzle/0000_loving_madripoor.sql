CREATE TABLE `papers` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`data` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `paper_owner` ON `papers` (`owner`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`source_id` text,
	`data` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `question_owner` ON `questions` (`owner`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`hash` text NOT NULL,
	`data` text NOT NULL,
	`committed` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_owner_hash` ON `sources` (`owner`,`hash`);--> statement-breakpoint
CREATE INDEX `source_owner` ON `sources` (`owner`);