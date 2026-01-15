import { IsNotEmpty, IsObject, IsString } from 'class-validator';

export class YooKassaWebhookDto {
  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsNotEmpty()
  event: string;

  @IsObject()
  @IsNotEmpty()
  object: {
    id: string;
    status: string;
    amount: {
      value: string;
      currency: string;
    };
    created_at: string;
    description?: string;
    metadata?: Record<string, string>;
  };
}

