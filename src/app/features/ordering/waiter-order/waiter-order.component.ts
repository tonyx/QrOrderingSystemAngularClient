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
  comment?: string | null;
  primaryItemId?: string | null;
}

@Component({
  selector: 'app-waiter-order',
  standalone: true,
  imports: [CommonModule, FormsModule, LocPipe, CultureSelectorComponent],
  templateUrl: './waiter-order.component.html',
  styleUrls: ['./waiter-order.component.css'],
})
export class WaiterOrderComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly restaurantService = inject(RestaurantService);
  readonly loc = inject(LocalizationService);

  // Query Params (supports both PascalCase and camelCase)
  restaurantId = '';
  tableNumber: number | null = null;
  tableId = '';

  // State signals
  isLoading = signal(true);
  isBusy = signal(false);
  errorMessage = signal<string | null>(null);
  actionError = signal<string | null>(null);
  seatCreationError = signal<string | null>(null);
  toastMessage = signal<string | null>(null);

  // Restaurant & Table
  restaurant = signal<PublicRestaurantDetails | null>(null);
  matchedTable = signal<TableModel | null>(null);
  additionalInfo = signal<string | null>(null);

  // Active Sessions
  activeSessions = signal<string[]>([]);
  selectedSessionId = signal<string | null>(null);

  // Orders in currently selected session
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

  // Comment Modal State
  isCommentModalOpen = signal(false);
  isAddingNewItemWithComment = signal(false);
  commentModalItemName = signal<string>('');
  commentModalOrderItemId = signal<string | null>(null);
  commentInputText = '';
  commentModalError = signal<string | null>(null);

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

  // Polling & Toast timers
  private pollingIntervalId: any = null;
  private toastTimerId: any = null;

  // Computed Menu Categories
  categories = computed<GroupedCategory[]>(() => {
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

  // Extra Catalogue categories & items
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

  filteredExtraItems = computed<MenuItemModel[]>(() => {
    const cat = this.extraCatalogue();
    if (!cat || !this.isExtraSearchEnabled()) return [];

    const rawItems: any[] = cat.extraCatalogueMenuItems ?? cat.ExtraCatalogueMenuItems ?? [];
    if (!Array.isArray(rawItems)) return [];

    const term = this.extraSearchTerm().toLowerCase().trim();
    const selectedCats = this.selectedExtraCategories();

    return rawItems
      .filter((it) => {
        if (it.available === false || it.Available === false) return false;
        const optCat = it.optCategory ?? it.OptCategory ?? it.category ?? it.Category;
        const itemCat = typeof optCat === 'string' ? optCat.trim() : (optCat?.fields?.[0] || optCat?.value || '').trim();

        if (selectedCats.size > 0 && !selectedCats.has(itemCat)) {
          return false;
        }

        if (term) {
          const name = String(it.name || it.Name || '').toLowerCase();
          const desc = String(it.description || it.Description || '').toLowerCase();
          return name.includes(term) || desc.includes(term);
        }

        return selectedCats.size > 0;
      })
      .map((it, idx) => {
        const name = String(it.name || it.Name || '');
        const desc = String(it.description || it.Description || '');
        const price = it.price ?? it.Price ?? it.optOrdinaryPrice ?? it.OptOrdinaryPrice ?? null;
        const allergens = parseAllergensMap(it.allergens || it.Allergens);
        const translations = parseTranslationsMap(it.translations || it.Translations);

        return {
          name,
          category: it.category || it.Category || 'Extra',
          orderIndex: 10000 + idx,
          description: desc,
          price: price !== null ? Number(price) : null,
          available: true,
          allergens,
          translations,
          isExtra: true,
          imageUrl: it.imageUrl || it.ImageUrl || null,
        } as MenuItemModel;
      });
  });

  autocompleteSuggestions = computed<string[]>(() => {
    const extraCat = this.extraCatalogue();
    const term = this.extraSearchTerm().toLowerCase().trim();
    if (!extraCat || !term) return [];

    const items: any[] = extraCat.extraCatalogueMenuItems ?? extraCat.ExtraCatalogueMenuItems ?? [];
    if (!Array.isArray(items)) return [];
    const suggestions = new Set<string>();

    for (const it of items) {
      const name = String(it.name || it.Name || '');
      if (name.toLowerCase().includes(term)) {
        suggestions.add(name);
        if (suggestions.size >= 10) break;
      }
    }

    return Array.from(suggestions);
  });

  totalPendingCount = computed<number>(() => {
    return this.aggregatedSessionItems()
      .filter((i) => i.isPending)
      .reduce((sum, i) => sum + i.quantity, 0);
  });

  orderSubtotal = computed<number>(() => {
    let sum = 0;
    this.sessionItems()
      .filter((i) => i.isPending)
      .forEach((item) => {
        sum += this.getItemUnitPrice(item.dishName);
      });
    return sum;
  });

  paymentBreakdown = computed<PaymentBreakdownItem[]>(() => {
    const agg = this.aggregatedSessionItems().filter((i) => i.isPending);
    return agg.map((a) => {
      const unit = this.getItemUnitPrice(a.dishName);
      return {
        itemName: a.dishName,
        qty: a.quantity,
        unitPrice: unit,
        lineTotal: unit * a.quantity,
        comment: a.comment || null,
        primaryItemId: a.itemIds && a.itemIds.length > 0 ? a.itemIds[0] : null,
      };
    });
  });

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    this.restaurantId = qp.get('restaurantId') || qp.get('RestaurantId') || '';
    const tableNumStr = qp.get('tableNumber') || qp.get('TableNumber');
    this.tableNumber = tableNumStr ? parseInt(tableNumStr, 10) : null;
    this.tableId = qp.get('tableId') || qp.get('TableId') || '';

    if (!this.restaurantId) {
      this.errorMessage.set('Invalid Restaurant ID.');
      this.isLoading.set(false);
      return;
    }
    if (!this.tableNumber || this.tableNumber <= 0) {
      this.errorMessage.set('Invalid Table Number.');
      this.isLoading.set(false);
      return;
    }
    if (!this.tableId) {
      this.errorMessage.set('Invalid Table ID code.');
      this.isLoading.set(false);
      return;
    }

    this.loadRestaurantData();
    this.startPolling();
  }

  ngOnDestroy(): void {
    if (this.pollingIntervalId) clearInterval(this.pollingIntervalId);
    if (this.confirmTimerId) clearInterval(this.confirmTimerId);
    if (this.toastTimerId) clearTimeout(this.toastTimerId);
  }

  private loadRestaurantData(): void {
    const tableSession =
      this.tableNumber !== null && this.tableId
        ? {
            tableNum: this.tableNumber,
            tableId: this.tableId,
            sessionId: this.selectedSessionId() || undefined,
          }
        : undefined;

    this.restaurantService.getRestaurantPublic(this.restaurantId, tableSession).subscribe({
      next: (rest) => {
        this.restaurant.set(rest);

        const parsedTables: TableModel[] = rest.parsedTables || [];
        const matched = parsedTables.find((t) => t.tableNumber === this.tableNumber);

        if (!matched) {
          this.errorMessage.set(`Table #${this.tableNumber} does not exist in this restaurant.`);
          this.isLoading.set(false);
          return;
        }

        if (matched.tableId.toLowerCase() !== this.tableId.toLowerCase()) {
          this.errorMessage.set('Table ID mismatch. Please verify the QR code.');
          this.isLoading.set(false);
          return;
        }

        this.matchedTable.set(matched);
        this.additionalInfo.set(matched.additionalInfo || null);

        this.updateSessionsFromTable(matched);

        // Load extra catalogue if available
        this.restaurantService.getExtraCatalogue(this.restaurantId).subscribe({
          next: (extra) => {
            this.extraCatalogue.set(extra);
          },
          error: () => {},
        });

        this.isLoading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err?.error?.message || err?.message || 'Failed to load restaurant details.');
        this.isLoading.set(false);
      },
    });
  }

  private updateSessionsFromTable(table: TableModel): void {
    const sessions = (table.sessions || []).map((s) => s.sessionId);
    this.activeSessions.set(sessions);

    const currentSelected = this.selectedSessionId();
    if (currentSelected && sessions.includes(currentSelected)) {
      this.loadSessionOrders(currentSelected, table);
    } else if (sessions.length > 0) {
      this.selectSession(sessions[0], table);
    } else {
      this.selectedSessionId.set(null);
      this.sessionItems.set([]);
      this.aggregatedSessionItems.set([]);
      this.currentFiscalMetadata.set(null);
    }
  }

  selectSession(sessionId: string, table?: TableModel): void {
    this.selectedSessionId.set(sessionId);
    const targetTable = table || this.matchedTable();
    if (targetTable) {
      this.loadSessionOrders(sessionId, targetTable);
    }
  }

  private loadSessionOrders(sessionId: string, table: TableModel): void {
    const sess = (table.sessions || []).find((s) => s.sessionId === sessionId);
    if (sess) {
      this.sessionItems.set(sess.items || []);
      this.aggregatedSessionItems.set(sess.aggregatedItems || []);
      this.currentFiscalMetadata.set(sess.fiscalMetadata || null);

      if (sess.fiscalMetadata) {
        if (sess.fiscalMetadata.isCodiceFiscale) {
          this.selectedFiscalOption = 'cf';
          this.fiscalInputText = sess.fiscalMetadata.value;
        } else if (sess.fiscalMetadata.isCodiceLotteria) {
          this.selectedFiscalOption = 'lotteria';
          this.fiscalInputText = sess.fiscalMetadata.value;
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

  private startPolling(): void {
    if (this.pollingIntervalId) clearInterval(this.pollingIntervalId);
    this.pollingIntervalId = setInterval(() => {
      this.refreshOrders();
    }, 4000);
  }

  refreshOrders(): void {
    if (!this.restaurantId || !this.tableNumber) return;
    const tableSession =
      this.tableId
        ? {
            tableNum: this.tableNumber,
            tableId: this.tableId,
            sessionId: this.selectedSessionId() || undefined,
          }
        : undefined;

    this.restaurantService.getRestaurantPublic(this.restaurantId, tableSession).subscribe({
      next: (rest) => {
        this.restaurant.set(rest);
        const parsedTables: TableModel[] = rest.parsedTables || [];
        const matched = parsedTables.find((t) => t.tableNumber === this.tableNumber);
        if (matched) {
          this.matchedTable.set(matched);
          this.updateSessionsFromTable(matched);
        }
      },
    });
  }

  // --- Seat Management ---

  createVirtualSeat(): void {
    const rest = this.restaurant();
    const table = this.matchedTable();
    if (!rest || !table || !this.tableNumber) return;

    this.isBusy.set(true);
    this.seatCreationError.set(null);

    const currentSessionCount = (table.sessions || []).length;
    const currentMaxSessions = table.maxSessions || 4;

    const doAttach = () => {
      const newSessionId = this.generateUuid();
      this.restaurantService.attachSessionToTable(rest.restaurantId, this.tableNumber!, this.tableId, newSessionId).subscribe({
        next: () => {
          this.isBusy.set(false);
          this.selectedSessionId.set(newSessionId);
          this.showToast('New seat created!');
          this.refreshOrders();
        },
        error: (err) => {
          this.isBusy.set(false);
          this.seatCreationError.set(`Could not create seat: ${err?.error || err?.message || 'Error'}`);
        },
      });
    };

    if (currentSessionCount >= currentMaxSessions) {
      this.restaurantService.changeMaxSessions(rest.restaurantId, this.tableNumber, currentMaxSessions + 1).subscribe({
        next: () => {
          doAttach();
        },
        error: (err) => {
          this.isBusy.set(false);
          this.seatCreationError.set(`Could not increase seat limit: ${err?.error || err?.message || 'Error'}`);
        },
      });
    } else {
      doAttach();
    }
  }

  private ensureSeatAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.selectedSessionId()) {
        resolve(true);
        return;
      }

      const sessions = this.activeSessions();
      if (sessions.length > 0) {
        this.selectSession(sessions[0]);
        resolve(true);
        return;
      }

      // Auto create a seat
      const rest = this.restaurant();
      if (!rest || !this.tableNumber) {
        resolve(false);
        return;
      }

      const newSessionId = this.generateUuid();
      this.restaurantService.attachSessionToTable(rest.restaurantId, this.tableNumber, this.tableId, newSessionId).subscribe({
        next: () => {
          this.selectedSessionId.set(newSessionId);
          this.refreshOrders();
          resolve(true);
        },
        error: (err) => {
          this.actionError.set(`Could not create seat: ${err?.error || err?.message || 'Error'}`);
          resolve(false);
        },
      });
    });
  }

  getSelectedSeatLabel(): string {
    const current = this.selectedSessionId();
    if (!current) return '?';
    const sessions = this.activeSessions();
    const idx = sessions.indexOf(current);
    return idx >= 0 ? `Seat ${idx + 1}` : 'Seat ?';
  }

  // --- Cart & Order Actions ---

  async addItem(dishName: string): Promise<void> {
    const hasSeat = await this.ensureSeatAvailable();
    if (!hasSeat) return;

    const rest = this.restaurant();
    const sess = this.selectedSessionId();
    if (!rest || !this.tableNumber || !sess) return;

    this.isBusy.set(true);
    this.actionError.set(null);

    this.restaurantService.addMenuItemPerSession(rest.restaurantId, this.tableNumber, this.tableId, sess, dishName).subscribe({
      next: () => {
        this.isBusy.set(false);
        this.showToast(`${dishName} • Added`);
        this.refreshOrders();
      },
      error: (err) => {
        this.isBusy.set(false);
        this.actionError.set(err?.error || err?.message || 'Failed to add item');
      },
    });
  }

  removeItem(dishName: string, orderItemId?: string | null): void {
    const rest = this.restaurant();
    const sess = this.selectedSessionId();
    if (!rest || !this.tableNumber || !sess) return;

    this.isBusy.set(true);
    this.actionError.set(null);

    const req$ = orderItemId
      ? this.restaurantService.removeOrderItemById(rest.restaurantId, this.tableNumber, this.tableId, sess, orderItemId)
      : this.restaurantService.removeMenuItemPerSession(rest.restaurantId, this.tableNumber, this.tableId, sess, dishName);

    req$.subscribe({
      next: () => {
        this.isBusy.set(false);
        this.refreshOrders();
      },
      error: (err) => {
        this.isBusy.set(false);
        this.actionError.set(err?.error || err?.message || 'Failed to remove item');
      },
    });
  }

  // --- Comment / Note Modal Handlers ---

  openAddWithCommentModal(itemName: string): void {
    this.isAddingNewItemWithComment.set(true);
    this.commentModalItemName.set(itemName);
    this.commentModalOrderItemId.set(null);
    this.commentInputText = '';
    this.commentModalError.set(null);
    this.isCommentModalOpen.set(true);
  }

  openAddCommentModal(orderItemId: string, itemName: string): void {
    this.isAddingNewItemWithComment.set(false);
    this.commentModalItemName.set(itemName);
    this.commentModalOrderItemId.set(orderItemId);
    this.commentInputText = '';
    this.commentModalError.set(null);
    this.isCommentModalOpen.set(true);
  }

  openEditCommentModal(orderItemId: string, itemName: string, existingComment?: string | null): void {
    this.isAddingNewItemWithComment.set(false);
    this.commentModalItemName.set(itemName);
    this.commentModalOrderItemId.set(orderItemId);
    this.commentInputText = existingComment || '';
    this.commentModalError.set(null);
    this.isCommentModalOpen.set(true);
  }

  closeCommentModal(): void {
    if (this.isBusy()) return;
    this.isCommentModalOpen.set(false);
    this.commentModalItemName.set('');
    this.commentModalOrderItemId.set(null);
    this.commentInputText = '';
    this.commentModalError.set(null);
  }

  async handleSaveComment(): Promise<void> {
    const rest = this.restaurant();
    const sess = this.selectedSessionId();
    if (!rest || !this.tableNumber || !sess) return;

    this.commentModalError.set(null);
    const trimmed = (this.commentInputText || '').trim();

    if (this.isAddingNewItemWithComment()) {
      const itemName = this.commentModalItemName();
      if (!itemName) return;

      const hasSeat = await this.ensureSeatAvailable();
      if (!hasSeat) return;

      const activeSess = this.selectedSessionId();
      if (!activeSess) return;

      this.isBusy.set(true);
      const newOrderItemId = this.generateUuid();

      this.restaurantService
        .addOrderItem(rest.restaurantId, this.tableNumber, this.tableId, activeSess, newOrderItemId, itemName, trimmed || undefined)
        .subscribe({
          next: () => {
            this.isBusy.set(false);
            this.showToast(`${itemName} • Added`);
            this.closeCommentModal();
            this.refreshOrders();
          },
          error: (err) => {
            this.isBusy.set(false);
            this.commentModalError.set(err?.error || err?.message || 'Failed to add item with note');
          },
        });
    } else {
      const orderItemId = this.commentModalOrderItemId();
      if (!orderItemId) return;

      this.isBusy.set(true);
      const req$ = trimmed.length === 0
        ? this.restaurantService.unsetOrderItemComment(rest.restaurantId, this.tableNumber, this.tableId, sess, orderItemId)
        : this.restaurantService.setOrderItemComment(rest.restaurantId, this.tableNumber, this.tableId, sess, orderItemId, trimmed);

      req$.subscribe({
        next: () => {
          this.isBusy.set(false);
          this.closeCommentModal();
          this.refreshOrders();
        },
        error: (err) => {
          this.isBusy.set(false);
          this.commentModalError.set(err?.error || err?.message || 'Failed to save note');
        },
      });
    }
  }

  removeComment(orderItemId: string): void {
    const rest = this.restaurant();
    const sess = this.selectedSessionId();
    if (!rest || !this.tableNumber || !sess) return;

    this.isBusy.set(true);
    this.actionError.set(null);

    this.restaurantService.unsetOrderItemComment(rest.restaurantId, this.tableNumber, this.tableId, sess, orderItemId).subscribe({
      next: () => {
        this.isBusy.set(false);
        this.refreshOrders();
      },
      error: (err) => {
        this.isBusy.set(false);
        this.actionError.set(err?.error || err?.message || 'Failed to remove note');
      },
    });
  }

  getPendingQuantity(dishName: string): number {
    return this.sessionItems().filter((i) => i.dishName === dishName && i.isPending).length;
  }

  // --- Confirm Orders (with 5-second countdown & undo) ---

  startConfirmTimer(): void {
    if (this.confirmCountdown() > 0) return;

    this.confirmCountdown.set(5);
    this.confirmTimerId = setInterval(() => {
      const c = this.confirmCountdown();
      if (c <= 1) {
        clearInterval(this.confirmTimerId);
        this.confirmCountdown.set(0);
        this.fireConfirmOrder();
      } else {
        this.confirmCountdown.set(c - 1);
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
    const rest = this.restaurant();
    const sess = this.selectedSessionId();
    if (!rest || !this.tableNumber || !sess) return;

    this.isBusy.set(true);
    this.actionError.set(null);

    this.restaurantService.confirmOrdersPerSession2(rest.restaurantId, this.tableNumber, this.tableId, sess).subscribe({
      next: () => {
        this.isBusy.set(false);
        this.isOrderDrawerOpen.set(false);
        this.showToast('Order confirmed successfully!');
        this.refreshOrders();
      },
      error: (err) => {
        this.isBusy.set(false);
        this.actionError.set(err?.error || err?.message || 'Failed to confirm order');
      },
    });
  }

  // --- Fiscal Metadata ---

  handleSaveFiscalMetadata(): void {
    const rest = this.restaurant();
    const sess = this.selectedSessionId();
    if (!rest || !this.tableNumber || !sess) return;

    this.fiscalErrorMessage.set(null);
    this.isBusy.set(true);

    if (this.selectedFiscalOption === 'none') {
      this.restaurantService.unsetFiscalMetadataPerSession(rest.restaurantId, this.tableNumber, this.tableId, sess).subscribe({
        next: () => {
          this.isBusy.set(false);
          this.currentFiscalMetadata.set(null);
          this.fiscalInputText = '';
          this.isFiscalEditOpen.set(false);
          this.refreshOrders();
        },
        error: (err) => {
          this.isBusy.set(false);
          this.fiscalErrorMessage.set(err?.error || err?.message || 'Failed to unset fiscal metadata');
        },
      });
    } else if (this.selectedFiscalOption === 'cf') {
      const clean = (this.fiscalInputText || '').trim().toUpperCase();
      if (clean.length !== 16) {
        this.fiscalErrorMessage.set('Il Codice Fiscale deve contenere esattamente 16 caratteri.');
        this.isBusy.set(false);
        return;
      }

      this.restaurantService.setFiscalMetadataPerSession(rest.restaurantId, this.tableNumber, this.tableId, sess, clean, undefined).subscribe({
        next: () => {
          this.isBusy.set(false);
          this.currentFiscalMetadata.set({ isCodiceFiscale: true, isCodiceLotteria: false, value: clean });
          this.isFiscalEditOpen.set(false);
          this.refreshOrders();
        },
        error: (err) => {
          this.isBusy.set(false);
          this.fiscalErrorMessage.set(err?.error || err?.message || 'Failed to set Codice Fiscale');
        },
      });
    } else if (this.selectedFiscalOption === 'lotteria') {
      const clean = (this.fiscalInputText || '').trim().toUpperCase();
      if (clean.length !== 8) {
        this.fiscalErrorMessage.set('Il Codice Lotteria deve contenere esattamente 8 caratteri.');
        this.isBusy.set(false);
        return;
      }

      this.restaurantService.setFiscalMetadataPerSession(rest.restaurantId, this.tableNumber, this.tableId, sess, undefined, clean).subscribe({
        next: () => {
          this.isBusy.set(false);
          this.currentFiscalMetadata.set({ isCodiceFiscale: false, isCodiceLotteria: true, value: clean });
          this.isFiscalEditOpen.set(false);
          this.refreshOrders();
        },
        error: (err) => {
          this.isBusy.set(false);
          this.fiscalErrorMessage.set(err?.error || err?.message || 'Failed to set Codice Lotteria');
        },
      });
    }
  }

  // --- Extra Catalogue Search & Filtering ---

  onToggleExtraSearch(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.isExtraSearchEnabled.set(target.checked);
    if (!target.checked) {
      this.extraSearchTerm.set('');
      this.selectedExtraCategories.set(new Set());
    }
  }

  toggleExtraCategory(category: string, isChecked: boolean): void {
    const s = new Set(this.selectedExtraCategories());
    if (isChecked) {
      s.add(category);
    } else {
      s.delete(category);
    }
    this.selectedExtraCategories.set(s);
  }

  // --- Drawer & Allergens Modal ---

  openOrderDrawer(): void {
    this.isOrderDrawerOpen.set(true);
  }

  closeOrderDrawer(): void {
    this.isOrderDrawerOpen.set(false);
  }

  hasAllergens(item: MenuItemModel): boolean {
    return !!item.allergens && Object.values(item.allergens).some((v) => !!v && v.trim() !== '');
  }

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

  // --- Name & Description Localization Helpers ---

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

  isSelfOrderingEnabled(): boolean {
    const rest = this.restaurant();
    const tbl = this.matchedTable();
    if (!rest) return false;
    if (tbl && tbl.overwriteSelfOrderingConfig) {
      return tbl.overwriteSelfOrderingConfig.mode !== 'no';
    }
    return rest.selfOrderingConfig?.mode !== 'no';
  }

  // --- Helper Methods ---

  getItemUnitPrice(dishName: string): number {
    const rest = this.restaurant();
    if (rest?.items) {
      const m = rest.items.find((x) => x.name.toLowerCase() === dishName.toLowerCase());
      if (m?.price !== null && m?.price !== undefined) return m.price;
    }

    const extra = this.extraCatalogue();
    if (extra) {
      const items: any[] = extra.extraCatalogueMenuItems ?? extra.ExtraCatalogueMenuItems ?? [];
      if (Array.isArray(items)) {
        const m = items.find((x) => String(x.name || x.Name).toLowerCase() === dishName.toLowerCase());
        const p = m?.price ?? m?.Price ?? m?.optOrdinaryPrice ?? m?.OptOrdinaryPrice;
        if (p !== null && p !== undefined) return Number(p);
      }
    }

    return 0;
  }

  isItemPriced(dishName: string): boolean {
    const rest = this.restaurant();
    if (rest?.items) {
      const m = rest.items.find((x) => x.name.toLowerCase() === dishName.toLowerCase());
      if (m && m.price !== null && m.price !== undefined) return true;
    }

    const extra = this.extraCatalogue();
    if (extra) {
      const items: any[] = extra.extraCatalogueMenuItems ?? extra.ExtraCatalogueMenuItems ?? [];
      if (Array.isArray(items)) {
        const m = items.find((x) => String(x.name || x.Name).toLowerCase() === dishName.toLowerCase());
        const p = m?.price ?? m?.Price ?? m?.optOrdinaryPrice ?? m?.OptOrdinaryPrice;
        if (p !== null && p !== undefined) return true;
      }
    }

    return false;
  }

  showToast(message: string): void {
    if (this.toastTimerId) clearTimeout(this.toastTimerId);
    this.toastMessage.set(message);
    this.toastTimerId = setTimeout(() => {
      this.toastMessage.set(null);
    }, 2500);
  }

  private generateUuid(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
