import { Injectable } from '@nestjs/common';

export enum UserState {
  IDLE = 'idle',
  ENTERING_CUSTOM_AMOUNT = 'entering_custom_amount',
}

@Injectable()
export class UserStateService {
  private readonly userStates = new Map<string, UserState>();

  setState(userId: string, state: UserState): void {
    this.userStates.set(userId, state);
  }

  getState(userId: string): UserState {
    return this.userStates.get(userId) || UserState.IDLE;
  }

  clearState(userId: string): void {
    this.userStates.delete(userId);
  }
}
