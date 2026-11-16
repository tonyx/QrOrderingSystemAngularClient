export type ContentDimension = 'Weight' | 'Volume' | 'Discrete';

export type PackageType =
  | 'Bottle'
  | 'Can'
  | 'Keg'
  | 'Box'
  | 'Bag'
  | 'Pack'
  | 'Piece'
  | { Other: string };

export type VolumeUnit = 'Lt' | 'Ml' | 'Cl' | 'Dl' | 'FlOz';
export type WeightUnit = 'Kg' | 'G' | 'Oz' | 'Lbs';

export type ContentMeasure =
  | { case: 'Volume'; fields: [number, VolumeUnit] }
  | { case: 'Weight'; fields: [number, WeightUnit] }
  | { case: 'Count'; fields: [number] };

export type ItemTrackingMode =
  | { case: 'FixedPackage'; fields: [PackageType, ContentMeasure] }
  | { case: 'VariableWeight'; fields: [PackageType, ContentMeasure] }
  | { case: 'Discrete'; fields: [string] };

export type StockLevel =
  | { case: 'FixedPackageStock'; fields: [number, ContentMeasure | null] }
  | { case: 'VariableWeightStock'; fields: [number, ContentMeasure] }
  | { case: 'DiscreteStock'; fields: [number] }
  | { case: 'UnavailableStock'; fields?: unknown[] };

export type StockUnitOfMeasure =
  | 'Units'
  | 'Kg'
  | 'G'
  | 'Lt'
  | 'Ml'
  | 'Oz'
  | 'Lbs'
  | 'Unspecified'
  | { Informal: string };

export interface ProductBarcode {
  barCodeType?: any;
  BarCodeType?: any;
  packageQuantity?: number;
  PackageQuantity?: number;
  totalStockQuantity?: any;
  TotalStockQuantity?: any;
}

export interface StockInventoryItem {
  stockInventoryItemId?: any;
  StockInventoryItemId?: any;
  name?: any;
  Name?: any;
  brands?: any;
  Brands?: any;
  trackingMode?: any;
  TrackingMode?: any;
  categoriesTags?: string[];
  CategoriesTags?: string[];
  productBarCodes?: ProductBarcode[];
  ProductBarCodes?: ProductBarcode[];
  cluster?: any;
  Cluster?: any;
  deleted?: boolean;
  Deleted?: boolean;
}

export interface StockEquivalenceClass {
  id?: any;
  Id?: any;
  name?: any;
  Name?: any;
  dimension?: ContentDimension | any;
  Dimension?: ContentDimension | any;
  itemIds?: any[];
  ItemIds?: any[];
  defaultItemId?: any;
  DefaultItemId?: any;
}

export interface StockAnomalyRecord {
  stockInventoryItemId?: any;
  StockInventoryItemId?: any;
  dateTime?: string;
  DateTime?: string;
  anomalyType?: any;
  AnomalyType?: any;
}

export interface InboundReference2 {
  supplierIdOrVat?: string;
  SupplierIdOrVat?: string;
  documentNumber?: string;
  DocumentNumber?: string;
  documentDate?: string;
  DocumentDate?: string;
  docScan?: string[];
  DocScan?: string[];
}

export interface TrackedConsumption {
  id?: any;
  Id?: any;
  dateTime?: string;
  DateTime?: string;
  sourceMenuItem?: string | null;
  SourceMenuItem?: string | null;
  component?: any;
  Component?: any;
}

export interface StockInventory {
  stockInventoryId?: any;
  StockInventoryId?: any;
  stockInventoryItems?: any;
  StockInventoryItems?: any;
  quantities?: any;
  Quantities?: any;
  productBarCodes?: any;
  ProductBarCodes?: any;
  anomalies?: StockAnomalyRecord[];
  Anomalies?: StockAnomalyRecord[];
  anomaliesBufferSize?: number;
  AnomaliesBufferSize?: number;
  trackedInboundReferences?: InboundReference2[];
  TrackedInboundReferences?: InboundReference2[];
  inBoundReferencesBufferSize?: number;
  InBoundReferencesBufferSize?: number;
  trackingConsumptionBufferSize?: number;
  TrackingConsumptionBufferSize?: number;
  trackedConsumptions?: TrackedConsumption[];
  TrackedConsumptions?: TrackedConsumption[];
  trackingConsumptions?: boolean;
  TrackingConsumptions?: boolean;
  equivalenceClasses?: any;
  EquivalenceClasses?: any;
}

export interface ProductResponse {
  code?: string | null;
  product_name?: string;
  brands?: string | null;
  categories_tags?: string[] | null;
  allergens_tags?: string[] | null;
  quantity?: string | null;
}

export interface InventoryProductRow {
  itemId: string;
  name: string;
  brand?: string | null;
  trackingMode: any;
  stockLevel?: any;
  isFixedPackage: boolean;
  isVariableWeight: boolean;
  sealedPackages: number;
  packageUnitName: string;
  openContainerStatus?: string | null;
  variableWeightStatus?: string | null;
  openContainerMeasure?: any;
  nominalContent?: any;
  unitOfMeasure: string;
  unitOfMeasureDisplay: string;
  categoriesTags: string[];
  barcodes: ProductBarcode[];
  cluster?: string | null;
  currentQuantity: number;
  formattedQuantity: string;
}

export interface EquivalenceClassAvailabilityItem {
  classId: string | null;
  classIdString: string;
  name: string;
  dimensionDisplay: string;
  totalNumericStock: number;
  totalFormattedStock: string;
  totalItemsCount: number;
  inStockItemsCount: number;
  outOfStockItemsCount: number;
  isUnassigned: boolean;
  memberItems: ProductAvailabilityItem[];
  isExpanded: boolean;
  statusBadgeClass: string;
  statusText: string;
}

export interface ProductAvailabilityItem {
  itemId: string;
  itemIdString: string;
  name: string;
  brand?: string | null;
  equivalenceClassName?: string | null;
  equivalenceClassIdString?: string | null;
  numericStock: number;
  formattedStock: string;
  unitOfMeasureDisplay: string;
  isFixedPackage: boolean;
  isVariableWeight: boolean;
  sealedPackages: number;
  sourceRow?: InventoryProductRow;
  statusBadgeClass: string;
  statusText: string;
}
