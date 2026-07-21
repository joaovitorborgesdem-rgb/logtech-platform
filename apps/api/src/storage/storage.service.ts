import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Camada de storage de arquivos (Fase 8, ver ADR-011): S3-compatible em
 * qualquer ambiente — MinIO em dev (docker-compose), AWS S3 real em produção
 * apenas trocando `S3_ENDPOINT`/credenciais/`S3_FORCE_PATH_STYLE`, sem
 * mudança de código.
 */
@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(configService: ConfigService) {
    this.bucket = configService.get<string>("S3_BUCKET", "logisense-uploads");
    this.client = new S3Client({
      region: configService.get<string>("S3_REGION", "us-east-1"),
      endpoint: configService.get<string>("S3_ENDPOINT"),
      forcePathStyle: configService.get<boolean>("S3_FORCE_PATH_STYLE", true),
      credentials: {
        accessKeyId: configService.get<string>("S3_ACCESS_KEY_ID", ""),
        secretAccessKey: configService.get<string>("S3_SECRET_ACCESS_KEY", ""),
      },
    });
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async getSignedDownloadUrl(
    key: string,
    expiresInSeconds: number,
  ): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    });
  }
}
