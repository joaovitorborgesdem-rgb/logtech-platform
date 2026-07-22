import { PrismaService } from "../prisma/prisma.service";
import { LeadsService } from "./leads.service";

describe("LeadsService", () => {
  let service: LeadsService;
  let prisma: { lead: { create: jest.Mock } };

  const baseLead = {
    id: "lead-1",
    name: "Fulano de Tal",
    email: "fulano@example.com",
    company: "Acme",
    message: "Quero saber mais",
    createdAt: new Date(),
  };

  beforeEach(() => {
    prisma = { lead: { create: jest.fn() } };
    service = new LeadsService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("cria um lead com os dados informados", async () => {
    prisma.lead.create.mockResolvedValue(baseLead);

    const result = await service.create({
      name: "Fulano de Tal",
      email: "fulano@example.com",
      company: "Acme",
      message: "Quero saber mais",
    });

    expect(prisma.lead.create).toHaveBeenCalledWith({
      data: {
        name: "Fulano de Tal",
        email: "fulano@example.com",
        company: "Acme",
        message: "Quero saber mais",
      },
    });
    expect(result).toEqual(baseLead);
  });

  it("cria um lead sem os campos opcionais", async () => {
    prisma.lead.create.mockResolvedValue({
      ...baseLead,
      company: null,
      message: null,
    });

    await service.create({
      name: "Fulano de Tal",
      email: "fulano@example.com",
    });

    expect(prisma.lead.create).toHaveBeenCalledWith({
      data: { name: "Fulano de Tal", email: "fulano@example.com" },
    });
  });
});
