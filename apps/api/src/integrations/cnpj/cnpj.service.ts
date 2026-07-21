import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ClientRequestError,
  ResilientHttpClient,
} from "../common/resilient-http-client";

const INTEGRATION_NAME = "brasilapi-cnpj";
const NOT_FOUND_STATUS = 404;

interface BrasilApiCnpjResponse {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  email: string | null;
  ddd_telefone_1: string | null;
  descricao_situacao_cadastral: string | null;
}

export interface CnpjLookupResult {
  cnpj: string;
  legalName: string;
  tradeName: string | null;
  street: string | null;
  number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  email: string | null;
  phone: string | null;
  registrationStatus: string | null;
}

function sanitizeCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

@Injectable()
export class CnpjService {
  constructor(private readonly httpClient: ResilientHttpClient) {}

  async lookup(cnpj: string): Promise<CnpjLookupResult> {
    const digits = sanitizeCnpj(cnpj);
    const url = `https://brasilapi.com.br/api/cnpj/v1/${digits}`;

    let data: BrasilApiCnpjResponse;
    try {
      data = await this.httpClient.fetchJson<BrasilApiCnpjResponse>(url, {
        integrationName: INTEGRATION_NAME,
      });
    } catch (error) {
      if (
        error instanceof ClientRequestError &&
        error.status === NOT_FOUND_STATUS
      ) {
        throw new NotFoundException("CNPJ não encontrado");
      }
      if (error instanceof ClientRequestError) {
        throw new BadGatewayException("Falha ao consultar o serviço de CNPJ");
      }
      throw error;
    }

    return {
      cnpj: data.cnpj,
      legalName: data.razao_social,
      tradeName: data.nome_fantasia,
      street: data.logradouro,
      number: data.numero,
      neighborhood: data.bairro,
      city: data.municipio,
      state: data.uf,
      zipCode: data.cep,
      email: data.email,
      phone: data.ddd_telefone_1,
      registrationStatus: data.descricao_situacao_cadastral,
    };
  }
}
