CREATE TABLE IF NOT EXISTS `combination_odds` (
  `id` int AUTO_INCREMENT NOT NULL,
  `race_id` varchar(32) NOT NULL,
  `bet_type` enum('trio','trifecta') NOT NULL,
  `combination` varchar(32) NOT NULL,
  `odds` decimal(12,1) NOT NULL,
  `fetched_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `minutes_to_start` int,
  CONSTRAINT `combination_odds_id` PRIMARY KEY(`id`),
  KEY `idx_combination_odds_race_time` (`race_id`,`fetched_at`),
  KEY `idx_combination_odds_lookup` (`race_id`,`bet_type`,`combination`,`fetched_at`)
);
