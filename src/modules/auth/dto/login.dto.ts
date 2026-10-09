import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { UserDto } from '../../users/dto/user.dto.js';

export class LoginDto {
  @ApiProperty({ format: 'email', example: 'admin@venuedesk.test' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'demo-admin-1' })
  @IsString()
  @IsNotEmpty()
  // Bounds the work an unauthenticated caller can make the password hash do.
  @MaxLength(128)
  password!: string;
}

@ApiSchema({ name: 'LoginResponse' })
export class LoginResponseDto {
  @ApiProperty({ description: 'JWT, sent back as `Authorization: Bearer <accessToken>`.' })
  accessToken!: string;

  @ApiProperty({ type: 'integer', description: 'Token lifetime in seconds.', example: 3600 })
  expiresIn!: number;

  @ApiProperty({ type: UserDto })
  user!: UserDto;
}
