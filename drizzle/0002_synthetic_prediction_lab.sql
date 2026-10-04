CREATE TABLE IF NOT EXISTS `synthetic_prediction_runs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `run_id` varchar(64) NOT NULL,
  `label` varchar(128) NOT NULL,
  `is_synthetic` boolean NOT NULL DEFAULT true,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `synthetic_prediction_runs_id` PRIMARY KEY(`id`),
  CONSTRAINT `synthetic_prediction_runs_run_id_unique` UNIQUE(`run_id`)
);

CREATE TABLE IF NOT EXISTS `synthetic_prediction_entries` (
  `id` int AUTO_INCREMENT NOT NULL,
  `run_id` varchar(64) NOT NULL,
  `horse_number` int NOT NULL,
  `horse_name` varchar(64) NOT NULL,
  `popularity` int NOT NULL,
  `odds` float NOT NULL,
  `time_dm` float NOT NULL,
  `score` float NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `synthetic_prediction_entries_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_synthetic_prediction_entries_run_horse` UNIQUE(`run_id`,`horse_number`),
  KEY `idx_synthetic_prediction_entries_run` (`run_id`)
);

CREATE TABLE IF NOT EXISTS `synthetic_prediction_outputs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `run_id` varchar(64) NOT NULL,
  `score_tickets` text NOT NULL,
  `longshot_tickets` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `synthetic_prediction_outputs_id` PRIMARY KEY(`id`),
  CONSTRAINT `synthetic_prediction_outputs_run_id_unique` UNIQUE(`run_id`),
  KEY `idx_synthetic_prediction_outputs_run` (`run_id`)
);
