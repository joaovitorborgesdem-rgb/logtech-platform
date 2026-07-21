import { BadGatewayException } from "@nestjs/common";
import { ResilientHttpClient } from "../common/resilient-http-client";
import { ViaCepService } from "./viacep.service";

describe("ViaCepService", () => {
  let service: ViaCepService;
  let httpClient: { fetchJson: jest.Mock };

  beforeEach(() => {
    httpClient = { fetchJson: jest.fn() };
    service = new ViaCepService(httpClient as unknown as ResilientHttpClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("retorna a lista de endereços da ViaCEP", async () => {
    const addresses = [
      {
        cep: "01310-100",
        logradouro: "Avenida Paulista",
        complemento: "",
        bairro: "Bela Vista",
        localidade: "São Paulo",
        uf: "SP",
        ibge: "3550308",
        gia: "1004",
        ddd: "11",
        siafi: "7107",
      },
    ];
    httpClient.fetchJson.mockResolvedValue(addresses);

    const result = await service.searchByAddress(
      "SP",
      "São Paulo",
      "Avenida Paulista",
    );

    expect(result).toEqual(addresses);
    const [url, options] = httpClient.fetchJson.mock.calls[0] as [
      string,
      { integrationName: string },
    ];
    expect(url).toBe(
      "https://viacep.com.br/ws/SP/S%C3%A3o%20Paulo/Avenida%20Paulista/json/",
    );
    expect(options.integrationName).toBe("viacep");
  });

  it("retorna array vazio quando a ViaCEP não encontra resultados", async () => {
    httpClient.fetchJson.mockResolvedValue({ erro: true });

    const result = await service.searchByAddress("SP", "Cidade", "Rua X");

    expect(result).toEqual([]);
  });

  it("lança BadGatewayException quando o cliente HTTP falha", async () => {
    httpClient.fetchJson.mockRejectedValue(new Error("falha na integração"));

    await expect(
      service.searchByAddress("SP", "Cidade", "Rua X"),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
