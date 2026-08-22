CREATE TABLE `race_analysis_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`raceName` varchar(128) NOT NULL,
	`venue` varchar(64) NOT NULL,
	`surface` enum('turf','dirt') NOT NULL DEFAULT 'turf',
	`distance` int NOT NULL,
	`weather` varchar(32),
	`trackCondition` varchar(32),
	`raceDate` varchar(16) NOT NULL,
	`netkeibaRaceId` varchar(32),
	`analysisJson` text NOT NULL,
	`bettingJson` text,
	`predicted1st` varchar(64),
	`predicted2nd` varchar(64),
	`predicted3rd` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `race_analysis_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `race_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`analysisId` int,
	`raceName` varchar(128) NOT NULL,
	`venue` varchar(64) NOT NULL,
	`raceDate` varchar(16) NOT NULL,
	`netkeibaRaceId` varchar(32),
	`actual1st` varchar(64),
	`actual2nd` varchar(64),
	`actual3rd` varchar(64),
	`trifectaPayout` int,
	`trioBoxPayout` int,
	`exactaPayout` int,
	`isHit` boolean DEFAULT false,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `race_results_id` PRIMARY KEY(`id`)
);
