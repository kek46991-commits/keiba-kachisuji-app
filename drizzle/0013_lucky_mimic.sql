CREATE TABLE `horse_evaluations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`horseId` int NOT NULL,
	`aiRating` varchar(8),
	`evaluationSummary` text,
	`strongConditions` text,
	`weakConditions` text,
	`targetConditions` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `horse_evaluations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `horse_race_history` ADD `horseId` int;--> statement-breakpoint
ALTER TABLE `horses` ADD `trackBiasAptitude` varchar(255);--> statement-breakpoint
ALTER TABLE `horses` ADD `courseDirection` varchar(100);--> statement-breakpoint
ALTER TABLE `horses` ADD `surfaceAptitude` text;--> statement-breakpoint
ALTER TABLE `horses` ADD `nameEn` varchar(128);--> statement-breakpoint
ALTER TABLE `horses` ADD `nameMeaning` text;--> statement-breakpoint
ALTER TABLE `horses` ADD `earningsJra` float DEFAULT 0;--> statement-breakpoint
ALTER TABLE `horses` ADD `earningsLocal` float DEFAULT 0;--> statement-breakpoint
ALTER TABLE `horses` ADD `weight` int;--> statement-breakpoint
ALTER TABLE `horses` ADD `distanceAptitudeDetail` text;--> statement-breakpoint
ALTER TABLE `horses` ADD `trackConditionAptitude` varchar(255);--> statement-breakpoint
ALTER TABLE `horses` ADD `framePreference` varchar(128);--> statement-breakpoint
ALTER TABLE `horses` ADD `totalSeconds` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `horses` ADD `totalThirds` int DEFAULT 0;
