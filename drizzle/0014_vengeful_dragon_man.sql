ALTER TABLE `horse_race_history` ADD `bracketNumber` int;--> statement-breakpoint
ALTER TABLE `horse_race_history` ADD `horseNumber` int;--> statement-breakpoint
ALTER TABLE `horse_race_history` ADD `cornerPositions` varchar(64);--> statement-breakpoint
ALTER TABLE `race_results` ADD `winPayout` int;--> statement-breakpoint
ALTER TABLE `race_results` ADD `placePayout` text;--> statement-breakpoint
ALTER TABLE `race_results` ADD `quinellaPayout` int;--> statement-breakpoint
ALTER TABLE `race_results` ADD `widePayout` text;--> statement-breakpoint
ALTER TABLE `race_results` ADD `raceNumber` int;--> statement-breakpoint
ALTER TABLE `race_results` ADD `distance` int;--> statement-breakpoint
ALTER TABLE `race_results` ADD `surface` varchar(8);--> statement-breakpoint
ALTER TABLE `race_results` ADD `trackCondition` varchar(16);--> statement-breakpoint
ALTER TABLE `race_results` ADD `horseCount` int;
