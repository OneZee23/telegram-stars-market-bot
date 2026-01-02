import { UserService } from '@modules/user/user.service';
import { Module } from '@nestjs/common';
import { WhitelistService } from './services/whitelist.service';

@Module({
  providers: [UserService, WhitelistService],
  exports: [UserService, WhitelistService],
})
export class UserModule {}
