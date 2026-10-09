import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProtected } from '../../common/auth/api-protected.decorator.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import { ApiProblem } from '../../common/errors/problem.dto.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import { UserRefDto } from './dto/user.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles('ADMIN')
  @ApiProtected()
  @ApiOperation({ summary: 'List users for the assignee picker' })
  @ApiOkResponse({ type: [UserRefDto] })
  @ApiProblem('VALIDATION_FAILED')
  list(@Query() query: ListUsersQueryDto): Promise<UserRefDto[]> {
    return this.users.listRefs(query.role);
  }
}
