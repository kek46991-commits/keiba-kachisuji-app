CREATE TABLE IF NOT EXISTS `race_entry_master` (
  `id` int AUTO_INCREMENT NOT NULL,
  `race_key` varchar(64) NOT NULL,
  `race_name` varchar(128),
  `horse_number` int NOT NULL,
  `horse_name` varchar(64) NOT NULL,
  `jockey` varchar(64),
  `popularity` int,
  `odds` float,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `race_entry_master_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_race_entry_master_race_horse` UNIQUE(`race_key`,`horse_number`),
  KEY `idx_race_entry_master_race` (`race_key`)
);

ALTER TABLE `synthetic_prediction_runs` ADD `race_key` varchar(64);
