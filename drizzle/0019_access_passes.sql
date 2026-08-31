CREATE TABLE IF NOT EXISTS `access_passes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `key_hash` varchar(64) NOT NULL,
  `plan` varchar(32) NOT NULL,
  `provider` varchar(32) NOT NULL,
  `provider_ref` varchar(255),
  `email` varchar(320),
  `amount` int,
  `currency` varchar(8),
  `issued_at` timestamp NOT NULL DEFAULT (now()),
  `expires_at` timestamp NOT NULL,
  `revoked_at` timestamp,
  CONSTRAINT `access_passes_id` PRIMARY KEY(`id`),
  CONSTRAINT `access_passes_key_hash_unique` UNIQUE(`key_hash`),
  CONSTRAINT `uq_access_passes_provider_ref` UNIQUE(`provider`,`provider_ref`)
);
