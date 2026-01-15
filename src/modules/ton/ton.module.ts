import { Module } from '@nestjs/common';
import { DexSwapService } from './services/dex-swap.service';
import { TransactionService } from './services/transaction.service';
import { WalletService } from './services/wallet.service';
import { TonConfig } from './ton.config';

@Module({
  providers: [TonConfig, WalletService, TransactionService, DexSwapService],
  exports: [WalletService, TransactionService, DexSwapService],
})
export class TonModule {}
