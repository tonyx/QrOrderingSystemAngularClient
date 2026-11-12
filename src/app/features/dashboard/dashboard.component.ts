import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LocPipe } from '../../core/pipes/loc.pipe';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { RestaurantService } from '../../core/services/restaurant.service';
import { StripePaymentService } from '../../core/services/stripe-payment.service';
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
  private readonly router = inject(Router);

  // Data state
  protected restaurants = signal<RestaurantItem[]>([]);
  protected isLoading = signal(false);
  protected errorMessage = signal<string | null>(null);

  // Updating tracking
  protected updatingSelfOrderingIds = signal<Set<string>>(new Set());
  protected disconnectingStripeIds = signal<Set<string>>(new Set());

  // Quick Menu QR Modal state (matching Blazor ShowMenuQrModal)
  protected menuQrModalRestaurant = signal<RestaurantItem | null>(null);

  // Create restaurant state
  protected newRestaurantName = signal('');
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
    if (!name) {
      this.createErrorMessage.set('Please provide a restaurant name.');
      return;
    }
    this.createErrorMessage.set(null);
    this.createSuccessMessage.set(`Creation of "${name}" triggered (feature placeholder).`);
    this.newRestaurantName.set('');
  }

  askAssistant(topic: string, restaurantId: string): void {
    this.assistantTopic.set(`${topic} (${restaurantId})`);
  }

  closeAssistant(): void {
    this.assistantTopic.set(null);
  }

  noopAction(event?: Event): void {
    if (event) {
      event.preventDefault();
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
