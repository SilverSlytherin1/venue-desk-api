import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PageQueryDto } from '../../../common/http/pagination.js';
import { MessageKind, MessageStatus } from '../message.enums.js';

export class ListMessagesQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: MessageStatus, enumName: 'MessageStatus' })
  @IsOptional()
  @IsEnum(MessageStatus)
  status?: MessageStatus;

  @ApiPropertyOptional({ enum: MessageKind, enumName: 'MessageKind' })
  @IsOptional()
  @IsEnum(MessageKind)
  kind?: MessageKind;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  eventId?: string;
}
