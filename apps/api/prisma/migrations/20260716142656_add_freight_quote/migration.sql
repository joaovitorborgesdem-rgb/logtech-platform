-- CreateTable
CREATE TABLE `FreightQuote` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `originZipCode` VARCHAR(191) NOT NULL,
    `destinationZipCode` VARCHAR(191) NOT NULL,
    `weightKg` DECIMAL(10, 3) NOT NULL,
    `lengthCm` DECIMAL(10, 2) NOT NULL,
    `widthCm` DECIMAL(10, 2) NOT NULL,
    `heightCm` DECIMAL(10, 2) NOT NULL,
    `cargoValue` DECIMAL(12, 2) NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'DONE', 'ERROR') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FreightQuote_tenantId_idx`(`tenantId`),
    INDEX `FreightQuote_tenantId_status_idx`(`tenantId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FreightQuoteOption` (
    `id` VARCHAR(191) NOT NULL,
    `quoteId` VARCHAR(191) NOT NULL,
    `carrierId` VARCHAR(191) NOT NULL,
    `price` DECIMAL(12, 2) NOT NULL,
    `estimatedDays` INTEGER NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FreightQuoteOption_quoteId_idx`(`quoteId`),
    INDEX `FreightQuoteOption_carrierId_idx`(`carrierId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FreightQuote` ADD CONSTRAINT `FreightQuote_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FreightQuote` ADD CONSTRAINT `FreightQuote_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FreightQuoteOption` ADD CONSTRAINT `FreightQuoteOption_quoteId_fkey` FOREIGN KEY (`quoteId`) REFERENCES `FreightQuote`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FreightQuoteOption` ADD CONSTRAINT `FreightQuoteOption_carrierId_fkey` FOREIGN KEY (`carrierId`) REFERENCES `Carrier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
