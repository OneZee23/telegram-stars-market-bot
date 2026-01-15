/**
 * YooKassa API interfaces
 */

export interface YooKassaPaymentRequest {
  amount: {
    value: string;
    currency: string;
  };
  confirmation: {
    type: string;
    return_url?: string;
  };
  capture: boolean;
  description?: string;
  metadata?: Record<string, string>;
}

export interface YooKassaPaymentResponse {
  id: string;
  status: string;
  amount: {
    value: string;
    currency: string;
  };
  confirmation?: {
    type: string;
    confirmation_url?: string;
  };
  created_at: string;
  description?: string;
  metadata?: Record<string, string>;
}

export interface YooKassaWebhookEvent {
  type: string;
  event: string;
  object: {
    id: string;
    status: string;
    amount: {
      value: string;
      currency: string;
    };
    created_at: string;
    description?: string;
    metadata?: Record<string, string>;
  };
}

