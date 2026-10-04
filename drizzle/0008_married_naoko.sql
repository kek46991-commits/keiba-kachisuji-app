CREATE TABLE `g3_races` (
	`id` int AUTO_INCREMENT NOT NULL,
	`raceDate` date NOT NULL,
	`venue` varchar(64) NOT NULL,
	`raceNumber` int NOT NULL,
	`raceName` varchar(128) NOT NULL,
	`grade` varchar(16) NOT NULL,
	`distance` int,
	`surface` enum('turf','dirt') NOT NULL DEFAULT 'turf',
	`startTime` time,
	`netkeibaRaceId` varchar(32),
	`isFrameConfirmed` boolean NOT NULL DEFAULT false,
	`isEntriesConfirmed` boolean NOT NULL DEFAULT false,
	`blogPostId` int,
	`isBlogPublished` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `g3_races_id` PRIMARY KEY(`id`)
);
