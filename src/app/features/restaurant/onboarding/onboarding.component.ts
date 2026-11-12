import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { StripePaymentService } from '../../../core/services/stripe-payment.service';
import { RestaurantItem, StripeAccountStatus } from '../../../core/models/restaurant.models';
import { MainLayoutComponent } from '../../../shared/components/main-layout/main-layout.component';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, MainLayoutComponent],
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
    this.loadRestaurantData();
  }

  loadRestaurantData(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const id = this.restaurantId();
    this.restaurantService.getRestaurant(id).subscribe({
      next: (rest) => {
        this.restaurant.set(rest);
        this.accountStatus.set(rest.stripeStatus || null);
        this.isLoading.set(false);
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
    this.stripePaymentService.createConnectAccountLink(id, currentUrl, currentUrl).subscribe({
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

    this.stripePaymentService.createConnectAccountLoginLink(id).subscribe({
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

