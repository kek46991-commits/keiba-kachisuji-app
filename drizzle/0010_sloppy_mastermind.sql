ALTER TABLE `race_entries` ADD `horseAffiliation` enum('JRA','NAR');--> statement-breakpoint
ALTER TABLE `race_entries` ADD `organizer` enum('JRA','NAR') DEFAULT 'JRA';--> statement-breakpoint
ALTER TABLE `race_schedules` ADD `isExchangeRace` boolean DEFAULT false NOT NULL;
