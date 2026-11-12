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
  raw?: any;
}

