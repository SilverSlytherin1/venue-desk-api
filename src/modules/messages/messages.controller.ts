import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProtected } from '../../common/auth/api-protected.decorator.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import { ApiProblem } from '../../common/errors/problem.dto.js';
import { ApiPageResponse, type Page } from '../../common/http/pagination.js';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto.js';
import { MessageDto } from './dto/message.dto.js';
import { MessagesService } from './messages.service.js';

@ApiTags('messages')
@ApiProtected()
@Controller('messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({
    summary: 'List guest messages with their exact text, latest scheduled first',
    description: 'In this demo messages are recorded, not delivered.',
  })
  @ApiPageResponse(MessageDto)
  @ApiProblem('VALIDATION_FAILED')
  list(@Query() query: ListMessagesQueryDto): Promise<Page<MessageDto>> {
    return this.messages.list(query);
  }
}
