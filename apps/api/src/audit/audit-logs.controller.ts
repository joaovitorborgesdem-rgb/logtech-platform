import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AuditLogsService } from "./audit-logs.service";
import { AuditLogQueryDto } from "./dto/audit-log-query.dto";

@Controller("audit-logs")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  findAll(@Query() query: AuditLogQueryDto) {
    return this.auditLogsService.findAll(query);
  }
}
