import { Injectable } from "@nestjs/common";
import { Lead } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateLeadDto } from "./dto/create-lead.dto";

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateLeadDto): Promise<Lead> {
    return this.prisma.lead.create({ data: dto });
  }
}
