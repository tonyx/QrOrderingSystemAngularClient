import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { LocPipe } from '../../../core/pipes/loc.pipe';
import { LocalizationService } from '../../../core/services/localization.service';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { StripePaymentService } from '../../../core/services/stripe-payment.service';
import { AuthService } from '../../../core/services/auth.service';
import { RestaurantItem, SubscriptionSettingsConfig } from '../../../core/models/restaurant.models';
import { MainLayoutComponent } from '../../../shared/components/main-layout/main-layout.component';

export type ParsedSubscriptionKind = 'Endless' | 'Trial' | 'Ordinary' | 'PendingPayment' | 'Unknown';

export interface ParsedSubscriptionInfo {
  kind: ParsedSubscriptionKind;
  isEndless: boolean;
  isExpired: boolean;
  endingDate: Date | null;
  formattedEnding: string | null;
}

@Component({
  selector: 'app-manage-restaurant-subscription',
  standalone: true,
  imports: [CommonModule, RouterModule, LocPipe, MainLayoutComponent],
  templateUrl: './manage-restaurant-subscription.component.html',
  styleUrl: './manage-restaurant-subscription.component.css',
})
export class ManageRestaurantSubscriptionComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly restaurantService = inject(RestaurantService);
  private readonly stripePaymentService = inject(StripePaymentService);
  private readonly authService = inject(AuthService);
  private readonly loc = inject(LocalizationService);

  protected restaurantId = signal<string>('');
  protected restaurant = signal<RestaurantItem | null>(null);
  protected isLoading = signal<boolean>(true);
  protected isSubmitting = signal<boolean>(false);
  protected errorMessage = signal<string | null>(null);
  protected successMessage = signal<string | null>(null);

  protected selectedDays = signal<number>(30);
  protected monthlyFeeCents = signal<number>(2990);
  protected monthlyFeeCurrency = signal<string>('EUR');
  protected discount3MonthsPercent = signal<number>(10.0);
  protected discount6MonthsPercent = signal<number>(15.0);
  protected discount12MonthsPercent = signal<number>(20.0);

  // Stripe Mode configuration & selection
  protected hasTestKeys = signal<boolean>(false);
  protected hasLiveKeys = signal<boolean>(false);
  protected isTestMode = signal<boolean>(true); // default to true since this client is deployed in test mode

  // Only allow toggling if both test and live keys are configured
  protected canTogglePaymentMode = computed(() => this.hasTestKeys() && this.hasLiveKeys());

  protected monthlyFeeAmount = computed(() => this.monthlyFeeCents() / 100.0);

  protected parsedSub = computed<ParsedSubscriptionInfo>(() => {
    const rest = this.restaurant();
    return this.parseSubscription(rest?.subscription);
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('restaurantId') || '';
    this.restaurantId.set(id);

    // Check query params for status = success / cancel
    const queryParams = this.route.snapshot.queryParams;
    if (queryParams['status'] === 'success') {
      this.successMessage.set(this.loc.translate('ManageSub_SuccessPayment'));
    } else if (queryParams['status'] === 'cancel') {
      this.errorMessage.set(this.loc.translate('ManageSub_CancelledPayment'));
    }

    this.loadSubscriptionConfig();
    this.loadRestaurant();
  }

  loadSubscriptionConfig(): void {
    this.stripePaymentService.getSubscriptionConfig().subscribe({
      next: (config: SubscriptionSettingsConfig) => {
        if (config) {
          this.monthlyFeeCents.set(config.monthlyFeeCents || 2990);
          this.monthlyFeeCurrency.set(config.monthlyFeeCurrency || 'EUR');
          this.discount3MonthsPercent.set(config.discount3MonthsPercent ?? 10.0);
          this.discount6MonthsPercent.set(config.discount6MonthsPercent ?? 15.0);
          this.discount12MonthsPercent.set(config.discount12MonthsPercent ?? 20.0);
          this.hasTestKeys.set(Boolean(config.hasTestKeys));
          this.hasLiveKeys.set(Boolean(config.hasLiveKeys));

          // If only test keys are present, automatically force/default to test mode.
          // If only live keys are present, switch to live mode (false).
          // If both are present, defaults to test mode as requested for this client.
          if (config.hasTestKeys && !config.hasLiveKeys) {
            this.isTestMode.set(true);
          } else if (!config.hasTestKeys && config.hasLiveKeys) {
            this.isTestMode.set(false);
          } else {
            // Both configured or neither configured: default to test mode for this test-mode client
            this.isTestMode.set(true);
          }
        }
      },
      error: () => {
        // Fall back to defaults
      },
    });
  }

  setTestMode(enabled: boolean): void {
    this.isTestMode.set(enabled);
  }

  toggleTestMode(): void {
    if (this.canTogglePaymentMode()) {
      this.isTestMode.update((v) => !v);
    }
  }

  loadRestaurant(): void {
    const id = this.restaurantId();
    if (!id) {
      this.errorMessage.set(this.loc.translate('ManageSub_InvalidRestaurantId'));
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);
    this.restaurantService.getRestaurant(id).subscribe({
      next: (rest) => {
        this.restaurant.set(rest);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err?.error || err?.message || this.loc.translate('ManageSub_NotFoundOrDenied'));
      },
    });
  }

  selectPlan(days: number): void {
    this.selectedDays.set(days);
  }

  getOriginalFeeForDays(days: number): number {
    const months = days / 30.0;
    return this.monthlyFeeAmount() * months;
  }

  getDiscountPercentForDays(days: number): number {
    if (days >= 365) return this.discount12MonthsPercent();
    if (days >= 180) return this.discount6MonthsPercent();
    if (days >= 90) return this.discount3MonthsPercent();
    return 0.0;
  }

  calculatePlanFee(days: number): number {
    const rawFee = this.getOriginalFeeForDays(days);
    const discountPct = this.getDiscountPercentForDays(days);
    return rawFee * (1.0 - discountPct / 100.0);
  }

  getDiscountSavingsForDays(days: number): number {
    const rawFee = this.getOriginalFeeForDays(days);
    const discountPct = this.getDiscountPercentForDays(days);
    return rawFee * (discountPct / 100.0);
  }

  calculateTotalFee(): number {
    return this.calculatePlanFee(this.selectedDays());
  }

  formatCurrency(amount: number, currency: string): string {
    const curr = (currency || 'EUR').toUpperCase();
    let symbol = curr + ' ';
    if (curr === 'EUR') symbol = '€';
    else if (curr === 'USD') symbol = '$';
    else if (curr === 'GBP') symbol = '£';
    return `${symbol}${amount.toFixed(2)}`;
  }

  createSubscriptionCheckoutSession(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const restId = this.restaurantId();
    if (!restId) {
      this.errorMessage.set(this.loc.translate('ManageSub_InvalidUserSessionOrRestId'));
      return;
    }

    this.isSubmitting.set(true);

    const currentBaseUrl = window.location.origin + `/restaurantsAdmin/${restId}/subscription`;
    const successUrl = `${currentBaseUrl}?session_id={CHECKOUT_SESSION_ID}&status=success`;
    const cancelUrl = `${currentBaseUrl}?status=cancel`;

    const currentUser = this.authService.currentUser();
    const userId = currentUser?.userId || null;
    const isSandbox = this.isTestMode();

    this.stripePaymentService
      .createSubscriptionIntent(restId, {
        durationDays: this.selectedDays(),
        successUrl,
        cancelUrl,
        userId,
        isSandbox,
      }, isSandbox)
      .subscribe({
        next: (res) => {
          this.isSubmitting.set(false);
          if (res?.checkoutUrl) {
            window.location.href = res.checkoutUrl;
          } else {
            this.errorMessage.set(this.loc.translate('ManageSub_StripeUrlNotReturned'));
          }
        },
        error: (err) => {
          this.isSubmitting.set(false);
          const errDetail = err?.error || err?.message || 'Server error';
          this.errorMessage.set(this.loc.translate('ManageSub_FailedCreateStripeSession', errDetail));
        },
      });
  }

  clearError(): void {
    this.errorMessage.set(null);
  }

  clearSuccess(): void {
    this.successMessage.set(null);
  }

  private parseSubscription(sub: any): ParsedSubscriptionInfo {
    if (!sub) {
      return {
        kind: 'Unknown',
        isEndless: false,
        isExpired: false,
        endingDate: null,
        formattedEnding: null,
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

    const isEndless = caseName === 'Endless';
    let endingDate: Date | null = null;
    let isExpired = false;

    if (endingStr) {
      const parsed = new Date(endingStr);
      if (!isNaN(parsed.getTime())) {
        endingDate = parsed;
        isExpired = parsed.getTime() < Date.now();
      }
    }

    let kind: ParsedSubscriptionKind = 'Unknown';
    if (caseName === 'Endless') {
      kind = 'Endless';
    } else if (caseName === 'Trial') {
      kind = 'Trial';
    } else if (caseName === 'Ordinary') {
      kind = 'Ordinary';
    } else if (caseName === 'PendingPayment') {
      kind = 'PendingPayment';
      isExpired = true;
    }

    const formattedEnding = endingDate
      ? this.formatDate(endingDate)
      : null;

    return {
      kind,
      isEndless,
      isExpired,
      endingDate,
      formattedEnding,
    };
  }

  private formatDate(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const hh = pad(date.getHours());
    const mm = pad(date.getMinutes());
    return `${y}-${m}-${d} ${hh}:${mm}`;
  }
}

