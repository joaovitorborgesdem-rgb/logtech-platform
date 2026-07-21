-- CreateTable
CREATE TABLE `DailyMetricsSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `totalQuotes` INTEGER NOT NULL,
    `doneCount` INTEGER NOT NULL,
    `errorCount` INTEGER NOT NULL,
    `totalCargoValue` DECIMAL(14, 2) NOT NULL,
    `totalQuotedValue` DECIMAL(14, 2) NOT NULL,
    `avgFreightPrice` DECIMAL(12, 2) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DailyMetricsSnapshot_tenantId_date_idx`(`tenantId`, `date`),
    UNIQUE INDEX `DailyMetricsSnapshot_tenantId_date_key`(`tenantId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `DailyMetricsSnapshot` ADD CONSTRAINT `DailyMetricsSnapshot_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
