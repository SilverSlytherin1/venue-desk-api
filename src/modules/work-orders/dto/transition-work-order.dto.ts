import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { WorkOrderStatus } from '../work-order.enums.js';

export class TransitionWorkOrderDto {
  @ApiProperty({ enum: WorkOrderStatus, enumName: 'WorkOrderStatus' })
  @IsEnum(WorkOrderStatus)
  to!: WorkOrderStatus;
}
