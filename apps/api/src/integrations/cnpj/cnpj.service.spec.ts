import { BadGatewayException, NotFoundException } from "@nestjs/common";
import {
  ClientRequestError,
  ResilientHttpClient,
} from "../common/resilient-http-client";
import { CnpjService } from "./cnpj.service";

describe("CnpjService", () => {
  let service: CnpjService;
  let httpClient: { fetchJson: jest.Mock };

  beforeEach(() => {
    httpClient = { fetchJson: jest.fn() };
    service = new CnpjService(httpClient as unknown as ResilientHttpClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("retorna os dados da empresa mapeados para camelCase", async () => {
    httpClient.fetchJson.mockResolvedValue({
      cnpj: "19131243000197",
      razao_social: "OPEN KNOWLEDGE BRASIL",
      nome_fantasia: "REDE PELO CONHECIMENTO LIVRE",
      logradouro: "PAULISTA",
      numero: "37",
      bairro: "BELA VISTA",
      municipio: "SAO PAULO",
      uf: "SP",
      cep: "01311902",
      email: null,
      ddd_telefone_1: "1123851939",
      descricao_situacao_cadastral: "ATIVA",
    });

    const result = await service.lookup("19.131.243/0001-97");

    expect(httpClient.fetchJson).toHaveBeenCalledWith(
      "https://brasilapi.com.br/api/cnpj/v1/19131243000197",
      { integrationName: "brasilapi-cnpj" },
    );
    expect(result).toEqual({
      cnpj: "19131243000197",
      legalName: "OPEN KNOWLEDGE BRASIL",
      tradeName: "REDE PELO CONHECIMENTO LIVRE",
      street: "PAULISTA",
      number: "37",
      neighborhood: "BELA VISTA",
      city: "SAO PAULO",
      state: "SP",
      zipCode: "01311902",
      email: null,
      phone: "1123851939",
      registrationStatus: "ATIVA",
    });
  });

  it("lança NotFoundException quando a BrasilAPI retorna 404", async () => {
    httpClient.fetchJson.mockRejectedValue(
      new ClientRequestError("brasilapi-cnpj", 404),
    );

    await expect(service.lookup("19131243000197")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("lança BadGatewayException para outros erros 4xx", async () => {
    httpClient.fetchJson.mockRejectedValue(
      new ClientRequestError("brasilapi-cnpj", 400),
    );

    await expect(service.lookup("invalido")).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it("repropaga outros erros (ex.: ServiceUnavailableException do circuit breaker)", async () => {
    const serviceError = new Error("circuit breaker aberto");
    httpClient.fetchJson.mockRejectedValue(serviceError);

    await expect(service.lookup("19131243000197")).rejects.toBe(serviceError);
  });
});
