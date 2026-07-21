import { BadGatewayException, Injectable } from "@nestjs/common";
import { ResilientHttpClient } from "../common/resilient-http-client";

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

const INTEGRATION_NAME = "viacep";

@Injectable()
export class ViaCepService {
  constructor(private readonly httpClient: ResilientHttpClient) {}

  async searchByAddress(
    uf: string,
    city: string,
    street: string,
  ): Promise<ViaCepAddress[]> {
    const url = `https://viacep.com.br/ws/${encodeURIComponent(uf)}/${encodeURIComponent(city)}/${encodeURIComponent(street)}/json/`;

    let data: unknown;
    try {
      data = await this.httpClient.fetchJson<unknown>(url, {
        integrationName: INTEGRATION_NAME,
      });
    } catch {
      throw new BadGatewayException("Falha ao consultar o serviço de CEP");
    }

    return Array.isArray(data) ? (data as ViaCepAddress[]) : [];
  }
}
