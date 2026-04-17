CREATE TABLE `savedReports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`startDate` varchar(10) NOT NULL,
	`endDate` varchar(10) NOT NULL,
	`repFilter` varchar(320) NOT NULL DEFAULT 'all',
	`totalInvoices` int NOT NULL DEFAULT 0,
	`deliveredCount` int NOT NULL DEFAULT 0,
	`undeliveredCount` int NOT NULL DEFAULT 0,
	`totalSales` varchar(20) NOT NULL DEFAULT '0',
	`totalBonus` varchar(20) NOT NULL DEFAULT '0',
	`deliveredBonus` varchar(20) NOT NULL DEFAULT '0',
	`undeliveredBonus` varchar(20) NOT NULL DEFAULT '0',
	`reportData` mediumtext NOT NULL,
	`createdBy` varchar(320),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `savedReports_id` PRIMARY KEY(`id`)
);
