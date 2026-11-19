import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LocPipe } from '../../../core/pipes/loc.pipe';
import { ActivatedRoute, Router } from '@angular/router';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { StripePaymentService } from '../../../core/services/stripe-payment.service';
import { RestaurantItem, StripeAccountStatus, SubscriptionSettingsConfig } from '../../../core/models/restaurant.models';
import { MainLayoutComponent } from '../../../shared/components/main-layout/main-layout.component';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, MainLayoutComponent, LocPipe],
  templateUrl: './onboarding.component.html',
  styleUrl: './onboarding.component.css',
})
export class OnboardingComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly restaurantService = inject(RestaurantService);
  private readonly stripePaymentService = inject(StripePaymentService);

  protected restaurantId = signal<string>('');
  protected restaurant = signal<RestaurantItem | null>(null);
  protected accountStatus = signal<StripeAccountStatus | null>(null);

  // Stripe Mode configuration & selection
  protected hasTestKeys = signal<boolean>(false);
  protected hasLiveKeys = signal<boolean>(false);
  protected isTestMode = signal<boolean>(true); // default to true since this client is deployed in test mode

  // Only allow toggling if both test and live keys are configured
  protected canTogglePaymentMode = computed(() => this.hasTestKeys() && this.hasLiveKeys());

  protected isLoading = signal<boolean>(true);
  protected isActionProcessing = signal<boolean>(false);
  protected errorMessage = signal<string | null>(null);
  protected statusMessage = signal<string | null>(null);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('restaurantId') || '';
    if (!id) {
      this.errorMessage.set('Missing restaurant identifier in URL.');
      this.isLoading.set(false);
      return;
    }
    this.restaurantId.set(id);
    this.loadSubscriptionConfig();
    this.loadRestaurantData();
  }

  loadSubscriptionConfig(): void {
    this.stripePaymentService.getSubscriptionConfig().subscribe({
      next: (config: SubscriptionSettingsConfig) => {
        if (config) {
          this.hasTestKeys.set(Boolean(config.hasTestKeys));
          this.hasLiveKeys.set(Boolean(config.hasLiveKeys));

          if (config.hasTestKeys && !config.hasLiveKeys) {
            this.isTestMode.set(true);
          } else if (!config.hasTestKeys && config.hasLiveKeys) {
            this.isTestMode.set(false);
          } else {
            this.isTestMode.set(true);
          }
        }
      },
      error: () => {
        // keep default
      },
    });
  }

  setTestMode(enabled: boolean): void {
    this.isTestMode.set(enabled);
    this.loadRestaurantData();
  }

  toggleTestMode(): void {
    if (this.canTogglePaymentMode()) {
      this.isTestMode.update((v) => !v);
      this.loadRestaurantData();
    }
  }

  loadRestaurantData(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const id = this.restaurantId();
    this.restaurantService.getRestaurant(id).subscribe({
      next: (rest) => {
        this.restaurant.set(rest);
        // Refresh account status with current sandbox mode
        this.stripePaymentService.getConnectAccountStatus(id, this.isTestMode()).subscribe({
          next: (status) => {
            this.accountStatus.set(status);
            this.isLoading.set(false);
          },
          error: () => {
            this.accountStatus.set(rest.stripeStatus || null);
            this.isLoading.set(false);
          },
        });
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err?.error || err?.message || 'Failed to load restaurant details.');
      },
    });
  }

  /**
   * Starts or resumes Stripe Connect Onboarding.
   */
  startOnboardingFlow(): void {
    const id = this.restaurantId();
    if (!id) return;

    this.isActionProcessing.set(true);
    this.errorMessage.set(null);
    this.statusMessage.set(null);

    const currentUrl = window.location.href;
    const isSandbox = this.isTestMode();
    this.stripePaymentService.createConnectAccountLink(id, currentUrl, currentUrl, isSandbox).subscribe({
      next: (redirectUrl) => {
        this.isActionProcessing.set(false);
        if (redirectUrl) {
          window.location.href = redirectUrl;
        } else {
          this.errorMessage.set('Received an empty redirect URL from server.');
        }
      },
      error: (err) => {
        this.isActionProcessing.set(false);
        this.errorMessage.set(err?.error || err?.message || 'Failed to generate Stripe onboarding link.');
      },
    });
  }

  /**
   * Generates SSO login link to Stripe Express Dashboard.
   */
  openStripeDashboard(): void {
    const id = this.restaurantId();
    if (!id) return;

    this.isActionProcessing.set(true);
    this.errorMessage.set(null);
    this.statusMessage.set(null);

    const isSandbox = this.isTestMode();
    this.stripePaymentService.createConnectAccountLoginLink(id, isSandbox).subscribe({
      next: (loginUrl) => {
        this.isActionProcessing.set(false);
        if (loginUrl) {
          window.location.href = loginUrl;
        } else {
          this.errorMessage.set('Received an empty dashboard URL from server.');
        }
      },
      error: (err) => {
        this.isActionProcessing.set(false);
        this.errorMessage.set(err?.error || err?.message || 'Failed to generate Stripe login link.');
      },
    });
  }

  /**
   * Unbinds / disconnects Stripe account for this restaurant.
   */
  disconnectStripe(): void {
    const id = this.restaurantId();
    if (!id) return;

    const confirmed = window.confirm(
      'Are you sure you want to disconnect Stripe? Direct card payments and table self-ordering via Stripe will be disabled until reconnected.'
    );
    if (!confirmed) return;

    this.isActionProcessing.set(true);
    this.errorMessage.set(null);
    this.statusMessage.set(null);

    this.stripePaymentService.disableStripeAccountId(id).subscribe({
      next: () => {
        this.isActionProcessing.set(false);
        this.statusMessage.set('Stripe account has been successfully disconnected.');
        this.loadRestaurantData();
      },
      error: (err) => {
        this.isActionProcessing.set(false);
        this.errorMessage.set(err?.error || err?.message || 'Failed to disconnect Stripe account.');
      },
    });
  }

  goBackToAdmin(): void {
    this.router.navigate(['/restaurantsAdmin']);
  }
}

