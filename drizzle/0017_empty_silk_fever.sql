CREATE TABLE `score_weights` (
	`id` int AUTO_INCREMENT NOT NULL,
	`version` int NOT NULL,
	`base_weight` float NOT NULL DEFAULT 1,
	`history_weight` float NOT NULL DEFAULT 1,
	`advanced_weight` float NOT NULL DEFAULT 1,
	`paddock_weight` float NOT NULL DEFAULT 1,
	`sample_size` int NOT NULL DEFAULT 0,
	`hit_rate` float,
	`place_rate` float,
	`metadata_json` text,
	`is_active` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `score_weights_id` PRIMARY KEY(`id`)
);
