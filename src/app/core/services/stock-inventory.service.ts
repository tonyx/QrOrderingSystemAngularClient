import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { StockInventoryService as StockInventoryApiService } from '../api/endpoints/stock-inventory/stock-inventory.service';
import {
  StockInventory,
  ProductResponse,
  InboundReference2,
  StockInventoryItem,
  StockLevel,
  StockEquivalenceClass,
} from '../models/stock-inventory.models';

@Injectable({
  providedIn: 'root',
})
export class StockInventoryService {
  private readonly stockApi = inject(StockInventoryApiService);

  /**
   * Retrieves the active stock inventory for the specified restaurant.
   */
  getStockInventoryByRestaurant(restaurantId: string): Observable<StockInventory> {
    return this.stockApi.getApiStockInventoryRestaurantRestaurantIdInventory(restaurantId, 'application/json') as unknown as Observable<StockInventory>;
  }

  /**
   * Retrieves a specific stock inventory aggregate by its ID.
   */
  getStockInventory(restaurantId: string, stockInventoryId: string): Observable<StockInventory> {
    return this.stockApi.getApiStockInventoryRestaurantRestaurantIdInventoryStockInventoryId(
      restaurantId,
      stockInventoryId,
      'application/json'
    ) as unknown as Observable<StockInventory>;
  }

  /**
   * Searches for a product by barcode (via OpenFoodFacts/internal index).
   */
  getProductInfoByBarcode(restaurantId: string, barcode: string): Observable<ProductResponse> {
    const enc = encodeURIComponent(barcode || '');
    return this.stockApi.getApiStockInventoryRestaurantRestaurantIdProductInfoBarcode(
      restaurantId,
      enc,
      'application/json'
    ) as unknown as Observable<ProductResponse>;
  }

  /**
   * Searches products by name/query.
   */
  searchProductsByName(restaurantId: string, query: string, pageSize?: number): Observable<ProductResponse[]> {
    return this.stockApi.getApiStockInventoryRestaurantRestaurantIdSearchProducts(
      restaurantId,
      'application/json',
      {
        query: query || '',
        pageSize,
      }
    ) as unknown as Observable<ProductResponse[]>;
  }

  /**
   * Adds an inventory item definition with initial stock level.
   */
  addWithInitialStockLevel(
    restaurantId: string,
    stockInventoryId: string,
    item: StockInventoryItem,
    stockLevel: StockLevel
  ): Observable<void> {
    return this.stockApi.postApiStockInventoryRestaurantRestaurantIdInventoryStockInventoryIdItemAddWithInitialStockLevel(
      restaurantId,
      stockInventoryId,
      {
        item: item as any,
        stockLevel: stockLevel as any,
      }
    );
  }

  /**
   * Adds stock quantity to an existing item (standard).
   */
  addQuantity(
    restaurantId: string,
    stockInventoryId: string,
    itemId: string,
    quantity: any
  ): Observable<void> {
    return this.stockApi.postApiStockInventoryRestaurantRestaurantIdInventoryStockInventoryIdItemItemIdQuantityAdd(
      restaurantId,
      stockInventoryId,
      itemId,
      quantity
    );
  }

  /**
   * Adds stock quantity with inbound delivery note (DDT) reference document.
   */
  addQuantityWithInboundReference(
    restaurantId: string,
    stockInventoryId: string,
    itemId: string,
    quantity: any,
    inboundReference: InboundReference2
  ): Observable<void> {
    return this.stockApi.postApiStockInventoryRestaurantRestaurantIdInventoryStockInventoryIdItemItemIdQuantityAddWithInboundReference(
      restaurantId,
      stockInventoryId,
      itemId,
      {
        quantity,
        inboundReference: inboundReference as any,
      }
    );
  }

  /**
   * Attaches a barcode to an existing inventory item.
   */
  attachProductBarcode(
    restaurantId: string,
    stockInventoryId: string,
    itemId: string,
    barcode: any
  ): Observable<void> {
    return this.stockApi.postApiStockInventoryRestaurantRestaurantIdInventoryStockInventoryIdItemItemIdBarcodeAttach(
      restaurantId,
      stockInventoryId,
      itemId,
      barcode
    );
  }

  /**
   * Detaches a barcode from an inventory item.
   */
  detachProductBarcode(
    restaurantId: string,
    stockInventoryId: string,
    itemId: string,
    barcode: any
  ): Observable<void> {
    return this.stockApi.postApiStockInventoryRestaurantRestaurantIdInventoryStockInventoryIdItemItemIdBarcodeDetach(
      restaurantId,
      stockInventoryId,
      itemId,
      barcode
    );
  }

  /**
   * Adds stock level (sealed packages or units).
   */
  addStockLevel(
    restaurantId: string,
    stockInventoryId: string,
    itemId: string,
    stockLevel: StockLevel
  ): Observable<void> {
    return this.stockApi.postApiStockInventoryRestaurantRestaurantIdInventoryStockInventoryIdItemItemIdStockLevelAdd(
      restaurantId,
      stockInventoryId,
      itemId,
      stockLevel as any
    );
  }

  /**
   * Adjusts the open container measured level.
   */
  adjustOpenContainerContent(
    restaurantId: string,
    stockInventoryId: string,
    itemId: string,
    openContent: any
  ): Observable<void> {
    return this.stockApi.postApiStockInventoryRestaurantRestaurantIdInventoryStockInventoryIdItemItemIdOpenContainerAdjust(
      restaurantId,
      stockInventoryId,
      itemId,
      { openContent }
    );
  }

  /**
   * Unseals a package into the active open container.
   */
  unsealPackage(restaurantId: string, stockInventoryId: string, itemId: string): Observable<void> {
    return this.stockApi.postApiStockInventoryRestaurantRestaurantIdInventoryStockInventoryIdItemItemIdPackageUnseal(
      restaurantId,
      stockInventoryId,
      itemId,
      {}
    );
  }

  /**
   * Updates an item's details and tracking mode.
   */
  updateStockInventoryItemWithMode(
    restaurantId: string,
    stockInventoryId: string,
    itemId: string,
    name: string,
    brand: string | null,
    trackingMode: any
  ): Observable<void> {
    return this.stockApi.postApiStockInventoryRestaurantRestaurantIdInventoryStockInventoryIdItemItemIdUpdateWithMode(
      restaurantId,
      stockInventoryId,
      itemId,
      {
        name,
        brand: brand || null,
        trackingMode,
      }
    );
  }

  /**
   * Attaches a category tag to an inventory item.
   */
  attachCategoryTag(
    restaurantId: string,
    stockInventoryId: string,
    itemId: string,
    tag: string
  ): Observable<void> {
    return this.stockApi.postApiStockInventoryRestaurantRestaurantIdInventoryStockInventoryIdItemItemIdCategoryTagAttach(
      restaurantId,
      stockInventoryId,
      itemId,
      { tag }
    );
  }

  /**
   * Detaches a category tag from an inventory item.
   */
  detachCategoryTag(
    restaurantId: string,
    stockInventoryId: string,
    itemId: string,
    tag: string
  ): Observable<void> {
    return this.stockApi.postApiStockInventoryRestaurantRestaurantIdInventoryStockInventoryIdItemItemIdCategoryTagDetach(
      restaurantId,
      stockInventoryId,
      itemId,
      { tag }
    );
  }

  /**
   * Removes (soft deletes) an inventory item.
   */
  removeStockInventoryItem(
    restaurantId: string,
    stockInventoryId: string,
    itemId: string,
    name: string
  ): Observable<void> {
    return this.stockApi.postApiStockInventoryRestaurantRestaurantIdInventoryStockInventoryIdItemItemIdRemove(
      restaurantId,
      stockInventoryId,
      itemId,
      { name }
    );
  }

  // --- Equivalence Classes ---
  addEquivalenceClass(
    restaurantId: string,
    stockInventoryId: string,
    eqClass: StockEquivalenceClass
  ): Observable<void> {
    return this.stockApi.postApiStockInventoryRestaurantRestaurantIdInventoryStockInventoryIdEquivalenceClasses(
      restaurantId,
      stockInventoryId,
      eqClass as any
    );
  }

  removeEquivalenceClass(
    restaurantId: string,
    stockInventoryId: string,
    classId: string
  ): Observable<void> {
    return this.stockApi.postApiStockInventoryRestaurantRestaurantIdInventoryStockInventoryIdEquivalenceClassesClassIdRemove(
      restaurantId,
      stockInventoryId,
      classId,
      {}
    );
  }

  renameEquivalenceClass(
    restaurantId: string,
    stockInventoryId: string,
    classId: string,
    name: string
  ): Observable<void> {
    return this.stockApi.postApiStockInventoryRestaurantRestaurantIdInventoryStockInventoryIdEquivalenceClassesClassIdRename(
      restaurantId,
      stockInventoryId,
      classId,
      { name }
    );
  }

  addItemToEquivalenceClass(
    restaurantId: string,
    stockInventoryId: string,
    classId: string,
    itemId: string
  ): Observable<void> {
    return this.stockApi.postApiStockInventoryRestaurantRestaurantIdInventoryStockInventoryIdEquivalenceClassesClassIdItemsItemId(
      restaurantId,
      stockInventoryId,
      classId,
      itemId,
      {}
    );
  }

  removeItemFromEquivalenceClass(
    restaurantId: string,
    stockInventoryId: string,
    classId: string,
    itemId: string
  ): Observable<void> {
    return this.stockApi.postApiStockInventoryRestaurantRestaurantIdInventoryStockInventoryIdEquivalenceClassesClassIdItemsItemIdRemove(
      restaurantId,
      stockInventoryId,
      classId,
      itemId,
      {}
    );
  }

  setEquivalenceClassDefaultItem(
    restaurantId: string,
    stockInventoryId: string,
    classId: string,
    itemId: string
  ): Observable<void> {
    return this.stockApi.postApiStockInventoryRestaurantRestaurantIdInventoryStockInventoryIdEquivalenceClassesClassIdDefaultItemItemId(
      restaurantId,
      stockInventoryId,
      classId,
      itemId,
      {}
    );
  }

  moveItemBetweenEquivalenceClasses(
    restaurantId: string,
    stockInventoryId: string,
    fromClassId: string,
    toClassId: string,
    itemId: string
  ): Observable<void> {
    return this.stockApi.postApiStockInventoryRestaurantRestaurantIdInventoryStockInventoryIdEquivalenceClassesFromClassIdMoveItemItemIdToToClassId(
      restaurantId,
      stockInventoryId,
      fromClassId,
      itemId,
      toClassId,
      {}
    );
  }

  // --- Consumptions Management ---
  removeTrackedConsumption(
    restaurantId: string,
    stockInventoryId: string,
    consumptionId: string
  ): Observable<void> {
    return this.stockApi.postApiStockInventoryRestaurantRestaurantIdInventoryStockInventoryIdConsumptionsConsumptionIdRemove(
      restaurantId,
      stockInventoryId,
      consumptionId,
      {}
    );
  }

  reconcileTrackedConsumption(
    restaurantId: string,
    stockInventoryId: string,
    consumptionId: string,
    assignedItemId: string,
    deductStock: boolean
  ): Observable<void> {
    return this.stockApi.postApiStockInventoryRestaurantRestaurantIdInventoryStockInventoryIdConsumptionsConsumptionIdReconcileAdvanced(
      restaurantId,
      stockInventoryId,
      consumptionId,
      {
        deductions: [
          {
            assignedItemId,
            deductStock,
          },
        ],
      } as any
    );
  }

  reconcileConsumptionAdvanced(
    restaurantId: string,
    stockInventoryId: string,
    consumptionId: string,
    deductions: any[]
  ): Observable<void> {
    return this.stockApi.postApiStockInventoryRestaurantRestaurantIdInventoryStockInventoryIdConsumptionsConsumptionIdReconcileAdvanced(
      restaurantId,
      stockInventoryId,
      consumptionId,
      { deductions } as any
    );
  }

  removeMultipleTrackedConsumptions(
    restaurantId: string,
    stockInventoryId: string,
    consumptionIds: string[]
  ): Observable<void> {
    return this.stockApi.postApiStockInventoryRestaurantRestaurantIdInventoryStockInventoryIdConsumptionsBulkRemove(
      restaurantId,
      stockInventoryId,
      { consumptionIds }
    );
  }

  resolveDirectlyResolvableConsumptions(
    restaurantId: string,
    stockInventoryId: string,
    consumptionIds: string[]
  ): Observable<void> {
    return this.stockApi.postApiStockInventoryRestaurantRestaurantIdInventoryStockInventoryIdConsumptionsResolveDirect(
      restaurantId,
      stockInventoryId,
      { consumptionIds }
    );
  }
}
