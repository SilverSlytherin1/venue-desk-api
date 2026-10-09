import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { Role } from '../../../common/auth/role.js';

@ApiSchema({ name: 'UserRef' })
export class UserRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Sam Staff' })
  name!: string;
}

@ApiSchema({ name: 'User' })
export class UserDto extends UserRefDto {
  @ApiProperty({ format: 'email', example: 'sam@venuedesk.test' })
  email!: string;

  @ApiProperty({ enum: Role, enumName: 'Role' })
  role!: Role;
}
