import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  inject,
  signal,
  computed,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MainLayoutComponent } from '../../../shared/components/main-layout/main-layout.component';
import { LocPipe } from '../../../core/pipes/loc.pipe';
import { LocalizationService } from '../../../core/services/localization.service';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { StockInventoryService } from '../../../core/services/stock-inventory.service';
import { RestaurantItem } from '../../../core/models/restaurant.models';
import {
  StockInventory,
  StockInventoryItem,
  ProductBarcode,
  ProductResponse,
  StockEquivalenceClass,
  TrackedConsumption,
  InboundReference2,
  InventoryProductRow,
  EquivalenceClassAvailabilityItem,
  ProductAvailabilityItem,
} from '../../../core/models/stock-inventory.models';

export type InventoryFormMode = 'StockLoad' | 'NewProduct';
export type StockLoadSearchMode = 'Barcode' | 'Name';
export type AvailViewGrouping = 'EquivalenceClasses' | 'Products';
export type AvailDiagramType = 'HorizontalBar' | 'Donut' | 'Cards';
export type AvailStatusFilter = 'All' | 'InStock' | 'LowOrOutOfStock';

export interface ReconcileDeductionRow {
  itemId: string;
  amount: number;
  unitOfMeasure: string;
}

@Component({
  selector: 'app-inventory-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MainLayoutComponent, LocPipe],
  templateUrl: './inventory-settings.component.html',
  styleUrls: ['./inventory-settings.component.css'],
})
export class InventorySettingsComponent implements OnInit, OnDestroy, AfterViewInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly loc = inject(LocalizationService);
  private readonly restaurantService = inject(RestaurantService);
  private readonly stockInventoryService = inject(StockInventoryService);

  @ViewChild('chartCanvas') chartCanvasRef?: ElementRef<HTMLCanvasElement>;

  // Route & Core State
  readonly restaurantId = signal<string>('');
  readonly restaurant = signal<RestaurantItem | null>(null);
  readonly stockInventory = signal<StockInventory | null>(null);

  readonly isLoading = signal<boolean>(true);
  readonly isInitializing = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly warningMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  // Form Mode & Collapse
  readonly activeFormMode = signal<InventoryFormMode>('StockLoad');
  readonly isAddCardCollapsed = signal<boolean>(false);

  // --- Quick Stock Load Mode ---
  readonly stockLoadSearchMode = signal<StockLoadSearchMode>('Barcode');
  stockLoadBarcodeInput = '';
  stockLoadNameInput = '';
  stockLoadMatchedProduct: StockInventoryItem | null = null;
  stockLoadCurrentStock = 0.0;
  stockLoadQuantity = 1.0;
  stockLoadVarWeight = 1.0;
  isStockLoadSearching = false;
  isStockLoading = false;
  stockLoadWarning: string | null = null;
  stockLoadSuccess: string | null = null;
  stockLoadError: string | null = null;
  stockLoadLocalCandidates: StockInventoryItem[] = [];
  selectedStockLoadCandidateId = '';

  // Inbound Reference fields for Quick Stock Load
  stockLoadUseInboundReference = false;
  stockLoadInboundSupplier = '';
  stockLoadInboundDocNumber = '';
  stockLoadInboundDocDate = new Date().toISOString().substring(0, 10);

  // --- New Product Registration Mode ---
  barcodeInput = '';
  productNameInput = '';
  brandInput = '';
  selectedUnitInput = 'Units';
  packageQuantityInput = 1;
  barcodeQuantityAmountInput = 1.0;
  initialQuantityInput = 1.0;
  categoryTagsInput = '';
  selectedTrackingModeType = 'FixedPackage';
  fixedPackageType = 'Bottle';
  fixedNominalAmount = 75.0;
  fixedNominalUnit = 'cl';
  initialFixedPackages = 1;
  variablePackageLabel = 'Wheel';
  variableWeightUnit = 'kg';
  initialVariablePackages = 1;
  initialVariableWeight = 1.0;
  newProductEquivalenceClassId = '';
  isSaving = false;
  isSearchingBarcode = false;
  isSearchingByName = false;
  candidateProducts: ProductResponse[] = [];
  selectedCandidateCode = '';

  // --- Products Grid State ---
  readonly productRows = signal<InventoryProductRow[]>([]);
  productFilterText = '';
  productCategoryFilter = '';
  productSortColumn = 'name';
  productSortAsc = true;
  gridCurrentPage = 1;
  gridPageSize = 25;

  // --- Availability & Overview Visual Health State ---
  readonly isAvailOverviewCollapsed = signal<boolean>(false);
  readonly availViewGrouping = signal<AvailViewGrouping>('EquivalenceClasses');
  readonly availDiagramType = signal<AvailDiagramType>('HorizontalBar');
  readonly availStatusFilter = signal<AvailStatusFilter>('All');
  availSearchTerm = '';
  excludedEquivalenceClassIds = new Set<string>();
  excludedItemIds = new Set<string>();

  // --- Modals State ---
  // 1. Anomalies Modal
  showAnomaliesModal = false;

  // 2. Consumptions Modal
  showConsumptionsModal = false;
  consumptionSearchTerm = '';
  selectedConsumptionIds = new Set<string>();
  isBulkResolving = false;
  isBulkDropping = false;

  // 2b. Reconcile Single Consumption Modal
  consumptionToReconcile: TrackedConsumption | null = null;
  reconcileDeductionRows: ReconcileDeductionRow[] = [];
  reconcileErrorMessage: string | null = null;
  isReconciling = false;

  // 3. Equivalence Classes Management Modal
  showEquivalenceClassesModal = false;
  newEquivalenceClassName = '';
  newEquivalenceClassDimension = 'Volume';
  isCreatingEquivalenceClass = false;
  eqClassModalError: string | null = null;
  eqClassModalSuccess: string | null = null;
  renamingClassId: string | null = null;
  renamingClassName = '';
  isRenamingClass = false;
  isOperatingOnClass = false;
  selectedAddItemPerClass: Record<string, string> = {};
  selectedMoveTargetPerItem: Record<string, string> = {};

  // 4. Restock Modal (from Grid)
  restockModalItem: InventoryProductRow | null = null;
  restockAddQuantity = 1.0;
  restockVarWeight = 1.0;
  restockUseInboundReference = false;
  restockInboundSupplier = '';
  restockInboundDocNumber = '';
  restockInboundDocDate = new Date().toISOString().substring(0, 10);
  isRestocking = false;
  restockModalError: string | null = null;

  // 5. Open Container Level Adjustment Modal
  adjustLevelModalItem: InventoryProductRow | null = null;
  adjustMeasuredAmount = 0.0;
  isAdjustingLevel = false;
  adjustLevelError: string | null = null;

  // 6. Edit Product Modal
  editingProductItem: InventoryProductRow | null = null;
  editProductName = '';
  editProductBrand = '';
  editCategoryTags = '';
  editTrackingModeType = 'FixedPackage';
  editFixedPackageType = 'Bottle';
  editFixedNominalAmount = 75.0;
  editFixedNominalUnit = 'cl';
  editVariablePackageLabel = 'Wheel';
  editVariableWeightUnit = 'kg';
  editNewBarcode = '';
  editNewBarcodePackageQty = 1;
  editSelectedEquivalenceClassId = '';
  isEditingSaving = false;
  isDeletingItem = false;
  editModalError: string | null = null;

  // 7. Availability Filter Modal
  showAvailabilityFilterModal = false;
  filterModalActiveTab: 'classes' | 'products' = 'classes';

  // Math helper for template
  readonly Math = Math;

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      const restId = params['restaurantId'] || params['id'];
      if (restId) {
        this.restaurantId.set(restId);
        this.loadRestaurantData(restId);
      } else {
        // Fallback: check if user has restaurants
        this.restaurantService.getMyRestaurants().subscribe({
          next: (list) => {
            if (list && list.length > 0) {
              const firstId = list[0].restaurantId;
              this.restaurantId.set(firstId);
              this.loadRestaurantData(firstId);
            } else {
              this.isLoading.set(false);
              this.errorMessage.set('No restaurant found.');
            }
          },
          error: (err) => {
            this.isLoading.set(false);
            this.errorMessage.set(err?.message || 'Failed to load restaurant.');
          },
        });
      }
    });

    this.loadAvailabilityPreferences();
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.renderAvailabilityChart();
    }, 200);
  }

  ngOnDestroy(): void {
    // cleanup
  }

  // --- Data Loading ---
  loadRestaurantData(restId: string): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.restaurantService.getRestaurant(restId).subscribe({
      next: (rest) => {
        this.restaurant.set(rest);
        const invSettings = rest.stockInventorySettings;
        if (!invSettings?.isUnavailable) {
          this.reloadInventoryData(restId);
        } else {
          this.isLoading.set(false);
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err?.error?.message || err?.message || 'Failed to load restaurant details.');
      },
    });
  }

  reloadInventoryData(restId: string): void {
    this.stockInventoryService.getStockInventoryByRestaurant(restId).subscribe({
      next: (inv) => {
        this.stockInventory.set(inv);
        this.populateProductRows(inv);
        this.isLoading.set(false);
        setTimeout(() => this.renderAvailabilityChart(), 100);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err?.error || err?.message || 'Failed to load stock inventory data.');
      },
    });
  }

  initializeInventory(): void {
    const id = this.restaurantId();
    if (!id) return;
    this.isInitializing.set(true);
    this.errorMessage.set(null);

    this.restaurantService.initializeStockInventorySettings(id).subscribe({
      next: () => {
        this.isInitializing.set(false);
        this.successMessage.set(this.loc.translate('RestsAdmin_InventoryInitSuccess'));
        this.loadRestaurantData(id);
      },
      error: (err) => {
        this.isInitializing.set(false);
        const msg = err?.error?.message || err?.message || 'Error';
        this.errorMessage.set(this.loc.translate('RestsAdmin_InventoryInitFailed', msg));
      },
    });
  }

  // --- Populate Product Rows ---
  private populateProductRows(inv: StockInventory): void {
    if (!inv) {
      this.productRows.set([]);
      return;
    }

    const itemsMap = inv.stockInventoryItems || inv.StockInventoryItems || {};
    const quantitiesMap = inv.quantities || inv.Quantities || {};

    const itemsList: StockInventoryItem[] = Array.isArray(itemsMap)
      ? itemsMap.map((pair: any) => pair[1])
      : Object.values(itemsMap);

    const rows: InventoryProductRow[] = [];

    for (const item of itemsList) {
      if (item.deleted || item.Deleted) continue;

      const rawId = item.stockInventoryItemId || item.StockInventoryItemId;
      const itemId = typeof rawId === 'string' ? rawId : (rawId?.value || rawId?.Value || '');

      const rawName = item.name || item.Name;
      const name = typeof rawName === 'string' ? rawName : (rawName?.value || rawName?.Value || 'Unnamed');

      const rawBrand = item.brands || item.Brands;
      const brand = typeof rawBrand === 'string' ? rawBrand : (rawBrand?.value || rawBrand?.Value || null);

      const rawCluster = item.cluster || item.Cluster;
      const cluster = typeof rawCluster === 'string' ? rawCluster : (rawCluster?.value || rawCluster?.Value || null);

      const categoriesTags = item.categoriesTags || item.CategoriesTags || [];
      const barcodes = item.productBarCodes || item.ProductBarCodes || [];

      // Tracking mode extraction
      const mode = item.trackingMode || item.TrackingMode;
      const modeCase = mode?.case || mode?.Case || (typeof mode === 'string' ? mode : 'Discrete');
      const isFixed = modeCase === 'FixedPackage';
      const isVar = modeCase === 'VariableWeight';

      let pkgName = 'unit';
      let nominal: any = null;
      if (isFixed) {
        pkgName = this.extractPackageTypeName(mode?.fields?.[0] || mode?.Fields?.[0]);
        nominal = mode?.fields?.[1] || mode?.Fields?.[1];
      } else if (isVar) {
        pkgName = this.extractPackageTypeName(mode?.fields?.[0] || mode?.Fields?.[0]);
        nominal = mode?.fields?.[1] || mode?.Fields?.[1];
      }

      // Quantity & StockLevel extraction
      let sl: any = null;
      if (Array.isArray(quantitiesMap)) {
        const found = quantitiesMap.find((q: any) => {
          const k = q[0]?.value || q[0]?.Value || q[0];
          return k === itemId;
        });
        if (found) sl = found[1];
      } else if (quantitiesMap && typeof quantitiesMap === 'object') {
        sl = (quantitiesMap as any)[itemId];
      }

      let currentQty = 0;
      let sealedPkgs = 0;
      let openStatus: string | null = null;
      let varStatus: string | null = null;
      let openMeasure: any = null;

      if (sl) {
        const slCase = sl.case || sl.Case;
        if (slCase === 'FixedPackageStock') {
          sealedPkgs = Number(sl.fields?.[0] || sl.Fields?.[0] || 0);
          currentQty = sealedPkgs;
          const openObj = sl.fields?.[1] || sl.Fields?.[1];
          if (openObj) {
            openMeasure = openObj;
            openStatus = this.formatMeasure(openObj);
          }
        } else if (slCase === 'VariableWeightStock') {
          sealedPkgs = Number(sl.fields?.[0] || sl.Fields?.[0] || 0);
          const totContent = sl.fields?.[1] || sl.Fields?.[1];
          varStatus = this.formatMeasure(totContent);
          currentQty = this.getMeasureNumericValue(totContent);
        } else if (slCase === 'DiscreteStock') {
          currentQty = Number(sl.fields?.[0] || sl.Fields?.[0] || 0);
        }
      }

      const uomDisplay = isVar
        ? this.getMeasureUnitString(nominal)
        : isFixed
        ? pkgName
        : 'units';

      const formattedQty = isFixed
        ? `${sealedPkgs} ${pkgName}${sealedPkgs !== 1 ? 's' : ''}`
        : isVar
        ? `${sealedPkgs} ${pkgName} (${varStatus || '0'})`
        : `${currentQty} ${uomDisplay}`;

      rows.push({
        itemId,
        name,
        brand,
        trackingMode: mode,
        stockLevel: sl,
        isFixedPackage: isFixed,
        isVariableWeight: isVar,
        sealedPackages: sealedPkgs,
        packageUnitName: pkgName,
        openContainerStatus: openStatus,
        variableWeightStatus: varStatus,
        openContainerMeasure: openMeasure,
        nominalContent: nominal,
        unitOfMeasure: uomDisplay,
        unitOfMeasureDisplay: uomDisplay,
        categoriesTags,
        barcodes,
        cluster,
        currentQuantity: currentQty,
        formattedQuantity: formattedQty,
      });
    }

    this.productRows.set(rows);
  }

  // --- Filtering & Sorting Computed Products ---
  readonly filteredProducts = computed(() => {
    let list = this.productRows();

    if (this.excludedItemIds.size > 0) {
      list = list.filter((p) => !this.excludedItemIds.has(p.itemId));
    }

    if (this.productCategoryFilter) {
      list = list.filter((p) =>
        p.categoriesTags.some((t) => t.toLowerCase() === this.productCategoryFilter.toLowerCase())
      );
    }

    if (this.productFilterText) {
      const term = this.productFilterText.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          (p.brand && p.brand.toLowerCase().includes(term)) ||
          (p.cluster && p.cluster.toLowerCase().includes(term)) ||
          p.barcodes.some((b) => {
            const rawBc = b.barCodeType || b.BarCodeType;
            const bcVal = typeof rawBc === 'string' ? rawBc : (rawBc?.value || rawBc?.Value || '');
            return bcVal.toLowerCase().includes(term);
          })
      );
    }

    // Sort
    const col = this.productSortColumn;
    const asc = this.productSortAsc;
    list = [...list].sort((a, b) => {
      let valA: any = (a as any)[col];
      let valB: any = (b as any)[col];
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
      if (valA < valB) return asc ? -1 : 1;
      if (valA > valB) return asc ? 1 : -1;
      return 0;
    });

    return list;
  });

  readonly paginatedProducts = computed(() => {
    const list = this.filteredProducts();
    const start = (this.gridCurrentPage - 1) * this.gridPageSize;
    return list.slice(start, start + this.gridPageSize);
  });

  readonly totalGridPages = computed(() => {
    return Math.max(1, Math.ceil(this.filteredProducts().length / this.gridPageSize));
  });

  // Unique categories for filter dropdown
  readonly availableCategories = computed(() => {
    const set = new Set<string>();
    this.productRows().forEach((p) => p.categoriesTags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  });

  // --- Availability Breakdown Computed Items ---
  readonly computedEquivalenceClasses = computed<EquivalenceClassAvailabilityItem[]>(() => {
    const inv = this.stockInventory();
    if (!inv) return [];

    const eqMap = inv.equivalenceClasses || inv.EquivalenceClasses || {};
    const eqList: StockEquivalenceClass[] = Array.isArray(eqMap)
      ? eqMap.map((p: any) => p[1])
      : Object.values(eqMap);

    const result: EquivalenceClassAvailabilityItem[] = [];
    const assignedItemIds = new Set<string>();

    for (const eq of eqList) {
      const rawClassId = eq.id || eq.Id;
      const classIdStr = typeof rawClassId === 'string' ? rawClassId : (rawClassId?.value || rawClassId?.Value || '');
      if (this.excludedEquivalenceClassIds.has(classIdStr)) continue;

      const rawClassName = eq.name || eq.Name;
      const className = typeof rawClassName === 'string' ? rawClassName : (rawClassName?.value || rawClassName?.Value || 'Class');

      const rawItems = eq.itemIds || eq.ItemIds || [];
      const itemIds = rawItems.map((i: any) => typeof i === 'string' ? i : (i?.value || i?.Value || ''));
      itemIds.forEach((id: string) => assignedItemIds.add(id));

      const memberList: ProductAvailabilityItem[] = [];
      let totalStock = 0.0;
      let inStock = 0;
      let outOfStock = 0;

      for (const itemId of itemIds) {
        if (this.excludedItemIds.has(itemId)) continue;
        const row = this.productRows().find((r) => r.itemId === itemId);
        if (!row) continue;

        const q = row.currentQuantity;
        if (q > 0) inStock++; else outOfStock++;
        totalStock += q;

        memberList.push({
          itemId: row.itemId,
          itemIdString: row.itemId,
          name: row.name,
          brand: row.brand,
          equivalenceClassName: className,
          equivalenceClassIdString: classIdStr,
          numericStock: q,
          formattedStock: row.formattedQuantity,
          unitOfMeasureDisplay: row.unitOfMeasureDisplay,
          isFixedPackage: row.isFixedPackage,
          isVariableWeight: row.isVariableWeight,
          sealedPackages: row.sealedPackages,
          sourceRow: row,
          statusBadgeClass: q <= 0 ? 'bg-danger' : (q <= 3.0 ? 'bg-warning text-dark' : 'bg-success'),
          statusText: q <= 0 ? 'Out of Stock' : (q <= 3.0 ? 'Low Stock' : 'In Stock'),
        });
      }

      // Filter by search term & status
      let include = true;
      if (this.availSearchTerm) {
        const term = this.availSearchTerm.trim().toLowerCase();
        include = className.toLowerCase().includes(term) || memberList.some((m) => m.name.toLowerCase().includes(term));
      }
      if (this.availStatusFilter() === 'InStock' && totalStock <= 0) include = false;
      if (this.availStatusFilter() === 'LowOrOutOfStock' && totalStock > 3.0) include = false;

      if (include) {
        result.push({
          classId: classIdStr,
          classIdString: classIdStr,
          name: className,
          dimensionDisplay: typeof eq.dimension === 'string' ? eq.dimension : 'Mixed',
          totalNumericStock: totalStock,
          totalFormattedStock: `${totalStock.toFixed(2)} total units`,
          totalItemsCount: memberList.length,
          inStockItemsCount: inStock,
          outOfStockItemsCount: outOfStock,
          isUnassigned: false,
          memberItems: memberList,
          isExpanded: false,
          statusBadgeClass: totalStock <= 0 ? 'bg-danger' : (totalStock <= 3.0 ? 'bg-warning text-dark' : 'bg-success'),
          statusText: totalStock <= 0 ? 'Out of Stock' : (totalStock <= 3.0 ? 'Low Stock' : 'In Stock'),
        });
      }
    }

    // Unassigned products bucket
    const unassignedRows = this.productRows().filter(
      (r) => !assignedItemIds.has(r.itemId) && !this.excludedItemIds.has(r.itemId)
    );

    if (unassignedRows.length > 0) {
      let totalStock = 0.0;
      let inStock = 0;
      let outOfStock = 0;
      const unassignedMembers: ProductAvailabilityItem[] = [];

      for (const row of unassignedRows) {
        const q = row.currentQuantity;
        if (q > 0) inStock++; else outOfStock++;
        totalStock += q;

        unassignedMembers.push({
          itemId: row.itemId,
          itemIdString: row.itemId,
          name: row.name,
          brand: row.brand,
          equivalenceClassName: 'Unassigned',
          equivalenceClassIdString: null,
          numericStock: q,
          formattedStock: row.formattedQuantity,
          unitOfMeasureDisplay: row.unitOfMeasureDisplay,
          isFixedPackage: row.isFixedPackage,
          isVariableWeight: row.isVariableWeight,
          sealedPackages: row.sealedPackages,
          sourceRow: row,
          statusBadgeClass: q <= 0 ? 'bg-danger' : (q <= 3.0 ? 'bg-warning text-dark' : 'bg-success'),
          statusText: q <= 0 ? 'Out of Stock' : (q <= 3.0 ? 'Low Stock' : 'In Stock'),
        });
      }

      let includeUnassigned = true;
      if (this.availSearchTerm) {
        const term = this.availSearchTerm.trim().toLowerCase();
        includeUnassigned = unassignedMembers.some((m) => m.name.toLowerCase().includes(term));
      }
      if (this.availStatusFilter() === 'InStock' && totalStock <= 0) includeUnassigned = false;
      if (this.availStatusFilter() === 'LowOrOutOfStock' && totalStock > 3.0) includeUnassigned = false;

      if (includeUnassigned) {
        result.push({
          classId: null,
          classIdString: 'unassigned',
          name: 'Unassigned Products',
          dimensionDisplay: 'Mixed',
          totalNumericStock: totalStock,
          totalFormattedStock: `${totalStock.toFixed(2)} total units`,
          totalItemsCount: unassignedMembers.length,
          inStockItemsCount: inStock,
          outOfStockItemsCount: outOfStock,
          isUnassigned: true,
          memberItems: unassignedMembers,
          isExpanded: false,
          statusBadgeClass: totalStock <= 0 ? 'bg-danger' : (totalStock <= 3.0 ? 'bg-warning text-dark' : 'bg-success'),
          statusText: totalStock <= 0 ? 'Out of Stock' : (totalStock <= 3.0 ? 'Low Stock' : 'In Stock'),
        });
      }
    }

    return result;
  });

  readonly computedProducts = computed<ProductAvailabilityItem[]>(() => {
    const list: ProductAvailabilityItem[] = [];
    for (const row of this.productRows()) {
      if (this.excludedItemIds.has(row.itemId)) continue;

      if (this.availSearchTerm) {
        const term = this.availSearchTerm.trim().toLowerCase();
        const matches =
          row.name.toLowerCase().includes(term) ||
          (row.brand && row.brand.toLowerCase().includes(term)) ||
          (row.cluster && row.cluster.toLowerCase().includes(term));
        if (!matches) continue;
      }

      const q = row.currentQuantity;
      if (this.availStatusFilter() === 'InStock' && q <= 0) continue;
      if (this.availStatusFilter() === 'LowOrOutOfStock' && q > 3.0) continue;

      list.push({
        itemId: row.itemId,
        itemIdString: row.itemId,
        name: row.name,
        brand: row.brand,
        equivalenceClassName: row.cluster || 'None',
        equivalenceClassIdString: null,
        numericStock: q,
        formattedStock: row.formattedQuantity,
        unitOfMeasureDisplay: row.unitOfMeasureDisplay,
        isFixedPackage: row.isFixedPackage,
        isVariableWeight: row.isVariableWeight,
        sealedPackages: row.sealedPackages,
        sourceRow: row,
        statusBadgeClass: q <= 0 ? 'bg-danger' : (q <= 3.0 ? 'bg-warning text-dark' : 'bg-success'),
        statusText: q <= 0 ? 'Out of Stock' : (q <= 3.0 ? 'Low Stock' : 'In Stock'),
      });
    }
    return list;
  });

  readonly inStockCount = computed(() => this.productRows().filter((r) => r.currentQuantity > 0).length);
  readonly lowStockCount = computed(() => this.productRows().filter((r) => r.currentQuantity > 0 && r.currentQuantity <= 3.0).length);
  readonly outOfStockCount = computed(() => this.productRows().filter((r) => r.currentQuantity <= 0).length);

  // --- Quick Stock Load Methods ---
  setFormMode(mode: InventoryFormMode): void {
    this.activeFormMode.set(mode);
  }

  setStockLoadSearchMode(mode: StockLoadSearchMode): void {
    this.stockLoadSearchMode.set(mode);
    this.stockLoadMatchedProduct = null;
    this.stockLoadLocalCandidates = [];
    this.selectedStockLoadCandidateId = '';
    this.stockLoadWarning = null;
    this.stockLoadError = null;
  }

  handleStockLoadBarcodeKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      this.onStockLoadBarcodeSearch();
    }
  }

  onStockLoadBarcodeSearch(): void {
    const rawCode = this.stockLoadBarcodeInput.trim();
    if (!rawCode) return;

    this.stockLoadWarning = null;
    this.stockLoadSuccess = null;
    this.stockLoadError = null;
    this.isStockLoadSearching = true;

    // Check existing inventory items for barcode
    const found = this.productRows().find((r) =>
      r.barcodes.some((b) => {
        const bVal = typeof b.barCodeType === 'string' ? b.barCodeType : (b.barCodeType?.value || b.barCodeType?.Value || '');
        return bVal.toLowerCase() === rawCode.toLowerCase();
      })
    );

    if (found) {
      const invItem = this.findStockInventoryItemById(found.itemId);
      if (invItem) {
        this.applyMatchedProductForStockLoad(invItem, rawCode);
        this.stockLoadSuccess = `Matched existing product: ${found.name}`;
      }
      this.isStockLoadSearching = false;
      return;
    }

    // Lookup externally via API
    this.stockInventoryService.getProductInfoByBarcode(this.restaurantId(), rawCode).subscribe({
      next: (productInfo) => {
        this.isStockLoadSearching = false;
        if (productInfo && productInfo.product_name) {
          // Switch to new product form with auto-filled details
          this.activeFormMode.set('NewProduct');
          this.barcodeInput = rawCode;
          this.productNameInput = productInfo.product_name;
          this.brandInput = productInfo.brands || '';
          this.categoryTagsInput = (productInfo.categories_tags || []).join(', ');
          this.stockLoadWarning = `Product not in inventory yet. Switched to register "${productInfo.product_name}".`;
        } else {
          this.stockLoadError = `Barcode "${rawCode}" not found in inventory. You can switch to Register Product to add it.`;
        }
      },
      error: () => {
        this.isStockLoadSearching = false;
        this.stockLoadError = `Barcode "${rawCode}" not found.`;
      },
    });
  }

  onStockLoadNameSearch(): void {
    const term = this.stockLoadNameInput.trim().toLowerCase();
    if (!term) return;

    this.stockLoadLocalCandidates = [];
    const matches = this.productRows().filter((r) => r.name.toLowerCase().includes(term));
    if (matches.length === 1) {
      const invItem = this.findStockInventoryItemById(matches[0].itemId);
      if (invItem) {
        this.applyMatchedProductForStockLoad(invItem);
        this.stockLoadSuccess = `Matched: ${matches[0].name}`;
      }
    } else if (matches.length > 1) {
      this.stockLoadLocalCandidates = matches.map((m) => this.findStockInventoryItemById(m.itemId)!).filter(Boolean);
    } else {
      this.stockLoadWarning = `No local products found for "${this.stockLoadNameInput}".`;
    }
  }

  onStockLoadCandidateSelected(itemId: string): void {
    const invItem = this.findStockInventoryItemById(itemId);
    if (invItem) {
      this.applyMatchedProductForStockLoad(invItem);
      this.stockLoadSuccess = `Selected: ${this.getItemName(invItem)}`;
    }
  }

  private applyMatchedProductForStockLoad(item: StockInventoryItem, matchingBarcodeString?: string): void {
    this.stockLoadMatchedProduct = item;
    const itemId = this.getItemId(item);
    const row = this.productRows().find((r) => r.itemId === itemId);
    this.stockLoadCurrentStock = row ? row.currentQuantity : 0;
    this.stockLoadQuantity = 1.0;
    this.stockLoadVarWeight = 1.0;
  }

  confirmStockLoad(): void {
    if (!this.stockLoadMatchedProduct || this.stockLoadQuantity <= 0) return;

    const restId = this.restaurantId();
    const inv = this.stockInventory();
    const rawInvId = inv?.stockInventoryId || inv?.StockInventoryId;
    const invId = typeof rawInvId === 'string' ? rawInvId : (rawInvId?.value || rawInvId?.Value || '');
    const itemId = this.getItemId(this.stockLoadMatchedProduct);
    const prodName = this.getItemName(this.stockLoadMatchedProduct);

    if (!invId || !itemId) {
      this.stockLoadError = 'Inventory not initialized.';
      return;
    }

    this.isStockLoading = true;
    this.stockLoadError = null;
    this.stockLoadSuccess = null;

    const qtyToAdd = {
      case: 'Quantity',
      fields: [this.stockLoadQuantity, 'Units'],
    };

    let action$: any;
    if (this.stockLoadUseInboundReference) {
      const inboundRef: InboundReference2 = {
        supplierIdOrVat: this.stockLoadInboundSupplier.trim(),
        documentNumber: this.stockLoadInboundDocNumber.trim(),
        documentDate: this.stockLoadInboundDocDate,
        docScan: [],
      };
      action$ = this.stockInventoryService.addQuantityWithInboundReference(
        restId,
        invId,
        itemId,
        qtyToAdd,
        inboundRef
      );
    } else {
      action$ = this.stockInventoryService.addQuantity(restId, invId, itemId, qtyToAdd);
    }

    action$.subscribe({
      next: () => {
        this.isStockLoading = false;
        this.stockLoadSuccess = `Successfully loaded stock for "${prodName}".`;
        this.resetStockLoad(true);
        this.reloadInventoryData(restId);
      },
      error: (err: any) => {
        this.isStockLoading = false;
        this.stockLoadError = err?.error || err?.message || 'Failed to load stock.';
      },
    });
  }

  resetStockLoad(keepSuccess = false): void {
    this.stockLoadBarcodeInput = '';
    this.stockLoadNameInput = '';
    this.stockLoadMatchedProduct = null;
    this.stockLoadCurrentStock = 0;
    this.stockLoadQuantity = 1;
    this.stockLoadVarWeight = 1;
    this.stockLoadLocalCandidates = [];
    this.selectedStockLoadCandidateId = '';
    this.stockLoadWarning = null;
    this.stockLoadError = null;
    if (!keepSuccess) {
      this.stockLoadSuccess = null;
    }
  }

  // --- New Product Registration Methods ---
  searchProductByNameCandidates(): void {
    const term = this.productNameInput.trim();
    if (!term) return;

    this.isSearchingByName = true;
    this.candidateProducts = [];
    this.selectedCandidateCode = '';

    this.stockInventoryService.searchProductsByName(this.restaurantId(), term, 10).subscribe({
      next: (candidates) => {
        this.isSearchingByName = false;
        this.candidateProducts = candidates || [];
      },
      error: () => {
        this.isSearchingByName = false;
      },
    });
  }

  applySelectedCandidate(code: string): void {
    const candidate = this.candidateProducts.find((c) => c.code === code);
    if (!candidate) return;

    if (candidate.code) this.barcodeInput = candidate.code;
    if (candidate.product_name) this.productNameInput = candidate.product_name;
    if (candidate.brands) this.brandInput = candidate.brands;
    if (candidate.categories_tags) this.categoryTagsInput = candidate.categories_tags.join(', ');
    this.candidateProducts = [];
  }

  registerNewProduct(): void {
    const cleanName = this.productNameInput.trim();
    if (!cleanName) {
      this.errorMessage.set('Product name is required.');
      return;
    }

    const restId = this.restaurantId();
    const inv = this.stockInventory();
    const rawInvId = inv?.stockInventoryId || inv?.StockInventoryId;
    const invId = typeof rawInvId === 'string' ? rawInvId : (rawInvId?.value || rawInvId?.Value || '');

    if (!invId) {
      this.errorMessage.set('Inventory not initialized.');
      return;
    }

    this.isSaving = true;
    this.errorMessage.set(null);
    this.successMessage.set(null);

    // Build ItemTrackingMode & Initial StockLevel
    let trackingMode: any;
    let initialStockLevel: any;

    if (this.selectedTrackingModeType === 'FixedPackage') {
      const volUnits = ['ml', 'cl', 'lt', 'dl', 'floz'];
      const isVol = volUnits.includes(this.fixedNominalUnit.toLowerCase());
      const measure = isVol
        ? { case: 'Volume', fields: [this.fixedNominalAmount, this.capitalize(this.fixedNominalUnit)] }
        : { case: 'Weight', fields: [this.fixedNominalAmount, this.capitalize(this.fixedNominalUnit)] };

      trackingMode = {
        case: 'FixedPackage',
        fields: [this.fixedPackageType, measure],
      };
      initialStockLevel = {
        case: 'FixedPackageStock',
        fields: [this.initialFixedPackages, null],
      };
    } else if (this.selectedTrackingModeType === 'VariableWeight') {
      trackingMode = {
        case: 'VariableWeight',
        fields: [
          { Other: this.variablePackageLabel },
          { case: 'Weight', fields: [1.0, this.capitalize(this.variableWeightUnit)] },
        ],
      };
      initialStockLevel = {
        case: 'VariableWeightStock',
        fields: [
          this.initialVariablePackages,
          { case: 'Weight', fields: [this.initialVariableWeight, this.capitalize(this.variableWeightUnit)] },
        ],
      };
    } else {
      trackingMode = {
        case: 'Discrete',
        fields: [this.selectedUnitInput.toLowerCase()],
      };
      initialStockLevel = {
        case: 'DiscreteStock',
        fields: [Math.floor(this.initialQuantityInput)],
      };
    }

    // Build Barcodes
    const barcodesList: ProductBarcode[] = [];
    if (this.barcodeInput.trim()) {
      barcodesList.push({
        barCodeType: { value: this.barcodeInput.trim() },
        packageQuantity: this.packageQuantityInput,
        totalStockQuantity: {
          case: 'Quantity',
          fields: [this.barcodeQuantityAmountInput, 'Units'],
        },
      });
    }

    // Categories
    const categories = this.categoryTagsInput
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const newItem: StockInventoryItem = {
      name: { value: cleanName },
      brands: this.brandInput.trim() ? { value: this.brandInput.trim() } : null,
      trackingMode,
      categoriesTags: categories,
      productBarCodes: barcodesList,
      cluster: null,
      deleted: false,
    };

    this.stockInventoryService.addWithInitialStockLevel(restId, invId, newItem, initialStockLevel).subscribe({
      next: () => {
        this.isSaving = false;
        this.successMessage.set(`Successfully registered product "${cleanName}".`);
        this.clearNewProductForm();
        this.reloadInventoryData(restId);
      },
      error: (err) => {
        this.isSaving = false;
        this.errorMessage.set(err?.error || err?.message || 'Failed to register product.');
      },
    });
  }

  clearNewProductForm(): void {
    this.barcodeInput = '';
    this.productNameInput = '';
    this.brandInput = '';
    this.categoryTagsInput = '';
    this.candidateProducts = [];
    this.initialQuantityInput = 1;
    this.initialFixedPackages = 1;
    this.initialVariablePackages = 1;
  }

  // --- Modals Handlers ---
  openAnomaliesModal(): void {
    this.showAnomaliesModal = true;
  }

  closeAnomaliesModal(): void {
    this.showAnomaliesModal = false;
  }

  openConsumptionsModal(): void {
    this.showConsumptionsModal = true;
    this.selectedConsumptionIds.clear();
  }

  closeConsumptionsModal(): void {
    this.showConsumptionsModal = false;
  }

  openEquivalenceClassesModal(): void {
    this.showEquivalenceClassesModal = true;
    this.eqClassModalError = null;
    this.eqClassModalSuccess = null;
  }

  closeEquivalenceClassesModal(): void {
    this.showEquivalenceClassesModal = false;
  }

  openRestockModal(item: InventoryProductRow): void {
    this.restockModalItem = item;
    this.restockAddQuantity = 1.0;
    this.restockVarWeight = 1.0;
    this.restockModalError = null;
  }

  closeRestockModal(): void {
    this.restockModalItem = null;
  }

  confirmRestock(): void {
    if (!this.restockModalItem || this.restockAddQuantity <= 0) return;

    const restId = this.restaurantId();
    const inv = this.stockInventory();
    const rawInvId = inv?.stockInventoryId || inv?.StockInventoryId;
    const invId = typeof rawInvId === 'string' ? rawInvId : (rawInvId?.value || rawInvId?.Value || '');
    const itemId = this.restockModalItem.itemId;

    this.isRestocking = true;
    this.restockModalError = null;

    const qtyToAdd = {
      case: 'Quantity',
      fields: [this.restockAddQuantity, 'Units'],
    };

    let action$: any;
    if (this.restockUseInboundReference) {
      const inboundRef: InboundReference2 = {
        supplierIdOrVat: this.restockInboundSupplier.trim(),
        documentNumber: this.restockInboundDocNumber.trim(),
        documentDate: this.restockInboundDocDate,
        docScan: [],
      };
      action$ = this.stockInventoryService.addQuantityWithInboundReference(
        restId,
        invId,
        itemId,
        qtyToAdd,
        inboundRef
      );
    } else {
      action$ = this.stockInventoryService.addQuantity(restId, invId, itemId, qtyToAdd);
    }

    action$.subscribe({
      next: () => {
        this.isRestocking = false;
        this.closeRestockModal();
        this.successMessage.set(`Successfully restocked "${this.restockModalItem?.name}".`);
        this.reloadInventoryData(restId);
      },
      error: (err: any) => {
        this.isRestocking = false;
        this.restockModalError = err?.error || err?.message || 'Failed to restock item.';
      },
    });
  }

  openAdjustLevelModal(item: InventoryProductRow): void {
    this.adjustLevelModalItem = item;
    this.adjustMeasuredAmount = item.openContainerMeasure
      ? this.getMeasureNumericValue(item.openContainerMeasure)
      : (item.nominalContent ? this.getMeasureNumericValue(item.nominalContent) : 0);
    this.adjustLevelError = null;
  }

  closeAdjustLevelModal(): void {
    this.adjustLevelModalItem = null;
  }

  confirmAdjustLevel(): void {
    if (!this.adjustLevelModalItem) return;

    const restId = this.restaurantId();
    const inv = this.stockInventory();
    const rawInvId = inv?.stockInventoryId || inv?.StockInventoryId;
    const invId = typeof rawInvId === 'string' ? rawInvId : (rawInvId?.value || rawInvId?.Value || '');
    const itemId = this.adjustLevelModalItem.itemId;

    this.isAdjustingLevel = true;
    this.adjustLevelError = null;

    const nominal = this.adjustLevelModalItem.nominalContent;
    const unit = nominal?.fields?.[1] || 'Cl';
    const measureCase = nominal?.case || 'Volume';

    const openContent = {
      case: measureCase,
      fields: [this.adjustMeasuredAmount, unit],
    };

    this.stockInventoryService.adjustOpenContainerContent(restId, invId, itemId, openContent).subscribe({
      next: () => {
        this.isAdjustingLevel = false;
        this.closeAdjustLevelModal();
        this.successMessage.set(`Adjusted level for "${this.adjustLevelModalItem?.name}".`);
        this.reloadInventoryData(restId);
      },
      error: (err) => {
        this.isAdjustingLevel = false;
        this.adjustLevelError = err?.error || err?.message || 'Failed to adjust level.';
      },
    });
  }

  unsealNewPackage(): void {
    if (!this.adjustLevelModalItem) return;

    const restId = this.restaurantId();
    const inv = this.stockInventory();
    const rawInvId = inv?.stockInventoryId || inv?.StockInventoryId;
    const invId = typeof rawInvId === 'string' ? rawInvId : (rawInvId?.value || rawInvId?.Value || '');
    const itemId = this.adjustLevelModalItem.itemId;

    this.isAdjustingLevel = true;
    this.stockInventoryService.unsealPackage(restId, invId, itemId).subscribe({
      next: () => {
        this.isAdjustingLevel = false;
        this.closeAdjustLevelModal();
        this.successMessage.set(`Unsealed new container for "${this.adjustLevelModalItem?.name}".`);
        this.reloadInventoryData(restId);
      },
      error: (err) => {
        this.isAdjustingLevel = false;
        this.adjustLevelError = err?.error || err?.message || 'Failed to unseal package.';
      },
    });
  }

  openEditProductModal(item: InventoryProductRow): void {
    this.editingProductItem = item;
    this.editProductName = item.name;
    this.editProductBrand = item.brand || '';
    this.editCategoryTags = item.categoriesTags.join(', ');
    this.editModalError = null;
  }

  closeEditProductModal(): void {
    this.editingProductItem = null;
  }

  confirmEditProduct(): void {
    if (!this.editingProductItem || !this.editProductName.trim()) return;

    const restId = this.restaurantId();
    const inv = this.stockInventory();
    const rawInvId = inv?.stockInventoryId || inv?.StockInventoryId;
    const invId = typeof rawInvId === 'string' ? rawInvId : (rawInvId?.value || rawInvId?.Value || '');
    const itemId = this.editingProductItem.itemId;

    this.isEditingSaving = true;
    this.editModalError = null;

    this.stockInventoryService
      .updateStockInventoryItemWithMode(
        restId,
        invId,
        itemId,
        this.editProductName.trim(),
        this.editProductBrand.trim() || null,
        this.editingProductItem.trackingMode
      )
      .subscribe({
        next: () => {
          this.isEditingSaving = false;
          this.closeEditProductModal();
          this.successMessage.set(`Updated product "${this.editProductName}".`);
          this.reloadInventoryData(restId);
        },
        error: (err) => {
          this.isEditingSaving = false;
          this.editModalError = err?.error || err?.message || 'Failed to update product.';
        },
      });
  }

  deleteProductItem(): void {
    if (!this.editingProductItem) return;
    if (typeof window !== 'undefined' && !window.confirm(`Are you sure you want to remove "${this.editingProductItem.name}"?`)) {
      return;
    }

    const restId = this.restaurantId();
    const inv = this.stockInventory();
    const rawInvId = inv?.stockInventoryId || inv?.StockInventoryId;
    const invId = typeof rawInvId === 'string' ? rawInvId : (rawInvId?.value || rawInvId?.Value || '');
    const itemId = this.editingProductItem.itemId;
    const prodName = this.editingProductItem.name;

    if (!invId) {
      this.editModalError = 'Active stock inventory ID not found.';
      return;
    }

    this.isDeletingItem = true;
    this.stockInventoryService.removeStockInventoryItem(restId, invId, itemId, prodName).subscribe({
      next: () => {
        this.isDeletingItem = false;
        this.closeEditProductModal();
        this.successMessage.set(`Removed product "${prodName}".`);
        this.reloadInventoryData(restId);
      },
      error: (err) => {
        this.isDeletingItem = false;
        this.editModalError = err?.error || err?.message || 'Failed to delete product.';
      },
    });
  }

  // --- Equivalence Classes Methods ---
  createEquivalenceClass(): void {
    const name = this.newEquivalenceClassName.trim();
    if (!name) return;

    const restId = this.restaurantId();
    const inv = this.stockInventory();
    const rawInvId = inv?.stockInventoryId || inv?.StockInventoryId;
    const invId = typeof rawInvId === 'string' ? rawInvId : (rawInvId?.value || rawInvId?.Value || '');

    this.isCreatingEquivalenceClass = true;
    this.eqClassModalError = null;

    const newClass: StockEquivalenceClass = {
      name: { value: name },
      dimension: this.newEquivalenceClassDimension,
      itemIds: [],
      defaultItemId: null,
    };

    this.stockInventoryService.addEquivalenceClass(restId, invId, newClass).subscribe({
      next: () => {
        this.isCreatingEquivalenceClass = false;
        this.newEquivalenceClassName = '';
        this.eqClassModalSuccess = `Class "${name}" created successfully.`;
        this.reloadInventoryData(restId);
      },
      error: (err) => {
        this.isCreatingEquivalenceClass = false;
        this.eqClassModalError = err?.error || err?.message || 'Failed to create equivalence class.';
      },
    });
  }

  deleteEquivalenceClass(classId: string): void {
    if (typeof window !== 'undefined' && !window.confirm('Delete this equivalence class?')) return;

    const restId = this.restaurantId();
    const inv = this.stockInventory();
    const rawInvId = inv?.stockInventoryId || inv?.StockInventoryId;
    const invId = typeof rawInvId === 'string' ? rawInvId : (rawInvId?.value || rawInvId?.Value || '');

    this.isOperatingOnClass = true;
    this.stockInventoryService.removeEquivalenceClass(restId, invId, classId).subscribe({
      next: () => {
        this.isOperatingOnClass = false;
        this.eqClassModalSuccess = 'Equivalence class deleted.';
        this.reloadInventoryData(restId);
      },
      error: (err) => {
        this.isOperatingOnClass = false;
        this.eqClassModalError = err?.error || err?.message || 'Failed to delete equivalence class.';
      },
    });
  }

  addItemToClass(classId: string): void {
    const itemId = this.selectedAddItemPerClass[classId];
    if (!itemId) return;

    const restId = this.restaurantId();
    const inv = this.stockInventory();
    const rawInvId = inv?.stockInventoryId || inv?.StockInventoryId;
    const invId = typeof rawInvId === 'string' ? rawInvId : (rawInvId?.value || rawInvId?.Value || '');

    this.isOperatingOnClass = true;
    this.stockInventoryService.addItemToEquivalenceClass(restId, invId, classId, itemId).subscribe({
      next: () => {
        this.isOperatingOnClass = false;
        delete this.selectedAddItemPerClass[classId];
        this.eqClassModalSuccess = 'Item added to equivalence class.';
        this.reloadInventoryData(restId);
      },
      error: (err) => {
        this.isOperatingOnClass = false;
        this.eqClassModalError = err?.error || err?.message || 'Failed to add item to class.';
      },
    });
  }

  removeItemFromClass(classId: string, itemId: string): void {
    const restId = this.restaurantId();
    const inv = this.stockInventory();
    const rawInvId = inv?.stockInventoryId || inv?.StockInventoryId;
    const invId = typeof rawInvId === 'string' ? rawInvId : (rawInvId?.value || rawInvId?.Value || '');

    this.isOperatingOnClass = true;
    this.stockInventoryService.removeItemFromEquivalenceClass(restId, invId, classId, itemId).subscribe({
      next: () => {
        this.isOperatingOnClass = false;
        this.eqClassModalSuccess = 'Item removed from equivalence class.';
        this.reloadInventoryData(restId);
      },
      error: (err) => {
        this.isOperatingOnClass = false;
        this.eqClassModalError = err?.error || err?.message || 'Failed to remove item from class.';
      },
    });
  }

  setDefaultItemInClass(classId: string, itemId: string): void {
    const restId = this.restaurantId();
    const inv = this.stockInventory();
    const rawInvId = inv?.stockInventoryId || inv?.StockInventoryId;
    const invId = typeof rawInvId === 'string' ? rawInvId : (rawInvId?.value || rawInvId?.Value || '');

    this.isOperatingOnClass = true;
    this.stockInventoryService.setEquivalenceClassDefaultItem(restId, invId, classId, itemId).subscribe({
      next: () => {
        this.isOperatingOnClass = false;
        this.eqClassModalSuccess = 'Default item updated.';
        this.reloadInventoryData(restId);
      },
      error: (err) => {
        this.isOperatingOnClass = false;
        this.eqClassModalError = err?.error || err?.message || 'Failed to set default item.';
      },
    });
  }

  // --- Visual Health Chart Rendering ---
  setAvailViewGrouping(mode: AvailViewGrouping): void {
    this.availViewGrouping.set(mode);
    setTimeout(() => this.renderAvailabilityChart(), 100);
  }

  setAvailDiagramType(type: AvailDiagramType): void {
    this.availDiagramType.set(type);
    if (type !== 'Cards') {
      setTimeout(() => this.renderAvailabilityChart(), 100);
    }
  }

  setAvailStatusFilter(filter: AvailStatusFilter): void {
    this.availStatusFilter.set(filter);
    setTimeout(() => this.renderAvailabilityChart(), 100);
  }

  renderAvailabilityChart(): void {
    if (typeof window === 'undefined' || this.availDiagramType() === 'Cards') return;

    const fn = (window as any).renderInventoryAvailabilityChart;
    if (typeof fn !== 'function') return;

    const isClassMode = this.availViewGrouping() === 'EquivalenceClasses';
    const chartType = this.availDiagramType() === 'Donut' ? 'doughnut' : 'bar';

    let labels: string[] = [];
    let values: number[] = [];
    let displayValues: string[] = [];
    let colors: string[] = [];

    if (isClassMode) {
      const classes = this.computedEquivalenceClasses();
      labels = classes.map((c) => c.name);
      values = classes.map((c) => c.totalNumericStock);
      displayValues = classes.map((c) => c.totalFormattedStock);
      colors = classes.map((c) => (c.totalNumericStock <= 0 ? '#dc3545' : c.totalNumericStock <= 3.0 ? '#ffc107' : '#198754'));
    } else {
      const prods = this.computedProducts();
      labels = prods.map((p) => p.name);
      values = prods.map((p) => p.numericStock);
      displayValues = prods.map((p) => p.formattedStock);
      colors = prods.map((p) => (p.numericStock <= 0 ? '#dc3545' : p.numericStock <= 3.0 ? '#ffc107' : '#198754'));
    }

    fn('inventoryAvailabilityChart', chartType, labels, values, displayValues, colors, isClassMode ? 'Stock by Class' : 'Stock by Product');
  }

  // --- Availability Preferences (LocalStorage) ---
  loadAvailabilityPreferences(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem('inventory_avail_prefs');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.ExcludedEquivalenceClassIds) {
          this.excludedEquivalenceClassIds = new Set(parsed.ExcludedEquivalenceClassIds);
        }
        if (parsed.ExcludedItemIds) {
          this.excludedItemIds = new Set(parsed.ExcludedItemIds);
        }
      }
    } catch {
      // ignore
    }
  }

  saveAvailabilityPreferences(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const data = {
        ExcludedEquivalenceClassIds: Array.from(this.excludedEquivalenceClassIds),
        ExcludedItemIds: Array.from(this.excludedItemIds),
      };
      localStorage.setItem('inventory_avail_prefs', JSON.stringify(data));
    } catch {
      // ignore
    }
  }

  resetAvailabilityPreferences(): void {
    this.excludedEquivalenceClassIds.clear();
    this.excludedItemIds.clear();
    this.saveAvailabilityPreferences();
    setTimeout(() => this.renderAvailabilityChart(), 100);
  }

  // --- Helpers ---
  getItemId(item: StockInventoryItem): string {
    const raw = item.stockInventoryItemId || item.StockInventoryItemId;
    return typeof raw === 'string' ? raw : (raw?.value || raw?.Value || '');
  }

  getItemName(item: StockInventoryItem): string {
    const raw = item.name || item.Name;
    return typeof raw === 'string' ? raw : (raw?.value || raw?.Value || 'Unnamed');
  }

  private findStockInventoryItemById(id: string): StockInventoryItem | null {
    const inv = this.stockInventory();
    if (!inv) return null;
    const itemsMap = inv.stockInventoryItems || inv.StockInventoryItems || {};
    const itemsList: StockInventoryItem[] = Array.isArray(itemsMap)
      ? itemsMap.map((p: any) => p[1])
      : Object.values(itemsMap);
    return itemsList.find((i) => this.getItemId(i) === id) || null;
  }

  private extractPackageTypeName(pkg: any): string {
    if (!pkg) return 'unit';
    if (typeof pkg === 'string') return pkg.toLowerCase();
    if (pkg.Other) return String(pkg.Other);
    return 'unit';
  }

  private formatMeasure(m: any): string {
    if (!m) return '0';
    const mCase = m.case || m.Case;
    const f0 = m.fields?.[0] || m.Fields?.[0] || 0;
    const f1 = m.fields?.[1] || m.Fields?.[1] || '';
    if (mCase === 'Volume' || mCase === 'Weight') {
      return `${f0} ${f1}`;
    }
    return `${f0} units`;
  }

  private getMeasureNumericValue(m: any): number {
    if (!m) return 0;
    return Number(m.fields?.[0] || m.Fields?.[0] || 0);
  }

  private getMeasureUnitString(m: any): string {
    if (!m) return 'units';
    return String(m.fields?.[1] || m.Fields?.[1] || 'units');
  }

  private capitalize(s: string): string {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
