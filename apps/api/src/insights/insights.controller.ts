import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Response } from "express";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { InsightsExportQueryDto } from "./dto/insights-export-query.dto";
import { InsightsTrendQueryDto } from "./dto/insights-trend-query.dto";
import { TriggerAggregationDto } from "./dto/trigger-aggregation.dto";
import { InsightsService } from "./insights.service";

@Controller("insights")
@UseGuards(JwtAuthGuard)
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  @Get("trend")
  getTrend(@Query() query: InsightsTrendQueryDto) {
    return this.insightsService.getTrend(query.days);
  }

  @Get("carriers")
  getCarrierPerformance() {
    return this.insightsService.getCarrierPerformance();
  }

  @Get("export")
  async export(
    @Query() query: InsightsExportQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename, contentType } =
      await this.insightsService.exportReport(query.format);

    res.set({
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    });
    res.send(buffer);
  }

  @Post("aggregate")
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  triggerAggregation(@Body() body: TriggerAggregationDto) {
    return this.insightsService.triggerAggregation(body.date);
  }
}
