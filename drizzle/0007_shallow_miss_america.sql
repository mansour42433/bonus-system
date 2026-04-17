CREATE TABLE `bonusPayments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`invoiceReference` varchar(128) NOT NULL,
	`repEmail` varchar(320) NOT NULL,
	`bonusAmount` int NOT NULL,
	`bonusPercentage` int NOT NULL,
	`invoiceAmount` int NOT NULL,
	`invoiceDate` varchar(10) NOT NULL,
	`paymentDate` varchar(10) NOT NULL,
	`bonusPaymentDate` timestamp NOT NULL DEFAULT (now()),
	`status` enum('paid','unpaid') NOT NULL DEFAULT 'unpaid',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bonusPayments_id` PRIMARY KEY(`id`)
);
