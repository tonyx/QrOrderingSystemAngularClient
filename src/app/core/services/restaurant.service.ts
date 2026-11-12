import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, forkJoin, of, catchError, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  RestaurantItem,
  StripeAccountStatus,
  SelfOrderingMode,
  SelfOrderingConfig,
  VatDepartmentCodeAndRate,
  TipHintItem,
  ExtraCatalogueSetting,
  TableModel,
  TableSessionModel,
  OrderItemModel,
  AggregatedOrderItem,
} from '../models/restaurant.models';
import { PublicRestaurantDetails, MenuItemModel } from '../models/menu.models';

@Injectable({
  providedIn: 'root',
})
export class RestaurantService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl ? environment.apiBaseUrl.replace(/\/$/, '') : '';

  /**
   * Retrieves all restaurants of the current user.
   * Enriches each restaurant with individual detail and Stripe account status if connected.
   */
  getMyRestaurants(): Observable<RestaurantItem[]> {
    const url = `${this.baseUrl}/api/Restaurant/my-restaurants`;
    return this.http.get<unknown[]>(url).pipe(
      map((items) => (Array.isArray(items) ? items.map((raw) => this.normalizeRestaurant(raw)) : [])),
      switchMap((restaurants) => {
        if (!restaurants.length) {
          return of([]);
        }

        const enriched$ = restaurants.map((rest) => this.enrichRestaurant(rest));
        return forkJoin(enriched$);
      })
    );
  }

  getRestaurant(id: string): Observable<RestaurantItem> {
    const url = `${this.baseUrl}/api/Restaurant/${id}`;
    return this.http.get<unknown>(url).pipe(
      map((raw) => this.normalizeRestaurant(raw)),
      switchMap((rest) => this.enrichRestaurant(rest))
    );
  }

  /**
   * Retrieves public details of a restaurant (menu and dishes) for diners / view menu mode.
   * Calls GET /api/Restaurant/public/{id}
   */
  getRestaurantPublic(id: string): Observable<PublicRestaurantDetails> {
    const url = `${this.baseUrl}/api/Restaurant/public/${id}`;
    return this.http.get<any>(url).pipe(
      map((raw) => this.normalizePublicRestaurant(raw))
    );
  }

  getConnectAccountStatus(restaurantId: string): Observable<StripeAccountStatus | null> {
    const url = `${this.baseUrl}/api/StripePayment/restaurant/${restaurantId}/account-status`;
    return this.http.get<any>(url).pipe(
      map((res) => {
        if (!res) return null;
        return {
          isConnected: res.isConnected ?? res.IsConnected ?? false,
          detailsSubmitted: res.detailsSubmitted ?? res.DetailsSubmitted ?? false,
          chargesEnabled: res.chargesEnabled ?? res.ChargesEnabled ?? false,
          payoutsEnabled: res.payoutsEnabled ?? res.PayoutsEnabled ?? false,
          stripeAccountId: res.stripeAccountId ?? res.StripeAccountId ?? null,
          requirementsDue: res.requirementsDue ?? res.RequirementsDue ?? [],
        };
      }),
      catchError(() => of(null))
    );
  }

  // --- Self-Ordering Endpoints ---
  setNoSelfOrdering(restaurantId: string): Observable<void> {
    const url = `${this.baseUrl}/api/Restaurant/${restaurantId}/self-ordering/no`;
    return this.http.post<void>(url, null);
  }

  setCashOnlySelfOrdering(restaurantId: string): Observable<void> {
    const url = `${this.baseUrl}/api/Restaurant/${restaurantId}/self-ordering/cash-only`;
    return this.http.post<void>(url, null);
  }

  setCacheAndStripeSelfOrdering(restaurantId: string): Observable<void> {
    const url = `${this.baseUrl}/api/Restaurant/${restaurantId}/self-ordering/cache-and-stripe`;
    return this.http.post<void>(url, null);
  }

  setOnlyStripeSelfOrdering(restaurantId: string): Observable<void> {
    const url = `${this.baseUrl}/api/Restaurant/${restaurantId}/self-ordering/only-stripe`;
    return this.http.post<void>(url, null);
  }

  setSelfOrderingMode(restaurantId: string, mode: SelfOrderingMode): Observable<void> {
    switch (mode) {
      case 'no':
        return this.setNoSelfOrdering(restaurantId);
      case 'cash-only':
        return this.setCashOnlySelfOrdering(restaurantId);
      case 'cache-and-stripe':
        return this.setCacheAndStripeSelfOrdering(restaurantId);
      case 'only-stripe':
        return this.setOnlyStripeSelfOrdering(restaurantId);
      default:
        return this.setNoSelfOrdering(restaurantId);
    }
  }

  // --- Extra Catalogue API ---
  initializeExtraCatalogue(restaurantId: string): Observable<void> {
    const url = `${this.baseUrl}/api/Catalogue/${restaurantId}/extra-catalogue/initialize`;
    return this.http.post<void>(url, null);
  }

  enableExtraCatalogue(restaurantId: string): Observable<void> {
    const url = `${this.baseUrl}/api/Catalogue/${restaurantId}/extra-catalogue/enable`;
    return this.http.post<void>(url, null);
  }

  disableExtraCatalogue(restaurantId: string): Observable<void> {
    const url = `${this.baseUrl}/api/Catalogue/${restaurantId}/extra-catalogue/disable`;
    return this.http.post<void>(url, null);
  }

  getExtraCatalogue(restaurantId: string): Observable<any> {
    const url = `${this.baseUrl}/api/Catalogue/${restaurantId}/extra-catalogue`;
    return this.http.get<any>(url);
  }

  // --- Seating Fee API ---
  setSeatingFee(restaurantId: string, seatingFee: number): Observable<void> {
    const url = `${this.baseUrl}/api/Restaurant/${restaurantId}/seating-fee`;
    return this.http.post<void>(url, seatingFee);
  }

  // --- Tips Hints API ---
  setShowTips(restaurantId: string, showTips: boolean): Observable<void> {
    const url = `${this.baseUrl}/api/Restaurant/${restaurantId}/show-tips`;
    return this.http.post<void>(url, showTips);
  }

  addTipHint(restaurantId: string, tipHint: number): Observable<void> {
    const url = `${this.baseUrl}/api/Restaurant/${restaurantId}/tips-hints/add`;
    return this.http.post<void>(url, tipHint);
  }

  removeTipHint(restaurantId: string, tipHint: number): Observable<void> {
    const url = `${this.baseUrl}/api/Restaurant/${restaurantId}/tips-hints/${tipHint}`;
    return this.http.delete<void>(url);
  }

  setDefaultTipHint(restaurantId: string, tipHint: number): Observable<void> {
    const url = `${this.baseUrl}/api/Restaurant/${restaurantId}/tips-hints/set-default`;
    return this.http.post<void>(url, tipHint);
  }

  setNoDefaultTipHint(restaurantId: string): Observable<void> {
    const url = `${this.baseUrl}/api/Restaurant/${restaurantId}/tips-hints/set-no-default`;
    return this.http.post<void>(url, null);
  }

  resetTipsHints(restaurantId: string): Observable<void> {
    const url = `${this.baseUrl}/api/Restaurant/${restaurantId}/tips-hints/reset`;
    return this.http.post<void>(url, null);
  }

  // --- VAT Department Codes & Rates API ---
  addExtraVatDepartment(restaurantId: string, vat: { code: string; rate: number }): Observable<void> {
    const url = `${this.baseUrl}/api/Restaurant/${restaurantId}/vat-department/add`;
    return this.http.post<void>(url, { Code: vat.code, Rate: vat.rate });
  }

  removeExtraVatDepartment(restaurantId: string, code: string): Observable<void> {
    const url = `${this.baseUrl}/api/Restaurant/${restaurantId}/vat-department/remove`;
    return this.http.post<void>(url, JSON.stringify(code), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // --- Table Operations API ---
  addTable(restaurantId: string, table: { additionalInfo?: string | null; maxSessions: number }): Observable<void> {
    const url = `${this.baseUrl}/api/Restaurant/${restaurantId}/table/add`;
    const tableGuid = crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-0000-0000-000000000000';
    const payload = {
      Id: tableGuid,
      OptAdditionalInfo: table.additionalInfo ? table.additionalInfo : null,
      MaxSessions: table.maxSessions,
      Orders: {},
      OverWriteSelfOrderingConfig: null,
      SkipSeatFee: false,
      SeatingFeePaidSessions: [],
    };
    return this.http.post<void>(url, payload);
  }

  removeTopTable(restaurantId: string): Observable<void> {
    const url = `${this.baseUrl}/api/Restaurant/${restaurantId}/table/remove-top`;
    return this.http.post<void>(url, null);
  }

  regenerateTableId(restaurantId: string, tableNumber: number): Observable<void> {
    const url = `${this.baseUrl}/api/Restaurant/${restaurantId}/table/${tableNumber}/regenerate`;
    return this.http.post<void>(url, null);
  }

  changeMaxSessions(restaurantId: string, tableNumber: number, maxSessions: number): Observable<void> {
    const url = `${this.baseUrl}/api/Restaurant/${restaurantId}/table/${tableNumber}/max-sessions/${maxSessions}`;
    return this.http.post<void>(url, null);
  }

  setSkipSeatFee(restaurantId: string, tableNumber: number, skip: boolean): Observable<void> {
    const url = `${this.baseUrl}/api/Restaurant/${restaurantId}/table/${tableNumber}/skip-seat-fee/${skip}`;
    return this.http.post<void>(url, null);
  }

  setTableSelfOrdering(restaurantId: string, tableNumber: number, option: 'reset' | 'no' | 'cash-only' | 'cache-and-stripe' | 'only-stripe'): Observable<void> {
    let endpoint = 'reset';
    if (option === 'no') endpoint = 'no';
    else if (option === 'cash-only') endpoint = 'cash-only';
    else if (option === 'cache-and-stripe') endpoint = 'cache-and-stripe';
    else if (option === 'only-stripe') endpoint = 'only-stripe';

    const url = `${this.baseUrl}/api/Restaurant/${restaurantId}/tables/${tableNumber}/self-ordering/${endpoint}`;
    return this.http.post<void>(url, null);
  }

  resetActiveOrdersOfTable(restaurantId: string, tableNumber: number): Observable<void> {
    const url = `${this.baseUrl}/api/Restaurant/${restaurantId}/tables/${tableNumber}/orders/reset-active`;
    return this.http.post<void>(url, null);
  }

  makeOrderItemDone(restaurantId: string, tableNumber: number, tableId: string, sessionId: string, menuItemName: string): Observable<void> {
    const url = `${this.baseUrl}/api/Restaurant/${restaurantId}/table/session/menu/done`;
    return this.http.post<void>(url, {
      TableNum: tableNumber,
      TableId: tableId,
      SessionId: sessionId,
      MenuItemName: menuItemName,
    });
  }

  rejectOrderItem(restaurantId: string, tableNumber: number, tableId: string, sessionId: string, menuItemName: string, reason?: string): Observable<void> {
    const url = `${this.baseUrl}/api/Restaurant/${restaurantId}/table/session/menu/reject`;
    return this.http.post<void>(url, {
      TableNum: tableNumber,
      TableId: tableId,
      SessionId: sessionId,
      MenuItemName: menuItemName,
      Reason: reason || null,
    });
  }

  // --- Customer / Diner Public Ordering Endpoints ---

  attachSessionToTable(restaurantId: string, tableNumber: number, tableId: string, sessionId: string): Observable<void> {
    const url = `${this.baseUrl}/api/Restaurant/public/${restaurantId}/table/session/attach`;
    return this.http.post<void>(url, {
      TableNum: tableNumber,
      TableId: tableId,
      SessionId: sessionId,
    });
  }

  detachSessionFromTable(restaurantId: string, sessionId: string): Observable<void> {
    const url = `${this.baseUrl}/api/Restaurant/public/${restaurantId}/table/session/detach`;
    return this.http.post<void>(url, {
      SessionId: sessionId,
    });
  }

  addMenuItemPerSession(restaurantId: string, tableNumber: number, tableId: string, sessionId: string, menuItemName: string): Observable<void> {
    const url = `${this.baseUrl}/api/Restaurant/public/${restaurantId}/table/session/menu/add`;
    return this.http.post<void>(url, {
      TableNum: tableNumber,
      TableId: tableId,
      SessionId: sessionId,
      MenuItemName: menuItemName,
    });
  }

  removeMenuItemPerSession(restaurantId: string, tableNumber: number, tableId: string, sessionId: string, menuItemName: string): Observable<void> {
    const url = `${this.baseUrl}/api/Restaurant/public/${restaurantId}/table/session/menu/remove`;
    return this.http.post<void>(url, {
      TableNum: tableNumber,
      TableId: tableId,
      SessionId: sessionId,
      MenuItemName: menuItemName,
    });
  }

  confirmOrdersPerSession(restaurantId: string, tableNumber: number, tableId: string, sessionId: string): Observable<void> {
    const url = `${this.baseUrl}/api/Restaurant/public/${restaurantId}/table/session/confirm-all`;
    return this.http.post<void>(url, {
      TableNum: tableNumber,
      TableId: tableId,
      SessionId: sessionId,
    });
  }

  confirmOrdersPerSession2(restaurantId: string, tableNumber: number, tableId: string, sessionId: string): Observable<void> {
    const url = `${this.baseUrl}/api/Restaurant/public/${restaurantId}/table/session/confirm-all-2`;
    return this.http.post<void>(url, {
      TableNum: tableNumber,
      TableId: tableId,
      SessionId: sessionId,
    });
  }

  setFiscalMetadataPerSession(
    restaurantId: string,
    tableNumber: number,
    tableId: string,
    sessionId: string,
    codiceFiscale?: string,
    codiceLotteria?: string
  ): Observable<void> {
    const url = `${this.baseUrl}/api/Restaurant/public/${restaurantId}/table/session/fiscal-metadata/set`;
    return this.http.post<void>(url, {
      TableNum: tableNumber,
      TableId: tableId,
      SessionId: sessionId,
      CodiceFiscale: codiceFiscale || null,
      CodiceLotteria: codiceLotteria || null,
    });
  }

  unsetFiscalMetadataPerSession(restaurantId: string, tableNumber: number, tableId: string, sessionId: string): Observable<void> {
    const url = `${this.baseUrl}/api/Restaurant/public/${restaurantId}/table/session/fiscal-metadata/unset`;
    return this.http.post<void>(url, {
      TableNum: tableNumber,
      TableId: tableId,
      SessionId: sessionId,
    });
  }

  voteMenuItem(restaurantId: string, menuItemName: string, sessionId: string, stars: number): Observable<void> {
    const url = `${this.baseUrl}/api/Voting/vote`;
    return this.http.post<void>(url, {
      RestaurantId: restaurantId,
      MenuItemName: menuItemName,
      SessionId: sessionId,
      Stars: stars,
    });
  }

  createPaymentIntent(
    restaurantId: string,
    tableNumber: number,
    tableId: string,
    amountCents: number,
    currency: string,
    sessionId: string,
    items?: string,
    tipAmountCents?: number
  ): Observable<string> {
    const url = `${this.baseUrl}/api/StripePayment/restaurant/${restaurantId}/create-payment-intent`;
    return this.http
      .post<any>(url, {
        TableNum: tableNumber,
        TableId: tableId,
        Amount: amountCents,
        Currency: currency,
        SessionId: sessionId,
        Items: items || null,
        TipAmount: tipAmountCents || null,
      })
      .pipe(
        map((res) => {
          if (typeof res === 'string') return res;
          return res?.clientSecret || res?.ClientSecret || res?.secret || res?.Secret || '';
        })
      );
  }

  getStripePublishableKey(): Observable<string> {
    const url = `${this.baseUrl}/api/StripePayment/publishable-key`;
    return this.http.get<any>(url).pipe(
      map((res) => res?.publishableKey || res?.PublishableKey || '')
    );
  }

  getStripeEnabled(): Observable<boolean> {
    const url = `${this.baseUrl}/api/StripePayment/stripe-enabled`;
    return this.http.get<any>(url).pipe(
      map((res) => !!(res?.stripeEnabled ?? res?.StripeEnabled ?? true)),
      catchError(() => of(true))
    );
  }

  private enrichRestaurant(rest: RestaurantItem): Observable<RestaurantItem> {
    if (!rest.restaurantId) {
      return of(rest);
    }

    return this.getConnectAccountStatus(rest.restaurantId).pipe(
      map((stripeStatus) => {
        const isStripeConnected =
          stripeStatus?.isConnected ||
          rest.paymentConfig?.isStripeEnabled ||
          !!stripeStatus?.stripeAccountId;

        return {
          ...rest,
          stripeStatus,
          paymentConfig: {
            ...rest.paymentConfig,
            isStripeEnabled: isStripeConnected,
            isCashOnly: !isStripeConnected,
            stripeAccountId: stripeStatus?.stripeAccountId || rest.paymentConfig?.stripeAccountId || null,
          },
        };
      }),
      catchError(() => of(rest))
    );
  }

  private normalizePublicRestaurant(raw: any): PublicRestaurantDetails {
    let restaurantId = '';
    const rawId = raw?.restaurantId ?? raw?.RestaurantId ?? raw?.id ?? raw?.Id;
    if (typeof rawId === 'string') {
      restaurantId = rawId;
    } else if (rawId && typeof rawId === 'object') {
      restaurantId = rawId.fields?.[0] || rawId.value || rawId.Value || '';
    }

    let restaurantName = 'Unnamed Restaurant';
    const rawName = raw?.restaurantName ?? raw?.RestaurantName ?? raw?.name ?? raw?.Name;
    if (typeof rawName === 'string') {
      restaurantName = rawName;
    } else if (rawName && typeof rawName === 'object') {
      restaurantName = rawName.fields?.[0] || rawName.value || rawName.Value || restaurantName;
    }

    const humanReviewed = raw?.humanReviewed ?? raw?.HumanReviewed ?? false;

    // Extract current menu items
    const rawMenus = raw?.menus ?? raw?.Menus;
    let menuName = 'Menu';
    const items: MenuItemModel[] = [];

    let currentMenu: any = null;
    if (rawMenus) {
      const idx = rawMenus.curentMenuIndex ?? rawMenus.CurentMenuIndex ?? 0;
      const list = rawMenus.menus ?? rawMenus.Menus;
      if (Array.isArray(list) && list.length > 0) {
        currentMenu = list[idx] || list[0];
      }
    }

    if (currentMenu) {
      menuName = currentMenu.menuName ?? currentMenu.MenuName ?? 'Menu';
      const rawItems = currentMenu.menuItems ?? currentMenu.MenuItems;

      if (Array.isArray(rawItems)) {
        rawItems.forEach((entry: any, i: number) => {
          // F# Map<OptCategory*int, MenuItem> serializes to:
          // [ [ "CategoryName", orderIndex ], { ...MenuItemFields... } ]
          if (Array.isArray(entry) && entry.length >= 2) {
            const keyTuple = entry[0];
            const itemObj = entry[1];
            const categoryHint = Array.isArray(keyTuple) && keyTuple.length > 0 ? keyTuple[0] : undefined;
            const orderIndex = Array.isArray(keyTuple) && keyTuple.length > 1 && typeof keyTuple[1] === 'number' ? keyTuple[1] : i;
            items.push(this.normalizeMenuItem(itemObj, orderIndex, categoryHint));
          } else {
            items.push(this.normalizeMenuItem(entry, i));
          }
        });
      } else if (rawItems && typeof rawItems === 'object') {
        Object.keys(rawItems).forEach((k, i) => {
          items.push(this.normalizeMenuItem(rawItems[k], i, k));
        });
      }
    }

    const rawTables = raw?.tables ?? raw?.Tables;
    const parsedTables = this.normalizeTables(rawTables);
    const seatingFee = raw?.seatingFee ?? raw?.SeatingFee ?? 0;
    const showTips = !!(raw?.showTips ?? raw?.ShowTips);

    // Tips Hints parsing
    const tipsHints: TipHintItem[] = [];
    const rawTipsHints = raw?.tipsHints ?? raw?.TipsHints;
    let hintsList: any[] = [];
    if (Array.isArray(rawTipsHints)) {
      hintsList = rawTipsHints;
    } else if (rawTipsHints && typeof rawTipsHints === 'object') {
      const field0 = rawTipsHints.fields?.[0] || rawTipsHints.Fields?.[0];
      if (Array.isArray(field0)) {
        hintsList = field0;
      }
    }
    if (Array.isArray(hintsList)) {
      hintsList.forEach((h: any) => {
        if (Array.isArray(h) && h.length >= 2) {
          tipsHints.push({ percentage: Number(h[0]), isDefault: Boolean(h[1]) });
        } else if (typeof h === 'object' && h !== null) {
          const pct = h.item1 ?? h.Item1 ?? h.percentage ?? h.Percentage;
          const isDef = h.item2 ?? h.Item2 ?? h.isDefault ?? h.IsDefault ?? false;
          if (pct !== undefined) {
            tipsHints.push({ percentage: Number(pct), isDefault: Boolean(isDef) });
          }
        }
      });
    }

    // Payment Config
    const rawPayment = raw?.paymentConfig ?? raw?.PaymentConfig;
    let isStripeEnabled = false;
    let stripeAccountId: string | null = null;
    if (rawPayment) {
      if (typeof rawPayment === 'string') {
        isStripeEnabled = rawPayment.toLowerCase().includes('stripe');
      } else if (typeof rawPayment === 'object') {
        const caseName = (rawPayment.case || rawPayment.Case || '').toString();
        if (caseName.toLowerCase().includes('stripe')) {
          isStripeEnabled = true;
          const firstField = rawPayment.fields?.[0] || rawPayment.Fields?.[0];
          if (typeof firstField === 'string') {
            stripeAccountId = firstField;
          } else if (firstField && typeof firstField === 'object') {
            stripeAccountId = firstField.fields?.[0] || firstField.value || firstField.Value || null;
          }
        } else if (rawPayment.isStripeEnabled ?? rawPayment.IsStripeEnabled) {
          isStripeEnabled = true;
          stripeAccountId = rawPayment.stripeAccountId ?? rawPayment.StripeAccountId ?? null;
        } else if (rawPayment.destination || rawPayment.Destination) {
          isStripeEnabled = true;
          const dest = rawPayment.destination || rawPayment.Destination;
          stripeAccountId = typeof dest === 'string' ? dest : (dest.fields?.[0] || dest.value || null);
        }
      }
    }

    const paymentConfig = {
      isStripeEnabled,
      isCashOnly: !isStripeEnabled,
      stripeAccountId,
      currency: rawPayment?.currency ?? rawPayment?.Currency ?? 'EUR',
    };

    // Self ordering config
    const rawSelfOrder = raw?.selfOrderingConfig ?? raw?.SelfOrderingConfig;
    let selfOrderConfig: SelfOrderingConfig = {
      mode: 'no',
      isNoSelfOrdering: true,
      isCashOnlySelfOrdering: false,
      isCacheAndStripeSelfOrdering: false,
      isOnlyStripeSelfOrdering: false,
      isEnabled: false,
    };
    const caseName = typeof rawSelfOrder === 'string'
      ? rawSelfOrder
      : (rawSelfOrder?.case || rawSelfOrder?.Case || '').toString();

    switch (caseName) {
      case 'CashOnlySelfOrdering':
        selfOrderConfig = {
          mode: 'cash-only',
          isNoSelfOrdering: false,
          isCashOnlySelfOrdering: true,
          isCacheAndStripeSelfOrdering: false,
          isOnlyStripeSelfOrdering: false,
          isEnabled: true,
        };
        break;
      case 'CacheAndStripeSelfOrdering':
        selfOrderConfig = {
          mode: 'cache-and-stripe',
          isNoSelfOrdering: false,
          isCashOnlySelfOrdering: false,
          isCacheAndStripeSelfOrdering: true,
          isOnlyStripeSelfOrdering: false,
          isEnabled: true,
        };
        break;
      case 'OnlyStripeSelfOrdering':
        selfOrderConfig = {
          mode: 'only-stripe',
          isNoSelfOrdering: false,
          isCashOnlySelfOrdering: false,
          isCacheAndStripeSelfOrdering: false,
          isOnlyStripeSelfOrdering: true,
          isEnabled: true,
        };
        break;
      case 'NoSelfOrdering':
      default:
        selfOrderConfig = {
          mode: 'no',
          isNoSelfOrdering: true,
          isCashOnlySelfOrdering: false,
          isCacheAndStripeSelfOrdering: false,
          isOnlyStripeSelfOrdering: false,
          isEnabled: false,
        };
        break;
    }

    // Extra Catalogue Setting parsing
    const rawExtraCat = raw?.extraCatalogueSetting ?? raw?.ExtraCatalogueSetting;
    let extraCatSetting: ExtraCatalogueSetting = {
      isUnavailable: true,
      isEnabled: false,
      isDisabled: false,
      extraCatalogueId: null,
    };
    if (rawExtraCat) {
      const catCase = (rawExtraCat.case || rawExtraCat.Case || (typeof rawExtraCat === 'string' ? rawExtraCat : '')).toString();
      const firstField = rawExtraCat.fields?.[0] || rawExtraCat.Fields?.[0];
      const catId = typeof firstField === 'string'
        ? firstField
        : (firstField?.fields?.[0] || firstField?.value || firstField?.Value || null);

      if (catCase === 'Enabled') {
        extraCatSetting = {
          isUnavailable: false,
          isEnabled: true,
          isDisabled: false,
          extraCatalogueId: catId,
        };
      } else if (catCase === 'Disabled') {
        extraCatSetting = {
          isUnavailable: false,
          isEnabled: false,
          isDisabled: true,
          extraCatalogueId: catId,
        };
      }
    }

    return {
      restaurantId,
      restaurantName,
      humanReviewed,
      menuName,
      items,
      tables: rawTables,
      parsedTables,
      seatingFee,
      paymentConfig,
      selfOrderingConfig: selfOrderConfig,
      showTips,
      tipsHints,
      extraCatalogueSetting: extraCatSetting,
      raw,
    };
  }

  private normalizeMenuItem(raw: any, fallbackIndex: number, keyHint?: string): MenuItemModel {
    const rawItem = raw?.item || raw?.value || raw?.Value || raw;

    let name = rawItem?.name ?? rawItem?.Name ?? 'Unnamed Item';
    if (typeof name === 'object' && name) {
      name = name.fields?.[0] || name.value || name.Value || 'Unnamed Item';
    }

    let description = rawItem?.description ?? rawItem?.Description ?? '';
    if (typeof description === 'object' && description) {
      description = description.fields?.[0] || description.value || description.Value || '';
    }

    // Category
    let category = keyHint || 'Dishes';
    const rawCat = rawItem?.category ?? rawItem?.Category;
    if (typeof rawCat === 'string' && rawCat) {
      category = rawCat;
    } else if (rawCat && typeof rawCat === 'object') {
      category = rawCat.fields?.[0] || rawCat.value || rawCat.Value || category;
    } else if (typeof keyHint === 'string' && (keyHint.includes(';') || keyHint.includes(','))) {
      const parts = keyHint.split(/[,;]/);
      if (parts[0]) category = parts[0].replace(/[\(\)"]/g, '').trim() || category;
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
      const p = rawItem?.price ?? rawItem?.Price;
      if (typeof p === 'number') {
        price = p;
      } else if (p && typeof p === 'object') {
        price = p.fields?.[0] ?? p.value ?? null;
      }
    }

    // Image URL
    let imageUrl: string | null = null;
    const rawImg = rawItem?.imageUrl ?? rawItem?.ImageUrl;
    if (typeof rawImg === 'string') {
      imageUrl = rawImg;
    } else if (rawImg && typeof rawImg === 'object') {
      imageUrl = rawImg.fields?.[0] || rawImg.value || null;
    }

    // Ratings counts & stats
    const fiveStarVotesCount = Number(rawItem?.fiveStarVotesCount ?? rawItem?.FiveStarVotesCount ?? 0);
    const fourStarVotesCount = Number(rawItem?.fourStarVotesCount ?? rawItem?.FourStarVotesCount ?? 0);
    const threeStarVotesCount = Number(rawItem?.threeStarVotesCount ?? rawItem?.ThreeStarVotesCount ?? 0);
    const twoStarVotesCount = Number(rawItem?.twoStarVotesCount ?? rawItem?.TwoStarVotesCount ?? 0);
    const oneStarVotesCount = Number(rawItem?.oneStarVotesCount ?? rawItem?.OneStarVotesCount ?? 0);
    const totalVotes = oneStarVotesCount + twoStarVotesCount + threeStarVotesCount + fourStarVotesCount + fiveStarVotesCount;
    let ratingStats = { mean: 0, stdDev: 0 };
    if (totalVotes > 0) {
      const sumWeighted = 1.0 * oneStarVotesCount + 2.0 * twoStarVotesCount + 3.0 * threeStarVotesCount + 4.0 * fourStarVotesCount + 5.0 * fiveStarVotesCount;
      const mean = sumWeighted / totalVotes;
      const variance = (
        oneStarVotesCount * Math.pow(1.0 - mean, 2) +
        twoStarVotesCount * Math.pow(2.0 - mean, 2) +
        threeStarVotesCount * Math.pow(3.0 - mean, 2) +
        fourStarVotesCount * Math.pow(4.0 - mean, 2) +
        fiveStarVotesCount * Math.pow(5.0 - mean, 2)
      ) / totalVotes;
      ratingStats = { mean, stdDev: Math.sqrt(variance) };
    }

    return {
      name,
      category,
      orderIndex: fallbackIndex,
      description,
      price,
      imageUrl,
      available: rawItem?.available ?? rawItem?.Available ?? true,
      allergens: rawItem?.allergens ?? rawItem?.Allergens ?? {},
      translations: rawItem?.translations ?? rawItem?.Translations ?? {},
      isExtra: false,
      fiveStarVotesCount,
      fourStarVotesCount,
      threeStarVotesCount,
      twoStarVotesCount,
      oneStarVotesCount,
      ratingStats,
    };
  }

  private normalizeRestaurant(raw: any): RestaurantItem {
    let restaurantId = '';
    const rawId = raw?.restaurantId ?? raw?.RestaurantId ?? raw?.id ?? raw?.Id;
    if (typeof rawId === 'string') {
      restaurantId = rawId;
    } else if (rawId && typeof rawId === 'object') {
      restaurantId = rawId.fields?.[0] || rawId.value || rawId.Value || '';
    }

    let restaurantName = 'Unnamed Restaurant';
    const rawName = raw?.restaurantName ?? raw?.RestaurantName ?? raw?.name ?? raw?.Name;
    if (typeof rawName === 'string') {
      restaurantName = rawName;
    } else if (rawName && typeof rawName === 'object') {
      restaurantName = rawName.fields?.[0] || rawName.value || rawName.Value || restaurantName;
    }

    const rawTables = raw?.tables ?? raw?.Tables;
    let tablesCount = 0;
    let hasActiveOrders = false;

    if (Array.isArray(rawTables)) {
      tablesCount = rawTables.length;
      hasActiveOrders = rawTables.some((t: any) => {
        const orders = t?.orders ?? t?.Orders;
        if (!orders) return false;
        if (Array.isArray(orders)) return orders.length > 0;
        if (typeof orders === 'object') return Object.keys(orders).length > 0;
        return false;
      });
    } else if (rawTables && typeof rawTables === 'object') {
      const keys = Object.keys(rawTables);
      tablesCount = keys.length;
      hasActiveOrders = keys.some((k) => {
        const t = rawTables[k];
        const orders = t?.orders ?? t?.Orders;
        if (!orders) return false;
        if (Array.isArray(orders)) return orders.length > 0;
        if (typeof orders === 'object') return Object.keys(orders).length > 0;
        return false;
      });
    }

    const rawPayment = raw?.paymentConfig ?? raw?.PaymentConfig;
    let isStripeEnabled = false;
    let stripeAccountId: string | null = null;

    if (rawPayment) {
      if (typeof rawPayment === 'string') {
        isStripeEnabled = rawPayment.toLowerCase().includes('stripe');
      } else if (typeof rawPayment === 'object') {
        const caseName = (rawPayment.case || rawPayment.Case || '').toString();
        if (caseName.toLowerCase().includes('stripe')) {
          isStripeEnabled = true;
          const firstField = rawPayment.fields?.[0] || rawPayment.Fields?.[0];
          if (typeof firstField === 'string') {
            stripeAccountId = firstField;
          } else if (firstField && typeof firstField === 'object') {
            stripeAccountId = firstField.fields?.[0] || firstField.value || firstField.Value || null;
          }
        } else if (rawPayment.isStripeEnabled ?? rawPayment.IsStripeEnabled) {
          isStripeEnabled = true;
          stripeAccountId = rawPayment.stripeAccountId ?? rawPayment.StripeAccountId ?? null;
        } else if (rawPayment.destination || rawPayment.Destination) {
          isStripeEnabled = true;
          const dest = rawPayment.destination || rawPayment.Destination;
          stripeAccountId = typeof dest === 'string' ? dest : (dest.fields?.[0] || dest.value || null);
        }
      }
    }

    const paymentConfig = {
      isStripeEnabled,
      isCashOnly: !isStripeEnabled,
      stripeAccountId,
      currency: rawPayment?.currency ?? rawPayment?.Currency ?? 'EUR',
    };

    const rawSelfOrder = raw?.selfOrderingConfig ?? raw?.SelfOrderingConfig;
    let selfOrderConfig: SelfOrderingConfig = {
      mode: 'no',
      isNoSelfOrdering: true,
      isCashOnlySelfOrdering: false,
      isCacheAndStripeSelfOrdering: false,
      isOnlyStripeSelfOrdering: false,
      isEnabled: false,
    };

    const caseName = typeof rawSelfOrder === 'string'
      ? rawSelfOrder
      : (rawSelfOrder?.case || rawSelfOrder?.Case || '').toString();

    switch (caseName) {
      case 'CashOnlySelfOrdering':
        selfOrderConfig = {
          mode: 'cash-only',
          isNoSelfOrdering: false,
          isCashOnlySelfOrdering: true,
          isCacheAndStripeSelfOrdering: false,
          isOnlyStripeSelfOrdering: false,
          isEnabled: true,
        };
        break;
      case 'CacheAndStripeSelfOrdering':
        selfOrderConfig = {
          mode: 'cache-and-stripe',
          isNoSelfOrdering: false,
          isCashOnlySelfOrdering: false,
          isCacheAndStripeSelfOrdering: true,
          isOnlyStripeSelfOrdering: false,
          isEnabled: true,
        };
        break;
      case 'OnlyStripeSelfOrdering':
        selfOrderConfig = {
          mode: 'only-stripe',
          isNoSelfOrdering: false,
          isCashOnlySelfOrdering: false,
          isCacheAndStripeSelfOrdering: false,
          isOnlyStripeSelfOrdering: true,
          isEnabled: true,
        };
        break;
      case 'NoSelfOrdering':
      default:
        selfOrderConfig = {
          mode: 'no',
          isNoSelfOrdering: true,
          isCashOnlySelfOrdering: false,
          isCacheAndStripeSelfOrdering: false,
          isOnlyStripeSelfOrdering: false,
          isEnabled: false,
        };
        break;
    }

    const seatingFee = raw?.seatingFee ?? raw?.SeatingFee ?? 0;
    const showTips = !!(raw?.showTips ?? raw?.ShowTips);

    // Tips Hints parsing: F# TipHints of List<int * bool>
    // JSON shape typically: { case: "TipHints", fields: [ [ [10, false], [15, true] ] ] } or [ [10, false], [15, true] ]
    const tipsHints: TipHintItem[] = [];
    const rawTipsHints = raw?.tipsHints ?? raw?.TipsHints;
    let hintsList: any[] = [];
    if (Array.isArray(rawTipsHints)) {
      hintsList = rawTipsHints;
    } else if (rawTipsHints && typeof rawTipsHints === 'object') {
      const field0 = rawTipsHints.fields?.[0] || rawTipsHints.Fields?.[0];
      if (Array.isArray(field0)) {
        hintsList = field0;
      }
    }
    if (Array.isArray(hintsList)) {
      hintsList.forEach((h: any) => {
        if (Array.isArray(h) && h.length >= 2) {
          tipsHints.push({ percentage: Number(h[0]), isDefault: Boolean(h[1]) });
        } else if (typeof h === 'object' && h !== null) {
          const pct = h.item1 ?? h.Item1 ?? h.percentage ?? h.Percentage;
          const isDef = h.item2 ?? h.Item2 ?? h.isDefault ?? h.IsDefault ?? false;
          if (pct !== undefined) {
            tipsHints.push({ percentage: Number(pct), isDefault: Boolean(isDef) });
          }
        }
      });
    }

    // Default & Extra VAT Department Codes
    const parseVatItem = (item: any): VatDepartmentCodeAndRate | null => {
      if (!item) return null;
      let code = '';
      const rawCode = item.vatDepartmentCode ?? item.VatDepartmentCode;
      if (typeof rawCode === 'string') {
        code = rawCode;
      } else if (rawCode && typeof rawCode === 'object') {
        code = rawCode.fields?.[0] || rawCode.value || rawCode.Value || '';
      }
      const rate = Number(item.rate ?? item.Rate ?? 0);
      return code ? { code, rate } : null;
    };

    const defaultVat = parseVatItem(raw?.defaultVatDepartmentCodeAndRate ?? raw?.DefaultVatDepartmentCodeAndRate) || {
      code: 'Rep1',
      rate: 10,
    };

    const rawExtraVat = raw?.extraVatDepartmentCodeAndRate ?? raw?.ExtraVatDepartmentCodeAndRate;
    const extraVatDepartmentCodeAndRate: VatDepartmentCodeAndRate[] = [];
    if (Array.isArray(rawExtraVat)) {
      rawExtraVat.forEach((ev: any) => {
        const parsed = parseVatItem(ev);
        if (parsed) extraVatDepartmentCodeAndRate.push(parsed);
      });
    }

    const vatDepartmentCodeAndRates: VatDepartmentCodeAndRate[] = [
      defaultVat,
      ...extraVatDepartmentCodeAndRate.filter((ev) => ev.code !== defaultVat.code),
    ];

    // Extra Catalogue Setting parsing
    // F#: | Unavailable | Enabled of ExtraCatalogueId | Disabled of ExtraCatalogueId
    const rawExtraCat = raw?.extraCatalogueSetting ?? raw?.ExtraCatalogueSetting;
    let extraCatSetting: ExtraCatalogueSetting = {
      isUnavailable: true,
      isEnabled: false,
      isDisabled: false,
      extraCatalogueId: null,
    };

    if (rawExtraCat) {
      const catCase = (rawExtraCat.case || rawExtraCat.Case || (typeof rawExtraCat === 'string' ? rawExtraCat : '')).toString();
      const firstField = rawExtraCat.fields?.[0] || rawExtraCat.Fields?.[0];
      const catId = typeof firstField === 'string'
        ? firstField
        : (firstField?.fields?.[0] || firstField?.value || firstField?.Value || null);

      if (catCase === 'Enabled') {
        extraCatSetting = {
          isUnavailable: false,
          isEnabled: true,
          isDisabled: false,
          extraCatalogueId: catId,
        };
      } else if (catCase === 'Disabled') {
        extraCatSetting = {
          isUnavailable: false,
          isEnabled: false,
          isDisabled: true,
          extraCatalogueId: catId,
        };
      } else {
        extraCatSetting = {
          isUnavailable: true,
          isEnabled: false,
          isDisabled: false,
          extraCatalogueId: null,
        };
      }
    }

    const currentMenuName = raw?.currentMenuName ?? raw?.CurrentMenuName ?? raw?.currentMenu?.menuName ?? raw?.CurrentMenu?.MenuName ?? 'Main Menu';
    const rawOtherMenus = raw?.otherAvailableMenus ?? raw?.OtherAvailableMenus ?? [];
    const otherAvailableMenus: Array<[number, string]> = [];
    if (Array.isArray(rawOtherMenus)) {
      rawOtherMenus.forEach((m: any) => {
        if (Array.isArray(m) && m.length >= 2) {
          otherAvailableMenus.push([Number(m[0]), String(m[1])]);
        } else if (m && typeof m === 'object') {
          const idx = m.item1 ?? m.Item1;
          const name = m.item2 ?? m.Item2;
          if (idx !== undefined && name !== undefined) {
            otherAvailableMenus.push([Number(idx), String(name)]);
          }
        }
      });
    }

    const humanReviewed = !!(raw?.humanReviewed ?? raw?.HumanReviewed);
    const parsedTables = this.normalizeTables(rawTables);

    return {
      restaurantId,
      restaurantName,
      tablesCount: parsedTables.length > 0 ? parsedTables.length : tablesCount,
      tables: rawTables,
      parsedTables,
      hasActiveOrders: hasActiveOrders || parsedTables.some((t) => t.hasActiveOrders),
      seatingFee,
      showTips,
      tipsHints,
      defaultVatDepartmentCodeAndRate: defaultVat,
      extraVatDepartmentCodeAndRate,
      vatDepartmentCodeAndRates,
      extraCatalogueSetting: extraCatSetting,
      currentMenuName,
      otherAvailableMenus,
      humanReviewed,
      paymentConfig,
      selfOrderingConfig: selfOrderConfig,
      subscription: raw?.subscription ?? raw?.Subscription,
      stockInventorySettings: raw?.stockInventorySettings ?? raw?.StockInventorySettings,
      raw,
    };
  }

  private normalizeTables(rawTables: any): TableModel[] {
    if (!rawTables) return [];
    const result: TableModel[] = [];

    const parseTableObj = (keyNum: number, t: any): TableModel => {
      let tableId = '';
      const rawId = t?.id ?? t?.Id;
      if (typeof rawId === 'string') {
        tableId = rawId;
      } else if (rawId && typeof rawId === 'object') {
        tableId = rawId.fields?.[0] || rawId.value || rawId.Value || '';
      }

      let additionalInfo: string | null = null;
      const rawInfo = t?.optAdditionalInfo ?? t?.OptAdditionalInfo ?? t?.additionalInfo ?? t?.AdditionalInfo;
      if (typeof rawInfo === 'string') {
        additionalInfo = rawInfo;
      } else if (rawInfo && typeof rawInfo === 'object') {
        additionalInfo = rawInfo.fields?.[0] || rawInfo.value || rawInfo.Value || null;
      }

      const maxSessions = Number(t?.maxSessions ?? t?.MaxSessions ?? 4);
      const skipSeatFee = Boolean(t?.skipSeatFee ?? t?.SkipSeatFee ?? false);

      // Overwrite self-ordering
      let overwriteSelfOrderingConfig: SelfOrderingConfig | null = null;
      const rawOverride = t?.overWriteSelfOrderingConfig ?? t?.OverWriteSelfOrderingConfig;
      if (rawOverride) {
        const caseName = typeof rawOverride === 'string'
          ? rawOverride
          : (rawOverride.case || rawOverride.Case || '').toString();

        if (caseName.includes('NoSelfOrdering')) {
          overwriteSelfOrderingConfig = { mode: 'no', isNoSelfOrdering: true, isEnabled: false };
        } else if (caseName.includes('CashOnly')) {
          overwriteSelfOrderingConfig = { mode: 'cash-only', isCashOnlySelfOrdering: true, isEnabled: true };
        } else if (caseName.includes('CacheAndStripe')) {
          overwriteSelfOrderingConfig = { mode: 'cache-and-stripe', isCacheAndStripeSelfOrdering: true, isEnabled: true };
        } else if (caseName.includes('OnlyStripe')) {
          overwriteSelfOrderingConfig = { mode: 'only-stripe', isOnlyStripeSelfOrdering: true, isEnabled: true };
        }
      }

      // Sessions and orders
      const sessions: TableSessionModel[] = [];
      const rawOrders = t?.orders ?? t?.Orders;

      if (rawOrders && typeof rawOrders === 'object') {
        const sessionKeys = Array.isArray(rawOrders)
          ? rawOrders.map((entry: any) => entry?.[0] || entry?.key)
          : Object.keys(rawOrders);

        const getSessionVal = (k: any) => {
          if (Array.isArray(rawOrders)) {
            const found = rawOrders.find((entry: any) => (entry?.[0] || entry?.key) === k);
            return found?.[1] || found?.value;
          }
          return rawOrders[k];
        };

        sessionKeys.forEach((sessKey: any) => {
          if (!sessKey) return;
          const sessVal = getSessionVal(sessKey);
          const rawItems = sessVal?.items ?? sessVal?.Items ?? [];
          const items: OrderItemModel[] = [];

          if (Array.isArray(rawItems)) {
            rawItems.forEach((it: any) => {
              const dishName = it?.dishName ?? it?.DishName ?? it?.[1] ?? 'Item';
              const comment = it?.comment ?? it?.Comment ?? null;
              const rawStatus = it?.status ?? it?.Status ?? 'Pending';
              const statusStr = typeof rawStatus === 'string' ? rawStatus : (rawStatus?.case || rawStatus?.Case || 'Pending');
              const isConfirmed = statusStr.toLowerCase().includes('confirm');
              const isDone = statusStr.toLowerCase().includes('done') || statusStr.toLowerCase().includes('voted');
              const isRejected = statusStr.toLowerCase().includes('reject');
              const isPending = !isConfirmed && !isDone && !isRejected;

              // Parse paymentMethod and reason from rawStatus if present
              let paymentMethod: any = null;
              let rejectionReason: string | null = null;

              const extractPaymentMethod = (rawPm: any) => {
                if (!rawPm) return null;
                const pmCase = typeof rawPm === 'string' ? rawPm : (rawPm.case || rawPm.Case || '');
                const pmLower = pmCase.toLowerCase();

                if (pmLower.includes('prepaidwithstripe')) {
                  return {
                    isPayAtCounter: false,
                    isPaidAtCounter: false,
                    isPrepaidWithStripe: true,
                    isPaidWithStripe: false,
                    isCompedAsOmaggio: false,
                    label: 'Hold',
                    icon: '💳',
                    title: 'Stripe Pre-authorization Intent',
                  };
                }
                if (pmLower.includes('paidwithstripe')) {
                  return {
                    isPayAtCounter: false,
                    isPaidAtCounter: false,
                    isPrepaidWithStripe: false,
                    isPaidWithStripe: true,
                    isCompedAsOmaggio: false,
                    label: 'Paid',
                    icon: '💳',
                    title: 'Stripe Payment Completed',
                  };
                }
                if (pmLower.includes('paidatcounter')) {
                  return {
                    isPayAtCounter: false,
                    isPaidAtCounter: true,
                    isPrepaidWithStripe: false,
                    isPaidWithStripe: false,
                    isCompedAsOmaggio: false,
                    label: 'Paid',
                    icon: '💵',
                    title: 'Paid at counter',
                  };
                }
                if (pmLower.includes('payatcounter')) {
                  return {
                    isPayAtCounter: true,
                    isPaidAtCounter: false,
                    isPrepaidWithStripe: false,
                    isPaidWithStripe: false,
                    isCompedAsOmaggio: false,
                    label: '',
                    icon: '🧾',
                    title: 'Pay at counter',
                  };
                }
                if (pmLower.includes('omaggio')) {
                  return {
                    isPayAtCounter: false,
                    isPaidAtCounter: false,
                    isPrepaidWithStripe: false,
                    isPaidWithStripe: false,
                    isCompedAsOmaggio: true,
                    label: 'Omaggio',
                    icon: '🎁',
                    title: 'Omaggio / On the House',
                  };
                }
                return null;
              };

              if (typeof rawStatus === 'object' && rawStatus !== null) {
                const fields = rawStatus.fields || rawStatus.Fields || [];
                if (statusStr === 'Confirmed') {
                  // Confirmed: field 0 is DateTime, field 1 is PaymentMethodInfo
                  if (fields.length > 1) {
                    paymentMethod = extractPaymentMethod(fields[1]);
                  } else if (fields.length === 1) {
                    paymentMethod = extractPaymentMethod(fields[0]);
                  }
                } else if (statusStr === 'DoneWithPayAndEventualVote') {
                  // DoneWithPayAndEventualVote: field 0 is Option<Star>, field 1 is PaymentMethodInfo
                  if (fields.length > 1) {
                    paymentMethod = extractPaymentMethod(fields[1]);
                  } else if (fields.length === 1) {
                    paymentMethod = extractPaymentMethod(fields[0]);
                  }
                } else if (statusStr === 'Rejected') {
                  // Rejected: reason, paymentInfo
                  if (fields.length > 0) {
                    const r0 = fields[0];
                    if (typeof r0 === 'string') rejectionReason = r0;
                    else if (r0 && typeof r0 === 'object') rejectionReason = r0.fields?.[0] || r0.value || null;
                  }
                  if (fields.length > 1) {
                    paymentMethod = extractPaymentMethod(fields[1]);
                  }
                }
              }

              items.push({
                id: it?.id ?? it?.Id,
                dishName,
                comment,
                status: statusStr,
                isConfirmed,
                isDone,
                isPending,
                isRejected,
                rejectionReason,
                paymentMethod,
              });
            });
          }

          // Aggregated items: group by dishName + status + paymentMethod
          const aggregatedMap = new Map<string, AggregatedOrderItem>();
          items.forEach((it) => {
            const pmKey = it.paymentMethod ? `${it.paymentMethod.icon}_${it.paymentMethod.label}` : 'none';
            const key = `${it.dishName}__${it.status}__${pmKey}`;
            if (!aggregatedMap.has(key)) {
              aggregatedMap.set(key, {
                quantity: 0,
                dishName: it.dishName,
                status: it.status,
                isConfirmed: it.isConfirmed,
                isPending: it.isPending,
                isDone: it.isDone,
                isRejected: it.isRejected,
                rejectionReason: it.rejectionReason,
                paymentMethod: it.paymentMethod,
              });
            }
            aggregatedMap.get(key)!.quantity += 1;
          });

          // Fiscal metadata
          let fiscalMetadata: { isCodiceFiscale: boolean; isCodiceLotteria: boolean; value: string } | null = null;
          const rawFiscal = sessVal?.fiscalMetadata ?? sessVal?.FiscalMetadata;
          if (rawFiscal) {
            const caseName = (rawFiscal.case || rawFiscal.Case || '').toString();
            const val = rawFiscal.fields?.[0] || rawFiscal.Fields?.[0] || rawFiscal.value || rawFiscal.Value || '';
            if (caseName.toLowerCase().includes('fiscale') || rawFiscal.isCodiceFiscale || rawFiscal.IsCodiceFiscale) {
              fiscalMetadata = { isCodiceFiscale: true, isCodiceLotteria: false, value: String(val) };
            } else if (caseName.toLowerCase().includes('lotteria') || rawFiscal.isCodiceLotteria || rawFiscal.IsCodiceLotteria) {
              fiscalMetadata = { isCodiceFiscale: false, isCodiceLotteria: true, value: String(val) };
            }
          }

          sessions.push({
            sessionId: String(sessKey),
            items,
            aggregatedItems: Array.from(aggregatedMap.values()),
            total: 0,
            fiscalMetadata,
          });
        });
      }

      const hasActiveOrders = sessions.some((s) => s.items.length > 0 && s.items.some((i) => !i.isDone));

      return {
        tableNumber: keyNum,
        tableId,
        additionalInfo,
        maxSessions,
        skipSeatFee,
        overwriteSelfOrderingConfig,
        hasActiveOrders,
        sessions,
      };
    };

    if (Array.isArray(rawTables)) {
      rawTables.forEach((entry: any, i: number) => {
        if (Array.isArray(entry) && entry.length >= 2) {
          result.push(parseTableObj(Number(entry[0]), entry[1]));
        } else {
          result.push(parseTableObj(i + 1, entry));
        }
      });
    } else if (typeof rawTables === 'object') {
      Object.keys(rawTables).forEach((k) => {
        result.push(parseTableObj(Number(k), rawTables[k]));
      });
    }

    result.sort((a, b) => a.tableNumber - b.tableNumber);
    return result;
  }
}
