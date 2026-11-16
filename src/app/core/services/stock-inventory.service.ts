import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
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
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '';

  /**
   * Retrieves the active stock inventory for the specified restaurant.
   */
  getStockInventoryByRestaurant(restaurantId: string): Observable<StockInventory> {
    const url = `${this.baseUrl}/api/StockInventory/restaurant/${restaurantId}/inventory`;
    return this.http.get<StockInventory>(url);
  }

  /**
   * Retrieves a specific stock inventory aggregate by its ID.
   */
  getStockInventory(restaurantId: string, stockInventoryId: string): Observable<StockInventory> {
    const url = `${this.baseUrl}/api/StockInventory/restaurant/${restaurantId}/inventory/${stockInventoryId}`;
    return this.http.get<StockInventory>(url);
  }

  /**
   * Searches for a product by barcode (via OpenFoodFacts/internal index).
   */
  getProductInfoByBarcode(restaurantId: string, barcode: string): Observable<ProductResponse> {
    const enc = encodeURIComponent(barcode || '');
    const url = `${this.baseUrl}/api/StockInventory/restaurant/${restaurantId}/product-info/${enc}`;
    return this.http.get<ProductResponse>(url);
  }

  /**
   * Searches products by name/query.
   */
  searchProductsByName(restaurantId: string, query: string, pageSize?: number): Observable<ProductResponse[]> {
    let url = `${this.baseUrl}/api/StockInventory/restaurant/${restaurantId}/search-products?query=${encodeURIComponent(query || '')}`;
    if (pageSize) {
      url += `&pageSize=${pageSize}`;
    }
    return this.http.get<ProductResponse[]>(url);
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
    const url = `${this.baseUrl}/api/StockInventory/restaurant/${restaurantId}/inventory/${stockInventoryId}/item/add-with-initial-stock-level`;
    return this.http.post<void>(url, {
      Item: item,
      StockLevel: stockLevel,
    });
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
    const url = `${this.baseUrl}/api/StockInventory/restaurant/${restaurantId}/inventory/${stockInventoryId}/item/${itemId}/quantity/add`;
    return this.http.post<void>(url, quantity);
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
    const url = `${this.baseUrl}/api/StockInventory/restaurant/${restaurantId}/inventory/${stockInventoryId}/item/${itemId}/quantity/add-with-inbound-reference`;
    return this.http.post<void>(url, {
      Quantity: quantity,
      InboundReference: inboundReference,
    });
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
    const url = `${this.baseUrl}/api/StockInventory/restaurant/${restaurantId}/inventory/${stockInventoryId}/item/${itemId}/barcode/attach`;
    return this.http.post<void>(url, barcode);
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
    const url = `${this.baseUrl}/api/StockInventory/restaurant/${restaurantId}/inventory/${stockInventoryId}/item/${itemId}/barcode/detach`;
    return this.http.post<void>(url, barcode);
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
    const url = `${this.baseUrl}/api/StockInventory/restaurant/${restaurantId}/inventory/${stockInventoryId}/item/${itemId}/stock-level/add`;
    return this.http.post<void>(url, stockLevel);
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
    const url = `${this.baseUrl}/api/StockInventory/restaurant/${restaurantId}/inventory/${stockInventoryId}/item/${itemId}/open-container/adjust`;
    return this.http.post<void>(url, { OpenContent: openContent });
  }

  /**
   * Unseals a package into the active open container.
   */
  unsealPackage(restaurantId: string, stockInventoryId: string, itemId: string): Observable<void> {
    const url = `${this.baseUrl}/api/StockInventory/restaurant/${restaurantId}/inventory/${stockInventoryId}/item/${itemId}/package/unseal`;
    return this.http.post<void>(url, {});
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
    const url = `${this.baseUrl}/api/StockInventory/restaurant/${restaurantId}/inventory/${stockInventoryId}/item/${itemId}/update-with-mode`;
    return this.http.post<void>(url, {
      Name: name,
      Brand: brand || null,
      TrackingMode: trackingMode,
    });
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
    const url = `${this.baseUrl}/api/StockInventory/restaurant/${restaurantId}/inventory/${stockInventoryId}/item/${itemId}/category-tag/attach`;
    return this.http.post<void>(url, { Tag: tag });
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
    const url = `${this.baseUrl}/api/StockInventory/restaurant/${restaurantId}/inventory/${stockInventoryId}/item/${itemId}/category-tag/detach`;
    return this.http.post<void>(url, { Tag: tag });
  }

  /**
   * Removes (soft deletes) an inventory item.
   */
  removeStockInventoryItem(restaurantId: string, itemId: string, name: string): Observable<void> {
    const url = `${this.baseUrl}/api/StockInventory/restaurant/${restaurantId}/item/${itemId}/remove`;
    return this.http.post<void>(url, { Name: name });
  }

  // --- Equivalence Classes ---
  addEquivalenceClass(
    restaurantId: string,
    stockInventoryId: string,
    eqClass: StockEquivalenceClass
  ): Observable<void> {
    const url = `${this.baseUrl}/api/StockInventory/restaurant/${restaurantId}/inventory/${stockInventoryId}/equivalence-classes`;
    return this.http.post<void>(url, eqClass);
  }

  removeEquivalenceClass(
    restaurantId: string,
    stockInventoryId: string,
    classId: string
  ): Observable<void> {
    const url = `${this.baseUrl}/api/StockInventory/restaurant/${restaurantId}/inventory/${stockInventoryId}/equivalence-classes/${classId}/remove`;
    return this.http.post<void>(url, {});
  }

  renameEquivalenceClass(
    restaurantId: string,
    stockInventoryId: string,
    classId: string,
    name: string
  ): Observable<void> {
    const url = `${this.baseUrl}/api/StockInventory/restaurant/${restaurantId}/inventory/${stockInventoryId}/equivalence-classes/${classId}/rename`;
    return this.http.post<void>(url, { Name: name });
  }

  addItemToEquivalenceClass(
    restaurantId: string,
    stockInventoryId: string,
    classId: string,
    itemId: string
  ): Observable<void> {
    const url = `${this.baseUrl}/api/StockInventory/restaurant/${restaurantId}/inventory/${stockInventoryId}/equivalence-classes/${classId}/items/${itemId}`;
    return this.http.post<void>(url, {});
  }

  removeItemFromEquivalenceClass(
    restaurantId: string,
    stockInventoryId: string,
    classId: string,
    itemId: string
  ): Observable<void> {
    const url = `${this.baseUrl}/api/StockInventory/restaurant/${restaurantId}/inventory/${stockInventoryId}/equivalence-classes/${classId}/items/${itemId}/remove`;
    return this.http.post<void>(url, {});
  }

  setEquivalenceClassDefaultItem(
    restaurantId: string,
    stockInventoryId: string,
    classId: string,
    itemId: string
  ): Observable<void> {
    const url = `${this.baseUrl}/api/StockInventory/restaurant/${restaurantId}/inventory/${stockInventoryId}/equivalence-classes/${classId}/default-item/${itemId}`;
    return this.http.post<void>(url, {});
  }

  moveItemBetweenEquivalenceClasses(
    restaurantId: string,
    stockInventoryId: string,
    fromClassId: string,
    toClassId: string,
    itemId: string
  ): Observable<void> {
    const url = `${this.baseUrl}/api/StockInventory/restaurant/${restaurantId}/inventory/${stockInventoryId}/equivalence-classes/${fromClassId}/move-item/${itemId}/to/${toClassId}`;
    return this.http.post<void>(url, {});
  }

  // --- Consumptions Management ---
  removeTrackedConsumption(
    restaurantId: string,
    stockInventoryId: string,
    consumptionId: string
  ): Observable<void> {
    const url = `${this.baseUrl}/api/StockInventory/restaurant/${restaurantId}/inventory/${stockInventoryId}/consumptions/${consumptionId}/remove`;
    return this.http.post<void>(url, {});
  }

  reconcileTrackedConsumption(
    restaurantId: string,
    stockInventoryId: string,
    consumptionId: string,
    assignedItemId: string,
    deductStock: boolean
  ): Observable<void> {
    const url = `${this.baseUrl}/api/StockInventory/restaurant/${restaurantId}/inventory/${stockInventoryId}/consumptions/${consumptionId}/reconcile`;
    return this.http.post<void>(url, {
      AssignedItemId: assignedItemId,
      DeductStock: deductStock,
    });
  }

  reconcileConsumptionAdvanced(
    restaurantId: string,
    stockInventoryId: string,
    consumptionId: string,
    deductions: any[]
  ): Observable<void> {
    const url = `${this.baseUrl}/api/StockInventory/restaurant/${restaurantId}/inventory/${stockInventoryId}/consumptions/${consumptionId}/reconcile-advanced`;
    return this.http.post<void>(url, { Deductions: deductions });
  }

  removeMultipleTrackedConsumptions(
    restaurantId: string,
    stockInventoryId: string,
    consumptionIds: string[]
  ): Observable<void> {
    const url = `${this.baseUrl}/api/StockInventory/restaurant/${restaurantId}/inventory/${stockInventoryId}/consumptions/bulk-remove`;
    return this.http.post<void>(url, { ConsumptionIds: consumptionIds });
  }

  resolveDirectlyResolvableConsumptions(
    restaurantId: string,
    stockInventoryId: string,
    consumptionIds: string[]
  ): Observable<void> {
    const url = `${this.baseUrl}/api/StockInventory/restaurant/${restaurantId}/inventory/${stockInventoryId}/consumptions/resolve-direct`;
    return this.http.post<void>(url, { ConsumptionIds: consumptionIds });
  }
}
