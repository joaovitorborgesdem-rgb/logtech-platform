import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    let db: "up" | "down" = "up";

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = "down";
    }

    return {
      status: "ok",
      db,
      timestamp: new Date().toISOString(),
    };
  }
}
