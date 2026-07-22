import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import {
  HealthIndicatorResult,
  HealthIndicatorService,
} from "@nestjs/terminus";
import { Queue } from "bullmq";
import { FREIGHT_QUOTE_QUEUE } from "../freight-quotes/freight-quote-queue.constants";
import { INSIGHTS_QUEUE } from "../insights/insights-queue.constants";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

@Injectable()
export class HealthIndicatorsService {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @InjectQueue(FREIGHT_QUOTE_QUEUE)
    private readonly freightQuoteQueue: Queue,
    @InjectQueue(INSIGHTS_QUEUE)
    private readonly insightsQueue: Queue,
  ) {}

  async checkDatabase(): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check("database");
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return indicator.up();
    } catch (error) {
      return indicator.down({ message: (error as Error).message });
    }
  }

  async checkRedis(): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check("redis");
    try {
      await this.redis.ping();
      return indicator.up();
    } catch (error) {
      return indicator.down({ message: (error as Error).message });
    }
  }

  checkFreightQuoteQueue(): Promise<HealthIndicatorResult> {
    return this.checkQueue("freight-quote-queue", this.freightQuoteQueue);
  }

  checkInsightsQueue(): Promise<HealthIndicatorResult> {
    return this.checkQueue("insights-queue", this.insightsQueue);
  }

  private async checkQueue(
    key: string,
    queue: Queue,
  ): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    try {
      const counts = await queue.getJobCounts();
      return indicator.up({ counts });
    } catch (error) {
      return indicator.down({ message: (error as Error).message });
    }
  }
}
