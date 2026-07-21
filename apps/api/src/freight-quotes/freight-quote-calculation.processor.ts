import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import { FreightQuoteStatus } from "@prisma/client";
import { Job } from "bullmq";
import {
  TENANT_SCOPED_PRISMA,
  TenantScopedPrismaClient,
} from "../prisma/tenant-scoped-prisma.provider";
import { runWithTenantContext } from "../tenant/tenant-context";
import { FreightCalculationService } from "./freight-calculation.service";
import {
  FREIGHT_QUOTE_QUEUE,
  FreightQuoteJobData,
} from "./freight-quote-queue.constants";

/**
 * Consome os jobs de cálculo de frete enfileirados por `FreightQuotesService.create`.
 * Roda fora do ciclo de vida de uma requisição HTTP, então precisa reconstruir
 * manualmente o contexto de tenant (AsyncLocalStorage) a partir do payload do
 * job antes de usar o `TENANT_SCOPED_PRISMA` — ver ADR-002 e ADR-006.
 */
@Processor(FREIGHT_QUOTE_QUEUE)
export class FreightQuoteCalculationProcessor extends WorkerHost {
  private readonly logger = new Logger(FreightQuoteCalculationProcessor.name);

  constructor(
    @Inject(TENANT_SCOPED_PRISMA)
    private readonly prisma: TenantScopedPrismaClient,
    private readonly freightCalculationService: FreightCalculationService,
  ) {
    super();
  }

  async process(job: Job<FreightQuoteJobData>): Promise<void> {
    const { quoteId, tenantId, userId, role } = job.data;

    await runWithTenantContext({ tenantId, userId, role }, async () => {
      const quote = await this.prisma.freightQuote.findFirstOrThrow({
        where: { id: quoteId },
      });

      await this.prisma.freightQuote.update({
        where: { id: quoteId },
        data: { status: FreightQuoteStatus.PROCESSING },
      });

      await this.freightCalculationService.generateOptions(quote);
    });
  }

  @OnWorkerEvent("failed")
  async onFailed(job: Job<FreightQuoteJobData> | undefined): Promise<void> {
    if (!job) {
      return;
    }

    const { quoteId, tenantId, userId, role } = job.data;

    this.logger.error(
      `Job ${job.id} de cálculo de frete falhou para a cotação ${quoteId}: ${job.failedReason}`,
    );

    await runWithTenantContext({ tenantId, userId, role }, () =>
      this.prisma.freightQuote.update({
        where: { id: quoteId },
        data: { status: FreightQuoteStatus.ERROR },
      }),
    );
  }
}
