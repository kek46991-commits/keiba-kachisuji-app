ALTER TABLE `horses` ADD `imageUrl` text;--> statement-breakpoint
ALTER TABLE `horses` ADD `trainer` varchar(64);--> statement-breakpoint
ALTER TABLE `horses` ADD `owner` varchar(128);--> statement-breakpoint
ALTER TABLE `horses` ADD `breeder` varchar(128);--> statement-breakpoint
ALTER TABLE `horses` ADD `sire` varchar(128);--> statement-breakpoint
ALTER TABLE `horses` ADD `dam` varchar(128);--> statement-breakpoint
ALTER TABLE `horses` ADD `damSire` varchar(128);--> statement-breakpoint
ALTER TABLE `horses` ADD `totalEarnings` float DEFAULT 0;--> statement-breakpoint
ALTER TABLE `horses` ADD `notableWin` text;--> statement-breakpoint
ALTER TABLE `horses` ADD `coatColor` varchar(32);--> statement-breakpoint
ALTER TABLE `horses` ADD `birthDate` varchar(16);--> statement-breakpoint
ALTER TABLE `race_results` ADD `hitTickets` text;
