/**
 * Callback data constants for Telegram bot
 * Used for inline keyboard buttons
 */
export enum CallbackData {
  // Main menu
  HELP = 'help',
  BUY_STARS = 'buy_stars',
  BACK_TO_MAIN = 'back_to_main',

  // Purchase flow
  BUY_FOR_MYSELF = 'buy_for_myself',
  BUY_FOR_OTHER = 'buy_for_other',
  AMOUNT_CUSTOM = 'amount_custom',

  // Consent flow
  CONSENT_GRANT = 'consent_grant',

  // Help submenu
  HELP_OFFER = 'help_offer',
  HELP_PRIVACY = 'help_privacy',
  HELP_CONTACTS = 'help_contacts',
  HELP_FAQ = 'help_faq',
  HELP_REVOKE = 'help_revoke',
  HELP_REVOKE_CONFIRM = 'help_revoke_confirm',
  HELP_BACK = 'help_back',
}

/**
 * Build callback data for amount selection
 * @param amount Amount of stars
 * @param isTest Whether this is a test claim
 * @returns Callback data string
 */
export function buildAmountCallback(
  amount: number,
  isTest: boolean = false,
): string {
  return isTest ? `amount_${amount}_test` : `amount_${amount}`;
}

/**
 * Build callback data for payment confirmation
 * @param amount Amount of stars
 * @returns Callback data string
 */
export function buildPaymentCallback(amount: number): string {
  return `confirm_payment_${amount}`;
}
