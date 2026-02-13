CREATE TABLE `repSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`repEmail` varchar(320) NOT NULL,
	`repNickname` text,
	`monthlyTarget` int DEFAULT 0,
	`bonusAmount` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `repSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `repSettings_repEmail_unique` UNIQUE(`repEmail`)
);
