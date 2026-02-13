CREATE TABLE `apiSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`qoyodApiKey` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `apiSettings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `productSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` varchar(128) NOT NULL,
	`productName` text,
	`premiumPrice` int NOT NULL DEFAULT 70,
	`basePrice` int NOT NULL DEFAULT 69,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `productSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `productSettings_productId_unique` UNIQUE(`productId`)
);
--> statement-breakpoint
ALTER TABLE `apiSettings` ADD CONSTRAINT `apiSettings_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;