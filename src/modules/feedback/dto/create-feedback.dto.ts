import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Trims a comment, and turns one that is left empty into no comment at all. */
const toComment = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export class CreateFeedbackDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 5, example: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({
    type: 'string',
    nullable: true,
    maxLength: 1000,
    description: 'Trimmed. An empty comment is stored as null.',
  })
  @Transform(toComment)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string | null;
}
