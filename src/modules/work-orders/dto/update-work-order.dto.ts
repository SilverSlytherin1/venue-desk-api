import { PartialType, PickType } from '@nestjs/swagger';
import { CreateWorkOrderDto } from './create-work-order.dto.js';

const EDITABLE_FIELDS = ['title', 'description', 'priority', 'assigneeId'] as const;

/**
 * Every field is optional, and a field that is left out is left unchanged. `null` is rejected
 * everywhere except `assigneeId`, where it means "unassign": that field already accepts null
 * in the create DTO, the others do not.
 */
export class UpdateWorkOrderDto extends PartialType(PickType(CreateWorkOrderDto, EDITABLE_FIELDS), {
  skipNullProperties: false,
}) {}
