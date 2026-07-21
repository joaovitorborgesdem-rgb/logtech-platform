import { BadGatewayException, Injectable, Logger } from "@nestjs/common";

export interface ViaCepAddress {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  ibge: string;
  gia: string;
  ddd: string;
  siafi: string;
}

const REQUEST_TIMEOUT_MS = 5000;

@Injectable()
export class ViaCepService {
  private readonly logger = new Logger(ViaCepService.name);

  async searchByAddress(
    uf: string,
    city: string,
    street: string,
  ): Promise<ViaCepAddress[]> {
    const url = `https://viacep.com.br/ws/${encodeURIComponent(uf)}/${encodeURIComponent(city)}/${encodeURIComponent(street)}/json/`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch (error) {
      this.logger.error("Erro ao consultar ViaCEP", error as Error);
      throw new BadGatewayException("Falha ao consultar o serviço de CEP");
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new BadGatewayException("Falha ao consultar o serviço de CEP");
    }

    const data: unknown = await response.json();

    return Array.isArray(data) ? (data as ViaCepAddress[]) : [];
  }
}
