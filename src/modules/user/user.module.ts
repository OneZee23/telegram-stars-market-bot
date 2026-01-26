import { UserService } from '@modules/user/user.service';
import { Module } from '@nestjs/common';
import { ConsentService } from './services/consent.service';
import { WhitelistService } from './services/whitelist.service';

@Module({
  providers: [UserService, WhitelistService, ConsentService],
  exports: [UserService, WhitelistService, ConsentService],
})
export class UserModule {}
