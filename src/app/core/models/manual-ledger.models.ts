export type ManualLedgerPaymentMethodType =
  | 'Cash'
  | 'ExternalCardTerminal'
  | 'Voucher'
  | 'Stripe'
  | 'DiscountOmaggio'
  | 'Other';

export interface ManualLedgerPaymentMethod {
  Case?: string;
  Fields?: any[];
}

export interface ManualLedgerDishItem {
  dishName: string;
  quantity: number;
  unitPrice: number;
  vatDepartmentCode?: string | null;
}

export type FiscalMetadata =
  | { case: 'CodiceFiscale'; item: string }
  | { case: 'CodiceLotteria'; item: string }
  | { Case: 'CodiceFiscale'; Fields: [string] }
  | { Case: 'CodiceLotteria'; Fields: [string] };

export interface LedgerPublishStatusPublished {
  case: 'Published';
  publishedAt: string;
  publishedBatchId?: string | null;
}

export type LedgerPublishStatus =
  | 'Unrequired'
  | 'Unpublished'
  | { Case: 'Unrequired' }
  | { Case: 'Unpublished' }
  | { Case: 'Published'; Fields: [string, string | null] }
  | LedgerPublishStatusPublished;

export interface ManualLedgerEntry {
  entryId: string;
  timestamp: string;
  amount: number;
  tipAmount: number;
  paymentMethod: ManualLedgerPaymentMethodType | any;
  referenceNumber?: string | null;
  notes?: string | null;
  items?: ManualLedgerDishItem[];
  createdByUserId?: string | null;
  publishStatus?: any;
  fiscalMetadata?: any;
}

export interface ManualLedger {
  manualLedgerId: string;
  restaurantId: string;
  startDate: string;
  endDate: string;
  entries: ManualLedgerEntry[];
  isClosed: boolean;
  closedAt?: string | null;
  closedByUserId?: string | null;
}

export interface CreateManualLedgerRequest {
  startDate: string;
  endDate: string;
}

export interface PublishGroupRequest {
  entryIds: string[];
  customRef?: string | null;
  codiceFiscale?: string | null;
  codiceLotteria?: string | null;
}

export interface ApiKeyResponse {
  apiKey: string;
  authorizationHeader?: string;
}

export interface IntegrationStatusResponse {
  enabled: boolean;
  unconsumedCount: number;
}
