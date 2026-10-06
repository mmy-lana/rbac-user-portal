import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Request body for `POST /api/v1/auth/login`.
 *
 * The global `ValidationPipe` runs with `whitelist: true`, so unknown keys are
 * stripped before the handler sees them and cannot be smuggled into the query.
 */
export class LoginDto {
  @IsEmail({}, { message: 'A valid email address is required.' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Passphrase must be at least 8 characters.' })
  @MaxLength(128, { message: 'Passphrase must not exceed 128 characters.' })
  password!: string;
}