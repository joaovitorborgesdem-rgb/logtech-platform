import { BadGatewayException } from "@nestjs/common";
import { ViaCepService } from "./viacep.service";

describe("ViaCepService", () => {
  let service: ViaCepService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = new ViaCepService();
    fetchMock = jest.fn();
    global.fetch = fetchMock;
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
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(addresses),
    });

    const result = await service.searchByAddress(
      "SP",
      "São Paulo",
      "Avenida Paulista",
    );

    expect(result).toEqual(addresses);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(
      "https://viacep.com.br/ws/SP/S%C3%A3o%20Paulo/Avenida%20Paulista/json/",
    );
  });

  it("retorna array vazio quando a ViaCEP não encontra resultados", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ erro: true }),
    });

    const result = await service.searchByAddress("SP", "Cidade", "Rua X");

    expect(result).toEqual([]);
  });

  it("lança BadGatewayException quando a resposta não é ok", async () => {
    fetchMock.mockResolvedValue({ ok: false });

    await expect(
      service.searchByAddress("SP", "Cidade", "Rua X"),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it("lança BadGatewayException quando a requisição falha", async () => {
    fetchMock.mockRejectedValue(new Error("network error"));

    await expect(
      service.searchByAddress("SP", "Cidade", "Rua X"),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
