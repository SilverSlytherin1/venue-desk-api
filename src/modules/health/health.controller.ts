import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth/public.decorator.js';
import { PrismaService } from '../../database/prisma.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Reports healthy only if the database answers: an API without it can serve nothing. */
  @Get()
  @Public()
  @ApiOperation({ summary: 'Liveness and database connectivity' })
  @ApiOkResponse({
    schema: { type: 'object', properties: { status: { type: 'string', enum: ['ok'] } } },
  })
  async check(): Promise<{ status: 'ok' }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
