import { Injectable, inject } from '@angular/core';
import { HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { StripePaymentsService } from '../api/endpoints/stripe-payments/stripe-payments.service';
import {
  StripeAccountStatus,
  SubscriptionSettingsConfig,
  CreateSubscriptionIntentRequest,
  CreateSubscriptionIntentResponse,
} from '../models/restaurant.models';
import { PaymentModel } from '../models/payment.models';

export interface ConnectAccountLinkResponse {
  url?: string;
  Url?: string;
  URL?: string;
}

@Injectable({
  providedIn: 'root',
})
export class StripePaymentService {
  private readonly stripeApi = inject(StripePaymentsService);

  /**
   * Retrieves platform SaaS subscription pricing tiers, currency, and multi-month discount percentage configuration.
   */
  getSubscriptionConfig(): Observable<SubscriptionSettingsConfig> {
    return this.stripeApi.getApiStripePaymentSubscriptionConfig('application/json').pipe(
      map((res: any) => ({
        monthlyFeeCents: Number(res?.monthlyFeeCents ?? res?.MonthlyFeeCents ?? 2990),
        monthlyFeeCurrency: String(res?.monthlyFeeCurrency ?? res?.MonthlyFeeCurrency ?? 'EUR'),
        discount3MonthsPercent: Number(res?.discount3MonthsPercent ?? res?.Discount3MonthsPercent ?? 10.0),
        discount6MonthsPercent: Number(res?.discount6MonthsPercent ?? res?.Discount6MonthsPercent ?? 15.0),
        discount12MonthsPercent: Number(res?.discount12MonthsPercent ?? res?.Discount12MonthsPercent ?? 20.0),
        hasTestKeys: Boolean(res?.hasTestKeys ?? res?.HasTestKeys ?? false),
        hasLiveKeys: Boolean(res?.hasLiveKeys ?? res?.HasLiveKeys ?? false),
      }))
    );
  }

  /**
   * Creates a Stripe Checkout session to purchase or extend a restaurant's platform subscription.
   */
  createSubscriptionIntent(
    restaurantId: string,
    payload: CreateSubscriptionIntentRequest,
    isSandbox?: boolean
  ): Observable<CreateSubscriptionIntentResponse> {
    const sandboxValue = Boolean(isSandbox ?? payload.isSandbox);
    let headers: HttpHeaders | undefined;
    let params: HttpParams | undefined;

    if (sandboxValue) {
      headers = new HttpHeaders({ 'X-Sandbox': 'true' });
      params = new HttpParams().set('sandbox', 'true');
    }

    const body = {
      ...payload,
      isSandbox: sandboxValue,
    };

    return this.stripeApi
      .postApiStripePaymentRestaurantRestaurantIdCreateSubscriptionIntent(
        restaurantId,
        body as any,
        'application/json',
        { headers, params }
      )
      .pipe(
        map((res: any) => ({
          checkoutUrl: res?.checkoutUrl ?? res?.CheckoutUrl ?? '',
          isRealStripe: Boolean(res?.isRealStripe ?? res?.IsRealStripe ?? false),
        }))
      );
  }

  /**
   * Retrieves Stripe Connect account status and verification requirements.
   */
  getConnectAccountStatus(restaurantId: string): Observable<StripeAccountStatus> {
    return this.stripeApi.getApiStripePaymentRestaurantRestaurantIdAccountStatus(restaurantId, 'application/json').pipe(
      map((res: any) => ({
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
    return this.stripeApi
      .postApiStripePaymentRestaurantRestaurantIdCreateConnectLink(
        restaurantId,
        { refreshUrl, returnUrl },
        'application/json'
      )
      .pipe(
        map((res: any) => {
          if (typeof res === 'string') return res;
          return res?.url || res?.Url || res?.URL || '';
        })
      );
  }

  /**
   * Generates a single-sign-on login link into the Stripe Express Dashboard for the restaurant merchant.
   */
  createConnectAccountLoginLink(restaurantId: string): Observable<string> {
    return this.stripeApi
      .postApiStripePaymentRestaurantRestaurantIdCreateLoginLink(restaurantId, 'application/json')
      .pipe(
        map((res: any) => {
          if (typeof res === 'string') return res;
          return res?.url || res?.Url || res?.URL || '';
        })
      );
  }

  /**
   * Disables and unbinds Stripe account connection for this restaurant.
   */
  disableStripeAccountId(restaurantId: string): Observable<void> {
    return this.stripeApi.postApiStripePaymentRestaurantRestaurantIdDisableAccount(restaurantId);
  }

  /**
   * Retrieves electronic payments processed for a restaurant within a specific time window.
   */
  getPaymentsByTimeInterval(
    restaurantId: string,
    startDate: Date,
    endDate: Date
  ): Observable<PaymentModel[]> {
    return this.stripeApi.getApiStripePaymentRestaurantRestaurantIdPayments(
      restaurantId,
      'application/json',
      {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      }
    ) as unknown as Observable<PaymentModel[]>;
  }

  /**
   * Records an issue or audit dispute against a payment transaction.
   */
  addIssue(
    restaurantId: string,
    paymentId: string,
    issue: string
  ): Observable<void> {
    return this.stripeApi.postApiStripePaymentRestaurantRestaurantIdPaymentPaymentIdAddIssue(
      restaurantId,
      paymentId,
      { issue }
    );
  }
}

