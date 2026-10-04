CREATE TABLE `authorized_data_sources` (
  `id` int AUTO_INCREMENT NOT NULL,
  `source_key` varchar(64) NOT NULL,
  `provider_name` varchar(128) NOT NULL,
  `organizer` enum('JRA','NAR') NOT NULL,
  `delivery_method` enum('csv','api') NOT NULL,
  `authorization_reference` varchar(512) NOT NULL,
  `status` enum('pending','active','revoked') NOT NULL DEFAULT 'pending',
  `allowed_uses` json NOT NULL,
  `approved_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `authorized_data_sources_id` PRIMARY KEY(`id`),
  CONSTRAINT `authorized_data_sources_source_key_unique` UNIQUE(`source_key`)
);

CREATE INDEX `idx_authorized_data_sources_status` ON `authorized_data_sources` (`status`,`organizer`);

CREATE TABLE `data_import_audits` (
  `id` int AUTO_INCREMENT NOT NULL,
  `source_id` int,
  `source_key` varchar(64) NOT NULL,
  `organizer` enum('JRA','NAR') NOT NULL,
  `import_kind` enum('race_list','entries','payouts','odds','combination_odds') NOT NULL,
  `file_name` varchar(255),
  `file_sha256` varchar(64),
  `row_count` int NOT NULL DEFAULT 0,
  `status` enum('accepted','rejected','failed') NOT NULL,
  `reason` varchar(512),
  `imported_by_open_id` varchar(64),
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `data_import_audits_id` PRIMARY KEY(`id`)
);

CREATE INDEX `idx_data_import_audits_source_time` ON `data_import_audits` (`source_key`,`created_at`);
CREATE INDEX `idx_data_import_audits_status` ON `data_import_audits` (`status`,`created_at`);
