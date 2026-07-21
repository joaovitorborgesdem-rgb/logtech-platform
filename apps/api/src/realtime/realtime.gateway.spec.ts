import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { UserRole } from "@prisma/client";
import { Socket } from "socket.io";
import { RealtimeGateway } from "./realtime.gateway";

describe("RealtimeGateway", () => {
  let gateway: RealtimeGateway;
  let jwtService: { verify: jest.Mock };
  let configService: { get: jest.Mock };
  let client: {
    handshake: {
      auth: Record<string, unknown>;
      query: Record<string, unknown>;
    };
    join: jest.Mock;
    emit: jest.Mock;
    disconnect: jest.Mock;
  };
  let server: { to: jest.Mock };
  let emitMock: jest.Mock;

  beforeEach(() => {
    jwtService = { verify: jest.fn() };
    configService = { get: jest.fn().mockReturnValue("access-secret") };

    gateway = new RealtimeGateway(
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
    );

    client = {
      handshake: { auth: {}, query: {} },
      join: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
    };

    emitMock = jest.fn();
    server = { to: jest.fn().mockReturnValue({ emit: emitMock }) };
    Object.assign(gateway, { server });
  });

  describe("handleConnection", () => {
    it("entra na room do tenant quando o token é válido", () => {
      client.handshake.auth.token = "valid-token";
      jwtService.verify.mockReturnValue({
        sub: "user-1",
        tenantId: "tenant-1",
        role: UserRole.MEMBER,
        type: "access",
      });

      gateway.handleConnection(client as unknown as Socket);

      expect(jwtService.verify).toHaveBeenCalledWith("valid-token", {
        secret: "access-secret",
      });
      expect(client.join).toHaveBeenCalledWith("tenant:tenant-1");
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it("aceita o token via query string quando não vem no auth", () => {
      client.handshake.query.token = "query-token";
      jwtService.verify.mockReturnValue({
        sub: "user-1",
        tenantId: "tenant-2",
        role: UserRole.MEMBER,
        type: "access",
      });

      gateway.handleConnection(client as unknown as Socket);

      expect(jwtService.verify).toHaveBeenCalledWith("query-token", {
        secret: "access-secret",
      });
      expect(client.join).toHaveBeenCalledWith("tenant:tenant-2");
    });

    it("desconecta quando não há token", () => {
      gateway.handleConnection(client as unknown as Socket);

      expect(jwtService.verify).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it("desconecta quando o token é inválido", () => {
      client.handshake.auth.token = "invalid-token";
      jwtService.verify.mockImplementation(() => {
        throw new Error("jwt malformed");
      });

      gateway.handleConnection(client as unknown as Socket);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it("desconecta quando o tipo do token não é access", () => {
      client.handshake.auth.token = "refresh-token";
      jwtService.verify.mockReturnValue({
        sub: "user-1",
        tenantId: "tenant-1",
        type: "refresh",
      });

      gateway.handleConnection(client as unknown as Socket);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });
  });

  describe("emitFreightQuoteUpdated", () => {
    it("emite o evento apenas para a room do tenant", () => {
      const quote = { id: "quote-1" };

      gateway.emitFreightQuoteUpdated("tenant-1", quote as never);

      expect(server.to).toHaveBeenCalledWith("tenant:tenant-1");
      expect(emitMock).toHaveBeenCalledWith("freight-quote.updated", quote);
    });
  });
});
