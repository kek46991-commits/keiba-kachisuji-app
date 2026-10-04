CREATE TABLE IF NOT EXISTS `prediction_ticket_sets` (
  `id` int AUTO_INCREMENT NOT NULL,
  `prediction_id` int NOT NULL,
  `race_id` varchar(32) NOT NULL,
  `strategy` enum('score','longshot') NOT NULL,
  `ticket_data` text NOT NULL,
  `invest_amount` int,
  `return_amount` int,
  `is_hit` boolean,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `prediction_ticket_sets_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_prediction_ticket_sets_prediction_strategy` UNIQUE(`prediction_id`,`strategy`)
);
--> statement-breakpoint
CREATE INDEX `idx_prediction_ticket_sets_race` ON `prediction_ticket_sets` (`race_id`,`strategy`);
