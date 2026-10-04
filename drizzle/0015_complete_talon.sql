CREATE TABLE `frame_position_stats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`venue` varchar(64) NOT NULL,
	`surface` varchar(8) NOT NULL,
	`distance` int NOT NULL,
	`frame_number` int NOT NULL,
	`total_runs` int NOT NULL DEFAULT 0,
	`win_count` int NOT NULL DEFAULT 0,
	`place_count` int NOT NULL DEFAULT 0,
	`show_count` int NOT NULL DEFAULT 0,
	`longshot_win_count` int NOT NULL DEFAULT 0,
	`longshot_place_count` int NOT NULL DEFAULT 0,
	`longshot_rate` varchar(8),
	`last_longshot_interval` int,
	`avg_longshot_cycle` varchar(8),
	`current_drought` int DEFAULT 0,
	`organizer` enum('JRA','NAR') DEFAULT 'JRA',
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `frame_position_stats_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `race_odds` (
	`id` int AUTO_INCREMENT NOT NULL,
	`race_id` varchar(20) NOT NULL,
	`horse_num` int NOT NULL,
	`win_odds` varchar(16),
	`place_odds_min` varchar(16),
	`place_odds_max` varchar(16),
	`popularity` int,
	`odds_status` enum('provisional','confirmed','final') DEFAULT 'provisional',
	`change_rate` varchar(16),
	`is_sudden_change` boolean DEFAULT false,
	`fetched_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `race_odds_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `race_prediction_patterns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`race_id` varchar(20) NOT NULL,
	`pattern_type` enum('honmei','ana','balance') NOT NULL,
	`pattern_name` varchar(64) NOT NULL,
	`pattern_description` text,
	`trifecta_first` varchar(64),
	`trifecta_second` varchar(64),
	`trifecta_third` varchar(128),
	`betting_json` text,
	`expected_payout_range` varchar(64),
	`confidence_score` int,
	`frame_stats_score` int,
	`odds_change_score` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `race_prediction_patterns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trifecta_odds` (
	`id` int AUTO_INCREMENT NOT NULL,
	`race_id` varchar(20) NOT NULL,
	`first` int NOT NULL,
	`second` int NOT NULL,
	`third` int NOT NULL,
	`odds` varchar(32) NOT NULL,
	`popularity` int,
	`fetched_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trifecta_odds_id` PRIMARY KEY(`id`)
);
