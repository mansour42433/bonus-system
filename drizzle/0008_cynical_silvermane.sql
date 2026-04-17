CREATE TABLE `categorySalesSummary` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category` text NOT NULL,
	`month` varchar(7) NOT NULL,
	`totalQuantity` int DEFAULT 0,
	`totalSales` int DEFAULT 0,
	`productCount` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `categorySalesSummary_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `creditNotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`creditNoteId` varchar(128) NOT NULL,
	`invoiceId` int NOT NULL,
	`invoiceReference` varchar(128) NOT NULL,
	`productId` varchar(128) NOT NULL,
	`productName` text NOT NULL,
	`quantity` int NOT NULL,
	`amount` int NOT NULL,
	`creditNoteDate` varchar(10) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `creditNotes_id` PRIMARY KEY(`id`),
	CONSTRAINT `creditNotes_creditNoteId_unique` UNIQUE(`creditNoteId`)
);
--> statement-breakpoint
CREATE TABLE `invoiceItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`productId` varchar(128) NOT NULL,
	`productName` text NOT NULL,
	`category` text,
	`quantity` int NOT NULL,
	`price` int NOT NULL,
	`total` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoiceItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`invoiceReference` varchar(128) NOT NULL,
	`repEmail` varchar(320) NOT NULL,
	`clientName` text,
	`invoiceDate` varchar(10) NOT NULL,
	`invoiceAmount` int NOT NULL,
	`invoiceStatus` enum('Paid','Approved','Draft','Cancelled') NOT NULL DEFAULT 'Draft',
	`paymentDate` varchar(10),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoices_invoiceId_unique` UNIQUE(`invoiceId`)
);
--> statement-breakpoint
CREATE TABLE `productSalesSummary` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` varchar(128) NOT NULL,
	`productName` text NOT NULL,
	`category` text,
	`month` varchar(7) NOT NULL,
	`totalQuantity` int DEFAULT 0,
	`totalSales` int DEFAULT 0,
	`salesCount` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `productSalesSummary_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` varchar(128) NOT NULL,
	`productName` text NOT NULL,
	`category` text,
	`price` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_productId_unique` UNIQUE(`productId`)
);
--> statement-breakpoint
CREATE TABLE `repPerformance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`repEmail` varchar(320) NOT NULL,
	`month` varchar(7) NOT NULL,
	`totalSales` int DEFAULT 0,
	`paidInvoices` int DEFAULT 0,
	`unpaidInvoices` int DEFAULT 0,
	`bonusEarned` int DEFAULT 0,
	`bonusPaid` int DEFAULT 0,
	`bonusRemaining` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `repPerformance_id` PRIMARY KEY(`id`)
);
