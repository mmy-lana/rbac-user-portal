import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Query parameters for `GET /api/v1/audit-logs`.
 *
 * All fields are optional with sensible defaults applied by the service layer.
 * `forbidNonWhitelisted` in the global ValidationPipe will reject any parameter
 * not declared here.
 */
export class ListAuditLogsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  resourceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;
}
