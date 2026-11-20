import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LocPipe } from '../../core/pipes/loc.pipe';
import { LocalizationService } from '../../core/services/localization.service';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { RestaurantService } from '../../core/services/restaurant.service';
import { StripePaymentService } from '../../core/services/stripe-payment.service';
import { AssistantService } from '../../core/services/assistant.service';
import { MaintenanceService } from '../../core/services/maintenance.service';
import { RestaurantItem, SelfOrderingMode } from '../../core/models/restaurant.models';
import { MainLayoutComponent } from '../../shared/components/main-layout/main-layout.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MainLayoutComponent, LocPipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  protected readonly authService = inject(AuthService);
  private readonly restaurantService = inject(RestaurantService);
  private readonly stripePaymentService = inject(StripePaymentService);
  private readonly maintenanceService = inject(MaintenanceService);
  private readonly assistantService = inject(AssistantService);
  private readonly loc = inject(LocalizationService);
  private readonly router = inject(Router);

  // Data state
  protected restaurants = signal<RestaurantItem[]>([]);
  protected isLoading = signal(false);
  protected errorMessage = signal<string | null>(null);
  protected successMessage = signal<string | null>(null);
  protected importingRestaurantId = signal<string | null>(null);

  // Updating tracking
  protected updatingSelfOrderingIds = signal<Set<string>>(new Set());
  protected disconnectingStripeIds = signal<Set<string>>(new Set());

  // Deep Reset state (matching Blazor)
  protected restaurantToReset = signal<RestaurantItem | null>(null);
  protected confirmRestaurantName = signal('');
  protected isResetting = signal(false);

  // Quick Menu QR Modal state (matching Blazor ShowMenuQrModal)
  protected menuQrModalRestaurant = signal<RestaurantItem | null>(null);

  // Create restaurant state
  protected newRestaurantName = signal('');
  protected isCreatingRestaurant = signal(false);
  protected showTrialExpirationModal = signal(false);
  protected pendingRestaurantName = signal('');
  protected createErrorMessage = signal<string | null>(null);
  protected createSuccessMessage = signal<string | null>(null);

  // Active assistant / modal mock placeholders
  protected assistantTopic = signal<string | null>(null);

  ngOnInit(): void {
    this.loadRestaurants();
  }

  loadRestaurants(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.restaurantService.getMyRestaurants().subscribe({
      next: (list) => {
        this.restaurants.set(list || []);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        if (err.status === 401 || err.status === 400) {
          this.errorMessage.set('Session expired or unable to load restaurants.');
        } else {
          this.errorMessage.set(err.message || 'Failed to fetch restaurants.');
        }
      },
    });
  }

  selectSelfOrderingForRestaurant(restaurant: RestaurantItem, mode: SelfOrderingMode): void {
    const restId = restaurant.restaurantId;
    if (!restId) return;

    if (mode === 'no' && restaurant.hasActiveOrders) {
      this.errorMessage.set('Cannot switch to Menu Only while there are active orders.');
      return;
    }

    if ((mode === 'cache-and-stripe' || mode === 'only-stripe') && restaurant.paymentConfig?.isCashOnly) {
      this.errorMessage.set('Cannot enable Stripe self-ordering when Stripe is not connected.');
      return;
    }

    this.errorMessage.set(null);
    this.addUpdatingId(restId);

    this.restaurantService.setSelfOrderingMode(restId, mode).subscribe({
      next: () => {
        this.removeUpdatingId(restId);
        this.loadRestaurants();
      },
      error: (err) => {
        this.removeUpdatingId(restId);
        const errMsg = err?.error || err?.message || 'Failed to update self-ordering mode.';
        this.errorMessage.set(`Failed to update self-ordering configuration: ${errMsg}`);
      },
    });
  }

  disconnectStripe(restaurant: RestaurantItem): void {
    const restId = restaurant.restaurantId;
    if (!restId) return;

    const confirmed = window.confirm(
      `Are you sure you want to disconnect Stripe for ${restaurant.restaurantName}?`
    );
    if (!confirmed) return;

    this.errorMessage.set(null);
    this.addDisconnectingId(restId);

    this.stripePaymentService.disableStripeAccountId(restId).subscribe({
      next: () => {
        this.removeDisconnectingId(restId);
        this.loadRestaurants();
      },
      error: (err) => {
        this.removeDisconnectingId(restId);
        const errMsg = err?.error || err?.message || 'Failed to disconnect Stripe.';
        this.errorMessage.set(`Failed to disconnect Stripe: ${errMsg}`);
      },
    });
  }

  // --- Deep Reset Actions (matching Blazor) ---
  startDeepReset(restaurant: RestaurantItem): void {
    this.restaurantToReset.set(restaurant);
    this.confirmRestaurantName.set('');
  }

  cancelDeepReset(): void {
    this.restaurantToReset.set(null);
    this.confirmRestaurantName.set('');
  }

  confirmDeepReset(): void {
    const rest = this.restaurantToReset();
    if (!rest || this.confirmRestaurantName() !== rest.restaurantName) {
      return;
    }

    const confirmed = window.confirm(
      'WARNING: You are about to initiate a DEEP RESET. This will overwrite and ghost the database entries for this restaurant. ARE YOU ABSOLUTELY SURE?'
    );
    if (!confirmed) {
      return;
    }

    this.isResetting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.createSuccessMessage.set(null);
    this.createErrorMessage.set(null);

    this.maintenanceService.ghostEventsAndSnapshots(rest.restaurantId).subscribe({
      next: () => {
        this.isResetting.set(false);
        this.createSuccessMessage.set(
          this.loc.translate('RestsAdmin_SuccessDeepReset', rest.restaurantName)
        );
        this.restaurantToReset.set(null);
        this.confirmRestaurantName.set('');
        this.loadRestaurants();
      },
      error: (err) => {
        this.isResetting.set(false);
        const errDetail = err?.error?.message || err?.error || err?.message || 'Unknown error';
        this.errorMessage.set(
          this.loc.translate('RestsAdmin_ErrFailedDeepReset', errDetail)
        );
        this.restaurantToReset.set(null);
        this.confirmRestaurantName.set('');
      },
    });
  }

  // --- Menu QR Modal Actions ---
  openMenuQrModal(restaurant: RestaurantItem): void {
    this.menuQrModalRestaurant.set(restaurant);
  }

  closeMenuQrModal(): void {
    this.menuQrModalRestaurant.set(null);
  }

  getMenuQrUrl(restaurantId: string): string {
    const origin = window.location.origin;
    return `${origin}/m/${restaurantId}`;
  }

  getMenuQrImageUrl(restaurantId: string): string {
    const url = this.getMenuQrUrl(restaurantId);
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`;
  }

  printMenuQr(): void {
    window.print();
  }

  isUpdatingSelfOrdering(restaurantId: string): boolean {
    return this.updatingSelfOrderingIds().has(restaurantId);
  }

  isDisconnectingStripe(restaurantId: string): boolean {
    return this.disconnectingStripeIds().has(restaurantId);
  }

  private addUpdatingId(id: string): void {
    this.updatingSelfOrderingIds.update((set) => {
      const next = new Set(set);
      next.add(id);
      return next;
    });
  }

  private removeUpdatingId(id: string): void {
    this.updatingSelfOrderingIds.update((set) => {
      const next = new Set(set);
      next.delete(id);
      return next;
    });
  }

  private addDisconnectingId(id: string): void {
    this.disconnectingStripeIds.update((set) => {
      const next = new Set(set);
      next.add(id);
      return next;
    });
  }

  private removeDisconnectingId(id: string): void {
    this.disconnectingStripeIds.update((set) => {
      const next = new Set(set);
      next.delete(id);
      return next;
    });
  }

  onLogout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  onCreateRestaurant(): void {
    const name = this.newRestaurantName().trim();
    if (!name || name.length < 2 || name.length > 100) {
      this.createErrorMessage.set(this.loc.translate('RestsAdmin_ErrInvalidRestaurantName'));
      return;
    }

    if (this.restaurants().length >= 5) {
      this.createErrorMessage.set(this.loc.translate('RestsAdmin_ErrMaxLimitReached', '5'));
      return;
    }

    this.createErrorMessage.set(null);
    this.createSuccessMessage.set(null);

    // If user already has 1 or more restaurants, their 1-week trial was already claimed on the first restaurant.
    // Show trial expiration notice modal matching Blazor behavior.
    if (this.restaurants().length > 0) {
      this.pendingRestaurantName.set(name);
      this.showTrialExpirationModal.set(true);
      return;
    }

    this.executeCreateRestaurant(name);
  }

  cancelTrialExpirationModal(): void {
    this.showTrialExpirationModal.set(false);
    this.pendingRestaurantName.set('');
  }

  confirmTrialExpirationCreate(): void {
    const name = this.pendingRestaurantName();
    this.showTrialExpirationModal.set(false);
    this.pendingRestaurantName.set('');
    if (name) {
      this.executeCreateRestaurant(name);
    }
  }

  private executeCreateRestaurant(name: string): void {
    this.isCreatingRestaurant.set(true);
    this.createErrorMessage.set(null);
    this.createSuccessMessage.set(null);

    this.restaurantService.createRestaurant(name).subscribe({
      next: () => {
        this.isCreatingRestaurant.set(false);
        this.newRestaurantName.set('');
        this.createSuccessMessage.set(this.loc.translate('RestsAdmin_SuccessCreated'));
        this.loadRestaurants();
      },
      error: (err) => {
        this.isCreatingRestaurant.set(false);
        const errDetail = err?.error?.message || err?.error || err?.message || this.loc.translate('RestsAdmin_ErrCreationNotAllowed');
        this.createErrorMessage.set(typeof errDetail === 'string' ? errDetail : this.loc.translate('RestsAdmin_ErrCreationNotAllowed'));
      },
    });
  }

  askAssistant(topic: string, restaurantId: string): void {
    const lang = this.loc.currentLang();
    const prompt =
      lang === 'en'
        ? `How does ${topic} work in the restaurant system?`
        : `How does ${topic} work in the restaurant system? Please answer in Italian (Italiano).`;

    this.assistantService.openQuery(prompt, restaurantId);
  }

  closeAssistant(): void {
    this.assistantTopic.set(null);
  }

  downloadMenuJson(restaurant: RestaurantItem): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const raw = restaurant.raw as any;
    let menuObj: any = null;

    if (raw) {
      const rawMenus = raw.menus ?? raw.Menus;
      if (rawMenus) {
        const idx = rawMenus.curentMenuIndex ?? rawMenus.CurentMenuIndex ?? 0;
        const list = rawMenus.menus ?? rawMenus.Menus;
        if (Array.isArray(list) && list.length > 0) {
          menuObj = list[idx] || list[0];
        }
      }
      if (!menuObj) {
        menuObj = raw.currentMenu ?? raw.CurrentMenu;
      }
    }

    if (!menuObj) {
      this.errorMessage.set(this.loc.translate('RestsAdmin_MenuDownloadError'));
      return;
    }

    const menuName = menuObj.menuName ?? menuObj.MenuName ?? restaurant.currentMenuName ?? 'Menu';
    const json = JSON.stringify(menuObj, null, 2);
    const rawSafeName = `${restaurant.restaurantName}_${menuName}`.replace(/[\\/:*?"<>|]/g, '_');
    const fileName = `${rawSafeName}.json`;

    const blob = new Blob([json], { type: 'application/json' });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  }

  async handleMenuFileImport(event: Event, restaurant: RestaurantItem): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.importingRestaurantId.set(restaurant.restaurantId);

    try {
      const jsonText = await file.text();
      this.restaurantService.importMenu(restaurant.restaurantId, jsonText).subscribe({
        next: () => {
          this.importingRestaurantId.set(null);
          this.successMessage.set(this.loc.translate('RestsAdmin_MenuImportSuccess'));
          input.value = '';
          this.loadRestaurants();
        },
        error: (err) => {
          this.importingRestaurantId.set(null);
          input.value = '';
          const errMsg = typeof err?.error === 'string'
            ? err.error
            : err?.error?.message || err?.message || this.loc.translate('RestsAdmin_MenuImportError');
          this.errorMessage.set(errMsg);
        },
      });
    } catch (err: any) {
      this.importingRestaurantId.set(null);
      input.value = '';
      this.errorMessage.set(err?.message || this.loc.translate('RestsAdmin_MenuImportError'));
    }
  }

  noopAction(event?: Event): void {
    if (event) {
      event.preventDefault();
    }
  }

  protected disablingGeoLocIds = signal<Set<string>>(new Set());

  // Inventory management state
  protected initializingInventoryIds = signal<Set<string>>(new Set());
  protected disablingInventoryIds = signal<Set<string>>(new Set());
  protected switchingInventoryModeIds = signal<Map<string, boolean>>(new Map());

  initializeInventory(restaurant: RestaurantItem): void {
    const restId = restaurant.restaurantId;
    if (!restId || this.initializingInventoryIds().has(restId)) return;

    this.initializingInventoryIds.update((set) => {
      const next = new Set(set);
      next.add(restId);
      return next;
    });

    this.restaurantService.initializeStockInventorySettings(restId).subscribe({
      next: () => {
        this.initializingInventoryIds.update((set) => {
          const next = new Set(set);
          next.delete(restId);
          return next;
        });
        this.successMessage.set(this.loc.translate('RestsAdmin_InventoryInitSuccess'));
        this.loadRestaurants();
      },
      error: (err) => {
        this.initializingInventoryIds.update((set) => {
          const next = new Set(set);
          next.delete(restId);
          return next;
        });
        const errDetail = err?.error?.message || err?.message || 'Error';
        this.errorMessage.set(this.loc.translate('RestsAdmin_InventoryInitFailed', errDetail));
      },
    });
  }

  toggleInventory(restaurant: RestaurantItem): void {
    const restId = restaurant.restaurantId;
    if (!restId || this.disablingInventoryIds().has(restId) || this.switchingInventoryModeIds().has(restId)) return;

    const inv = restaurant.stockInventorySettings;
    const isEnabled = inv?.isEnabledOnlyLoad || inv?.isEnabledWithConsumptionTracking || inv?.isEnabledWithAutonomousReplenishment;

    if (isEnabled) {
      const prompt = this.loc.translate('RestsAdmin_ConfirmDisableInventory', restaurant.restaurantName);
      if (typeof window !== 'undefined' && !window.confirm(prompt)) {
        return;
      }

      this.disablingInventoryIds.update((set) => {
        const next = new Set(set);
        next.add(restId);
        return next;
      });

      this.restaurantService.disableStockInventorySettings(restId).subscribe({
        next: () => {
          this.disablingInventoryIds.update((set) => {
            const next = new Set(set);
            next.delete(restId);
            return next;
          });
          this.successMessage.set(this.loc.translate('RestsAdmin_InventoryDisabledSuccess'));
          this.loadRestaurants();
        },
        error: (err) => {
          this.disablingInventoryIds.update((set) => {
            const next = new Set(set);
            next.delete(restId);
            return next;
          });
          const errDetail = err?.error?.message || err?.message || 'Error';
          this.errorMessage.set(this.loc.translate('RestsAdmin_InventoryDisableFailed', errDetail));
        },
      });
    } else {
      this.disablingInventoryIds.update((set) => {
        const next = new Set(set);
        next.add(restId);
        return next;
      });

      this.restaurantService.setStockInventoryOnlyLoad(restId).subscribe({
        next: () => {
          this.disablingInventoryIds.update((set) => {
            const next = new Set(set);
            next.delete(restId);
            return next;
          });
          this.successMessage.set(this.loc.translate('RestsAdmin_InventoryEnabledSuccess'));
          this.loadRestaurants();
        },
        error: (err) => {
          this.disablingInventoryIds.update((set) => {
            const next = new Set(set);
            next.delete(restId);
            return next;
          });
          const errDetail = err?.error?.message || err?.message || 'Error';
          this.errorMessage.set(this.loc.translate('RestsAdmin_InventoryEnableFailed', errDetail));
        },
      });
    }
  }

  setInventoryMode(restaurant: RestaurantItem, isConsumptionTracking: boolean): void {
    const restId = restaurant.restaurantId;
    if (!restId || this.disablingInventoryIds().has(restId) || this.switchingInventoryModeIds().has(restId)) return;

    this.switchingInventoryModeIds.update((map) => {
      const next = new Map(map);
      next.set(restId, isConsumptionTracking);
      return next;
    });

    const action$ = isConsumptionTracking
      ? this.restaurantService.setStockInventoryConsumptionTracking(restId)
      : this.restaurantService.setStockInventoryOnlyLoad(restId);

    action$.subscribe({
      next: () => {
        this.switchingInventoryModeIds.update((map) => {
          const next = new Map(map);
          next.delete(restId);
          return next;
        });
        const msg = isConsumptionTracking
          ? this.loc.translate('RestsAdmin_InventoryConsumptionTrackingSuccess')
          : this.loc.translate('RestsAdmin_InventoryOnlyLoadSuccess');
        this.successMessage.set(msg);
        this.loadRestaurants();
      },
      error: (err) => {
        this.switchingInventoryModeIds.update((map) => {
          const next = new Map(map);
          next.delete(restId);
          return next;
        });
        const errDetail = err?.error?.message || err?.message || 'Error';
        this.errorMessage.set(this.loc.translate('RestsAdmin_InventoryModeChangeFailed', errDetail));
      },
    });
  }

  toggleGeoLoc(restaurant: RestaurantItem): void {
    const restId = restaurant.restaurantId;
    if (!restId) return;

    const isEnabled = restaurant.geoLocSettings?.isEnabled;
    if (isEnabled) {
      const prompt = this.loc.translate('RestsAdmin_ConfirmDisableGeoLoc', restaurant.restaurantName);
      if (typeof window !== 'undefined' && !window.confirm(prompt)) {
        return;
      }

      this.disablingGeoLocIds.update((set) => {
        const next = new Set(set);
        next.add(restId);
        return next;
      });

      this.restaurantService.disableGeoLocSettings(restId).subscribe({
        next: () => {
          this.disablingGeoLocIds.update((set) => {
            const next = new Set(set);
            next.delete(restId);
            return next;
          });
          this.loadRestaurants();
        },
        error: (err) => {
          this.disablingGeoLocIds.update((set) => {
            const next = new Set(set);
            next.delete(restId);
            return next;
          });
          this.errorMessage.set(
            this.loc.translate('RestsAdmin_GeoLocDisableFailed', err?.error?.message || err?.message || 'Error')
          );
        },
      });
    } else {
      this.router.navigate(['/restaurantsAdmin', restId, 'geoloc']);
    }
  }

  getSubscriptionBadgeInfo(sub: any): {
    badgeClass: string;
    iconClass: string;
    labelKey: string;
    isExpired: boolean;
    expiresTitle?: string;
  } {
    if (!sub) {
      return {
        badgeClass: 'bg-secondary-subtle text-secondary border border-secondary',
        iconClass: 'bi-question-circle',
        labelKey: 'RestsAdmin_SubUnknown',
        isExpired: false,
      };
    }

    const subType = sub.subscriptionType ?? sub.SubscriptionType;
    let caseName = '';
    let endingStr: string | null = null;

    if (typeof subType === 'string') {
      caseName = subType;
    } else if (subType && typeof subType === 'object') {
      caseName = subType.case || subType.Case || subType.name || subType.Name || '';
      endingStr = subType.ending || subType.Ending || null;
      if (!endingStr && Array.isArray(subType.fields) && subType.fields.length > 0) {
        endingStr = subType.fields[0];
      }
      if (!endingStr && Array.isArray(subType.Fields) && subType.Fields.length > 0) {
        endingStr = subType.Fields[0];
      }
    }

    if (caseName === 'Endless') {
      return {
        badgeClass: 'bg-primary-subtle text-primary border border-primary',
        iconClass: 'bi-infinity',
        labelKey: 'RestsAdmin_SubEndless',
        isExpired: false,
      };
    }

    if (caseName === 'PendingPayment') {
      return {
        badgeClass: 'bg-warning-subtle text-warning border border-warning',
        iconClass: 'bi-credit-card-2-front',
        labelKey: 'RestsAdmin_SubPendingPayment',
        isExpired: true,
      };
    }

    let isExpired = false;
    let expiresTitle: string | undefined;

    if (endingStr) {
      const parsed = new Date(endingStr);
      if (!isNaN(parsed.getTime())) {
        isExpired = parsed.getTime() < Date.now();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const formatted = `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
        expiresTitle = `Expires: ${formatted}`;
      }
    }

    if (caseName === 'Trial') {
      return {
        badgeClass: isExpired
          ? 'bg-danger-subtle text-danger border border-danger'
          : 'bg-info-subtle text-info border border-info',
        iconClass: isExpired ? 'bi-exclamation-octagon' : 'bi-clock-history',
        labelKey: 'RestsAdmin_SubTrial',
        isExpired,
        expiresTitle,
      };
    }

    if (caseName === 'Ordinary') {
      return {
        badgeClass: isExpired
          ? 'bg-danger-subtle text-danger border border-danger'
          : 'bg-success-subtle text-success border border-success',
        iconClass: isExpired ? 'bi-exclamation-octagon' : 'bi-check-circle',
        labelKey: 'RestsAdmin_SubOrdinary',
        isExpired,
        expiresTitle,
      };
    }

    return {
      badgeClass: 'bg-secondary-subtle text-secondary border border-secondary',
      iconClass: 'bi-question-circle',
      labelKey: 'RestsAdmin_SubUnknown',
      isExpired: false,
    };
  }
}
