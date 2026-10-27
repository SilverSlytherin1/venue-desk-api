import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProtected } from '../../common/auth/api-protected.decorator.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import { DashboardService } from './dashboard.service.js';
import { DashboardDto } from './dto/dashboard.dto.js';

@ApiTags('dashboard')
@ApiProtected()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Figures for the staff overview' })
  @ApiOkResponse({ type: DashboardDto })
  get(): Promise<DashboardDto> {
    return this.dashboard.get();
  }
}
