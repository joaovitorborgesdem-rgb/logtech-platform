import { authenticator } from "otplib";
import { MfaService } from "./mfa.service";

describe("MfaService", () => {
  let service: MfaService;

  beforeEach(() => {
    service = new MfaService();
  });

  it("gera um secret base32 válido", () => {
    const secret = service.generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
  });

  it("monta uma otpauth URL com issuer e e-mail", () => {
    const secret = service.generateSecret();
    const url = service.buildOtpAuthUrl("ana@example.com", secret, "LogiSense");
    expect(url).toContain("otpauth://totp/");
    expect(url).toContain("LogiSense");
  });

  it("gera um data URL de QR code", async () => {
    const dataUrl = await service.buildQrCodeDataUrl(
      "otpauth://totp/test?secret=ABC",
    );
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  describe("verifyToken", () => {
    it("aceita um token TOTP válido gerado para o secret", () => {
      const secret = service.generateSecret();
      const token = authenticator.generate(secret);
      expect(service.verifyToken(token, secret)).toBe(true);
    });

    it("rejeita um token inválido", () => {
      const secret = service.generateSecret();
      expect(service.verifyToken("000000", secret)).toBe(false);
    });

    it("retorna false em vez de lançar quando o secret é inválido", () => {
      expect(service.verifyToken("123456", "")).toBe(false);
    });
  });

  describe("backup codes", () => {
    it("gera códigos e permite consumir um deles uma única vez", () => {
      const { plainCodes, stored } = service.generateBackupCodes();
      expect(plainCodes).toHaveLength(8);
      expect(stored).toHaveLength(8);
      expect(stored.every((c) => c.usedAt === null)).toBe(true);

      const firstCode = plainCodes[0];
      const { valid, updatedCodes } = service.consumeBackupCode(
        stored,
        firstCode,
      );
      expect(valid).toBe(true);
      expect(
        updatedCodes.find((c) => c.codeHash === stored[0].codeHash)?.usedAt,
      ).not.toBeNull();

      const secondAttempt = service.consumeBackupCode(updatedCodes, firstCode);
      expect(secondAttempt.valid).toBe(false);
    });

    it("rejeita um código que nunca existiu", () => {
      const { stored } = service.generateBackupCodes();
      const { valid } = service.consumeBackupCode(stored, "not-a-real-code");
      expect(valid).toBe(false);
    });
  });
});
