import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  StripeAccountStatus,
  SubscriptionSettingsConfig,
  CreateSubscriptionIntentRequest,
  CreateSubscriptionIntentResponse,
} from '../models/restaurant.models';

export interface ConnectAccountLinkResponse {
  url?: string;
  Url?: string;
  URL?: string;
}

@Injectable({
  providedIn: 'root',
})
export class StripePaymentService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl ? environment.apiBaseUrl.replace(/\/$/, '') : '';

  /**
   * Retrieves platform SaaS subscription pricing tiers, currency, and multi-month discount percentage configuration.
   */
  getSubscriptionConfig(): Observable<SubscriptionSettingsConfig> {
    const url = `${this.baseUrl}/api/StripePayment/subscription-config`;
    return this.http.get<any>(url).pipe(
      map((res) => ({
        monthlyFeeCents: Number(res?.monthlyFeeCents ?? res?.MonthlyFeeCents ?? 2990),
        monthlyFeeCurrency: String(res?.monthlyFeeCurrency ?? res?.MonthlyFeeCurrency ?? 'EUR'),
        discount3MonthsPercent: Number(res?.discount3MonthsPercent ?? res?.Discount3MonthsPercent ?? 10.0),
        discount6MonthsPercent: Number(res?.discount6MonthsPercent ?? res?.Discount6MonthsPercent ?? 15.0),
        discount12MonthsPercent: Number(res?.discount12MonthsPercent ?? res?.Discount12MonthsPercent ?? 20.0),
      }))
    );
  }

  /**
   * Creates a Stripe Checkout session to purchase or extend a restaurant's platform subscription.
   */
  createSubscriptionIntent(
    restaurantId: string,
    payload: CreateSubscriptionIntentRequest
  ): Observable<CreateSubscriptionIntentResponse> {
    const url = `${this.baseUrl}/api/StripePayment/restaurant/${restaurantId}/create-subscription-intent`;
    return this.http.post<any>(url, payload).pipe(
      map((res) => ({
        checkoutUrl: res?.checkoutUrl ?? res?.CheckoutUrl ?? '',
        isRealStripe: Boolean(res?.isRealStripe ?? res?.IsRealStripe ?? false),
      }))
    );
  }

  /**
   * Retrieves Stripe Connect account status and verification requirements.
   */
  getConnectAccountStatus(restaurantId: string): Observable<StripeAccountStatus> {
    const url = `${this.baseUrl}/api/StripePayment/restaurant/${restaurantId}/account-status`;
    return this.http.get<any>(url).pipe(
      map((res) => ({
        isConnected: res?.isConnected ?? res?.IsConnected ?? false,
        detailsSubmitted: res?.detailsSubmitted ?? res?.DetailsSubmitted ?? false,
        chargesEnabled: res?.chargesEnabled ?? res?.ChargesEnabled ?? false,
        payoutsEnabled: res?.payoutsEnabled ?? res?.PayoutsEnabled ?? false,
        stripeAccountId: res?.stripeAccountId ?? res?.StripeAccountId ?? null,
        requirementsDue: res?.requirementsDue ?? res?.RequirementsDue ?? [],
      }))
    );
  }

  /**
   * Starts or resumes Stripe Connect onboarding by generating an account onboarding URL.
   */
  createConnectAccountLink(
    restaurantId: string,
    refreshUrl: string,
    returnUrl: string
  ): Observable<string> {
    const url = `${this.baseUrl}/api/StripePayment/restaurant/${restaurantId}/create-connect-link`;
    return this.http
      .post<ConnectAccountLinkResponse | string>(url, {
        refreshUrl,
        returnUrl,
      })
      .pipe(
        map((res) => {
          if (typeof res === 'string') return res;
          return res?.url || res?.Url || res?.URL || '';
        })
      );
  }

  /**
   * Generates a single-sign-on login link into the Stripe Express Dashboard for the restaurant merchant.
   */
  createConnectAccountLoginLink(restaurantId: string): Observable<string> {
    const url = `${this.baseUrl}/api/StripePayment/restaurant/${restaurantId}/create-login-link`;
    return this.http.post<ConnectAccountLinkResponse | string>(url, null).pipe(
      map((res) => {
        if (typeof res === 'string') return res;
        return res?.url || res?.Url || res?.URL || '';
      })
    );
  }

  /**
   * Disables and unbinds Stripe account connection for this restaurant.
   */
  disableStripeAccountId(restaurantId: string): Observable<void> {
    const url = `${this.baseUrl}/api/StripePayment/restaurant/${restaurantId}/disable-account`;
    return this.http.post<void>(url, null);
  }
}

