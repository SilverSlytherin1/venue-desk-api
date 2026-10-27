import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProtected } from '../../common/auth/api-protected.decorator.js';
import { Public } from '../../common/auth/public.decorator.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import { ApiProblem } from '../../common/errors/problem.dto.js';
import { ApiPageResponse, type Page } from '../../common/http/pagination.js';
import { RateLimit } from '../../common/http/rate-limit.js';
import { CreateFeedbackDto } from './dto/create-feedback.dto.js';
import {
  FeedbackInvitationDto,
  FeedbackItemDto,
  FeedbackSummaryDto,
  SubmittedFeedbackDto,
} from './dto/feedback.dto.js';
import {
  FeedbackSummaryQueryDto,
  ListFeedbackQueryDto,
  TokenParamDto,
} from './dto/feedback-query.dto.js';
import { FeedbackService } from './feedback.service.js';

@ApiTags('feedback')
@Controller()
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get('feedback/:token')
  @Public()
  @RateLimit('BOOKING_RATE_LIMIT')
  @ApiOperation({ summary: 'What the feedback page of a booking shows' })
  @ApiOkResponse({ type: FeedbackInvitationDto })
  @ApiProblem('VALIDATION_FAILED', 'FEEDBACK_NOT_FOUND', 'FEEDBACK_NOT_OPEN', 'RATE_LIMITED')
  invitation(@Param() { token }: TokenParamDto): Promise<FeedbackInvitationDto> {
    return this.feedback.invitation(token);
  }

  @Post('feedback/:token')
  @Public()
  @RateLimit('BOOKING_RATE_LIMIT')
  @ApiOperation({ summary: 'Rate an event from 1 to 5, once per booking' })
  @ApiCreatedResponse({ type: SubmittedFeedbackDto })
  @ApiProblem(
    'VALIDATION_FAILED',
    'FEEDBACK_NOT_FOUND',
    'FEEDBACK_NOT_OPEN',
    'FEEDBACK_ALREADY_SUBMITTED',
    'RATE_LIMITED',
  )
  submit(
    @Param() { token }: TokenParamDto,
    @Body() dto: CreateFeedbackDto,
  ): Promise<SubmittedFeedbackDto> {
    return this.feedback.submit(token, dto);
  }

  @Get('feedback')
  @Roles('ADMIN', 'STAFF')
  @ApiProtected()
  @ApiOperation({ summary: 'List feedback, newest first' })
  @ApiPageResponse(FeedbackItemDto)
  @ApiProblem('VALIDATION_FAILED')
  list(@Query() query: ListFeedbackQueryDto): Promise<Page<FeedbackItemDto>> {
    return this.feedback.list(query);
  }

  @Get('feedback-summary')
  @Roles('ADMIN', 'STAFF')
  @ApiProtected()
  @ApiOperation({ summary: 'Average rating and count per rating, overall or for one event' })
  @ApiOkResponse({ type: FeedbackSummaryDto })
  @ApiProblem('VALIDATION_FAILED')
  summary(@Query() { eventId }: FeedbackSummaryQueryDto): Promise<FeedbackSummaryDto> {
    return this.feedback.summary(eventId);
  }
}
