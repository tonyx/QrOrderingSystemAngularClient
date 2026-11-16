export interface MenuItemTranslation {
  name?: string;
  Name?: string;
  description?: string;
  Description?: string;
}

export interface MenuItemModel {
  name: string;
  category: string;
  orderIndex: number;
  description: string;
  price: number | null;
  imageUrl?: string | null;
  available: boolean;
  allergens?: Record<string, string>;
  translations?: Record<string, MenuItemTranslation>;
  isExtra?: boolean;
  vatDepartmentCode?: string | { Value?: string; value?: string; fields?: string[] } | null;
  fiveStarVotesCount?: number;
  fourStarVotesCount?: number;
  threeStarVotesCount?: number;
  twoStarVotesCount?: number;
  oneStarVotesCount?: number;
  ratingStats?: { mean: number; stdDev: number };
}

export interface PublicRestaurantDetails {
  restaurantId: string;
  restaurantName: string;
  humanReviewed: boolean;
  menuName?: string;
  items: MenuItemModel[];
  tables?: any;
  parsedTables?: any[];
  seatingFee?: number;
  paymentConfig?: any;
  selfOrderingConfig?: any;
  showTips?: boolean;
  tipsHints?: any[];
  extraCatalogueSetting?: {
    isUnavailable: boolean;
    isEnabled: boolean;
    isDisabled: boolean;
    extraCatalogueId?: string | null;
  };
  geoLocSettings?: import('./restaurant.models').GeoLocSettings | null;
  optCidrAddresses?: string | null;
  raw?: any;
}

export interface ExtraCatalogueItemDto {
  name: string;
  optCategory?: string | null;
  optDescription?: string | null;
  optOrdinaryPrice?: number | null;
  available: boolean;
  translations?: Record<string, MenuItemTranslation>;
  allergens?: Record<string, string>;
  composition?: any[];
  pricesPerVatDepartments?: Record<string, number>;
}

export interface ExtraCatalogueItemDetailDto {
  extraCatalogueMenuItem: ExtraCatalogueItemDto;
  menuItemStockComponentDetails?: any[];
}

export interface ExtraCatalogueDetailsDto {
  extraCatalogue: {
    extraCatalogueId?: string;
    extraCatalogueMenuItems?: ExtraCatalogueItemDto[];
  };
  extraCatalogueMenuItemDetails: ExtraCatalogueItemDetailDto[];
}

