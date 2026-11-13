export type SelfOrderingMode = 'no' | 'cash-only' | 'cache-and-stripe' | 'only-stripe';

export interface RestaurantSubscription {
  subscriptionType?: {
    case?: string;
    fields?: unknown[];
    ending?: string;
  } | string;
  optStripeInfo?: {
    customerId?: string;
    subscriptionId?: string;
    optConnectAccountId?: string | null;
    priceId?: string;
  } | null;
  optPendingPaymentIntent?: {
    paymentIntentId?: string;
    duration?: unknown;
  } | null;
}

export interface SubscriptionSettingsConfig {
  monthlyFeeCents: number;
  monthlyFeeCurrency: string;
  discount3MonthsPercent: number;
  discount6MonthsPercent: number;
  discount12MonthsPercent: number;
}

export interface CreateSubscriptionIntentRequest {
  durationDays: number;
  successUrl: string;
  cancelUrl: string;
  userId?: string | null;
}

export interface CreateSubscriptionIntentResponse {
  checkoutUrl?: string;
  isRealStripe?: boolean;
}

export interface PaymentConfiguration {
  isStripeEnabled?: boolean;
  isCashOnly?: boolean;
  stripeAccountId?: string | null;
  currency?: string;
}

export interface StripeAccountStatus {
  isConnected: boolean;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  stripeAccountId?: string | null;
  requirementsDue?: string[];
}

export interface SelfOrderingConfig {
  mode?: SelfOrderingMode;
  isNoSelfOrdering?: boolean;
  isCashOnlySelfOrdering?: boolean;
  isCacheAndStripeSelfOrdering?: boolean;
  isOnlyStripeSelfOrdering?: boolean;
  isEnabled?: boolean;
}

export interface StockInventorySettings {
  isUnavailable?: boolean;
  isEnabledOnlyLoad?: boolean;
  isEnabledWithConsumptionTracking?: boolean;
  isDisabled?: boolean;
}

export interface SasResponse {
  uploadUrl: string;
  publicUrl: string;
}

export interface VatDepartmentCodeAndRate {
  code: string;
  rate: number;
}

export interface TipHintItem {
  percentage: number;
  isDefault: boolean;
}

export interface ExtraCatalogueSetting {
  isUnavailable: boolean;
  isEnabled: boolean;
  isDisabled: boolean;
  extraCatalogueId?: string | null;
}

export interface RestaurantItem {
  restaurantId: string;
  restaurantName: string;
  admin?: string;
  members?: string[];
  tablesCount?: number;
  tables?: Record<string, unknown> | unknown[];
  parsedTables?: TableModel[];
  hasActiveOrders?: boolean;
  seatingFee?: number;
  showTips?: boolean;
  tipsHints?: TipHintItem[];
  defaultVatDepartmentCodeAndRate?: VatDepartmentCodeAndRate;
  extraVatDepartmentCodeAndRate?: VatDepartmentCodeAndRate[];
  vatDepartmentCodeAndRates?: VatDepartmentCodeAndRate[];
  extraCatalogueSetting?: ExtraCatalogueSetting;
  currentMenuName?: string;
  otherAvailableMenus?: Array<[number, string]>;
  humanReviewed?: boolean;
  paymentConfig?: PaymentConfiguration;
  stripeStatus?: StripeAccountStatus | null;
  selfOrderingConfig?: SelfOrderingConfig;
  subscription?: RestaurantSubscription;
  isExpired?: boolean;
  stockInventorySettings?: StockInventorySettings;
  items?: import('./menu.models').MenuItemModel[];
  categoriesOrdering?: Record<number, string | null>;
  raw?: unknown;
}

export interface PaymentMethodBadgeInfo {
  isPayAtCounter: boolean;
  isPaidAtCounter: boolean;
  isPrepaidWithStripe: boolean;
  isPaidWithStripe: boolean;
  isCompedAsOmaggio: boolean;
  label: string;
  icon?: string;
  title?: string;
}

export interface OrderItemModel {
  id?: string;
  dishName: string;
  comment?: string | null;
  status: string;
  isConfirmed: boolean;
  isPending: boolean;
  isDone: boolean;
  isRejected: boolean;
  rejectionReason?: string | null;
  paymentMethod?: PaymentMethodBadgeInfo | null;
}

export interface AggregatedOrderItem {
  quantity: number;
  dishName: string;
  comment?: string | null;
  status: string;
  isConfirmed: boolean;
  isPending: boolean;
  isDone: boolean;
  isRejected: boolean;
  rejectionReason?: string | null;
  paymentMethod?: PaymentMethodBadgeInfo | null;
  itemIds: string[];
}

export interface TableSessionModel {
  sessionId: string;
  items: OrderItemModel[];
  aggregatedItems: AggregatedOrderItem[];
  total: number;
  fiscalMetadata?: {
    isCodiceFiscale: boolean;
    isCodiceLotteria: boolean;
    value: string;
  } | null;
}

export interface TableModel {
  tableNumber: number;
  tableId: string;
  additionalInfo?: string | null;
  maxSessions: number;
  skipSeatFee: boolean;
  overwriteSelfOrderingConfig?: SelfOrderingConfig | null;
  hasActiveOrders: boolean;
  sessions: TableSessionModel[];
}
