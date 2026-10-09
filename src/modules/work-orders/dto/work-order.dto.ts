import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { WorkOrderPriority, WorkOrderStatus } from '../work-order.enums.js';
import { UserRefDto } from '../../users/dto/user.dto.js';

@ApiSchema({ name: 'EventRef' })
class EventRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Autumn Jazz Night' })
  title!: string;
}

@ApiSchema({ name: 'WorkOrder' })
export class WorkOrderDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'WO-0001' })
  number!: string;

  @ApiProperty({ example: 'Set up stage lighting' })
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ enum: WorkOrderPriority, enumName: 'WorkOrderPriority' })
  priority!: WorkOrderPriority;

  @ApiProperty({ enum: WorkOrderStatus, enumName: 'WorkOrderStatus' })
  status!: WorkOrderStatus;

  @ApiProperty({ type: EventRefDto, nullable: true })
  event!: EventRefDto | null;

  @ApiProperty({ type: UserRefDto, nullable: true })
  assignee!: UserRefDto | null;

  @ApiProperty({ type: UserRefDto })
  createdBy!: UserRefDto;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiProperty({
    enum: WorkOrderStatus,
    enumName: 'WorkOrderStatus',
    isArray: true,
    description:
      'Statuses the calling user may move this work order to, in the order to offer them: forward, back, cancel.',
  })
  allowedTransitions!: WorkOrderStatus[];
}
