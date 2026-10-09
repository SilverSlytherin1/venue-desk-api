import { applyDecorators, type Type as Class } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class PageQueryDto {
  @ApiPropertyOptional({ type: 'integer', minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export function toSkipTake({ page, pageSize }: PageQueryDto): { skip: number; take: number } {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

/** OpenAPI has no generics, so the page envelope is spelled out around the item schema. */
export function ApiPageResponse(item: Class): MethodDecorator {
  return applyDecorators(
    ApiExtraModels(item),
    ApiOkResponse({
      schema: {
        type: 'object',
        required: ['items', 'page', 'pageSize', 'total'],
        properties: {
          items: { type: 'array', items: { $ref: getSchemaPath(item) } },
          page: { type: 'integer', example: 1 },
          pageSize: { type: 'integer', example: 20 },
          total: { type: 'integer', example: 42 },
        },
      },
    }),
  );
}
