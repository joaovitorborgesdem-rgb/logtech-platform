import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import { authenticator } from "otplib";
import * as QRCode from "qrcode";
import { MfaBackupCode } from "./interfaces/mfa-backup-code.interface";

const BACKUP_CODE_COUNT = 8;
const BACKUP_CODE_BYTES = 5;

@Injectable()
export class MfaService {
  generateSecret(): string {
    return authenticator.generateSecret();
  }

  buildOtpAuthUrl(email: string, secret: string, issuer: string): string {
    return authenticator.keyuri(email, issuer, secret);
  }

  async buildQrCodeDataUrl(otpAuthUrl: string): Promise<string> {
    return QRCode.toDataURL(otpAuthUrl);
  }

  verifyToken(token: string, secret: string): boolean {
    try {
      return authenticator.verify({ token, secret });
    } catch {
      return false;
    }
  }

  generateBackupCodes(): { plainCodes: string[]; stored: MfaBackupCode[] } {
    const plainCodes = Array.from({ length: BACKUP_CODE_COUNT }, () =>
      randomBytes(BACKUP_CODE_BYTES).toString("hex"),
    );
    const stored = plainCodes.map((code) => ({
      codeHash: this.hashBackupCode(code),
      usedAt: null,
    }));
    return { plainCodes, stored };
  }

  hashBackupCode(code: string): string {
    return createHash("sha256").update(code.trim().toLowerCase()).digest("hex");
  }

  consumeBackupCode(
    codes: MfaBackupCode[],
    candidate: string,
  ): { valid: boolean; updatedCodes: MfaBackupCode[] } {
    const candidateHash = this.hashBackupCode(candidate);
    const index = codes.findIndex(
      (entry) => entry.codeHash === candidateHash && entry.usedAt === null,
    );

    if (index === -1) {
      return { valid: false, updatedCodes: codes };
    }

    const updatedCodes = codes.map((entry, i) =>
      i === index ? { ...entry, usedAt: new Date().toISOString() } : entry,
    );
    return { valid: true, updatedCodes };
  }
}
