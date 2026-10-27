import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PageQueryDto } from '../../../common/http/pagination.js';

export class TokenParamDto {
  @ApiProperty({ format: 'uuid', description: 'From the link in the feedback request.' })
  @IsUUID()
  token!: string;
}

export class FeedbackSummaryQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Only this event. All events when left out.',
  })
  @IsOptional()
  @IsUUID()
  eventId?: string;
}

export class ListFeedbackQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  eventId?: string;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;
}
