import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiProtected } from '../../common/auth/api-protected.decorator.js';
import { Public } from '../../common/auth/public.decorator.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import { ApiProblem } from '../../common/errors/problem.dto.js';
import { IdParamDto } from '../../common/http/id-param.dto.js';
import { ApiPageResponse, type Page, PageQueryDto } from '../../common/http/pagination.js';
import { RateLimit } from '../../common/http/rate-limit.js';
import { BookingsService } from './bookings.service.js';
import { BookingDto } from './dto/booking.dto.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { IDEMPOTENCY_KEY_HEADER, IdempotencyKey } from './idempotency-key.decorator.js';

@ApiTags('bookings')
@Controller()
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post('events/:id/bookings')
  @Public()
  @RateLimit('BOOKING_RATE_LIMIT')
  @ApiOperation({ summary: 'Book 1 to 4 seats for an event' })
  @ApiHeader({
    name: IDEMPOTENCY_KEY_HEADER,
    required: true,
    schema: { type: 'string', format: 'uuid' },
    description: 'Client generated. Send the same key when retrying the same request.',
  })
  @ApiCreatedResponse({ type: BookingDto, description: 'Seats reserved.' })
  @ApiOkResponse({ type: BookingDto, description: 'Retry of an earlier request: same booking.' })
  @ApiProblem(
    'VALIDATION_FAILED',
    'NOT_FOUND',
    'EVENT_SOLD_OUT',
    'EVENT_CLOSED',
    'IDEMPOTENCY_KEY_REUSED',
    'RATE_LIMITED',
  )
  async book(
    @Param() { id }: IdParamDto,
    @IdempotencyKey() idempotencyKey: string,
    @Body() dto: CreateBookingDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BookingDto> {
    const { booking, replayed } = await this.bookings.book(id, idempotencyKey, dto);
    response.status(replayed ? HttpStatus.OK : HttpStatus.CREATED);
    return booking;
  }

  @Get('events/:id/bookings')
  @Roles('ADMIN', 'STAFF')
  @ApiProtected()
  @ApiOperation({ summary: 'List the bookings of an event, newest first' })
  @ApiPageResponse(BookingDto)
  @ApiProblem('VALIDATION_FAILED', 'NOT_FOUND')
  listForEvent(
    @Param() { id }: IdParamDto,
    @Query() query: PageQueryDto,
  ): Promise<Page<BookingDto>> {
    return this.bookings.listForEvent(id, query);
  }

  @Post('bookings/:id/cancel')
  @Roles('ADMIN', 'STAFF')
  @ApiProtected()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a booking and release its seats. Safe to repeat.' })
  @ApiOkResponse({ type: BookingDto })
  @ApiProblem('VALIDATION_FAILED', 'NOT_FOUND')
  cancel(@Param() { id }: IdParamDto): Promise<BookingDto> {
    return this.bookings.cancel(id);
  }
}
