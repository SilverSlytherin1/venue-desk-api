import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProtected } from '../../common/auth/api-protected.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Public } from '../../common/auth/public.decorator.js';
import { Roles } from '../../common/auth/roles.decorator.js';
import { ApiProblem } from '../../common/errors/problem.dto.js';
import { RateLimit } from '../../common/http/rate-limit.js';
import { UserDto } from '../users/dto/user.dto.js';
import { AuthService } from './auth.service.js';
import { LoginDto, LoginResponseDto } from './dto/login.dto.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @Public()
  @RateLimit('LOGIN_RATE_LIMIT')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange email and password for an access token' })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiProblem('VALIDATION_FAILED', 'INVALID_CREDENTIALS', 'RATE_LIMITED')
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.auth.login(dto.email, dto.password);
  }

  @Get('me')
  @Roles('ADMIN', 'STAFF')
  @ApiProtected()
  @ApiOperation({ summary: 'Return the authenticated user' })
  @ApiOkResponse({ type: UserDto })
  me(@CurrentUser() user: AuthUser): UserDto {
    return user;
  }
}
