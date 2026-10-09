import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../../common/http/pagination.js';
import { WorkOrderStatus } from '../work-order.enums.js';

export class ListWorkOrdersQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: WorkOrderStatus, enumName: 'WorkOrderStatus' })
  @IsOptional()
  @IsEnum(WorkOrderStatus)
  status?: WorkOrderStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({ description: 'Case-insensitive match on title or description.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
