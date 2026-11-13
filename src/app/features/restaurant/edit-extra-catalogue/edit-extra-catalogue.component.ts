import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { catchError, of, switchMap } from 'rxjs';
import { LocPipe } from '../../../core/pipes/loc.pipe';
import { LocalizationService } from '../../../core/services/localization.service';
import { RestaurantService, parseTranslationsMap, parseAllergensMap } from '../../../core/services/restaurant.service';
import { RestaurantItem } from '../../../core/models/restaurant.models';
import { ExtraCatalogueDetailsDto, ExtraCatalogueItemDetailDto, ExtraCatalogueItemDto, MenuItemTranslation } from '../../../core/models/menu.models';
import { MainLayoutComponent } from '../../../shared/components/main-layout/main-layout.component';

export interface SuggestedItemPreviewModel {
  item: any;
  isSelected: boolean;
  alreadyExists: boolean;
}

@Component({
  selector: 'app-edit-extra-catalogue',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, MainLayoutComponent, LocPipe],
  templateUrl: './edit-extra-catalogue.component.html',
  styleUrls: ['./edit-extra-catalogue.component.css'],
})
export class EditExtraCatalogueComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly restaurantService = inject(RestaurantService);
  readonly loc = inject(LocalizationService);

  readonly suggestionPlaceholder = 'menu mediterraneo campano, lingua principale italiano';

  restaurantId = signal<string>('');
  restaurant = signal<RestaurantItem | null>(null);
  extraCatalogueDetails = signal<ExtraCatalogueDetailsDto | null>(null);

  isLoading = signal<boolean>(true);
  isCatalogueDisabled = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  warningMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  // AI Assist
  shortDescription = signal<string>('');
  includeCompositionScratch = signal<boolean>(false);
  includeCompositionNames = signal<boolean>(false);
  isGenerating = signal<boolean>(false);
  isGeneratingFromNames = signal<boolean>(false);
  showListOfNamesSection = signal<boolean>(false);
  listOfNamesText = signal<string>('');

  // AI Suggested Items Modal
  suggestedPreviewItems = signal<SuggestedItemPreviewModel[]>([]);
  showSuggestedItemsPreviewModal = signal<boolean>(false);
  isAddingSuggestedItems = signal<boolean>(false);
  previewModalErrorMessage = signal<string | null>(null);

  // Search & Filter & Pagination
  searchFilterText = signal<string>('');
  selectedCategoryFilter = signal<string>('');
  selectedStatusFilter = signal<string>('All');
  currentPage = signal<number>(1);
  pageSize = signal<number>(20);

  // Selection for bulk actions
  selectedItemNames = signal<Set<string>>(new Set<string>());

  // Inline Editing
  editingItemOriginalName = signal<string | null>(null);
  editingItemNewName = signal<string>('');
  isRenaming = signal<boolean>(false);

  editingCategoryItemName = signal<string | null>(null);
  editingCategoryValue = signal<string>('');
  isSavingCategory = signal<boolean>(false);

  editingPriceItemName = signal<string | null>(null);
  editingPriceText = signal<string>('');
  isSavingPrice = signal<boolean>(false);
  unsettingPriceItemName = signal<string | null>(null);

  updatingAvailabilityItems = signal<Set<string>>(new Set<string>());

  // Expanded items for translations
  expandedItemNames = signal<Set<string>>(new Set<string>());
  editingTransKey = signal<string | null>(null); // e.g. "Pizza Margherita_en_name"
  editingTransValue = signal<string>('');
  isSavingTranslation = signal<boolean>(false);

  // Modals
  showRemoveConsentModal = signal<boolean>(false);
  itemToRemoveName = signal<string | null>(null);
  isRemovingItem = signal<boolean>(false);
  removingItemName = signal<string | null>(null);

  showMoveToMainMenuConsentModal = signal<boolean>(false);
  itemToMoveToMainMenuName = signal<string | null>(null);
  isMovingItemToMainMenu = signal<boolean>(false);

  showRemoveMultipleConsentModal = signal<boolean>(false);
  isRemovingMultiple = signal<boolean>(false);

  showRemoveMultiplePricesConsentModal = signal<boolean>(false);
  isRemovingMultiplePrices = signal<boolean>(false);

  showUpdateMultiplePricesModal = signal<boolean>(false);
  updateMultiplePricesText = signal<string>('');
  isUpdatingMultiplePrices = signal<boolean>(false);

  showUpdateMultipleCategoryModal = signal<boolean>(false);
  updateMultipleCategoryText = signal<string>('');
  isUpdatingMultipleCategory = signal<boolean>(false);

  showAllergensModal = signal<boolean>(false);
  selectedItemForAllergens = signal<string>('');
  selectedItemAllergens = signal<string[]>([]);

  // Computed Properties
  readonly items = computed<ExtraCatalogueItemDetailDto[]>(() => {
    return this.extraCatalogueDetails()?.extraCatalogueMenuItemDetails ?? [];
  });

  readonly existingCategories = computed<string[]>(() => {
    const set = new Set<string>();
    for (const d of this.items()) {
      const cat = d.extraCatalogueMenuItem?.optCategory;
      if (cat && cat.trim()) {
        set.add(cat.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  });

  readonly filteredItems = computed<ExtraCatalogueItemDetailDto[]>(() => {
    const list = this.items();
    const search = this.searchFilterText().trim().toLowerCase();
    const cat = this.selectedCategoryFilter();
    const status = this.selectedStatusFilter();

    return list.filter((detail) => {
      const item = detail.extraCatalogueMenuItem;
      if (!item) return false;

      if (search) {
        const nameMatch = item.name?.toLowerCase().includes(search);
        const catMatch = item.optCategory?.toLowerCase().includes(search);
        const descMatch = item.optDescription?.toLowerCase().includes(search);
        if (!nameMatch && !catMatch && !descMatch) return false;
      }

      if (cat) {
        if ((item.optCategory ?? '').toLowerCase() !== cat.toLowerCase()) return false;
      }

      if (status === 'Available' && !item.available) return false;
      if (status === 'Unavailable' && item.available) return false;

      return true;
    });
  });

  readonly totalFilteredCount = computed<number>(() => this.filteredItems().length);

  readonly totalPages = computed<number>(() => {
    return Math.max(1, Math.ceil(this.totalFilteredCount() / this.pageSize()));
  });

  readonly paginatedItems = computed<ExtraCatalogueItemDetailDto[]>(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredItems().slice(start, start + this.pageSize());
  });

  readonly parsedNamesCount = computed<number>(() => {
    const text = this.listOfNamesText();
    if (!text.trim()) return 0;
    return text
      .split('\n')
      .map((n) => n.trim())
      .filter((n) => n.length > 0).length;
  });

  readonly isAllFilteredSelected = computed<boolean>(() => {
    const filtered = this.filteredItems();
    if (filtered.length === 0) return false;
    const selected = this.selectedItemNames();
    return filtered.every((d) => selected.has(d.extraCatalogueMenuItem.name));
  });

  readonly selectedItemsWithPriceCount = computed<number>(() => {
    const selected = this.selectedItemNames();
    return this.items().filter(
      (d) => selected.has(d.extraCatalogueMenuItem.name) && d.extraCatalogueMenuItem.optOrdinaryPrice != null
    ).length;
  });

  readonly selectedSuggestedItemsCount = computed<number>(() => {
    return this.suggestedPreviewItems().filter((x) => x.isSelected && !x.alreadyExists).length;
  });

  readonly selectableSuggestedItemsCount = computed<number>(() => {
    return this.suggestedPreviewItems().filter((x) => !x.alreadyExists).length;
  });

  readonly areAllSuggestedItemsSelected = computed<boolean>(() => {
    const selectable = this.selectableSuggestedItemsCount();
    return selectable > 0 && this.suggestedPreviewItems().filter((x) => !x.alreadyExists).every((x) => x.isSelected);
  });

  readonly hasActiveFilters = computed<boolean>(() => {
    return (
      !!this.searchFilterText().trim() ||
      !!this.selectedCategoryFilter() ||
      this.selectedStatusFilter() !== 'All'
    );
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const restId = params.get('restaurantId') || '';
      this.restaurantId.set(restId);
      if (restId) {
        this.loadRestaurant();
        this.loadCatalogue();
      }
    });
  }

  loadRestaurant(): void {
    const id = this.restaurantId();
    if (!id) return;
    this.restaurantService.getRestaurant(id).subscribe({
      next: (rest) => {
        this.restaurant.set(rest);
        this.isCatalogueDisabled.set(!!rest.extraCatalogueSetting?.isDisabled);
      },
      error: () => {},
    });
  }

  loadCatalogue(showLoading = true): void {
    const id = this.restaurantId();
    if (!id) return;
    if (showLoading) {
      this.isLoading.set(true);
      this.errorMessage.set(null);
    }

    this.restaurantService.getExtraCatalogueDetails(id).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        const details = this.normalizeCatalogueDetails(res);
        this.extraCatalogueDetails.set(details);

        // Clean up selections
        const validNames = new Set(details.extraCatalogueMenuItemDetails.map((d) => d.extraCatalogueMenuItem.name));
        const updatedSelected = new Set(this.selectedItemNames());
        for (const name of updatedSelected) {
          if (!validNames.has(name)) updatedSelected.delete(name);
        }
        this.selectedItemNames.set(updatedSelected);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err?.error?.message || err?.message || 'Failed to load extra catalogue.');
      },
    });
  }

  private normalizeCatalogueDetails(raw: any): ExtraCatalogueDetailsDto {
    if (!raw) {
      return { extraCatalogue: {}, extraCatalogueMenuItemDetails: [] };
    }
    const cat = raw.extraCatalogue || raw.ExtraCatalogue || {};
    const rawDetails = raw.extraCatalogueMenuItemDetails || raw.ExtraCatalogueMenuItemDetails || [];

    const normalizedDetails: ExtraCatalogueItemDetailDto[] = rawDetails.map((d: any) => {
      const rawItem = d.extraCatalogueMenuItem || d.ExtraCatalogueMenuItem || {};
      const item: ExtraCatalogueItemDto = {
        name: rawItem.name || rawItem.Name || '',
        optCategory: this.parseOpt(rawItem.optCategory ?? rawItem.OptCategory),
        optDescription: this.parseOpt(rawItem.optDescription ?? rawItem.OptDescription),
        optOrdinaryPrice: this.parseOrdinaryPrice(rawItem),
        available: rawItem.available ?? rawItem.Available ?? true,
        translations: parseTranslationsMap(rawItem.translations ?? rawItem.Translations) as any,
        allergens: parseAllergensMap(rawItem.allergens ?? rawItem.Allergens) as any,
        composition: rawItem.composition || rawItem.Composition || [],
        pricesPerVatDepartments: rawItem.pricesPerVatDepartments || rawItem.PricesPerVatDepartments || {},
      };
      return {
        extraCatalogueMenuItem: item,
        menuItemStockComponentDetails: d.menuItemStockComponentDetails || d.MenuItemStockComponentDetails || [],
      };
    });

    return {
      extraCatalogue: {
        extraCatalogueId: cat.extraCatalogueId?.value ?? cat.extraCatalogueId ?? cat.ExtraCatalogueId?.value ?? cat.ExtraCatalogueId,
        extraCatalogueMenuItems: normalizedDetails.map((d) => d.extraCatalogueMenuItem),
      },
      extraCatalogueMenuItemDetails: normalizedDetails,
    };
  }

  private parseOpt(v: any): any {
    if (v === undefined || v === null) return null;
    if (typeof v !== 'object') return v;
    if (Array.isArray(v.fields)) return v.fields[0] ?? null;
    if (v.value !== undefined) return v.value;
    return null;
  }

  // --- Template helpers ---
  private static readonly NEGATIVE_ALLERGENS = new Set([
    'none', 'no allergens', 'n/a', 'na', '-', '--', 'null', 'nessuno', 'nessun allergene', 'senza allergeni',
    'ninguno', 'aucun', 'keine', 'kein',
  ]);

  getAllergensList(raw: string | null | undefined): string[] {
    if (!raw) return [];
    return raw
      .split(',')
      .map((s) => s.trim().replace(/\.$/, ''))
      .filter((s) => s.length > 0 && !EditExtraCatalogueComponent.NEGATIVE_ALLERGENS.has(s.toLowerCase()));
  }

  itemLanguages(item: ExtraCatalogueItemDto): string[] {
    const keys = new Set<string>();
    Object.keys(item.translations || {}).forEach((k) => keys.add(k));
    Object.entries(item.allergens || {}).forEach(([k, v]) => { if (v && String(v).trim()) keys.add(k); });
    return Array.from(keys).sort();
  }

  transName(item: ExtraCatalogueItemDto, lang: string): string {
    return (item.translations as any)?.[lang]?.name || '';
  }

  transDesc(item: ExtraCatalogueItemDto, lang: string): string {
    return (item.translations as any)?.[lang]?.description || '';
  }

  rawAllergens(item: ExtraCatalogueItemDto, lang: string): string {
    return (item.allergens as any)?.[lang] || '';
  }

  formatStockComponent(comp: any): string {
    if (comp == null) return '';
    if (typeof comp === 'string') return comp;
    const fields = comp.fields || comp.Fields;
    let name = '';
    let qty: any = null;
    if (Array.isArray(fields)) {
      const first = fields[0];
      name = typeof first === 'string' ? first : (first?.name || first?.Name || first?.fields?.[0]?.name || first?.fields?.[1] || first?.fields?.[0] || '');
      qty = fields[1];
    } else {
      name = comp.componentName || comp.ComponentName || comp.name || comp.Name || '';
      qty = comp.quantity ?? comp.Quantity;
    }
    if (typeof name !== 'string') name = JSON.stringify(name);
    const qtyStr = this.formatQuantity(qty);
    return qtyStr ? `${name} (${qtyStr})` : name;
  }

  private formatQuantity(q: any): string {
    if (q == null) return '';
    if (typeof q === 'number' || typeof q === 'string') return String(q);
    const c = q.case || q.Case;
    if (c === 'Unspecified') return 'q.b.';
    const f = q.fields || q.Fields;
    if (Array.isArray(f) && f.length) {
      return f.filter((x: any) => typeof x === 'number' || typeof x === 'string').join(' ± ');
    }
    return '';
  }

  isUnresolvedComponent(comp: any): boolean {
    return (comp?.case || comp?.Case) === 'Unresolved' || comp?.isUnresolved === true;
  }

  sugName(item: any): string { return item?.name || item?.Name || ''; }
  sugCategory(item: any): string | null { return this.parseOpt(item?.optCategory ?? item?.OptCategory); }
  sugDescription(item: any): string | null { return this.parseOpt(item?.optDescription ?? item?.OptDescription); }
  sugPrice(item: any): number | null { return this.parseOrdinaryPrice(item || {}); }
  sugAllergens(item: any): string[] {
    const map = parseAllergensMap(item?.allergens ?? item?.Allergens);
    const lang = this.loc.currentLang().toLowerCase();
    const raw = map[lang] || map['en'] || map['it'] || Object.values(map).find((v) => v && v.trim()) || '';
    return this.getAllergensList(raw);
  }
  sugLanguages(item: any): string[] {
    return Object.keys(parseTranslationsMap(item?.translations ?? item?.Translations));
  }
  sugComposition(item: any): any[] {
    const c = item?.composition ?? item?.Composition;
    return Array.isArray(c) ? c : [];
  }

  toggleSuggested(index: number): void {
    this.suggestedPreviewItems.update((list) =>
      list.map((x, i) => (i === index && !x.alreadyExists ? { ...x, isSelected: !x.isSelected } : x))
    );
  }

  private parseOrdinaryPrice(rawItem: any): number | null {
    const opt = this.parseOpt(rawItem.optOrdinaryPrice ?? rawItem.OptOrdinaryPrice);
    if (typeof opt === 'number') return opt;
    const pv = rawItem.pricesPerVatDepartments ?? rawItem.PricesPerVatDepartments;
    if (Array.isArray(pv) && pv.length) {
      const e = pv[0];
      const v = Array.isArray(e) ? e[1] : (e?.value ?? e?.Value);
      if (typeof v === 'number') return v;
    }
    if (rawItem.optOrdinaryPrice !== undefined && rawItem.optOrdinaryPrice !== null) {
      if (typeof rawItem.optOrdinaryPrice === 'number') return rawItem.optOrdinaryPrice;
      if (rawItem.optOrdinaryPrice.value !== undefined) return rawItem.optOrdinaryPrice.value;
    }
    if (rawItem.OptOrdinaryPrice !== undefined && rawItem.OptOrdinaryPrice !== null) {
      if (typeof rawItem.OptOrdinaryPrice === 'number') return rawItem.OptOrdinaryPrice;
      if (rawItem.OptOrdinaryPrice.value !== undefined) return rawItem.OptOrdinaryPrice.value;
    }
    const prices = rawItem.pricesPerVatDepartments || rawItem.PricesPerVatDepartments;
    if (prices) {
      const val = prices['Rep1'] ?? prices['rep1'] ?? Object.values(prices)[0];
      if (typeof val === 'number') return val;
    }
    return null;
  }

  // --- AI Actions ---
  useSuggestion(): void {
    this.shortDescription.set(this.suggestionPlaceholder);
  }

  toggleListOfNamesSection(): void {
    this.showListOfNamesSection.set(!this.showListOfNamesSection());
  }

  clearListOfNames(): void {
    this.listOfNamesText.set('');
  }

  fillFromScratch(): void {
    const prompt = this.shortDescription().trim();
    if (!prompt) return;

    this.isGenerating.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.restaurantService
      .generateExtraCatalogueMenuFromScratch(prompt, this.includeCompositionScratch())
      .subscribe({
        next: (items) => {
          this.isGenerating.set(false);
          this.openSuggestedPreview(items || []);
        },
        error: (err) => {
          this.isGenerating.set(false);
          this.errorMessage.set(err?.error?.message || err?.message || 'AI Generation failed.');
        },
      });
  }

  integrateFromListOfNames(): void {
    const text = this.listOfNamesText();
    const names = text
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 20);

    if (names.length === 0) return;

    this.isGeneratingFromNames.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.restaurantService
      .generateExtraCatalogueMenuFromNames(names, this.includeCompositionNames())
      .subscribe({
        next: (items) => {
          this.isGeneratingFromNames.set(false);
          this.openSuggestedPreview(items || []);
        },
        error: (err) => {
          this.isGeneratingFromNames.set(false);
          this.errorMessage.set(err?.error?.message || err?.message || 'AI Generation failed.');
        },
      });
  }

  private openSuggestedPreview(rawItems: any[]): void {
    const existingNames = new Set(this.items().map((d) => d.extraCatalogueMenuItem.name.toLowerCase()));
    const previewList: SuggestedItemPreviewModel[] = rawItems.map((item) => {
      const name = item.name || item.Name || '';
      const exists = existingNames.has(name.toLowerCase());
      return {
        item,
        isSelected: !exists,
        alreadyExists: exists,
      };
    });

    this.suggestedPreviewItems.set(previewList);
    this.previewModalErrorMessage.set(null);
    this.showSuggestedItemsPreviewModal.set(true);
  }

  selectAllSuggested(): void {
    this.suggestedPreviewItems.update((list) =>
      list.map((x) => ({ ...x, isSelected: !x.alreadyExists ? true : false }))
    );
  }

  deselectAllSuggested(): void {
    this.suggestedPreviewItems.update((list) => list.map((x) => ({ ...x, isSelected: false })));
  }

  toggleAllSuggested(): void {
    const allSelected = this.areAllSuggestedItemsSelected();
    this.suggestedPreviewItems.update((list) =>
      list.map((x) => ({ ...x, isSelected: !x.alreadyExists ? !allSelected : false }))
    );
  }

  closeSuggestedModal(): void {
    this.showSuggestedItemsPreviewModal.set(false);
    this.suggestedPreviewItems.set([]);
  }

  confirmAddSuggestedItems(): void {
    const toAdd = this.suggestedPreviewItems()
      .filter((x) => x.isSelected && !x.alreadyExists)
      .map((x) => x.item);

    if (toAdd.length === 0) return;

    this.isAddingSuggestedItems.set(true);
    this.previewModalErrorMessage.set(null);

    const rid = this.restaurantId();
    const needsInit = !this.extraCatalogueDetails()?.extraCatalogue?.extraCatalogueId;
    const add$ = needsInit
      ? this.restaurantService.initializeExtraCatalogue(rid).pipe(
          catchError(() => of(null)),
          switchMap(() => this.restaurantService.addExtraCatalogueItems(rid, toAdd))
        )
      : this.restaurantService.addExtraCatalogueItems(rid, toAdd);

    add$.subscribe({
      next: () => {
        this.isAddingSuggestedItems.set(false);
        this.closeSuggestedModal();
        this.successMessage.set(`${toAdd.length} items added successfully.`);
        this.loadCatalogue(false);
      },
      error: (err) => {
        this.isAddingSuggestedItems.set(false);
        this.previewModalErrorMessage.set(err?.error?.message || err?.message || 'Failed to add items.');
      },
    });
  }

  // --- Filtering & Selection ---
  clearFilters(): void {
    this.searchFilterText.set('');
    this.selectedCategoryFilter.set('');
    this.selectedStatusFilter.set('All');
    this.currentPage.set(1);
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  toggleItemSelection(name: string): void {
    const set = new Set(this.selectedItemNames());
    if (set.has(name)) set.delete(name);
    else set.add(name);
    this.selectedItemNames.set(set);
  }

  toggleSelectAllFiltered(): void {
    const allSelected = this.isAllFilteredSelected();
    const set = new Set(this.selectedItemNames());
    const filtered = this.filteredItems();

    if (allSelected) {
      filtered.forEach((d) => set.delete(d.extraCatalogueMenuItem.name));
    } else {
      filtered.forEach((d) => set.add(d.extraCatalogueMenuItem.name));
    }
    this.selectedItemNames.set(set);
  }

  selectAllFiltered(): void {
    const set = new Set(this.selectedItemNames());
    this.filteredItems().forEach((d) => set.add(d.extraCatalogueMenuItem.name));
    this.selectedItemNames.set(set);
  }

  clearSelection(): void {
    this.selectedItemNames.set(new Set());
  }

  // --- Inline Renaming ---
  startRename(name: string): void {
    this.editingItemOriginalName.set(name);
    this.editingItemNewName.set(name);
  }

  cancelRename(): void {
    this.editingItemOriginalName.set(null);
    this.editingItemNewName.set('');
  }

  saveRename(oldName: string): void {
    const newName = this.editingItemNewName().trim();
    if (!newName || newName === oldName) {
      this.cancelRename();
      return;
    }

    this.isRenaming.set(true);
    this.restaurantService.renameExtraCatalogueItem(this.restaurantId(), oldName, newName).subscribe({
      next: () => {
        this.isRenaming.set(false);
        this.cancelRename();
        this.loadCatalogue(false);
      },
      error: (err) => {
        this.isRenaming.set(false);
        this.errorMessage.set(err?.error?.message || err?.message || 'Failed to rename item.');
      },
    });
  }

  // --- Inline Category Editing ---
  startEditCategory(name: string, currentCategory: string | null): void {
    this.editingCategoryItemName.set(name);
    this.editingCategoryValue.set(currentCategory || '');
  }

  cancelEditCategory(): void {
    this.editingCategoryItemName.set(null);
    this.editingCategoryValue.set('');
  }

  saveCategory(name: string): void {
    const cat = this.editingCategoryValue().trim();
    if (!cat) {
      this.cancelEditCategory();
      return;
    }

    this.isSavingCategory.set(true);
    this.restaurantService.setCategoryOfExtraCatalogueItem(this.restaurantId(), name, cat).subscribe({
      next: () => {
        this.isSavingCategory.set(false);
        this.cancelEditCategory();
        this.loadCatalogue(false);
      },
      error: (err) => {
        this.isSavingCategory.set(false);
        this.errorMessage.set(err?.error?.message || err?.message || 'Failed to set category.');
      },
    });
  }

  // --- Inline Price Editing ---
  startEditPrice(name: string, currentPrice: number | null): void {
    this.editingPriceItemName.set(name);
    this.editingPriceText.set(currentPrice != null ? currentPrice.toFixed(2) : '');
  }

  cancelEditPrice(): void {
    this.editingPriceItemName.set(null);
    this.editingPriceText.set('');
  }

  savePrice(name: string): void {
    const priceNum = parseFloat(this.editingPriceText().replace(',', '.'));
    if (isNaN(priceNum) || priceNum < 0) return;

    this.isSavingPrice.set(true);
    this.restaurantService.setExtraCatalogueItemPrice(this.restaurantId(), name, priceNum).subscribe({
      next: () => {
        this.isSavingPrice.set(false);
        this.cancelEditPrice();
        this.loadCatalogue(false);
      },
      error: (err) => {
        this.isSavingPrice.set(false);
        this.errorMessage.set(err?.error?.message || err?.message || 'Failed to update price.');
      },
    });
  }

  unsetPrice(name: string): void {
    this.unsettingPriceItemName.set(name);
    this.restaurantService.unsetExtraCatalogueItemPrice(this.restaurantId(), name).subscribe({
      next: () => {
        this.unsettingPriceItemName.set(null);
        this.loadCatalogue(false);
      },
      error: (err) => {
        this.unsettingPriceItemName.set(null);
        this.errorMessage.set(err?.error?.message || err?.message || 'Failed to unset price.');
      },
    });
  }

  // --- Availability Toggle ---
  toggleItemAvailability(item: ExtraCatalogueItemDto): void {
    const name = item.name;
    const set = new Set(this.updatingAvailabilityItems());
    set.add(name);
    this.updatingAvailabilityItems.set(set);

    const call$ = item.available
      ? this.restaurantService.setExtraCatalogueItemUnavailable(this.restaurantId(), name)
      : this.restaurantService.setExtraCatalogueItemAvailable(this.restaurantId(), name);

    call$.subscribe({
      next: () => {
        const updated = new Set(this.updatingAvailabilityItems());
        updated.delete(name);
        this.updatingAvailabilityItems.set(updated);
        this.loadCatalogue(false);
      },
      error: (err) => {
        const updated = new Set(this.updatingAvailabilityItems());
        updated.delete(name);
        this.updatingAvailabilityItems.set(updated);
        this.errorMessage.set(err?.error?.message || err?.message || 'Failed to toggle status.');
      },
    });
  }

  // --- Expand / Collapse Details & Translations ---
  toggleExpand(name: string): void {
    const set = new Set(this.expandedItemNames());
    if (set.has(name)) set.delete(name);
    else set.add(name);
    this.expandedItemNames.set(set);
  }

  collapseAll(): void {
    this.expandedItemNames.set(new Set());
  }

  getTranslationLanguages(item: ExtraCatalogueItemDto): string[] {
    const keys = new Set<string>();
    if (item.translations) {
      Object.keys(item.translations).forEach((k) => keys.add(k.toLowerCase()));
    }
    if (item.allergens) {
      Object.keys(item.allergens).forEach((k) => keys.add(k.toLowerCase()));
    }
    // Default languages to display
    ['it', 'en', 'es', 'fr', 'de'].forEach((l) => keys.add(l));
    return Array.from(keys).sort();
  }

  getLanguageFlag(lang: string): string {
    switch (lang.toLowerCase()) {
      case 'it': return '🇮🇹';
      case 'en': return '🇬🇧';
      case 'es': return '🇪🇸';
      case 'fr': return '🇫🇷';
      case 'de': return '🇩🇪';
      default: return '🌐';
    }
  }

  getLanguageDisplayName(lang: string): string {
    switch (lang.toLowerCase()) {
      case 'it': return 'Italiano';
      case 'en': return 'English';
      case 'es': return 'Español';
      case 'fr': return 'Français';
      case 'de': return 'Deutsch';
      default: return lang.toUpperCase();
    }
  }

  startEditTranslation(name: string, lang: string, field: 'name' | 'desc' | 'allergens', initialVal: string): void {
    this.editingTransKey.set(`${name}_${lang}_${field}`);
    this.editingTransValue.set(initialVal || '');
  }

  cancelEditTranslation(): void {
    this.editingTransKey.set(null);
    this.editingTransValue.set('');
  }

  isEditingTrans(name: string, lang: string, field: 'name' | 'desc' | 'allergens'): boolean {
    return this.editingTransKey() === `${name}_${lang}_${field}`;
  }

  hasAllergens(item: ExtraCatalogueItemDto): boolean {
    if (!item.allergens) return false;
    return Object.values(item.allergens).some((val) => {
      if (!val || !val.trim()) return false;
      const lower = val.trim().toLowerCase();
      return lower !== 'none' && lower !== 'nessuno' && lower !== '-';
    });
  }

  getTranslationCount(item: ExtraCatalogueItemDto): number {
    if (!item.translations) return 0;
    return Object.keys(item.translations).length;
  }

  isValidPriceInput(text: string): boolean {
    const val = parseFloat(text.replace(',', '.'));
    return !isNaN(val) && val >= 0;
  }

  parsePricePreview(text: string): string {
    const val = parseFloat(text.replace(',', '.'));
    return !isNaN(val) && val >= 0 ? val.toFixed(2) : '0.00';
  }

  selectedNamesArray(): string[] {
    return Array.from(this.selectedItemNames());
  }

  expandedDetails(): ExtraCatalogueItemDetailDto[] {
    const expanded = this.expandedItemNames();
    return this.items().filter((d) => expanded.has(d.extraCatalogueMenuItem.name));
  }

  saveTranslation(name: string, lang: string, field: 'name' | 'desc' | 'allergens'): void {
    const val = this.editingTransValue().trim();
    this.isSavingTranslation.set(true);

    let call$;
    if (field === 'name') {
      call$ = this.restaurantService.updateExtraCatalogueTranslatedName(this.restaurantId(), name, lang, val);
    } else if (field === 'desc') {
      call$ = this.restaurantService.updateExtraCatalogueTranslatedDescription(this.restaurantId(), name, lang, val);
    } else {
      call$ = this.restaurantService.updateExtraCatalogueTranslatedAllergens(this.restaurantId(), name, lang, val);
    }

    call$.subscribe({
      next: () => {
        this.isSavingTranslation.set(false);
        this.cancelEditTranslation();
        this.loadCatalogue(false);
      },
      error: (err) => {
        this.isSavingTranslation.set(false);
        this.errorMessage.set(err?.error?.message || err?.message || 'Failed to save translation.');
      },
    });
  }

  // --- Allergens Modal ---
  showAllergens(name: string, item: ExtraCatalogueItemDto): void {
    const currentLang = this.loc.currentLang().toLowerCase();
    const raw = item.allergens?.[currentLang] || item.allergens?.['it'] || item.allergens?.['en'] || '';
    const list = raw
      ? raw
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : [];

    this.selectedItemForAllergens.set(name);
    this.selectedItemAllergens.set(list);
    this.showAllergensModal.set(true);
  }

  closeAllergensModal(): void {
    this.showAllergensModal.set(false);
    this.selectedItemForAllergens.set('');
    this.selectedItemAllergens.set([]);
  }

  // --- Single Item Actions (Remove & Move to Main Menu) ---
  openRemoveConfirmation(name: string): void {
    this.itemToRemoveName.set(name);
    this.showRemoveConsentModal.set(true);
  }

  cancelRemoveItem(): void {
    this.showRemoveConsentModal.set(false);
    this.itemToRemoveName.set(null);
  }

  confirmRemoveItem(): void {
    const name = this.itemToRemoveName();
    if (!name) return;

    this.isRemovingItem.set(true);
    this.restaurantService.removeExtraCatalogueItem(this.restaurantId(), name).subscribe({
      next: () => {
        this.isRemovingItem.set(false);
        this.cancelRemoveItem();
        this.successMessage.set(`"${name}" removed successfully.`);
        this.loadCatalogue(false);
      },
      error: (err) => {
        this.isRemovingItem.set(false);
        this.errorMessage.set(err?.error?.message || err?.message || 'Failed to remove item.');
      },
    });
  }

  openMoveToMainMenuConfirmation(name: string): void {
    this.itemToMoveToMainMenuName.set(name);
    this.showMoveToMainMenuConsentModal.set(true);
  }

  cancelMoveToMainMenu(): void {
    this.showMoveToMainMenuConsentModal.set(false);
    this.itemToMoveToMainMenuName.set(null);
  }

  confirmMoveToMainMenu(): void {
    const name = this.itemToMoveToMainMenuName();
    if (!name) return;

    this.isMovingItemToMainMenu.set(true);
    this.restaurantService.moveExtraCatalogueItemToMainMenu(this.restaurantId(), name).subscribe({
      next: () => {
        this.isMovingItemToMainMenu.set(false);
        this.cancelMoveToMainMenu();
        this.successMessage.set(`"${name}" promoted to Main Menu.`);
        this.loadCatalogue(false);
      },
      error: (err) => {
        this.isMovingItemToMainMenu.set(false);
        this.errorMessage.set(err?.error?.message || err?.message || 'Failed to move item to Main Menu.');
      },
    });
  }

  // --- Bulk Actions ---
  openRemoveMultipleConfirmation(): void {
    this.showRemoveMultipleConsentModal.set(true);
  }

  cancelRemoveMultiple(): void {
    this.showRemoveMultipleConsentModal.set(false);
  }

  confirmRemoveMultiple(): void {
    const names = Array.from(this.selectedItemNames());
    if (names.length === 0) return;

    this.isRemovingMultiple.set(true);
    this.restaurantService.removeExtraCatalogueMultipleItems(this.restaurantId(), names).subscribe({
      next: () => {
        this.isRemovingMultiple.set(false);
        this.cancelRemoveMultiple();
        this.clearSelection();
        this.successMessage.set(`${names.length} items removed.`);
        this.loadCatalogue(false);
      },
      error: (err) => {
        this.isRemovingMultiple.set(false);
        this.errorMessage.set(err?.error?.message || err?.message || 'Failed to remove items.');
      },
    });
  }

  openRemoveMultiplePricesConfirmation(): void {
    this.showRemoveMultiplePricesConsentModal.set(true);
  }

  cancelRemoveMultiplePrices(): void {
    this.showRemoveMultiplePricesConsentModal.set(false);
  }

  confirmRemoveMultiplePrices(): void {
    const names = Array.from(this.selectedItemNames());
    if (names.length === 0) return;

    this.isRemovingMultiplePrices.set(true);
    this.restaurantService.removeExtraCatalogueMultipleItemPrices(this.restaurantId(), names).subscribe({
      next: () => {
        this.isRemovingMultiplePrices.set(false);
        this.cancelRemoveMultiplePrices();
        this.successMessage.set(`Prices removed from selected items.`);
        this.loadCatalogue(false);
      },
      error: (err) => {
        this.isRemovingMultiplePrices.set(false);
        this.errorMessage.set(err?.error?.message || err?.message || 'Failed to remove prices.');
      },
    });
  }

  openUpdateMultiplePricesModal(): void {
    this.updateMultiplePricesText.set('');
    this.showUpdateMultiplePricesModal.set(true);
  }

  cancelUpdateMultiplePrices(): void {
    this.showUpdateMultiplePricesModal.set(false);
    this.updateMultiplePricesText.set('');
  }

  confirmUpdateMultiplePrices(): void {
    const priceNum = parseFloat(this.updateMultiplePricesText().replace(',', '.'));
    if (isNaN(priceNum) || priceNum < 0) return;
    const names = Array.from(this.selectedItemNames());
    if (names.length === 0) return;

    this.isUpdatingMultiplePrices.set(true);
    this.restaurantService
      .updateExtraCatalogueMultipleItemPrices(this.restaurantId(), names, priceNum)
      .subscribe({
        next: () => {
          this.isUpdatingMultiplePrices.set(false);
          this.cancelUpdateMultiplePrices();
          this.successMessage.set(`Price updated for ${names.length} items.`);
          this.loadCatalogue(false);
        },
        error: (err) => {
          this.isUpdatingMultiplePrices.set(false);
          this.errorMessage.set(err?.error?.message || err?.message || 'Failed to update prices.');
        },
      });
  }

  openUpdateMultipleCategoryModal(): void {
    this.updateMultipleCategoryText.set('');
    this.showUpdateMultipleCategoryModal.set(true);
  }

  cancelUpdateMultipleCategory(): void {
    this.showUpdateMultipleCategoryModal.set(false);
    this.updateMultipleCategoryText.set('');
  }

  confirmUpdateMultipleCategory(): void {
    const cat = this.updateMultipleCategoryText().trim();
    if (!cat) return;
    const names = Array.from(this.selectedItemNames());
    if (names.length === 0) return;

    this.isUpdatingMultipleCategory.set(true);
    this.restaurantService
      .updateExtraCatalogueMultipleItemCategory(this.restaurantId(), names, cat)
      .subscribe({
        next: () => {
          this.isUpdatingMultipleCategory.set(false);
          this.cancelUpdateMultipleCategory();
          this.successMessage.set(`Category set for ${names.length} items.`);
          this.loadCatalogue(false);
        },
        error: (err) => {
          this.isUpdatingMultipleCategory.set(false);
          this.errorMessage.set(err?.error?.message || err?.message || 'Failed to update category.');
        },
      });
  }
}

