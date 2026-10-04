ALTER TABLE `blog_posts` ADD `isPinned` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `blog_posts` ADD `isBreaking` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `blog_posts` ADD `relatedPostId` int;
