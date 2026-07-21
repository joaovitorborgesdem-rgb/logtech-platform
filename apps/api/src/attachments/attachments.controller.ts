import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedUser } from "../auth/interfaces/jwt-payload.interface";
import {
  AttachmentsService,
  MAX_ATTACHMENT_SIZE_BYTES,
} from "./attachments.service";
import { AttachmentQueryDto } from "./dto/attachment-query.dto";
import { CreateAttachmentDto } from "./dto/create-attachment.dto";

@Controller("attachments")
@UseGuards(JwtAuthGuard)
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES },
    }),
  )
  create(
    @Body() dto: CreateAttachmentDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attachmentsService.create(dto, file, user.id);
  }

  @Get()
  findAll(@Query() query: AttachmentQueryDto) {
    return this.attachmentsService.findAll(query);
  }

  @Get(":id/download-url")
  getDownloadUrl(@Param("id") id: string) {
    return this.attachmentsService.getDownloadUrl(id);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.attachmentsService.remove(id, user.id);
  }
}
