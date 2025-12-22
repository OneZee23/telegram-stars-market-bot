/**
 * # App-level error. Should be displayed to users
 */
export abstract class AppError extends Error {
  public abstract readonly code: string;

  // eslint-disable-next-line class-methods-use-this
  public shouldBeLogged(): boolean {
    return false;
  }

  public devMessage(): string {
    return this.message;
  }

  public payload(): object | undefined {
    return undefined;
  }
}
