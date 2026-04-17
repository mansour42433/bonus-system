ALTER TABLE `bonusPayments` ADD `deliveryMethod` enum('cash','transfer','cheque') DEFAULT 'cash';--> statement-breakpoint
ALTER TABLE `bonusPayments` ADD `deliveryDate` varchar(10);