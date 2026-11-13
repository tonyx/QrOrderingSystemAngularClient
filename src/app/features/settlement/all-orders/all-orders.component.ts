import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin, of, catchError } from 'rxjs';
import { MainLayoutComponent } from '../../../shared/components/main-layout/main-layout.component';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { LocalizationService } from '../../../core/services/localization.service';
import { LocPipe } from '../../../core/pipes/loc.pipe';
import {
  RestaurantItem,
  TableModel,
  TableSessionModel,
  OrderItemModel,
  AggregatedOrderItem,
  SettlePayAtCounterItemSelectionDto,
  ArbitraryPaymentGroupItemDto,
  CreatePaymentGroupDto,
  PublishPaymentGroupSetRequestDto,
  PaymentGroupSetModel,
} from '../../../core/models/restaurant.models';

export type SettlementWidgetLayoutMode = 'SidePanel' | 'Floating' | 'BottomDock';

export interface SelectedCounterItemState {
  tableNum: number;
  tableId: string;
  sessionId: string;
  menuItemName: string;
  quantity: number;
  unitPrice: number;
  orderItemId?: string | null;
}

export interface GroupBuilderGroup {
  id: string;
  name: string;
  discountAmount: number;
}

export interface GroupBuilderItem {
  key: string;
  sessionId: string;
  menuItemName: string;
  quantity: number;
  unitPrice: number;
  orderItemId?: string | null;
  assignedGroupId: string;
  isCommon: boolean;
  isGift: boolean;
  isCustom: boolean;
}

export interface CustomItemSuggestion {
  name: string;
  price: number;
  category: string;
  isExtra: boolean;
  isAvailable: boolean;
}

export interface OngoingPrepaymentEntry {
  paymentIntentId: string;
  shortPaymentIntent: string;
  total: number;
  itemsSummary: string;
}

export interface CompletedStripePaymentEntry {
  paymentIntentId: string;
  shortPaymentIntent: string;
  totalAmount: number;
  tipAmount: number;
  itemsSummary: string;
}

export interface RejectItemTarget {
  tableNum: number;
  tableId: string;
  sessionId: string;
  itemName: string;
  orderItemId?: string | null;
}

@Component({
  selector: 'app-all-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LocPipe, MainLayoutComponent],
  templateUrl: './all-orders.component.html',
  styleUrls: ['./all-orders.component.css'],
})
export class AllOrdersComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly restaurantService = inject(RestaurantService);
  readonly loc = inject(LocalizationService);

  restaurantId = '';
  restaurant: RestaurantItem | null = null;
  extraCatalogueItems: Array<{
    name: string;
    price: number;
    category: string;
    isAvailable: boolean;
  }> = [];

  isLoading = signal<boolean>(true);
  errorMessage: string | null = null;

  // Timers
  private pollIntervalId: any = null;
  private clockIntervalId: any = null;
  nowMs = signal<number>(Date.now());

  // Category filter
  readonly UNASSIGNED_CAT = '__UNASSIGNED__';
  availableCategories: Array<string | null> = [];
  selectedCategories = new Set<string>();
  private categoriesInitialized = false;

  // Widget layout & dragging
  widgetLayoutMode: SettlementWidgetLayoutMode = 'SidePanel';
  isSettlementWidgetMinimized = false;
  floatingPosX = 24;
  floatingPosY = 90;
  private isDraggingWidget = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  showPriceAdjustmentPanel = false;

  // PayAtCounter selections & split rows
  selectedPayAtCounterItems = new Map<string, SelectedCounterItemState>();
  selectedOrdinaryKeys = new Set<string>();
  selectedGiftKeys = new Set<string>();
  splitRowKeys = new Set<string>();
  priceOverrides = new Map<string, number>();
  selectedLedgerPaymentMethodStr: 'Cash' | 'ExternalCardTerminal' | 'Voucher' = 'Cash';
  settlementDiscount = 0;
  isSettling = false;
  settlementError: string | null = null;
  isStripeConnected = false;

  // Reset table orders modal
  confirmTableNum: number | null = null;
  isResettingOrders = false;
  resetOrdersError: string | null = null;

  // Reject item modal
  rejectItemTarget: RejectItemTarget | null = null;
  rejectReason = '';
  isRejectingItem = false;
  rejectItemError: string | null = null;

  // Payment Group Builder modal
  showPaymentGroupModal = false;
  groupModalTableNum = 0;
  groupModalTableId = '';
  isFlexibleGroupSet = false;
  isPublishingGroups = false;
  publishGroupError: string | null = null;
  copyFeedback: string | null = null;
  publishedGroupSet: PaymentGroupSetModel | null = null;

  builderGroups: GroupBuilderGroup[] = [];
  builderItems: GroupBuilderItem[] = [];

  // Custom item in Group Builder
  showAddCustomItemForm = false;
  newCustomItemDescription = '';
  newCustomItemUnitPrice = 0;
  newCustomItemQuantity = 1;
  newCustomItemTargetGroup = '';
  newCustomItemIsGift = false;
  addCustomItemError: string | null = null;
  showCustomItemAutocomplete = false;
  autocompleteResults: CustomItemSuggestion[] = [];
  customItemSearchCategories = new Set<string>();

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      this.restaurantId = params.get('restaurantId') || '';
      if (this.restaurantId) {
        this.loadData(false);
        this.startTimers();
      } else {
        this.errorMessage = this.loc.translate('AllOrders_MsgNotFoundOrDenied');
        this.isLoading.set(false);
      }
    });
  }

  ngOnDestroy(): void {
    this.stopTimers();
  }

  private startTimers(): void {
    this.stopTimers();
    this.clockIntervalId = setInterval(() => {
      this.nowMs.set(Date.now());
    }, 1000);
    this.pollIntervalId = setInterval(() => {
      if (
        this.restaurantId &&
        !this.isSettling &&
        !this.isResettingOrders &&
        !this.isRejectingItem &&
        !this.isPublishingGroups
      ) {
        this.loadData(true);
      }
    }, 5000);
  }

  private stopTimers(): void {
    if (this.clockIntervalId) {
      clearInterval(this.clockIntervalId);
      this.clockIntervalId = null;
    }
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }

  loadData(silent = false): void {
    if (!silent) {
      this.isLoading.set(true);
      this.errorMessage = null;
    }

    forkJoin({
      restaurant: this.restaurantService.getRestaurant(this.restaurantId),
      extraDetails: this.restaurantService.getExtraCatalogueDetails(this.restaurantId).pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ restaurant, extraDetails }) => {
        this.restaurant = restaurant;
        this.parseExtraCatalogue(extraDetails);

        const stripeConfigured = Boolean(
          restaurant.paymentConfig?.isStripeEnabled || restaurant.paymentConfig?.stripeAccountId
        );
        if (restaurant.stripeStatus) {
          this.isStripeConnected = Boolean(
            restaurant.stripeStatus.isConnected && restaurant.stripeStatus.chargesEnabled
          );
        } else if (stripeConfigured) {
          this.restaurantService
            .getConnectAccountStatus(this.restaurantId)
            .pipe(catchError(() => of(null)))
            .subscribe((status) => {
              this.isStripeConnected = Boolean(status && status.isConnected && status.chargesEnabled);
            });
        } else {
          this.isStripeConnected = false;
        }

        this.extractCategories();
        this.reconcileSelectedItems();
        this.isLoading.set(false);
      },
      error: (err) => {
        if (!silent) {
          this.errorMessage = err?.error?.message || err?.message || this.loc.translate('AllOrders_MsgNotFoundOrDenied');
          this.isLoading.set(false);
        }
      },
    });
  }

  private parseExtraCatalogue(raw: any): void {
    this.extraCatalogueItems = [];
    if (!raw) return;

    const rawItems = raw?.items ?? raw?.Items ?? (Array.isArray(raw) ? raw : []);
    if (!Array.isArray(rawItems)) return;

    rawItems.forEach((entry: any) => {
      const it = Array.isArray(entry) && entry.length >= 2 ? entry[1] : entry?.value ?? entry?.Value ?? entry;
      if (!it) return;
      const name = String(it?.name ?? it?.Name ?? (Array.isArray(entry) ? entry[0] : '') ?? '').trim();
      if (!name) return;

      let price = 0;
      const rawPrice = it?.ordinaryPrice ?? it?.OrdinaryPrice ?? it?.price ?? it?.Price;
      if (typeof rawPrice === 'number') {
        price = rawPrice;
      } else if (rawPrice && typeof rawPrice === 'object') {
        const pv = rawPrice.fields?.[0] ?? rawPrice.Fields?.[0] ?? rawPrice.value ?? rawPrice.Value;
        if (pv !== undefined && pv !== null) price = Number(pv);
      }

      let category = '';
      const rawCat = it?.category ?? it?.Category ?? it?.optCategory ?? it?.OptCategory;
      if (typeof rawCat === 'string') {
        category = rawCat.trim();
      } else if (rawCat && typeof rawCat === 'object') {
        const cv = rawCat.fields?.[0] ?? rawCat.Fields?.[0] ?? rawCat.value ?? rawCat.Value;
        if (typeof cv === 'string') category = cv.trim();
      }

      const isAvailable = it?.available ?? it?.Available ?? true;
      this.extraCatalogueItems.push({
        name,
        price: isNaN(price) ? 0 : price,
        category,
        isAvailable: Boolean(isAvailable),
      });
    });
  }

  private extractCategories(): void {
    if (!this.restaurant) return;
    const cats: Array<string | null> = [];
    const seen = new Set<string>();

    (this.restaurant.items || []).forEach((item) => {
      const c = item.category && item.category.trim() ? item.category.trim() : null;
      const key = c ?? this.UNASSIGNED_CAT;
      if (!seen.has(key)) {
        seen.add(key);
        cats.push(c);
      }
    });

    this.extraCatalogueItems.forEach((extra) => {
      const c = extra.category ? extra.category : null;
      const key = c ?? this.UNASSIGNED_CAT;
      if (!seen.has(key)) {
        seen.add(key);
        cats.push(c);
      }
    });

    if (!seen.has(this.UNASSIGNED_CAT)) {
      seen.add(this.UNASSIGNED_CAT);
      cats.push(null);
    }

    this.availableCategories = cats;
    if (!this.categoriesInitialized) {
      this.SelectAllCategories();
      this.categoriesInitialized = true;
    }
  }

  SelectAllCategories(): void {
    this.selectedCategories.clear();
    this.availableCategories.forEach((c) => {
      this.selectedCategories.add(c ?? this.UNASSIGNED_CAT);
    });
  }

  SelectNoCategories(): void {
    this.selectedCategories.clear();
  }

  ToggleCategory(catKey: string, event: Event): void {
    const checked = (event.target as HTMLInputElement)?.checked ?? false;
    if (checked) {
      this.selectedCategories.add(catKey);
    } else {
      this.selectedCategories.delete(catKey);
    }
  }

  isCategorySelected(cat: string | null): boolean {
    const key = cat ?? this.UNASSIGNED_CAT;
    return this.selectedCategories.has(key);
  }

  IsItemCategorySelected(itemName: string): boolean {
    if (!this.restaurant) return true;
    const menuItem = (this.restaurant.items || []).find((m) => m.name === itemName);
    if (menuItem) {
      const catKey = menuItem.category && menuItem.category.trim() ? menuItem.category.trim() : this.UNASSIGNED_CAT;
      return this.selectedCategories.has(catKey);
    }
    const extraItem = this.extraCatalogueItems.find((e) => e.name.toLowerCase() === itemName.toLowerCase());
    if (extraItem) {
      const catKey = extraItem.category ? extraItem.category : this.UNASSIGNED_CAT;
      return this.selectedCategories.has(catKey);
    }
    return this.selectedCategories.has(this.UNASSIGNED_CAT);
  }

  IsExtraMenuItem(itemName: string): boolean {
    const isOrdinary = Boolean((this.restaurant?.items || []).some((m) => m.name === itemName));
    if (isOrdinary) return false;
    return this.extraCatalogueItems.some((e) => e.name.toLowerCase() === itemName.toLowerCase());
  }

  GetMenuItemPrice(itemName: string): number {
    if (this.priceOverrides.has(itemName)) {
      return this.priceOverrides.get(itemName)!;
    }
    const menuItem = (this.restaurant?.items || []).find((m) => m.name === itemName);
    if (menuItem && menuItem.price !== undefined && menuItem.price !== null) {
      return menuItem.price;
    }
    const extraItem = this.extraCatalogueItems.find((e) => e.name.toLowerCase() === itemName.toLowerCase());
    if (extraItem) {
      return extraItem.price;
    }
    return 0;
  }

  // --- Formatting helpers ---
  formatText(key: string, ...args: Array<string | number>): string {
    return this.loc.translate(key, ...args);
  }

  getActiveTablesCount(): number {
    if (!this.restaurant?.parsedTables) return 0;
    return this.restaurant.parsedTables.filter((t) =>
      t.sessions.some((s) => s.items && s.items.length > 0)
    ).length;
  }

  getTablesWithSessions(): TableModel[] {
    if (!this.restaurant?.parsedTables) return [];
    return this.restaurant.parsedTables.filter((t) => t.sessions && t.sessions.length > 0);
  }

  hasAnySessions(): boolean {
    return this.getTablesWithSessions().length > 0;
  }

  HasPayAtCounterItems(table: TableModel): boolean {
    return table.sessions.some((s) =>
      s.items.some((item) => this.isItemPayAtCounter(item))
    );
  }

  isItemPayAtCounter(item: OrderItemModel | AggregatedOrderItem): boolean {
    return Boolean(
      (item.isConfirmed || item.isDoneWithPayAndEventualVote) &&
        item.paymentMethod?.isPayAtCounter
    );
  }

  isItemPaidAtCounter(item: OrderItemModel | AggregatedOrderItem): boolean {
    return Boolean(
      (item.isConfirmed || item.isDoneWithPayAndEventualVote) &&
        item.paymentMethod?.isPaidAtCounter
    );
  }

  isItemCompedAsOmaggio(item: OrderItemModel | AggregatedOrderItem): boolean {
    return Boolean(
      (item.isConfirmed || item.isDoneWithPayAndEventualVote) &&
        item.paymentMethod?.isCompedAsOmaggio
    );
  }

  getItemHoldSecret(item: OrderItemModel | AggregatedOrderItem): string | null {
    if (
      (item.isConfirmed || item.isDoneWithPayAndEventualVote) &&
      item.paymentMethod?.isPrepaidWithStripe &&
      item.paymentMethod.paymentIntentId
    ) {
      return item.paymentMethod.paymentIntentId;
    }
    return null;
  }

  getShortSecret(secret: string | null | undefined, maxLen = 8): string {
    if (!secret) return '';
    return secret.length > maxLen ? secret.substring(0, maxLen) + '…' : secret;
  }

  getFilteredSessionItems(session: TableSessionModel): AggregatedOrderItem[] {
    return (session.aggregatedItems || []).filter((i) => this.IsItemCategorySelected(i.dishName));
  }

  getFilteredSessionTotalItemsCount(session: TableSessionModel): number {
    return this.getFilteredSessionItems(session).reduce((sum, i) => sum + i.quantity, 0);
  }

  getMatchingOrderItems(session: TableSessionModel, agg: AggregatedOrderItem): OrderItemModel[] {
    return (session.items || []).filter(
      (i) =>
        i.dishName === agg.dishName &&
        i.status === agg.status &&
        (i.comment || null) === (agg.comment || null) &&
        (i.paymentMethod?.label || '') === (agg.paymentMethod?.label || '') &&
        (i.paymentMethod?.paymentIntentId || '') === (agg.paymentMethod?.paymentIntentId || '')
    );
  }

  // --- Ongoing Prepayments & Completed Stripe Payments per Session ---
  getOngoingPrepayments(session: TableSessionModel): OngoingPrepaymentEntry[] {
    const map = new Map<string, Map<string, number>>();
    (session.items || []).forEach((it) => {
      if (
        (it.isConfirmed || it.isDoneWithPayAndEventualVote) &&
        it.paymentMethod?.isPrepaidWithStripe &&
        it.paymentMethod.paymentIntentId
      ) {
        const pid = it.paymentMethod.paymentIntentId;
        if (!map.has(pid)) {
          map.set(pid, new Map<string, number>());
        }
        const dishCounts = map.get(pid)!;
        dishCounts.set(it.dishName, (dishCounts.get(it.dishName) || 0) + 1);
      }
    });

    const entries: OngoingPrepaymentEntry[] = [];
    map.forEach((dishCounts, pid) => {
      let total = 0;
      const parts: string[] = [];
      dishCounts.forEach((qty, dishName) => {
        total += qty * this.GetMenuItemPrice(dishName);
        parts.push(`${qty}x ${dishName}`);
      });
      entries.push({
        paymentIntentId: pid,
        shortPaymentIntent: this.getShortSecret(pid, 12),
        total,
        itemsSummary: parts.join(', '),
      });
    });
    return entries;
  }

  getCompletedStripePayments(session: TableSessionModel): CompletedStripePaymentEntry[] {
    const map = new Map<string, { tipAmount: number; dishes: Map<string, number> }>();
    (session.items || []).forEach((it) => {
      if (
        (it.isConfirmed || it.isDoneWithPayAndEventualVote) &&
        it.paymentMethod?.isPaidWithStripe &&
        !it.paymentMethod.isLedgerRegistered &&
        it.paymentMethod.paymentIntentId
      ) {
        const pid = it.paymentMethod.paymentIntentId;
        if (!map.has(pid)) {
          map.set(pid, {
            tipAmount: it.paymentMethod.tipAmount || 0,
            dishes: new Map<string, number>(),
          });
        }
        const entry = map.get(pid)!;
        if ((it.paymentMethod.tipAmount || 0) > entry.tipAmount) {
          entry.tipAmount = it.paymentMethod.tipAmount || 0;
        }
        entry.dishes.set(it.dishName, (entry.dishes.get(it.dishName) || 0) + 1);
      }
    });

    const result: CompletedStripePaymentEntry[] = [];
    map.forEach((val, pid) => {
      let totalAmount = 0;
      const parts: string[] = [];
      val.dishes.forEach((qty, dishName) => {
        totalAmount += qty * this.GetMenuItemPrice(dishName);
        parts.push(`${qty}x ${dishName}`);
      });
      result.push({
        paymentIntentId: pid,
        shortPaymentIntent: this.getShortSecret(pid, 12),
        totalAmount,
        tipAmount: val.tipAmount,
        itemsSummary: parts.join(', '),
      });
    });
    return result;
  }

  // --- OrderStatusBadge logic ---
  getConfirmedTimerBadge(confirmedAtIso?: string | null): { text: string; bgColor: string } {
    let elapsedMs = 0;
    if (confirmedAtIso) {
      const startMs = new Date(confirmedAtIso).getTime();
      if (!isNaN(startMs)) {
        elapsedMs = Math.max(0, this.nowMs() - startMs);
      }
    }
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const totalMinutes = totalSeconds / 60;
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const timeStr = hours > 0 ? `${hours}h ${pad2(mins)}m ${pad2(secs)}s` : `${pad2(mins)}m ${pad2(secs)}s`;
    const text = this.formatText('OrderStatus_ConfirmedTimerFormat', timeStr);

    let bgColor = '#dc2626';
    if (totalMinutes <= 0) {
      bgColor = '#10b981';
    } else if (totalMinutes < 15) {
      const t = totalMinutes / 15.0;
      bgColor = this.interpolateColor(16, 185, 129, 245, 158, 11, t);
    } else if (totalMinutes < 30) {
      const t = (totalMinutes - 15.0) / 15.0;
      bgColor = this.interpolateColor(245, 158, 11, 220, 38, 38, t);
    }

    return { text, bgColor };
  }

  private interpolateColor(
    r1: number,
    g1: number,
    b1: number,
    r2: number,
    g2: number,
    b2: number,
    t: number
  ): string {
    const clamped = Math.max(0, Math.min(1, t));
    const r = Math.round(r1 + (r2 - r1) * clamped);
    const g = Math.round(g1 + (g2 - g1) * clamped);
    const b = Math.round(b1 + (b2 - b1) * clamped);
    const hex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  }

  // --- Selection & Split Row Management ---
  get hasSelectedItems(): boolean {
    return this.selectedOrdinaryKeys.size > 0 || this.selectedGiftKeys.size > 0;
  }

  get selectedPayAtCounterEntries(): Array<[string, SelectedCounterItemState]> {
    return Array.from(this.selectedPayAtCounterItems.entries());
  }

  hasUnsetSelectedOrdinaryPrices(): boolean {
    for (const k of this.selectedOrdinaryKeys) {
      const itm = this.selectedPayAtCounterItems.get(k);
      if (itm && itm.unitPrice <= 0) {
        return true;
      }
    }
    return false;
  }

  getItemKey(tableNum: number, tableId: string, sessionId: string, itemName: string): string {
    return `${tableNum}_${tableId}_${sessionId}_${itemName}`;
  }

  getSubItemKey(itemKey: string, subIdx: number): string {
    return `${itemKey}_sub_${subIdx}`;
  }

  isRowSplit(tableNum: number, tableId: string, sessionId: string, agg: AggregatedOrderItem): boolean {
    const key = this.getItemKey(tableNum, tableId, sessionId, agg.dishName);
    return this.splitRowKeys.has(key) && agg.quantity > 1 && this.isItemPayAtCounter(agg);
  }

  getRowBorderClass(
    tableNum: number,
    tableId: string,
    sessionId: string,
    agg: AggregatedOrderItem
  ): string {
    const holdSecret = this.getItemHoldSecret(agg);
    if (holdSecret) return 'border border-warning bg-light';
    const key = this.getItemKey(tableNum, tableId, sessionId, agg.dishName);
    if (this.selectedGiftKeys.has(key)) return 'border border-warning bg-warning-subtle';
    if (this.selectedOrdinaryKeys.has(key)) return 'border border-primary bg-light';
    return '';
  }

  getSubRowBorderClass(subKey: string): string {
    if (this.selectedGiftKeys.has(subKey)) return 'border border-warning bg-warning-subtle';
    if (this.selectedOrdinaryKeys.has(subKey)) return 'border border-primary bg-light';
    return 'border-bottom';
  }

  getSubIndices(qty: number): number[] {
    return Array.from({ length: qty }, (_, i) => i);
  }

  GetSelectableItemNamesInSession(
    tableNum: number,
    tableId: string,
    sessionId: string,
    filteredItems: AggregatedOrderItem[]
  ): string[] {
    const names: string[] = [];
    const seen = new Set<string>();
    for (const order of filteredItems) {
      if (this.isItemPayAtCounter(order) && !seen.has(order.dishName)) {
        seen.add(order.dishName);
        names.push(order.dishName);
      }
    }
    return names;
  }

  isAllSessionSelected(tableNum: number, tableId: string, session: TableSessionModel): boolean {
    const filtered = this.getFilteredSessionItems(session);
    const selectableNames = this.GetSelectableItemNamesInSession(
      tableNum,
      tableId,
      session.sessionId,
      filtered
    );
    if (selectableNames.length === 0) return false;
    return selectableNames.every((name) => {
      const k = this.getItemKey(tableNum, tableId, session.sessionId, name);
      if (this.splitRowKeys.has(k)) {
        const q = this.GetItemQuantity(tableNum, session.sessionId, name);
        for (let i = 0; i < q; i++) {
          const sk = this.getSubItemKey(k, i);
          if (!this.selectedOrdinaryKeys.has(sk) && !this.selectedGiftKeys.has(sk)) {
            return false;
          }
        }
        return true;
      }
      return this.selectedOrdinaryKeys.has(k) || this.selectedGiftKeys.has(k);
    });
  }

  getSelectedInSessionCount(tableNum: number, tableId: string, session: TableSessionModel): number {
    const filtered = this.getFilteredSessionItems(session);
    const selectableNames = this.GetSelectableItemNamesInSession(
      tableNum,
      tableId,
      session.sessionId,
      filtered
    );
    if (selectableNames.length === 0) return 0;
    return selectableNames.filter((name) => {
      const k = this.getItemKey(tableNum, tableId, session.sessionId, name);
      if (this.splitRowKeys.has(k)) {
        const q = this.GetItemQuantity(tableNum, session.sessionId, name);
        for (let i = 0; i < q; i++) {
          const sk = this.getSubItemKey(k, i);
          if (this.selectedOrdinaryKeys.has(sk) || this.selectedGiftKeys.has(sk)) {
            return true;
          }
        }
        return false;
      }
      return this.selectedOrdinaryKeys.has(k) || this.selectedGiftKeys.has(k);
    }).length;
  }

  ToggleSessionSelection(
    tableNum: number,
    tableId: string,
    session: TableSessionModel,
    event: Event
  ): void {
    const isChecked = (event.target as HTMLInputElement)?.checked ?? false;
    if (isChecked) {
      this.SelectAllInSession(tableNum, tableId, session);
    } else {
      this.DeselectAllInSession(tableNum, tableId, session.sessionId);
    }
  }

  SelectAllInSession(tableNum: number, tableId: string, session: TableSessionModel): void {
    const filtered = this.getFilteredSessionItems(session);
    const selectableNames = this.GetSelectableItemNamesInSession(
      tableNum,
      tableId,
      session.sessionId,
      filtered
    );
    for (const itemName of selectableNames) {
      const key = this.getItemKey(tableNum, tableId, session.sessionId, itemName);
      if (this.splitRowKeys.has(key)) {
        const qty = this.GetItemQuantity(tableNum, session.sessionId, itemName);
        for (let i = 0; i < qty; i++) {
          const subKey = this.getSubItemKey(key, i);
          if (!this.selectedGiftKeys.has(subKey)) {
            this.selectedOrdinaryKeys.add(subKey);
            this.ensureSubItemTracked(tableNum, tableId, session.sessionId, itemName, i);
          }
        }
      } else if (!this.selectedGiftKeys.has(key)) {
        this.selectedOrdinaryKeys.add(key);
        this.ensureItemTracked(tableNum, tableId, session.sessionId, itemName);
      }
    }
  }

  DeselectAllInSession(tableNum: number, tableId: string, sessionId: string): void {
    const prefix = `${tableNum}_${tableId}_${sessionId}_`;
    const keysToRemove: string[] = [];
    this.selectedPayAtCounterItems.forEach((_, k) => {
      if (k.startsWith(prefix)) keysToRemove.push(k);
    });
    this.selectedOrdinaryKeys.forEach((k) => {
      if (k.startsWith(prefix) && !keysToRemove.includes(k)) keysToRemove.push(k);
    });
    this.selectedGiftKeys.forEach((k) => {
      if (k.startsWith(prefix) && !keysToRemove.includes(k)) keysToRemove.push(k);
    });

    for (const k of keysToRemove) {
      this.selectedOrdinaryKeys.delete(k);
      this.selectedGiftKeys.delete(k);
      this.selectedPayAtCounterItems.delete(k);
    }
  }

  SplitRow(tableNum: number, tableId: string, sessionId: string, itemName: string, qty: number): void {
    const key = this.getItemKey(tableNum, tableId, sessionId, itemName);
    this.splitRowKeys.add(key);

    const wasOrdinary = this.selectedOrdinaryKeys.delete(key);
    const wasGift = this.selectedGiftKeys.delete(key);
    this.selectedPayAtCounterItems.delete(key);

    if (wasOrdinary || wasGift) {
      for (let i = 0; i < qty; i++) {
        const subKey = this.getSubItemKey(key, i);
        if (wasOrdinary) this.selectedOrdinaryKeys.add(subKey);
        if (wasGift) this.selectedGiftKeys.add(subKey);
        this.ensureSubItemTracked(tableNum, tableId, sessionId, itemName, i);
      }
    }
  }

  UnsplitRow(tableNum: number, tableId: string, sessionId: string, itemName: string, qty: number): void {
    const key = this.getItemKey(tableNum, tableId, sessionId, itemName);
    this.splitRowKeys.delete(key);

    let anyOrdinary = false;
    let anyGift = false;
    for (let i = 0; i < qty; i++) {
      const subKey = this.getSubItemKey(key, i);
      if (this.selectedOrdinaryKeys.delete(subKey)) anyOrdinary = true;
      if (this.selectedGiftKeys.delete(subKey)) anyGift = true;
      this.selectedPayAtCounterItems.delete(subKey);
    }

    if (anyOrdinary) {
      this.selectedOrdinaryKeys.add(key);
      this.ensureItemTracked(tableNum, tableId, sessionId, itemName);
    } else if (anyGift) {
      this.selectedGiftKeys.add(key);
      this.ensureItemTracked(tableNum, tableId, sessionId, itemName);
    }
  }

  ToggleOrdinarySelection(
    tableNum: number,
    tableId: string,
    sessionId: string,
    itemName: string,
    event: Event
  ): void {
    const isChecked = (event.target as HTMLInputElement)?.checked ?? false;
    const key = this.getItemKey(tableNum, tableId, sessionId, itemName);
    if (isChecked) {
      this.selectedGiftKeys.delete(key);
      this.selectedOrdinaryKeys.add(key);
      this.ensureItemTracked(tableNum, tableId, sessionId, itemName);
    } else {
      this.selectedOrdinaryKeys.delete(key);
      if (!this.selectedGiftKeys.has(key)) {
        this.selectedPayAtCounterItems.delete(key);
      }
    }
  }

  ToggleGiftSelection(tableNum: number, tableId: string, sessionId: string, itemName: string): void {
    const key = this.getItemKey(tableNum, tableId, sessionId, itemName);
    if (this.selectedGiftKeys.has(key)) {
      this.selectedGiftKeys.delete(key);
      if (!this.selectedOrdinaryKeys.has(key)) {
        this.selectedPayAtCounterItems.delete(key);
      }
    } else {
      this.selectedOrdinaryKeys.delete(key);
      this.selectedGiftKeys.add(key);
      this.ensureItemTracked(tableNum, tableId, sessionId, itemName);
    }
  }

  ToggleOrdinarySubItemSelection(
    tableNum: number,
    tableId: string,
    sessionId: string,
    itemName: string,
    subIndex: number,
    event: Event
  ): void {
    const isChecked = (event.target as HTMLInputElement)?.checked ?? false;
    const baseKey = this.getItemKey(tableNum, tableId, sessionId, itemName);
    const subKey = this.getSubItemKey(baseKey, subIndex);
    if (isChecked) {
      this.selectedGiftKeys.delete(subKey);
      this.selectedOrdinaryKeys.add(subKey);
      this.ensureSubItemTracked(tableNum, tableId, sessionId, itemName, subIndex);
    } else {
      this.selectedOrdinaryKeys.delete(subKey);
      if (!this.selectedGiftKeys.has(subKey)) {
        this.selectedPayAtCounterItems.delete(subKey);
      }
    }
  }

  ToggleGiftSubItemSelection(
    tableNum: number,
    tableId: string,
    sessionId: string,
    itemName: string,
    subIndex: number
  ): void {
    const baseKey = this.getItemKey(tableNum, tableId, sessionId, itemName);
    const subKey = this.getSubItemKey(baseKey, subIndex);
    if (this.selectedGiftKeys.has(subKey)) {
      this.selectedGiftKeys.delete(subKey);
      if (!this.selectedOrdinaryKeys.has(subKey)) {
        this.selectedPayAtCounterItems.delete(subKey);
      }
    } else {
      this.selectedOrdinaryKeys.delete(subKey);
      this.selectedGiftKeys.add(subKey);
      this.ensureSubItemTracked(tableNum, tableId, sessionId, itemName, subIndex);
    }
  }

  private ensureItemTracked(
    tableNum: number,
    tableId: string,
    sessionId: string,
    itemName: string
  ): void {
    const key = this.getItemKey(tableNum, tableId, sessionId, itemName);
    const qty = this.GetItemQuantity(tableNum, sessionId, itemName);
    const unitPrice = this.GetMenuItemPrice(itemName);
    this.selectedPayAtCounterItems.set(key, {
      tableNum,
      tableId,
      sessionId,
      menuItemName: itemName,
      quantity: qty,
      unitPrice,
      orderItemId: null,
    });
  }

  private ensureSubItemTracked(
    tableNum: number,
    tableId: string,
    sessionId: string,
    itemName: string,
    subIndex: number
  ): void {
    const baseKey = this.getItemKey(tableNum, tableId, sessionId, itemName);
    const subKey = this.getSubItemKey(baseKey, subIndex);
    const unitPrice = this.GetMenuItemPrice(itemName);
    const orderItemId = this.getSubOrderItemId(tableNum, sessionId, itemName, subIndex);
    this.selectedPayAtCounterItems.set(subKey, {
      tableNum,
      tableId,
      sessionId,
      menuItemName: itemName,
      quantity: 1,
      unitPrice,
      orderItemId,
    });
  }

  private getSubOrderItemId(
    tableNum: number,
    sessionId: string,
    itemName: string,
    subIndex: number
  ): string | null {
    const table = (this.restaurant?.parsedTables || []).find((t) => t.tableNumber === tableNum);
    const session = table?.sessions.find((s) => s.sessionId === sessionId);
    if (!session) return null;

    const matching = session.items.filter(
      (i) => i.dishName === itemName && this.isItemPayAtCounter(i)
    );
    if (subIndex >= 0 && subIndex < matching.length) {
      return matching[subIndex].id || null;
    }
    return null;
  }

  GetItemQuantity(tableNum: number, sessionId: string, itemName: string): number {
    const table = (this.restaurant?.parsedTables || []).find((t) => t.tableNumber === tableNum);
    const session = table?.sessions.find((s) => s.sessionId === sessionId);
    if (!session) return 1;

    const qty = session.items.filter(
      (i) => i.dishName === itemName && this.isItemPayAtCounter(i)
    ).length;
    return qty > 0 ? qty : 1;
  }

  private reconcileSelectedItems(): void {
    if (!this.restaurant?.parsedTables || this.selectedPayAtCounterItems.size === 0) return;

    const toRemove: string[] = [];
    this.selectedPayAtCounterItems.forEach((state, key) => {
      const table = this.restaurant!.parsedTables!.find((t) => t.tableNumber === state.tableNum);
      const session = table?.sessions.find((s) => s.sessionId === state.sessionId);
      if (!session) {
        toRemove.push(key);
        return;
      }
      const payAtCounterItems = session.items.filter(
        (i) => i.dishName === state.menuItemName && this.isItemPayAtCounter(i)
      );
      if (payAtCounterItems.length === 0) {
        toRemove.push(key);
      } else if (!key.includes('_sub_')) {
        state.quantity = payAtCounterItems.length;
      }
    });

    for (const k of toRemove) {
      this.selectedPayAtCounterItems.delete(k);
      this.selectedOrdinaryKeys.delete(k);
      this.selectedGiftKeys.delete(k);
    }
  }

  UpdateSelectedItemUnitPrice(itemKey: string, event: Event): void {
    const rawValue = (event.target as HTMLInputElement)?.value ?? '0';
    const parsed = parseFloat(rawValue);
    if (!isNaN(parsed) && parsed >= 0 && this.selectedPayAtCounterItems.has(itemKey)) {
      const item = this.selectedPayAtCounterItems.get(itemKey)!;
      this.priceOverrides.set(item.menuItemName, parsed);

      this.selectedPayAtCounterItems.forEach((val, k) => {
        if (val.menuItemName === item.menuItemName) {
          this.selectedPayAtCounterItems.set(k, { ...val, unitPrice: parsed });
        }
      });
    }
  }

  GetSelectedOrdinaryTotal(): number {
    let total = 0;
    this.selectedOrdinaryKeys.forEach((k) => {
      const v = this.selectedPayAtCounterItems.get(k);
      if (v) total += v.quantity * v.unitPrice;
    });
    return total;
  }

  GetSelectedGiftTotal(): number {
    let total = 0;
    this.selectedGiftKeys.forEach((k) => {
      const v = this.selectedPayAtCounterItems.get(k);
      if (v) total += v.quantity * v.unitPrice;
    });
    return total;
  }

  GetSelectedOrdinaryTotalCount(): number {
    let count = 0;
    this.selectedOrdinaryKeys.forEach((k) => {
      const v = this.selectedPayAtCounterItems.get(k);
      if (v) count += v.quantity;
    });
    return count;
  }

  GetSelectedGiftTotalCount(): number {
    let count = 0;
    this.selectedGiftKeys.forEach((k) => {
      const v = this.selectedPayAtCounterItems.get(k);
      if (v) count += v.quantity;
    });
    return count;
  }

  ClearItemSelection(): void {
    this.selectedPayAtCounterItems.clear();
    this.selectedOrdinaryKeys.clear();
    this.selectedGiftKeys.clear();
    this.splitRowKeys.clear();
    this.settlementError = null;
    this.settlementDiscount = 0;
    this.isSettlementWidgetMinimized = false;
  }

  // --- Widget Layout & Dragging ---
  SetWidgetMode(mode: SettlementWidgetLayoutMode): void {
    this.widgetLayoutMode = mode;
    this.isSettlementWidgetMinimized = false;
  }

  ToggleWidgetMinimized(): void {
    this.isSettlementWidgetMinimized = !this.isSettlementWidgetMinimized;
  }

  GetWidgetContainerClass(): string {
    switch (this.widgetLayoutMode) {
      case 'SidePanel':
        return 'orders-sidebar-container';
      case 'Floating':
        return 'orders-floating-window';
      default:
        return 'orders-bottom-dock';
    }
  }

  GetWidgetContainerStyle(): Record<string, string> {
    if (this.widgetLayoutMode === 'Floating') {
      return {
        left: `${this.floatingPosX}px`,
        top: `${this.floatingPosY}px`,
      };
    }
    return {};
  }

  OnWidgetPointerDown(event: PointerEvent): void {
    if (this.widgetLayoutMode !== 'Floating') return;
    this.isDraggingWidget = true;
    this.dragOffsetX = event.clientX - this.floatingPosX;
    this.dragOffsetY = event.clientY - this.floatingPosY;
  }

  OnWidgetPointerMove(event: PointerEvent): void {
    if (!this.isDraggingWidget || this.widgetLayoutMode !== 'Floating') return;
    this.floatingPosX = Math.max(8, event.clientX - this.dragOffsetX);
    this.floatingPosY = Math.max(8, event.clientY - this.dragOffsetY);
  }

  OnWidgetPointerUp(): void {
    this.isDraggingWidget = false;
  }

  // --- Settlement Actions ---
  private buildSelectionsList(): SettlePayAtCounterItemSelectionDto[] {
    const list: SettlePayAtCounterItemSelectionDto[] = [];
    this.selectedPayAtCounterItems.forEach((v, k) => {
      list.push({
        TableNum: v.tableNum,
        TableId: v.tableId,
        SessionId: v.sessionId,
        MenuItemName: v.menuItemName,
        Quantity: v.quantity,
        OrderItemId: v.orderItemId || null,
        IsGift: this.selectedGiftKeys.has(k),
        OverriddenUnitPrice: v.unitPrice > 0 ? v.unitPrice : null,
      });
    });
    return list;
  }

  SettleSelectedNoLedger(): void {
    if (!this.restaurantId || !this.hasSelectedItems) return;
    this.isSettling = true;
    this.settlementError = null;

    const selections = this.buildSelectionsList();
    this.restaurantService.markPayAtCounterItemsWithoutLedger(this.restaurantId, selections).subscribe({
      next: () => {
        this.ClearItemSelection();
        this.isSettling = false;
        this.loadData(true);
      },
      error: (err) => {
        this.settlementError = extractHttpError(err) || 'Error settling items.';
        this.isSettling = false;
      },
    });
  }

  SettleSelectedWithLedger(): void {
    if (!this.restaurantId || !this.hasSelectedItems) return;
    this.isSettling = true;
    this.settlementError = null;

    const selections = this.buildSelectionsList();
    const discountOpt = this.settlementDiscount > 0 ? this.settlementDiscount : null;

    this.restaurantService
      .settlePayAtCounterItemsWithLedger(
        this.restaurantId,
        selections,
        this.selectedLedgerPaymentMethodStr,
        discountOpt
      )
      .subscribe({
        next: () => {
          this.ClearItemSelection();
          this.isSettling = false;
          this.loadData(true);
        },
        error: (err) => {
          this.settlementError = extractHttpError(err) || 'Error settling items to ledger.';
          this.isSettling = false;
        },
      });
  }

  // --- Stripe Intent Capture & Register to Ledger ---
  ConfirmPaymentIntent(secret: string): void {
    if (!this.restaurantId || !secret) return;
    this.settlementError = null;
    this.restaurantService.capturePaymentIntent(this.restaurantId, secret).subscribe({
      next: () => {
        this.loadData(true);
      },
      error: (err) => {
        this.settlementError =
          extractHttpError(err) || 'Error capturing payment intent.';
      },
    });
  }

  RegisterStripePaymentToLedger(
    tableNum: number,
    tableId: string,
    sessionId: string,
    paymentIntentId: string
  ): void {
    if (!this.restaurantId) return;
    this.settlementError = null;
    this.restaurantService
      .registerStripePaymentToLedger(this.restaurantId, tableNum, tableId, sessionId, paymentIntentId)
      .subscribe({
        next: () => {
          this.loadData(true);
        },
        error: (err) => {
          this.settlementError =
            extractHttpError(err) || `Failed to register Stripe payment ${paymentIntentId} to ledger.`;
        },
      });
  }

  // --- Mark Done & Reject Item ---
  MarkAsDone(
    tableNum: number,
    tableId: string,
    sessionId: string,
    itemName: string,
    orderItemId?: string | null
  ): void {
    if (!this.restaurantId) return;
    const obs = orderItemId
      ? this.restaurantService.makeOrderItemDoneById(
          this.restaurantId,
          tableNum,
          tableId,
          sessionId,
          orderItemId
        )
      : this.restaurantService.makeOrderItemDone(
          this.restaurantId,
          tableNum,
          tableId,
          sessionId,
          itemName
        );

    obs.subscribe({
      next: () => this.loadData(true),
      error: (err) => {
        this.settlementError = extractHttpError(err) || 'Error marking item done.';
      },
    });
  }

  PromptRejectItem(
    tableNum: number,
    tableId: string,
    sessionId: string,
    itemName: string,
    orderItemId?: string | null
  ): void {
    this.rejectItemTarget = { tableNum, tableId, sessionId, itemName, orderItemId };
    this.rejectReason = '';
    this.rejectItemError = null;
  }

  CancelRejectItem(): void {
    this.rejectItemTarget = null;
    this.rejectReason = '';
    this.rejectItemError = null;
  }

  ConfirmRejectItem(): void {
    if (!this.restaurantId || !this.rejectItemTarget) return;
    this.isRejectingItem = true;
    this.rejectItemError = null;

    const target = this.rejectItemTarget;
    const reason = this.rejectReason.trim() ? this.rejectReason.trim() : undefined;

    const obs = target.orderItemId
      ? this.restaurantService.rejectOrderItemById(
          this.restaurantId,
          target.tableNum,
          target.tableId,
          target.sessionId,
          target.orderItemId,
          reason
        )
      : this.restaurantService.rejectOrderItem(
          this.restaurantId,
          target.tableNum,
          target.tableId,
          target.sessionId,
          target.itemName,
          reason
        );

    obs.subscribe({
      next: () => {
        this.isRejectingItem = false;
        this.rejectItemTarget = null;
        this.rejectReason = '';
        this.loadData(true);
      },
      error: (err) => {
        this.rejectItemError = extractHttpError(err) || 'Error rejecting item.';
        this.isRejectingItem = false;
      },
    });
  }

  // --- Reset Table Orders Modal ---
  RequestResetOrders(tableNum: number): void {
    this.confirmTableNum = tableNum;
    this.resetOrdersError = null;
  }

  CancelReset(): void {
    this.confirmTableNum = null;
    this.resetOrdersError = null;
  }

  ConfirmReset(): void {
    if (!this.restaurantId || this.confirmTableNum === null) return;
    this.isResettingOrders = true;
    this.resetOrdersError = null;

    this.restaurantService.resetActiveOrdersOfTable(this.restaurantId, this.confirmTableNum).subscribe({
      next: () => {
        this.isResettingOrders = false;
        this.confirmTableNum = null;
        this.loadData(true);
      },
      error: (err) => {
        this.resetOrdersError =
          extractHttpError(err) || 'Error resetting table orders.';
        this.isResettingOrders = false;
      },
    });
  }

  // --- Payment Group Builder (Split Bill) ---
  OpenPaymentGroupBuilder(tableNum: number, tableId: string): void {
    if (!this.restaurant?.parsedTables) return;
    const table = this.restaurant.parsedTables.find((t) => t.tableNumber === tableNum);
    if (!table) return;

    this.groupModalTableNum = tableNum;
    this.groupModalTableId = tableId;
    this.isFlexibleGroupSet = false;
    this.publishGroupError = null;
    this.publishedGroupSet = null;
    this.copyFeedback = null;
    this.showAddCustomItemForm = false;
    this.showCustomItemAutocomplete = false;
    this.customItemSearchCategories.clear();

    this.builderGroups = [
      { id: 'grp_1', name: `${this.loc.translate('AllOrders_GroupNameLabel')} A`, discountAmount: 0 },
      { id: 'grp_2', name: `${this.loc.translate('AllOrders_GroupNameLabel')} B`, discountAmount: 0 },
    ];
    this.newCustomItemTargetGroup = 'grp_1';
    this.builderItems = [];

    let idx = 0;
    const sortedSessions = [...table.sessions].sort((a, b) => a.sessionId.localeCompare(b.sessionId));
    for (const sess of sortedSessions) {
      for (const agg of sess.aggregatedItems) {
        if (this.isItemPayAtCounter(agg)) {
          const itemKey = this.getItemKey(tableNum, tableId, sess.sessionId, agg.dishName);
          const unitPrice = this.GetMenuItemPrice(agg.dishName);
          const matchingOrderItems = this.getMatchingOrderItems(sess, agg);

          if (this.splitRowKeys.has(itemKey) && agg.quantity > 1) {
            for (let s = 0; s < agg.quantity; s++) {
              const subKey = this.getSubItemKey(itemKey, s);
              const oid = s < matchingOrderItems.length ? matchingOrderItems[s].id || null : null;
              this.builderItems.push({
                key: `bi_${idx++}`,
                sessionId: sess.sessionId,
                menuItemName: agg.dishName,
                quantity: 1,
                unitPrice,
                orderItemId: oid,
                assignedGroupId: this.builderGroups[idx % this.builderGroups.length].id,
                isCommon: false,
                isGift: this.selectedGiftKeys.has(subKey),
                isCustom: false,
              });
            }
          } else {
            const firstId = matchingOrderItems.length > 0 ? matchingOrderItems[0].id || null : null;
            this.builderItems.push({
              key: `bi_${idx++}`,
              sessionId: sess.sessionId,
              menuItemName: agg.dishName,
              quantity: agg.quantity,
              unitPrice,
              orderItemId: firstId,
              assignedGroupId: this.builderGroups[idx % this.builderGroups.length].id,
              isCommon: false,
              isGift: this.selectedGiftKeys.has(itemKey),
              isCustom: false,
            });
          }
        }
      }
    }

    this.showPaymentGroupModal = true;
  }

  OpenPaymentGroupBuilderFromSelection(): void {
    if (this.selectedPayAtCounterItems.size === 0) return;
    const first = Array.from(this.selectedPayAtCounterItems.values())[0];

    this.groupModalTableNum = first.tableNum;
    this.groupModalTableId = first.tableId;
    this.isFlexibleGroupSet = false;
    this.publishGroupError = null;
    this.publishedGroupSet = null;
    this.copyFeedback = null;
    this.showAddCustomItemForm = false;
    this.showCustomItemAutocomplete = false;
    this.customItemSearchCategories.clear();

    this.builderGroups = [
      { id: 'grp_1', name: `${this.loc.translate('AllOrders_GroupNameLabel')} A`, discountAmount: 0 },
      { id: 'grp_2', name: `${this.loc.translate('AllOrders_GroupNameLabel')} B`, discountAmount: 0 },
    ];
    this.newCustomItemTargetGroup = 'grp_1';
    this.builderItems = [];

    let idx = 0;
    this.selectedPayAtCounterItems.forEach((v, k) => {
      if (v.tableNum === first.tableNum) {
        this.builderItems.push({
          key: `bi_${idx++}`,
          sessionId: v.sessionId,
          menuItemName: v.menuItemName,
          quantity: v.quantity,
          unitPrice: v.unitPrice,
          orderItemId: v.orderItemId || null,
          assignedGroupId: this.builderGroups[idx % this.builderGroups.length].id,
          isCommon: false,
          isGift: this.selectedGiftKeys.has(k),
          isCustom: false,
        });
      }
    });

    this.showPaymentGroupModal = true;
  }

  ClosePaymentGroupModal(): void {
    this.showPaymentGroupModal = false;
    this.publishedGroupSet = null;
    this.publishGroupError = null;
  }

  AddBuilderGroup(): void {
    const nextNum = this.builderGroups.length + 1;
    const letter = String.fromCharCode(64 + Math.min(26, nextNum));
    this.builderGroups.push({
      id: `grp_${Date.now()}_${nextNum}`,
      name: `${this.loc.translate('AllOrders_GroupNameLabel')} ${letter}`,
      discountAmount: 0,
    });
  }

  RemoveBuilderGroup(groupId: string): void {
    if (this.builderGroups.length <= 1) return;
    this.builderGroups = this.builderGroups.filter((g) => g.id !== groupId);
    const fallbackGroupId = this.builderGroups[0].id;
    for (const item of this.builderItems) {
      if (item.assignedGroupId === groupId) {
        item.assignedGroupId = fallbackGroupId;
      }
    }
  }

  getGroupCardColClass(): string {
    const colSize = Math.max(3, Math.floor(12 / Math.max(1, this.builderGroups.length)));
    return `col-md-${colSize}`;
  }

  getGroupSummary(grp: GroupBuilderGroup): {
    assignedCount: number;
    assignedTotal: number;
    commonShare: number;
    groupSubtotal: number;
    netTotal: number;
    gifts: number;
  } {
    const assignedItems = this.builderItems.filter(
      (i) => !i.isCommon && i.assignedGroupId === grp.id
    );
    const assignedTotal = assignedItems
      .filter((i) => !i.isGift)
      .reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    const commonTotal = this.builderItems
      .filter((i) => i.isCommon && !i.isGift)
      .reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    const commonShare = this.builderGroups.length > 0 ? commonTotal / this.builderGroups.length : 0;
    const groupSubtotal = assignedTotal + commonShare;
    const netTotal = Math.max(0, groupSubtotal - (grp.discountAmount || 0));
    const gifts = assignedItems.filter((i) => i.isGift).length;
    return {
      assignedCount: assignedItems.length,
      assignedTotal,
      commonShare,
      groupSubtotal,
      netTotal,
      gifts,
    };
  }

  getBuilderTotalToSettle(): number {
    return this.builderItems
      .filter((i) => !i.isGift)
      .reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  }

  getCustomBuilderItems(): GroupBuilderItem[] {
    return this.builderItems.filter((i) => i.isCustom);
  }

  getSessionBuilderGroups(): Array<{ sessionId: string; shortSession: string; items: GroupBuilderItem[] }> {
    const map = new Map<string, GroupBuilderItem[]>();
    for (const item of this.builderItems) {
      if (!item.isCustom) {
        if (!map.has(item.sessionId)) {
          map.set(item.sessionId, []);
        }
        map.get(item.sessionId)!.push(item);
      }
    }
    const res: Array<{ sessionId: string; shortSession: string; items: GroupBuilderItem[] }> = [];
    map.forEach((items, sessionId) => {
      res.push({
        sessionId,
        shortSession: this.getShortSecret(sessionId, 8),
        items,
      });
    });
    return res;
  }

  getUnassignedBuilderItemsCount(): number {
    return this.builderItems.filter((i) => !i.isCommon && !i.assignedGroupId).length;
  }

  SetItemAssignment(item: GroupBuilderItem, targetVal: string): void {
    if (targetVal === 'common') {
      item.isCommon = true;
      item.assignedGroupId = '';
    } else if (!targetVal) {
      item.isCommon = false;
      item.assignedGroupId = '';
    } else {
      item.isCommon = false;
      item.assignedGroupId = targetVal;
    }
  }

  AssignEntireSession(sessionId: string, targetVal: string): void {
    for (const item of this.builderItems) {
      if (!item.isCustom && item.sessionId === sessionId) {
        this.SetItemAssignment(item, targetVal);
      }
    }
  }

  updateBuilderItemUnitPrice(item: GroupBuilderItem, event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement)?.value ?? '0');
    if (!isNaN(val) && val >= 0) {
      item.unitPrice = val;
    }
  }

  // --- Custom Item Autocomplete & Add ---
  GetCustomItemAvailableCategories(): string[] {
    const cats = new Set<string>();
    (this.restaurant?.items || []).forEach((m) => {
      if (m.category && m.category.trim()) cats.add(m.category.trim());
    });
    this.extraCatalogueItems.forEach((e) => {
      if (e.category && e.category.trim()) cats.add(e.category.trim());
    });
    return Array.from(cats).sort((a, b) => a.localeCompare(b));
  }

  ToggleCustomItemSearchCategory(category: string): void {
    if (this.customItemSearchCategories.has(category)) {
      this.customItemSearchCategories.delete(category);
    } else {
      this.customItemSearchCategories.add(category);
    }
    this.UpdateCustomItemAutocomplete(this.newCustomItemDescription);
    this.showCustomItemAutocomplete = true;
  }

  ClearCustomItemSearchCategories(): void {
    this.customItemSearchCategories.clear();
    this.UpdateCustomItemAutocomplete(this.newCustomItemDescription);
  }

  OnCustomItemDescriptionInput(event: Event): void {
    this.newCustomItemDescription = (event.target as HTMLInputElement)?.value ?? '';
    this.UpdateCustomItemAutocomplete(this.newCustomItemDescription);
    this.showCustomItemAutocomplete = true;
  }

  OnCustomItemDescriptionFocus(): void {
    this.UpdateCustomItemAutocomplete(this.newCustomItemDescription);
    this.showCustomItemAutocomplete = true;
  }

  ClearCustomItemDescription(): void {
    this.newCustomItemDescription = '';
    this.UpdateCustomItemAutocomplete('');
    this.showCustomItemAutocomplete = true;
  }

  private UpdateCustomItemAutocomplete(query: string): void {
    const q = (query || '').trim().toLowerCase();
    const filterByCat = this.customItemSearchCategories.size > 0;
    const suggestions: CustomItemSuggestion[] = [];
    const seen = new Set<string>();

    (this.restaurant?.items || []).forEach((m) => {
      const cat = m.category && m.category.trim() ? m.category.trim() : '';
      if (filterByCat && (!cat || !this.customItemSearchCategories.has(cat))) return;
      if (!q || m.name.toLowerCase().includes(q) || cat.toLowerCase().includes(q)) {
        seen.add(m.name.toLowerCase());
        suggestions.push({
          name: m.name,
          price: m.price ?? 0,
          category: cat,
          isExtra: false,
          isAvailable: m.available !== false,
        });
      }
    });

    this.extraCatalogueItems.forEach((e) => {
      if (seen.has(e.name.toLowerCase())) return;
      const cat = e.category || '';
      if (filterByCat && (!cat || !this.customItemSearchCategories.has(cat))) return;
      if (!q || e.name.toLowerCase().includes(q) || cat.toLowerCase().includes(q)) {
        seen.add(e.name.toLowerCase());
        suggestions.push({
          name: e.name,
          price: e.price,
          category: cat,
          isExtra: true,
          isAvailable: e.isAvailable,
        });
      }
    });

    suggestions.sort((a, b) => {
      const aStarts = q && a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = q && b.name.toLowerCase().startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      if (a.isExtra !== b.isExtra) return a.isExtra ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

    this.autocompleteResults = suggestions.slice(0, 20);
  }

  SelectCustomItemSuggestion(suggestion: CustomItemSuggestion): void {
    this.newCustomItemDescription = suggestion.name;
    this.newCustomItemUnitPrice = suggestion.price;
    this.showCustomItemAutocomplete = false;
    this.addCustomItemError = null;
  }

  AddCustomItemToBuilder(): void {
    this.addCustomItemError = null;
    const desc = (this.newCustomItemDescription || '').trim();
    if (!desc) {
      this.addCustomItemError = this.loc.translate('AllOrders_CustomItemDescRequired');
      return;
    }
    if (this.newCustomItemUnitPrice <= 0 && !this.newCustomItemIsGift) {
      this.addCustomItemError = this.loc.translate('AllOrders_CustomItemAmountRequired');
      return;
    }
    const qty = Math.max(1, this.newCustomItemQuantity || 1);
    const isCommon = this.newCustomItemTargetGroup === 'common';
    const assignedGroupId = isCommon ? '' : this.newCustomItemTargetGroup;

    this.builderItems.push({
      key: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      sessionId: 'CUSTOM',
      menuItemName: desc,
      quantity: qty,
      unitPrice: Math.max(0, this.newCustomItemUnitPrice),
      orderItemId: null,
      assignedGroupId,
      isCommon,
      isGift: this.newCustomItemIsGift,
      isCustom: true,
    });

    this.newCustomItemDescription = '';
    this.newCustomItemUnitPrice = 0;
    this.newCustomItemQuantity = 1;
    this.newCustomItemIsGift = false;
    this.showCustomItemAutocomplete = false;
    this.showAddCustomItemForm = false;
  }

  RemoveCustomItem(key: string): void {
    this.builderItems = this.builderItems.filter((i) => i.key !== key);
  }

  PublishPaymentGroups(): void {
    if (!this.restaurantId || this.builderGroups.length === 0) return;

    const unassigned = this.getUnassignedBuilderItemsCount();
    if (unassigned > 0) {
      this.publishGroupError = this.formatText('AllOrders_UnassignedItemsWarning', unassigned);
      return;
    }

    this.isPublishingGroups = true;
    this.publishGroupError = null;

    const groupsDto: CreatePaymentGroupDto[] = this.builderGroups.map((g) => {
      const groupSessionItems: SettlePayAtCounterItemSelectionDto[] = this.builderItems
        .filter((i) => !i.isCustom && !i.isCommon && i.assignedGroupId === g.id)
        .map((i) => ({
          TableNum: this.groupModalTableNum,
          TableId: this.groupModalTableId,
          SessionId: i.sessionId,
          MenuItemName: i.menuItemName,
          Quantity: i.quantity,
          OrderItemId: i.orderItemId || null,
          IsGift: i.isGift,
          OverriddenUnitPrice: i.unitPrice > 0 ? i.unitPrice : null,
        }));

      const groupCustomItems: ArbitraryPaymentGroupItemDto[] = this.builderItems
        .filter((i) => i.isCustom && !i.isCommon && i.assignedGroupId === g.id)
        .map((i) => ({
          MenuItemName: i.menuItemName,
          Quantity: i.quantity,
          UnitPrice: i.unitPrice,
          IsGift: i.isGift,
        }));

      return {
        Name: stringOrDefault(g.name, 'Group'),
        Discount: g.discountAmount > 0 ? g.discountAmount : null,
        ItemSelections: groupSessionItems,
        CustomItems: groupCustomItems,
      };
    });

    const commonItemsDto: SettlePayAtCounterItemSelectionDto[] = this.builderItems
      .filter((i) => !i.isCustom && i.isCommon)
      .map((i) => ({
        TableNum: this.groupModalTableNum,
        TableId: this.groupModalTableId,
        SessionId: i.sessionId,
        MenuItemName: i.menuItemName,
        Quantity: i.quantity,
        OrderItemId: i.orderItemId || null,
        IsGift: i.isGift,
        OverriddenUnitPrice: i.unitPrice > 0 ? i.unitPrice : null,
      }));

    const commonCustomItemsDto: ArbitraryPaymentGroupItemDto[] = this.builderItems
      .filter((i) => i.isCustom && i.isCommon)
      .map((i) => ({
        MenuItemName: i.menuItemName,
        Quantity: i.quantity,
        UnitPrice: i.unitPrice,
        IsGift: i.isGift,
      }));

    const req: PublishPaymentGroupSetRequestDto = {
      TableNum: this.groupModalTableNum,
      TableId: this.groupModalTableId,
      IsFlexible: this.isFlexibleGroupSet,
      Groups: groupsDto,
      CommonItemSelections: commonItemsDto,
      CommonCustomItems: commonCustomItemsDto,
    };

    this.restaurantService.publishPaymentGroupSet(this.restaurantId, req).subscribe({
      next: (setModel) => {
        this.publishedGroupSet = setModel;
        this.isPublishingGroups = false;
      },
      error: (err) => {
        this.publishGroupError =
          extractHttpError(err) || 'Error publishing payment groups.';
        this.isPublishingGroups = false;
      },
    });
  }

  getWaiterUrl(): string {
    if (!this.publishedGroupSet) return '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/waiter/table/${this.groupModalTableNum}/payment-groups/${this.publishedGroupSet.setId}`;
  }

  getWaiterQrCodeUrl(): string {
    const waiterUrl = this.getWaiterUrl();
    if (!waiterUrl) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(waiterUrl)}`;
  }

  getGroupPayUrl(groupId: string): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/pay/group/${groupId}`;
  }

  CopyToClipboard(text: string): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        this.copyFeedback = 'Link copiato negli appunti!';
        setTimeout(() => {
          this.copyFeedback = null;
        }, 2000);
      });
    }
  }
}

/**
 * Turns an HttpErrorResponse into a readable string.
 * Handles plain-text bodies, JSON strings, ASP.NET ProblemDetails / ValidationProblemDetails
 * ({ title, detail, errors: { field: [msgs] } }), and falls back to JSON.stringify.
 */
function extractHttpError(err: any): string | null {
  if (!err) return null;
  const body = err.error;
  const status = err.status ? `[${err.status}] ` : '';

  if (typeof body === 'string' && body.trim()) {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === 'object') return status + describeErrorObject(parsed);
    } catch {
      /* not JSON */
    }
    return status + body;
  }
  if (body instanceof ProgressEvent || (body && body.type === 'error' && body.target)) {
    return `${status}Network error: ${err.message || 'request failed'}`;
  }
  if (body && typeof body === 'object') {
    return status + describeErrorObject(body);
  }
  return err.message ? status + err.message : null;
}

function describeErrorObject(obj: any): string {
  const parts: string[] = [];
  const main = obj.message ?? obj.Message ?? obj.detail ?? obj.Detail ?? obj.title ?? obj.Title;
  if (main) parts.push(String(main));
  const errors = obj.errors ?? obj.Errors;
  if (errors && typeof errors === 'object') {
    Object.keys(errors).forEach((k) => {
      const v = errors[k];
      parts.push(`${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`);
    });
  }
  return parts.length ? parts.join(' | ') : JSON.stringify(obj);
}

function stringOrDefault(val: string | undefined | null, fallback: string): string {
  return val && val.trim() ? val.trim() : fallback;
}
