import { Module } from '@nestjs/common';
import { StonfiSwapService } from './providers/stonfi-swap.provider';
import { TonBalanceProvider } from './providers/ton-balance.provider';
import { TonTransactionProvider } from './providers/ton-transaction.provider';
import { TonWalletProvider } from './providers/ton-wallet.provider';
import { TonConfig } from './ton.config';

@Module({
  providers: [
    TonConfig,
    TonWalletProvider,
    TonTransactionProvider,
    TonBalanceProvider,
    StonfiSwapService,
  ],
  exports: [
    TonConfig,
    TonWalletProvider,
    TonTransactionProvider,
    TonBalanceProvider,
    StonfiSwapService,
  ],
})
export class TonModule {}
