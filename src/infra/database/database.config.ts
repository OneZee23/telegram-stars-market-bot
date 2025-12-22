import { parseBool } from '@common/parse-bool.fn';
import {
  IsBoolean,
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';
import { UseEnv } from '@common/config/use-env.decorator';
import { ConfigFragment } from '@common/config/config-fragment';
import { LoggerOptions } from 'typeorm';
import { DecodeBase64 } from '@common/decode-base64';

type LogOption =
  | 'query'
  | 'schema'
  | 'error'
  | 'warn'
  | 'info'
  | 'log'
  | 'migration';

const parseLogOptions: (raw?: string) => LoggerOptions = (raw?: string) => {
  if (!raw) {
    return false;
  }

  if (['true', 'false', 'yes', 'no'].includes(raw)) {
    return parseBool(raw);
  }

  if (raw === 'all') {
    return 'all';
  }

  return raw.split(',') as LogOption[];
};

export class DatabaseConfig extends ConfigFragment {
  @IsString()
  @UseEnv('DB_HOST')
  public readonly host: string;

  @IsInt()
  @UseEnv('DB_PORT', parseInt)
  public readonly port: number;

  @IsString()
  @UseEnv('DB_NAME')
  public readonly database: string;

  @IsString()
  @UseEnv('DB_USER')
  public readonly username: string;

  @IsString()
  @UseEnv('DB_PASS')
  public readonly password: string;

  @IsDefined()
  @UseEnv('DB_LOG', parseLogOptions)
  public readonly log: boolean;

  @IsBoolean()
  @UseEnv('DB_SYNC', parseBool)
  public readonly sync: boolean;

  @IsBoolean()
  @UseEnv('DB_MIGRATE', parseBool)
  public readonly migrate: boolean;

  /**
   * # Database cert CA
   *
   * Very useful for production.
   *
   * Base64 is used to deal with PEM-format compliance.
   * In base64 newlines are encoded within other characters.
   * So, it is more convenient for .env files.
   */
  @IsString()
  @IsOptional()
  @UseEnv('DB_CERT_BASE64', DecodeBase64)
  public readonly cert?: string;
}
