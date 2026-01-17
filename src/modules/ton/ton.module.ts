import { Module } from '@nestjs/common';
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
  ],
  exports: [TonWalletProvider, TonTransactionProvider, TonBalanceProvider],
})
export class TonModule {}
