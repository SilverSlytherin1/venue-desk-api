import { ApiProperty, ApiSchema } from '@nestjs/swagger';

@ApiSchema({ name: 'EventRef' })
export class EventRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Autumn Jazz Night' })
  title!: string;
}
