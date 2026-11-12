import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { RestaurantService, parseTranslationsMap, parseAllergensMap } from '../../../core/services/restaurant.service';
import { LocalizationService } from '../../../core/services/localization.service';
import { LocPipe } from '../../../core/pipes/loc.pipe';
import { CultureSelectorComponent } from '../../../shared/components/culture-selector/culture-selector.component';
import { PublicRestaurantDetails, MenuItemModel } from '../../../core/models/menu.models';
import { TableModel, TableSessionModel, OrderItemModel, AggregatedOrderItem } from '../../../core/models/restaurant.models';

interface GroupedCategory {
  category: string;
  items: MenuItemModel[];
}

interface PaymentBreakdownItem {
  itemName: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

@Component({
  selector: 'app-order',
  standalone: true,
  imports: [CommonModule, FormsModule, LocPipe, CultureSelectorComponent],
  templateUrl: './order.component.html',
  styleUrls: ['./order.component.css'],
})
export class OrderComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly restaurantService = inject(RestaurantService);
  readonly loc = inject(LocalizationService);

  // Query Params
  restaurantId = '';
  tableNumber: number | null = null;
  tableId = '';

  // State signals
  isLoading = signal(true);
  isBusy = signal(false);
  errorMessage = signal<string | null>(null);
  actionError = signal<string | null>(null);
  toastMessage = signal<string | null>(null);

  // Restaurant & Table metadata
  restaurant = signal<PublicRestaurantDetails | null>(null);
  matchedTable = signal<TableModel | null>(null);
  additionalInfo = signal<string | null>(null);

  // Session state
  sessionId = signal<string | null>(null);
  showSessionConsentModal = signal(false);

  // Orders in active session
  sessionItems = signal<OrderItemModel[]>([]);
  aggregatedSessionItems = signal<AggregatedOrderItem[]>([]);

  // Extra Catalogue state
  extraCatalogue = signal<any | null>(null);
  isExtraSearchEnabled = signal(false);
  extraSearchTerm = signal<string>('');
  selectedExtraCategories = signal<Set<string>>(new Set());

  // Drawer & Modals
  isOrderDrawerOpen = signal(false);
  showAllergensModal = signal(false);
  selectedItemForAllergens = signal<string>('');
  selectedItemAllergens = signal<string[]>([]);

  // Fiscal metadata
  currentFiscalMetadata = signal<{ isCodiceFiscale: boolean; isCodiceLotteria: boolean; value: string } | null>(null);
  isFiscalEditOpen = signal(false);
  selectedFiscalOption: 'none' | 'cf' | 'lotteria' = 'none';
  fiscalInputText = '';
  fiscalErrorMessage = signal<string | null>(null);

  // Confirmation countdown timer
  confirmCountdown = signal<number>(0);
  private confirmTimerId: any = null;

  // Menu Language translation (orthogonal to UI language)
  selectedLang = signal<string>('default');

  onMenuLanguageChange(lang: string): void {
    this.selectedLang.set(lang);
  }

  // Stripe & Online Payment
  isStripeConfigEnabled = signal(true);
  showOnlinePaymentBlock = signal(false);
  showStripeElement = signal(false);
  paymentIntentStatus = signal<string | null>(null);
  paymentIntentDetail = signal<string | null>(null);
  newlyConfirmedItems = signal<Array<{ qty: number; itemName: string }>>([]);

  // Tips
  selectedTipMode: 'none' | 'percentage' | 'custom_percentage' | 'fixed' = 'none';
  selectedTipPercentage = 0;
  customTipPercentageInput: number | null = null;
  customTipFixedInput: number | null = null;
  isHighTipConfirmed = false;

  private toastTimeoutId: any = null;
  private pollingIntervalId: any = null;

  // Computed properties
  groupedCategories = computed<GroupedCategory[]>(() => {
    const rest = this.restaurant();
    if (!rest || !rest.items) return [];

    const map = new Map<string, MenuItemModel[]>();
    for (const item of rest.items) {
      if (!item.available) continue;
      const cat = item.category || 'Dishes';
      if (!map.has(cat)) {
        map.set(cat, []);
      }
      map.get(cat)!.push(item);
    }

    const result: GroupedCategory[] = [];
    map.forEach((items, category) => {
      items.sort((a, b) => a.orderIndex - b.orderIndex);
      result.push({ category, items });
    });
    return result;
  });

  totalPendingCount = computed(() => {
    return this.aggregatedSessionItems()
      .filter((i) => i.isPending)
      .reduce((sum, i) => sum + i.quantity, 0);
  });

  pendingSubtotal = computed(() => {
    return this.calculateSubtotal(true);
  });

  grandTotal = computed(() => {
    const sub = this.pendingSubtotal();
    const seatFee = this.getEffectiveSeatingFee();
    const tip = this.getSelectedTipAmount();
    return sub + seatFee + tip;
  });

  // Extra Catalogue Computed Properties
  extraAvailableCategories = computed<string[]>(() => {
    const extraCat = this.extraCatalogue();
    if (!extraCat) return [];

    const rawItems = extraCat.extraCatalogueMenuItems ?? extraCat.ExtraCatalogueMenuItems ?? [];
    if (!Array.isArray(rawItems)) return [];

    const cats = new Set<string>();
    for (const item of rawItems) {
      if (item.available === false || item.Available === false) continue;
      const optCat = item.optCategory ?? item.OptCategory ?? item.category ?? item.Category;
      let catStr = '';
      if (typeof optCat === 'string') {
        catStr = optCat.trim();
      } else if (optCat && typeof optCat === 'object') {
        catStr = (optCat.fields?.[0] || optCat.value || optCat.Value || '').trim();
      }
      if (catStr) cats.add(catStr);
    }
    return Array.from(cats).sort();
  });

  extraAutocompleteSuggestions = computed<string[]>(() => {
    const extraCat = this.extraCatalogue();
    const term = (this.extraSearchTerm() || '').trim().toLowerCase();
    if (!extraCat || !term) return [];

    const rawItems = extraCat.extraCatalogueMenuItems ?? extraCat.ExtraCatalogueMenuItems ?? [];
    if (!Array.isArray(rawItems)) return [];

    const names = new Set<string>();
    const lang = (this.selectedLang() || 'default').toLowerCase();

    for (const item of rawItems) {
      if (item.available === false || item.Available === false) continue;
      const defaultName = item.name ?? item.Name ?? '';
      if (defaultName.toLowerCase().includes(term)) {
        names.add(defaultName);
      }

      const transMap = parseTranslationsMap(item.translations ?? item.Translations);
      if (lang !== 'default' && transMap[lang]?.name) {
        const transName = transMap[lang].name;
        if (transName.toLowerCase().includes(term)) {
          names.add(transName);
        }
      }
    }
    return Array.from(names).slice(0, 10);
  });

  filteredExtraMenuItems = computed<MenuItemModel[]>(() => {
    const extraCat = this.extraCatalogue();
    if (!extraCat || !this.isExtraSearchEnabled()) return [];

    const rawItems = extraCat.extraCatalogueMenuItems ?? extraCat.ExtraCatalogueMenuItems ?? [];
    if (!Array.isArray(rawItems)) return [];

    const selectedCats = this.selectedExtraCategories();
    const term = (this.extraSearchTerm() || '').trim().toLowerCase();

    // If no category selected and no search term, return empty to display hint
    if (selectedCats.size === 0 && !term) {
      return [];
    }

    const results: MenuItemModel[] = [];
    const lang = (this.selectedLang() || 'default').toLowerCase();

    rawItems.forEach((rawItem: any, idx: number) => {
      const isAvail = rawItem?.available ?? rawItem?.Available ?? true;
      if (!isAvail) return;

      const name = rawItem?.name ?? rawItem?.Name ?? 'Extra Item';
      const optCat = rawItem?.optCategory ?? rawItem?.OptCategory ?? rawItem?.category ?? rawItem?.Category;
      let category = '';
      if (typeof optCat === 'string') {
        category = optCat.trim();
      } else if (optCat && typeof optCat === 'object') {
        category = (optCat.fields?.[0] || optCat.value || optCat.Value || '').trim();
      }

      // Category filter check
      if (selectedCats.size > 0 && (!category || !selectedCats.has(category))) {
        return;
      }

      // Search term check
      if (term) {
        let nameMatch = name.toLowerCase().includes(term);
        const optDesc = rawItem?.optDescription ?? rawItem?.OptDescription ?? rawItem?.description ?? rawItem?.Description ?? '';
        let descStr = typeof optDesc === 'string' ? optDesc : (optDesc?.fields?.[0] || optDesc?.value || '');
        let descMatch = descStr.toLowerCase().includes(term);

        const transMap = parseTranslationsMap(rawItem?.translations ?? rawItem?.Translations);
        if (lang !== 'default' && transMap[lang]) {
          const trans = transMap[lang];
          if (trans.name && trans.name.toLowerCase().includes(term)) nameMatch = true;
          if (trans.description && trans.description.toLowerCase().includes(term)) descMatch = true;
        }

        if (!nameMatch && !descMatch) {
          return;
        }
      }

      // Price
      let price: number | null = null;
      const rawPrices = rawItem?.pricesPerVatDepartments ?? rawItem?.PricesPerVatDepartments;
      if (rawPrices && typeof rawPrices === 'object') {
        const vals = Object.values(rawPrices);
        if (vals.length > 0 && typeof vals[0] === 'number') {
          price = vals[0] as number;
        }
      }
      if (price === null) {
        const ord = rawItem?.optOrdinaryPrice ?? rawItem?.OptOrdinaryPrice ?? rawItem?.price ?? rawItem?.Price;
        if (typeof ord === 'number') {
          price = ord;
        } else if (ord && typeof ord === 'object') {
          price = ord.fields?.[0] ?? ord.value ?? null;
        }
      }

      // Description
      const optDesc = rawItem?.optDescription ?? rawItem?.OptDescription ?? rawItem?.description ?? rawItem?.Description ?? '';
      const description = typeof optDesc === 'string' ? optDesc : (optDesc?.fields?.[0] || optDesc?.value || '');

      results.push({
        name,
        category: category || 'Extra',
        orderIndex: 10000 + idx,
        description,
        price,
        imageUrl: null,
        available: true,
        allergens: parseAllergensMap(rawItem?.allergens ?? rawItem?.Allergens),
        translations: parseTranslationsMap(rawItem?.translations ?? rawItem?.Translations),
        isExtra: true,
      });
    });

    return results;
  });

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      this.restaurantId = params['restaurantId'] || '';
      const tableNumParam = params['tableNumber'];
      this.tableNumber = tableNumParam !== undefined && tableNumParam !== null && tableNumParam !== '' ? Number(tableNumParam) : null;
      this.tableId = params['tableId'] || '';

      this.initializeOrdering();
    });
  }

  ngOnDestroy(): void {
    if (this.confirmTimerId) clearInterval(this.confirmTimerId);
    if (this.toastTimeoutId) clearTimeout(this.toastTimeoutId);
    if (this.pollingIntervalId) clearInterval(this.pollingIntervalId);
  }

  private initializeOrdering(): void {
    if (!this.restaurantId) {
      this.errorMessage.set('Parametro ID Ristorante mancante o non valido.');
      this.isLoading.set(false);
      return;
    }

    if (this.tableNumber === null || isNaN(this.tableNumber) || this.tableNumber <= 0) {
      this.errorMessage.set('Numero del tavolo non valido o mancante.');
      this.isLoading.set(false);
      return;
    }

    if (!this.tableId) {
      this.errorMessage.set('ID univoco del tavolo non valido o non corrispondente.');
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);
    this.loadRestaurantData(() => {
      this.checkAndInitSession();
    });
  }

  private loadRestaurantData(onSuccess?: () => void): void {
    this.restaurantService.getRestaurantPublic(this.restaurantId).subscribe({
      next: (rest) => {
        this.restaurant.set(rest);

        // Verify table match
        const parsedTables: TableModel[] = rest.parsedTables || [];
        const matched = parsedTables.find((t) => t.tableNumber === this.tableNumber);

        if (!matched) {
          this.errorMessage.set(`Tavolo ${this.tableNumber} non trovato nel ristorante.`);
          this.isLoading.set(false);
          return;
        }

        if (this.tableId && matched.tableId && matched.tableId.toLowerCase() !== this.tableId.toLowerCase()) {
          this.errorMessage.set('Tavolo non corrispondente al QR code fornito.');
          this.isLoading.set(false);
          return;
        }

        this.matchedTable.set(matched);
        this.additionalInfo.set(matched.additionalInfo || null);
        this.updateSessionOrdersFromTable(matched);

        // Load Extra Catalogue if enabled
        if (rest.extraCatalogueSetting && rest.extraCatalogueSetting.isEnabled) {
          this.restaurantService.getExtraCatalogue(this.restaurantId).subscribe({
            next: (extraCat) => {
              this.extraCatalogue.set(extraCat);
            },
            error: () => {
              // Silently ignore if extra catalogue cannot be fetched
              this.extraCatalogue.set(null);
            },
          });
        }

        // Check whether Stripe online payments are enabled globally
        this.restaurantService.getStripeEnabled().subscribe({
          next: (enabled) => {
            this.isStripeConfigEnabled.set(enabled);
          },
          error: () => {
            this.isStripeConfigEnabled.set(true);
          },
        });

        this.isLoading.set(false);
        if (onSuccess) onSuccess();
      },
      error: (err) => {
        this.errorMessage.set(`Errore caricamento menu: ${err?.message || 'Server non raggiungibile'}`);
        this.isLoading.set(false);
      },
    });
  }

  private checkAndInitSession(): void {
    try {
      const stored = localStorage.getItem('session_id');
      if (stored) {
        this.sessionId.set(stored);
        this.connectSession();
      } else {
        this.showSessionConsentModal.set(true);
      }
    } catch {
      this.showSessionConsentModal.set(true);
    }
  }

  agreeToSessionConsent(): void {
    try {
      const newSess = crypto.randomUUID();
      localStorage.setItem('session_id', newSess);
      this.sessionId.set(newSess);
    } catch {
      this.sessionId.set(crypto.randomUUID());
    }

    this.showSessionConsentModal.set(false);
    this.connectSession();
  }

  private connectSession(): void {
    const sess = this.sessionId();
    const tbl = this.matchedTable();
    if (!sess || !tbl || this.tableNumber === null) return;

    this.restaurantService
      .attachSessionToTable(this.restaurantId, this.tableNumber, tbl.tableId, sess)
      .subscribe({
        next: () => {
          this.refreshOrders();
          this.startOrderPolling();
        },
        error: (err) => {
          const errStr = typeof err?.error === 'string' ? err.error : err?.message || '';
          if (errStr.toLowerCase().includes('already attached') || errStr.toLowerCase().includes('duplicate')) {
            // Re-generate session ID and retry once
            const newSess = crypto.randomUUID();
            try {
              localStorage.setItem('session_id', newSess);
            } catch {}
            this.sessionId.set(newSess);
            this.restaurantService
              .attachSessionToTable(this.restaurantId, this.tableNumber!, tbl.tableId, newSess)
              .subscribe({
                next: () => {
                  this.refreshOrders();
                  this.startOrderPolling();
                },
                error: (e) => {
                  this.errorMessage.set(`Impossibile agganciare la sessione al tavolo: ${e?.error || e?.message}`);
                },
              });
          } else {
            this.errorMessage.set(`Impossibile agganciare la sessione al tavolo: ${errStr}`);
          }
        },
      });
  }

  private startOrderPolling(): void {
    if (this.pollingIntervalId) clearInterval(this.pollingIntervalId);
    this.pollingIntervalId = setInterval(() => {
      this.refreshOrders();
    }, 5000);
  }

  refreshOrders(): void {
    if (!this.restaurantId) return;
    this.restaurantService.getRestaurantPublic(this.restaurantId).subscribe({
      next: (rest) => {
        this.restaurant.set(rest);
        const parsedTables: TableModel[] = rest.parsedTables || [];
        const matched = parsedTables.find((t) => t.tableNumber === this.tableNumber);
        if (matched) {
          this.matchedTable.set(matched);
          this.updateSessionOrdersFromTable(matched);
        }
      },
    });
  }

  private updateSessionOrdersFromTable(table: TableModel): void {
    const currentSess = this.sessionId();
    if (!currentSess || !table.sessions) return;

    const matchedSess = table.sessions.find((s) => s.sessionId === currentSess);
    if (matchedSess) {
      this.sessionItems.set(matchedSess.items || []);
      this.aggregatedSessionItems.set(matchedSess.aggregatedItems || []);
      this.currentFiscalMetadata.set(matchedSess.fiscalMetadata || null);

      if (matchedSess.fiscalMetadata) {
        if (matchedSess.fiscalMetadata.isCodiceFiscale) {
          this.selectedFiscalOption = 'cf';
          this.fiscalInputText = matchedSess.fiscalMetadata.value;
        } else if (matchedSess.fiscalMetadata.isCodiceLotteria) {
          this.selectedFiscalOption = 'lotteria';
          this.fiscalInputText = matchedSess.fiscalMetadata.value;
        }
      } else if (!this.isFiscalEditOpen()) {
        this.selectedFiscalOption = 'none';
        this.fiscalInputText = '';
      }
    } else {
      this.sessionItems.set([]);
      this.aggregatedSessionItems.set([]);
      this.currentFiscalMetadata.set(null);
    }
  }

  // --- Order item actions ---

  addItem(itemName: string): void {
    const sess = this.sessionId();
    const tbl = this.matchedTable();
    if (!sess || !tbl || this.tableNumber === null) return;

    this.isBusy.set(true);
    this.actionError.set(null);

    this.restaurantService
      .addMenuItemPerSession(this.restaurantId, this.tableNumber, tbl.tableId, sess, itemName)
      .subscribe({
        next: () => {
          this.showToast(`${itemName} • ${this.loc.translate('Order_AddedToast')}`);
          this.refreshOrders();
          this.isBusy.set(false);
        },
        error: (err) => {
          this.actionError.set(err?.error || err?.message || 'Errore aggiunta piatto');
          this.isBusy.set(false);
        },
      });
  }

  removeItem(itemName: string): void {
    const sess = this.sessionId();
    const tbl = this.matchedTable();
    if (!sess || !tbl || this.tableNumber === null) return;

    this.isBusy.set(true);
    this.actionError.set(null);

    this.restaurantService
      .removeMenuItemPerSession(this.restaurantId, this.tableNumber, tbl.tableId, sess, itemName)
      .subscribe({
        next: () => {
          this.refreshOrders();
          this.isBusy.set(false);
        },
        error: (err) => {
          this.actionError.set(err?.error || err?.message || 'Errore rimozione piatto');
          this.isBusy.set(false);
        },
      });
  }

  getPendingQuantity(itemName: string): number {
    const found = this.aggregatedSessionItems().find((i) => i.dishName === itemName && i.isPending);
    return found ? found.quantity : 0;
  }

  getItemUnitPrice(itemName: string): number {
    const rest = this.restaurant();
    if (rest && rest.items) {
      const found = rest.items.find((i) => i.name.toLowerCase() === itemName.toLowerCase());
      if (found && found.price !== null) return found.price;
    }

    // Check Extra Catalogue
    const extraCat = this.extraCatalogue();
    if (extraCat) {
      const rawItems = extraCat.extraCatalogueMenuItems ?? extraCat.ExtraCatalogueMenuItems ?? [];
      if (Array.isArray(rawItems)) {
        const foundExtra = rawItems.find((i: any) => (i?.name ?? i?.Name ?? '').toLowerCase() === itemName.toLowerCase());
        if (foundExtra) {
          const rawPrices = foundExtra.pricesPerVatDepartments ?? foundExtra.PricesPerVatDepartments;
          if (rawPrices && typeof rawPrices === 'object') {
            const vals = Object.values(rawPrices);
            if (vals.length > 0 && typeof vals[0] === 'number') {
              return vals[0] as number;
            }
          }
          const ord = foundExtra.optOrdinaryPrice ?? foundExtra.OptOrdinaryPrice;
          if (typeof ord === 'number') return ord;
          if (ord && typeof ord === 'object') return ord.fields?.[0] ?? ord.value ?? 0;
        }
      }
    }

    return 0;
  }

  private calculateSubtotal(onlyPending: boolean): number {
    let total = 0;
    const items = onlyPending
      ? this.aggregatedSessionItems().filter((i) => i.isPending)
      : this.aggregatedSessionItems();

    for (const item of items) {
      total += this.getItemUnitPrice(item.dishName) * item.quantity;
    }
    return total;
  }

  getEffectiveSeatingFee(): number {
    const rest = this.restaurant();
    const tbl = this.matchedTable();
    if (!rest || !tbl || tbl.skipSeatFee) return 0;

    // Check if seating fee already paid in raw table session
    const rawTables = rest.raw?.tables ?? rest.raw?.Tables;
    if (rawTables && typeof rawTables === 'object') {
      const t = Array.isArray(rawTables)
        ? rawTables.find((entry: any) => (entry?.[0] || entry?.key) === this.tableNumber)?.[1]
        : rawTables[this.tableNumber!];
      const paidSess = t?.seatingFeePaidSessions ?? t?.SeatingFeePaidSessions;
      const sess = this.sessionId();
      if (sess && Array.isArray(paidSess) && paidSess.includes(sess)) {
        return 0;
      }
    }
    return rest.seatingFee ?? 0;
  }

  getPaymentItemsBreakdown(): PaymentBreakdownItem[] {
    const result: PaymentBreakdownItem[] = [];
    const pending = this.aggregatedSessionItems().filter((i) => i.isPending);

    for (const item of pending) {
      const unit = this.getItemUnitPrice(item.dishName);
      result.push({
        itemName: item.dishName,
        qty: item.quantity,
        unitPrice: unit,
        lineTotal: unit * item.quantity,
      });
    }
    return result;
  }

  // --- Confirmation & Undo Timer ---

  startConfirmTimer(): void {
    if (this.confirmCountdown() > 0) return;
    this.confirmCountdown.set(5);

    if (this.confirmTimerId) clearInterval(this.confirmTimerId);

    this.confirmTimerId = setInterval(() => {
      const current = this.confirmCountdown();
      if (current <= 1) {
        clearInterval(this.confirmTimerId);
        this.confirmCountdown.set(0);
        this.fireConfirmOrder();
      } else {
        this.confirmCountdown.set(current - 1);
      }
    }, 1000);
  }

  undoConfirm(): void {
    if (this.confirmTimerId) {
      clearInterval(this.confirmTimerId);
      this.confirmTimerId = null;
    }
    this.confirmCountdown.set(0);
  }

  private fireConfirmOrder(): void {
    const sess = this.sessionId();
    const tbl = this.matchedTable();
    if (!sess || !tbl || this.tableNumber === null) return;

    this.isBusy.set(true);
    this.actionError.set(null);

    // Save pending items snapshot
    const pending = this.aggregatedSessionItems()
      .filter((i) => i.isPending)
      .map((i) => ({ qty: i.quantity, itemName: i.dishName }));

    this.restaurantService
      .confirmOrdersPerSession2(this.restaurantId, this.tableNumber, tbl.tableId, sess)
      .subscribe({
        next: () => {
          this.isOrderDrawerOpen.set(false);
          this.newlyConfirmedItems.set(pending);
          this.refreshOrders();
          this.showToast('Ordine inviato alla cucina con successo!');
          this.isBusy.set(false);
        },
        error: (err) => {
          this.actionError.set(err?.error || err?.message || "Errore durante l'invio dell'ordine");
          this.isBusy.set(false);
        },
      });
  }

  // --- Fiscal metadata ---

  saveFiscalMetadata(): void {
    const sess = this.sessionId();
    const tbl = this.matchedTable();
    if (!sess || !tbl || this.tableNumber === null) return;

    this.fiscalErrorMessage.set(null);
    this.isBusy.set(true);

    if (this.selectedFiscalOption === 'none') {
      this.restaurantService
        .unsetFiscalMetadataPerSession(this.restaurantId, this.tableNumber, tbl.tableId, sess)
        .subscribe({
          next: () => {
            this.currentFiscalMetadata.set(null);
            this.isFiscalEditOpen.set(false);
            this.refreshOrders();
            this.isBusy.set(false);
          },
          error: (err) => {
            this.fiscalErrorMessage.set(err?.error || err?.message || 'Errore rimozione scontrino');
            this.isBusy.set(false);
          },
        });
    } else if (this.selectedFiscalOption === 'cf') {
      const clean = (this.fiscalInputText || '').trim().toUpperCase();
      if (clean.length !== 16) {
        this.fiscalErrorMessage.set('Il Codice Fiscale deve contenere esattamente 16 caratteri.');
        this.isBusy.set(false);
        return;
      }
      this.restaurantService
        .setFiscalMetadataPerSession(this.restaurantId, this.tableNumber, tbl.tableId, sess, clean, undefined)
        .subscribe({
          next: () => {
            this.currentFiscalMetadata.set({ isCodiceFiscale: true, isCodiceLotteria: false, value: clean });
            this.isFiscalEditOpen.set(false);
            this.refreshOrders();
            this.isBusy.set(false);
          },
          error: (err) => {
            this.fiscalErrorMessage.set(err?.error || err?.message || 'Errore salvataggio Codice Fiscale');
            this.isBusy.set(false);
          },
        });
    } else if (this.selectedFiscalOption === 'lotteria') {
      const clean = (this.fiscalInputText || '').trim().toUpperCase();
      if (clean.length !== 8) {
        this.fiscalErrorMessage.set('Il Codice Lotteria deve contenere esattamente 8 caratteri.');
        this.isBusy.set(false);
        return;
      }
      this.restaurantService
        .setFiscalMetadataPerSession(this.restaurantId, this.tableNumber, tbl.tableId, sess, undefined, clean)
        .subscribe({
          next: () => {
            this.currentFiscalMetadata.set({ isCodiceFiscale: false, isCodiceLotteria: true, value: clean });
            this.isFiscalEditOpen.set(false);
            this.refreshOrders();
            this.isBusy.set(false);
          },
          error: (err) => {
            this.fiscalErrorMessage.set(err?.error || err?.message || 'Errore salvataggio Codice Lotteria');
            this.isBusy.set(false);
          },
        });
    }
  }

  // --- Voting ---

  voteItem(itemName: string, rating: number): void {
    const sess = this.sessionId();
    if (!sess) return;

    this.isBusy.set(true);
    this.restaurantService.voteMenuItem(this.restaurantId, itemName, sess, rating).subscribe({
      next: () => {
        this.showToast(`Grazie per aver votato (${rating} ★)!`);
        this.refreshOrders();
        this.isBusy.set(false);
      },
      error: (err) => {
        this.actionError.set(err?.error || err?.message || 'Errore durante la votazione');
        this.isBusy.set(false);
      },
    });
  }

  // --- Leave / Detach Table ---

  detachSession(): void {
    const sess = this.sessionId();
    if (!sess) return;

    if (confirm('Sei sicuro di voler lasciare il tavolo? Tutti i tuoi dati di sessione verranno azzerati.')) {
      this.restaurantService.detachSessionFromTable(this.restaurantId, sess).subscribe({
        next: () => {
          try {
            localStorage.removeItem('session_id');
          } catch {}
          this.sessionId.set(null);
          this.sessionItems.set([]);
          this.aggregatedSessionItems.set([]);
          this.showToast('Sessione rilasciata.');
          setTimeout(() => {
            this.showSessionConsentModal.set(true);
          }, 1500);
        },
        error: (err) => {
          this.actionError.set(err?.error || err?.message || 'Errore rilascio sessione');
        },
      });
    }
  }

  // --- Allergens modal ---

  openAllergensModal(itemName: string, allergens?: Record<string, string>): void {
    this.selectedItemForAllergens.set(itemName);
    const list: string[] = [];
    if (allergens) {
      const currentMenuLang = (this.selectedLang() || 'default').toLowerCase();
      let allergensStr = '';

      if (currentMenuLang !== 'default' && allergens[currentMenuLang] && allergens[currentMenuLang].trim()) {
        allergensStr = allergens[currentMenuLang];
      } else if (allergens['en'] && allergens['en'].trim()) {
        allergensStr = allergens['en'];
      } else if (allergens['it'] && allergens['it'].trim()) {
        allergensStr = allergens['it'];
      } else {
        allergensStr = Object.values(allergens).find((v) => typeof v === 'string' && v.trim()) ?? '';
      }

      if (allergensStr) {
        allergensStr.split(',').forEach((a) => {
          const clean = a.trim();
          if (clean && !list.includes(clean)) list.push(clean);
        });
      }
    }
    this.selectedItemAllergens.set(list);
    this.showAllergensModal.set(true);
  }

  closeAllergensModal(): void {
    this.showAllergensModal.set(false);
  }

  // --- Self-ordering permission checks ---

  isSelfOrderingEnabled(): boolean {
    const rest = this.restaurant();
    const tbl = this.matchedTable();
    if (!rest) return false;
    if (tbl && tbl.overwriteSelfOrderingConfig) {
      return tbl.overwriteSelfOrderingConfig.mode !== 'no';
    }
    return rest.selfOrderingConfig?.mode !== 'no';
  }

  isCashSelfOrderingAllowed(): boolean {
    const rest = this.restaurant();
    const tbl = this.matchedTable();
    if (!rest) return false;
    const cfg = tbl?.overwriteSelfOrderingConfig || rest.selfOrderingConfig;
    if (!cfg) return true;
    return cfg.mode === 'cash-only' || cfg.mode === 'cache-and-stripe';
  }

  isStripeSelfOrderingAllowed(): boolean {
    const rest = this.restaurant();
    const tbl = this.matchedTable();
    if (!rest) return false;
    const cfg = tbl?.overwriteSelfOrderingConfig || rest.selfOrderingConfig;
    if (!cfg) return false;
    return cfg.mode === 'only-stripe' || cfg.mode === 'cache-and-stripe';
  }

  toggleOnlinePaymentBlock(): void {
    this.showOnlinePaymentBlock.set(!this.showOnlinePaymentBlock());
  }

  // --- Tips ---

  selectTipPercentage(pct: number): void {
    this.selectedTipMode = 'percentage';
    this.selectedTipPercentage = pct;
    this.isHighTipConfirmed = false;
  }

  selectTipMode(mode: 'none' | 'percentage' | 'custom_percentage' | 'fixed'): void {
    this.selectedTipMode = mode;
    if (mode === 'none') {
      this.selectedTipPercentage = 0;
      this.customTipPercentageInput = null;
      this.customTipFixedInput = null;
    } else if (mode === 'custom_percentage' && !this.customTipPercentageInput) {
      this.customTipPercentageInput = 10;
    } else if (mode === 'fixed' && !this.customTipFixedInput) {
      this.customTipFixedInput = 2.0;
    }
    this.isHighTipConfirmed = false;
  }

  getSelectedTipAmount(): number {
    const sub = this.pendingSubtotal();
    if (this.selectedTipMode === 'percentage' && this.selectedTipPercentage > 0) {
      return Math.round(sub * (this.selectedTipPercentage / 100) * 100) / 100;
    }
    if (this.selectedTipMode === 'custom_percentage' && this.customTipPercentageInput && this.customTipPercentageInput > 0) {
      return Math.round(sub * (this.customTipPercentageInput / 100) * 100) / 100;
    }
    if (this.selectedTipMode === 'fixed' && this.customTipFixedInput && this.customTipFixedInput > 0) {
      return Math.round(this.customTipFixedInput * 100) / 100;
    }
    return 0;
  }

  isTipOver50Percent(): boolean {
    const sub = this.pendingSubtotal();
    if (sub <= 0) return false;
    return this.getSelectedTipAmount() / sub > 0.5;
  }

  // --- UI Helpers ---

  getItemName(item: MenuItemModel): string {
    const lang = (this.selectedLang() || 'default').toLowerCase();
    if (lang !== 'default' && item.translations) {
      const trans = item.translations[lang];
      if (trans && trans.name && trans.name.trim()) {
        return trans.name;
      }
    }
    return item.name;
  }

  getItemDescription(item: MenuItemModel): string {
    const lang = (this.selectedLang() || 'default').toLowerCase();
    if (lang !== 'default' && item.translations) {
      const trans = item.translations[lang];
      if (trans && trans.description && trans.description.trim()) {
        return trans.description;
      }
    }
    return item.description;
  }

  hasAllergens(item: MenuItemModel): boolean {
    return !!item.allergens && Object.values(item.allergens).some((v) => !!v && v.trim() !== '');
  }

  getItemRatingDisplay(itemName: string): string | null {
    const rest = this.restaurant();
    if (!rest || !rest.items) return null;
    const item = rest.items.find((i) => i.name.toLowerCase() === itemName.toLowerCase());
    if (item && item.ratingStats && item.ratingStats.mean > 0) {
      return `Media: ${item.ratingStats.mean.toFixed(1)} ★ (±${item.ratingStats.stdDev.toFixed(1)})`;
    }
    return null;
  }

  showToast(msg: string): void {
    this.toastMessage.set(msg);
    if (this.toastTimeoutId) clearTimeout(this.toastTimeoutId);
    this.toastTimeoutId = setTimeout(() => {
      this.toastMessage.set(null);
    }, 2500);
  }

  // --- Extra Catalogue Actions ---

  toggleExtraSearch(enabled: boolean): void {
    this.isExtraSearchEnabled.set(enabled);
    if (!enabled) {
      this.extraSearchTerm.set('');
      this.selectedExtraCategories.set(new Set());
    }
  }

  toggleExtraCategory(category: string, isChecked: boolean): void {
    const updated = new Set(this.selectedExtraCategories());
    if (isChecked) {
      updated.add(category);
    } else {
      updated.delete(category);
    }
    this.selectedExtraCategories.set(updated);
  }

  isCategorySelected(category: string): boolean {
    return this.selectedExtraCategories().has(category);
  }

  clearExtraSearch(): void {
    this.extraSearchTerm.set('');
  }

  showExplicitTipForm = signal(false);
  webhookListenerWarning = signal<string | null>(null);

  toggleExplicitTipForm(): void {
    this.showExplicitTipForm.set(!this.showExplicitTipForm());
  }

  // --- Stripe Online Card Payment ---

  private stripeInstance: any = null;
  private stripeElements: any = null;
  private stripePaymentElement: any = null;

  handleCreatePaymentIntent(): void {
    const tbl = this.matchedTable();
    const sess = this.sessionId();
    if (!tbl || !sess || this.tableNumber === null) return;

    this.isBusy.set(true);
    this.paymentIntentStatus.set(null);
    this.paymentIntentDetail.set(null);

    const subtotal = this.pendingSubtotal();
    const seatFee = this.getEffectiveSeatingFee();
    const tip = this.getSelectedTipAmount();
    const grand = subtotal + seatFee + tip;

    const amountInCents = grand > 0 ? Math.round(grand * 100) : 1000;
    const tipInCents = Math.round(tip * 100);

    const itemsSummary = this.aggregatedSessionItems()
      .filter((i) => i.isPending)
      .map((i) => `${i.dishName} (x${i.quantity})`)
      .join(', ');

    this.restaurantService
      .createPaymentIntent(
        this.restaurantId,
        this.tableNumber,
        tbl.tableId,
        amountInCents,
        'eur',
        sess,
        itemsSummary,
        tipInCents
      )
      .subscribe({
        next: (clientSecret) => {
          this.paymentIntentStatus.set('In attesa di autorizzazione');
          this.paymentIntentDetail.set('Inserisci i dettagli della carta per autorizzare il pagamento.');
          this.showStripeElement.set(true);

          this.restaurantService.getStripePublishableKey().subscribe({
            next: (pubKey) => {
              this.mountStripeElement(pubKey, clientSecret);
            },
            error: (err) => {
              this.paymentIntentStatus.set('Errore');
              this.paymentIntentDetail.set(`Errore recupero chiave Stripe: ${err?.message || err}`);
              this.isBusy.set(false);
            },
          });
        },
        error: (err) => {
          this.paymentIntentStatus.set('Errore');
          this.paymentIntentDetail.set(`Creazione PaymentIntent fallita: ${err?.error || err?.message}`);
          this.showStripeElement.set(false);
          this.isBusy.set(false);
        },
      });
  }

  private mountStripeElement(publishableKey: string, clientSecret: string): void {
    if (typeof (window as any).Stripe === 'undefined') {
      this.paymentIntentDetail.set('Libreria Stripe.js non caricata.');
      this.isBusy.set(false);
      return;
    }

    try {
      const rest = this.restaurant();
      const connectedAccountId = rest?.paymentConfig?.stripeAccountId || null;
      const stripeOptions = connectedAccountId ? { stripeAccount: connectedAccountId } : {};

      this.stripeInstance = (window as any).Stripe(publishableKey, stripeOptions);

      const elementsOptions = {
        clientSecret,
        wallets: {
          applePay: 'auto',
          googlePay: 'auto',
        },
      };

      this.stripeElements = this.stripeInstance.elements(elementsOptions);
      this.stripePaymentElement = this.stripeElements.create('payment');

      setTimeout(() => {
        const container = document.getElementById('stripe-payment-element-container');
        if (container) {
          container.innerHTML = '';
          this.stripePaymentElement.mount('#stripe-payment-element-container');
        }
        this.isBusy.set(false);
      }, 150);
    } catch (e: any) {
      this.paymentIntentDetail.set(`Errore mount Stripe Element: ${e?.message || e}`);
      this.isBusy.set(false);
    }
  }

  handleConfirmStripePayment(): void {
    if (!this.stripeInstance || !this.stripeElements) {
      this.paymentIntentStatus.set('Errore');
      this.paymentIntentDetail.set('Modulo Stripe non inizializzato.');
      return;
    }

    this.isBusy.set(true);

    const pending = this.aggregatedSessionItems()
      .filter((i) => i.isPending)
      .map((i) => ({ qty: i.quantity, itemName: i.dishName }));

    this.stripeInstance
      .confirmPayment({
        elements: this.stripeElements,
        confirmParams: {
          return_url: window.location.href,
        },
        redirect: 'if_required',
      })
      .then((res: any) => {
        if (res.error) {
          this.paymentIntentStatus.set('Pagamento non riuscito');
          this.paymentIntentDetail.set(res.error.message || 'Autorizzazione carta fallita.');
          this.isBusy.set(false);
        } else {
          this.paymentIntentStatus.set('Pagamento Autorizzato');
          this.paymentIntentDetail.set('Il pre-addebito è stato autorizzato! Il ristorante confermerà la presa in carico del tuo ordine.');
          this.showStripeElement.set(false);
          this.newlyConfirmedItems.set(pending);

          // Check if webhook updates status after a few seconds
          setTimeout(() => {
            this.refreshOrders();
            if (this.aggregatedSessionItems().some((o) => o.isPending)) {
              this.webhookListenerWarning.set('⚠️ Se in ambiente locale, verifica che stripe listen inoltri gli eventi webhook al server.');
            }
          }, 3500);

          this.isBusy.set(false);
        }
      })
      .catch((err: any) => {
        this.paymentIntentStatus.set('Errore');
        this.paymentIntentDetail.set(err?.message || 'Errore durante la conferma del pagamento.');
        this.isBusy.set(false);
      });
  }

  goToPaymentSection(): void {
    this.isOrderDrawerOpen.set(false);
    const el = document.getElementById('order-panel-root');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }
}

