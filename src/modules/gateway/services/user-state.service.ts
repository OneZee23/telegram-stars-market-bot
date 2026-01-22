import { Injectable } from '@nestjs/common';

export enum UserState {
  IDLE = 'idle',
  ENTERING_CUSTOM_AMOUNT = 'entering_custom_amount',
  ENTERING_EMAIL = 'entering_email',
}

interface UserStateData {
  state: UserState;
  amount?: number;
}

@Injectable()
export class UserStateService {
  private readonly userStates = new Map<string, UserStateData>();

  setState(userId: string, state: UserState, amount?: number): void {
    this.userStates.set(userId, { state, amount });
  }

  getState(userId: string): UserState {
    return this.userStates.get(userId)?.state || UserState.IDLE;
  }

  getAmount(userId: string): number | undefined {
    return this.userStates.get(userId)?.amount;
  }

  clearState(userId: string): void {
    this.userStates.delete(userId);
  }
}
