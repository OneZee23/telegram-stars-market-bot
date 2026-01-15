import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class CreatePaymentDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsNumber()
  @Min(1)
  starsAmount: number;

  @IsString()
  @IsNotEmpty()
  recipientUsername: string;
}

