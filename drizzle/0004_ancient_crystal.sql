CREATE TABLE `news_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(256) NOT NULL,
	`thumbnailUrl` varchar(512),
	`summary` text,
	`linkUrl` varchar(512),
	`category` enum('breaking','result','column','prediction') NOT NULL DEFAULT 'breaking',
	`isPickup` boolean DEFAULT false,
	`publishedAt` timestamp NOT NULL DEFAULT (now()),
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `news_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `race_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`raceDate` varchar(16) NOT NULL,
	`venue` varchar(64) NOT NULL,
	`raceNumber` int NOT NULL,
	`raceName` varchar(128),
	`gateNum` int,
	`horseNum` int NOT NULL,
	`horseName` varchar(64) NOT NULL,
	`jockey` varchar(64),
	`trainer` varchar(64),
	`sexAge` varchar(16),
	`weight` varchar(8),
	`horseWeight` int,
	`horseWeightDiff` varchar(8),
	`odds` varchar(16),
	`popularity` int,
	`recentResults` varchar(64),
	`distance` int,
	`surface` varchar(16),
	`courseDetail` varchar(64),
	`startTime` varchar(8),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `race_entries_id` PRIMARY KEY(`id`)
);
