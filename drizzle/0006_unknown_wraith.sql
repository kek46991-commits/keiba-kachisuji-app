CREATE TABLE `odds_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`race_id` varchar(16) NOT NULL,
	`horse_num` int NOT NULL,
	`odds` varchar(16) NOT NULL,
	`popularity` int,
	`fetched_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `odds_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scheduled_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`schedule_cron_task_uid` varchar(65),
	`last_run_at` timestamp,
	`last_run_result` text,
	`is_active` boolean DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scheduled_jobs_id` PRIMARY KEY(`id`)
);
