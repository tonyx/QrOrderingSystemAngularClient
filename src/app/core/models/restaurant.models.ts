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
  stockInventorySettings?: StockInventorySettings;
  raw?: unknown;
}
