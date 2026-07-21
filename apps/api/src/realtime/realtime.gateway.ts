import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { AccessTokenPayload } from "../auth/interfaces/jwt-payload.interface";
import { FreightQuoteWithOptions } from "../freight-quotes/freight-quotes.service";

function tenantRoom(tenantId: string): string {
  return `tenant:${tenantId}`;
}

/**
 * Autenticação da conexão realtime: o handshake não passa pelos guards HTTP
 * (JwtAuthGuard/TenantContextInterceptor, ver ADR-002), então o token é
 * validado manualmente aqui e o socket entra na room do tenant — eventos são
 * sempre emitidos por tenant, nunca fazem broadcast global (ver ADR-007).
 */
@WebSocketGateway({
  namespace: "/realtime",
  cors: { origin: process.env.CORS_ORIGIN ?? "*" },
})
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  handleConnection(client: Socket): void {
    const token = this.extractToken(client);

    if (!token) {
      this.rejectConnection(client, "Token de autenticação ausente");
      return;
    }

    try {
      const payload = this.jwtService.verify<AccessTokenPayload>(token, {
        secret: this.configService.get<string>("JWT_ACCESS_SECRET"),
      });

      if (payload.type !== "access") {
        throw new Error("Tipo de token inválido");
      }

      void client.join(tenantRoom(payload.tenantId));
    } catch {
      this.rejectConnection(client, "Token de autenticação inválido");
    }
  }

  emitFreightQuoteUpdated(
    tenantId: string,
    quote: FreightQuoteWithOptions,
  ): void {
    this.server.to(tenantRoom(tenantId)).emit("freight-quote.updated", quote);
  }

  private extractToken(client: Socket): string | undefined {
    const authToken = client.handshake.auth?.token as string | undefined;
    if (authToken) {
      return authToken;
    }

    const queryToken = client.handshake.query?.token;
    return typeof queryToken === "string" ? queryToken : undefined;
  }

  private rejectConnection(client: Socket, message: string): void {
    this.logger.warn(`Conexão realtime rejeitada: ${message}`);
    client.emit("error", { message });
    client.disconnect(true);
  }
}
