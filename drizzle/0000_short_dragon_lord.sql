CREATE TABLE `fingerprint` (
	`id` text PRIMARY KEY NOT NULL,
	`thumbmark` text NOT NULL,
	`data` text NOT NULL,
	`visit_count` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`first_ip` text,
	`last_ip` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fingerprint_thumbmark_idx` ON `fingerprint` (`thumbmark`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`age` integer
);
