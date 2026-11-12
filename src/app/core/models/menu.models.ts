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
}

export interface PublicRestaurantDetails {
  restaurantId: string;
  restaurantName: string;
  humanReviewed: boolean;
  menuName?: string;
  items: MenuItemModel[];
}

