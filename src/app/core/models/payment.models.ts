export interface PaymentIssue {
  timestamp: string; // ISO string
  issue: string;
}

export type PaymentStatusType = 'Captured' | 'Refunded' | 'Failed' | 'Other';

export interface PaymentStatus {
  case?: string; // F# union discriminator e.g. "Captured", "Refunded", "Failed"
  fields?: any[]; // for Refunded [amount]
}

export interface PaymentModel {
  paymentId?: { value?: string } | string;
  PaymentId?: { value?: string } | string;
  initialAmount?: number;
  InitialAmount?: number;
  currentAmount?: number;
  CurrentAmount?: number;
  platformFee?: number;
  PlatformFee?: number;
  stripeFee?: number;
  StripeFee?: number;
  currency?: string;
  Currency?: string;
  statuses?: (PaymentStatus | string)[];
  Statuses?: (PaymentStatus | string)[];
  paymentIntentId?: string;
  PaymentIntentId?: string;
  restaurantId?: { value?: string } | string | null;
  RestaurantId?: { value?: string } | string | null;
  orderId?: { value?: string } | string | null;
  OrderId?: { value?: string } | string | null;
  createdAt?: string;
  CreatedAt?: string;
  metadata?: Record<string, string>;
  Metadata?: Record<string, string>;
  issues?: ([string, string] | { item1?: string; item2?: string } | PaymentIssue)[];
  Issues?: ([string, string] | { item1?: string; item2?: string } | PaymentIssue)[];
}
