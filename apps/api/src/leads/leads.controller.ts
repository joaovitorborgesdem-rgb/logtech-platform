import { Body, Controller, Post } from "@nestjs/common";
import { CreateLeadDto } from "./dto/create-lead.dto";
import { LeadsService } from "./leads.service";

/**
 * Rota pública (sem `JwtAuthGuard`) — formulário de contato da landing page,
 * ver Fase 14. Sem contexto de tenant, então o `MutationAuditInterceptor`
 * (ADR-012) já ignora essa mutação automaticamente.
 */
@Controller("leads")
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  create(@Body() dto: CreateLeadDto) {
    return this.leadsService.create(dto);
  }
}
