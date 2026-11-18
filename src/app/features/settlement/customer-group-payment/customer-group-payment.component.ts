import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { LocalizationService } from '../../../core/services/localization.service';
import { LocPipe } from '../../../core/pipes/loc.pipe';
import {
  PaymentGroupSetModel,
  PaymentGroupModel,
  PaymentGroupItemModel,
} from '../../../core/models/restaurant.models';
import { PublicRestaurantDetails } from '../../../core/models/menu.models';

declare const Stripe: any;

@Component({
  selector: 'app-customer-group-payment',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, LocPipe],
  templateUrl: './customer-group-payment.component.html',
  styleUrls: ['./customer-group-payment.component.css'],
})
export class CustomerGroupPaymentComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly restaurantService = inject(RestaurantService);
  private readonly loc = inject(LocalizationService);

  groupId = signal<string>('');
  restaurant = signal<PublicRestaurantDetails | null>(null);
  groupSet = signal<PaymentGroupSetModel | null>(null);
  group = signal<PaymentGroupModel | null>(null);

  isLoading = signal<boolean>(true);
  isBusy = signal<boolean>(false);
  isInitializingStripe = signal<boolean>(false);
  isStripeReady = signal<boolean>(false);
  isPaidSuccess = signal<boolean>(false);

  errorMessage = signal<string | null>(null);
  paymentError = signal<string | null>(null);

  // Tip management
  selectedTipMode = signal<string>('none'); // 'none' | 'percentage' | 'custom_percentage' | 'fixed'
  selectedTipPercentage = signal<number>(0);
  customTipPercentageInput = signal<number | null>(null);
  customTipFixedInput = signal<number | null>(null);
  isHighTipConfirmed = signal<boolean>(false);
  showExplicitTipForm = signal<boolean>(false);
  tipAmountCents = signal<number>(0);
  private tipSelectionInitialized = false;

  // Fiscal metadata
  selectedFiscalOption = signal<'none' | 'cf' | 'lotteria'>('none');
  fiscalInputText = signal<string>('');
  fiscalValidationError = signal<string | null>(null);

  // Stripe
  private clientSecret: string | null = null;
  private paymentIntentId: string | null = null;
  private stripeInstance: any = null;
  private stripeElements: any = null;
  private stripePaymentElement: any = null;
  private stripeInitialized = false;

  // Polling for group status updates
  private pollIntervalId: any = null;

  ngOnInit(): void {
    const gid = this.route.snapshot.paramMap.get('groupId') || '';
    this.groupId.set(gid);

    if (!gid) {
      this.errorMessage.set(this.loc.translate('CustomerGroupPay_InvalidGroupId'));
      this.isLoading.set(false);
      return;
    }

    this.loadGroupData(gid, true);

    // Poll every 4 seconds to detect external adoption or payment updates
    this.pollIntervalId = setInterval(() => {
      if (!this.isLoading() && !this.isBusy() && !this.isPaidSuccess()) {
        this.refreshGroupData(this.groupId());
      }
    }, 4000);
  }

  ngOnDestroy(): void {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
    this.destroyStripe();
  }

  formatText(key: string, ...args: Array<string | number>): string {
    return this.loc.translate(key, ...args);
  }

  private loadGroupData(gid: string, isInitial = false): void {
    // In backend RestaurantService.fs, GetPaymentGroup(setId, groupId) searches for groupId across sets if setId is Guid.Empty or matches
    const emptyGuid = '00000000-0000-0000-0000-000000000000';
    this.restaurantService.getPaymentGroup(emptyGuid, gid).subscribe({
      next: ({ set, group }) => {
        this.groupSet.set(set);
        this.group.set(group);

        if (group.status === 'Paid') {
          this.isPaidSuccess.set(true);
          this.isStripeReady.set(false);
          this.destroyStripe();
          this.isLoading.set(false);
          return;
        }

        // Initialize fiscal metadata if already present
        if (group.fiscalMetadata && this.selectedFiscalOption() === 'none') {
          if (group.fiscalMetadata.type === 'CodiceFiscale') {
            this.selectedFiscalOption.set('cf');
            this.fiscalInputText.set(group.fiscalMetadata.code);
          } else if (group.fiscalMetadata.type === 'CodiceLotteria') {
            this.selectedFiscalOption.set('lotteria');
            this.fiscalInputText.set(group.fiscalMetadata.code);
          }
        }

        // Fetch restaurant details for name and tip hints
        if (set.restaurantId) {
          this.restaurantService.getRestaurantPublic(set.restaurantId).subscribe({
            next: (rest) => {
              this.restaurant.set(rest);
              if (!this.tipSelectionInitialized) {
                this.initializeTipSelection(rest);
              } else {
                this.recalculateTipAmount();
              }
              if (isInitial && !this.stripeInitialized) {
                this.stripeInitialized = true;
                this.initializeStripePaymentElement();
              }
            },
            error: () => {
              if (isInitial && !this.stripeInitialized) {
                this.stripeInitialized = true;
                this.initializeStripePaymentElement();
              }
            },
          });
        } else if (isInitial && !this.stripeInitialized) {
          this.stripeInitialized = true;
          this.initializeStripePaymentElement();
        }

        this.isLoading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err?.error?.detail || err?.error || err?.message || 'Error loading bill.');
        this.isLoading.set(false);
      },
    });
  }

  private refreshGroupData(gid: string): void {
    const oldTotal = this.group()?.totalAmount ?? 0;
    const oldItemCount = this.group()?.items.length ?? 0;
    const emptyGuid = '00000000-0000-0000-0000-000000000000';

    this.restaurantService.getPaymentGroup(emptyGuid, gid).subscribe({
      next: ({ set, group }) => {
        this.groupSet.set(set);
        this.group.set(group);

        if (group.status === 'Paid') {
          this.isPaidSuccess.set(true);
          this.isStripeReady.set(false);
          this.destroyStripe();
          return;
        }

        if (group.items.length === 0 || group.totalAmount <= 0) {
          this.isStripeReady.set(false);
          this.clientSecret = null;
          this.paymentIntentId = null;
          this.destroyStripe();
          return;
        }

        if (Math.abs(group.totalAmount - oldTotal) > 0.001 || group.items.length !== oldItemCount || !this.isStripeReady()) {
          this.recalculateTipAmount();
          this.initializeStripePaymentElement();
        }
      },
      error: () => {
        // silent on background polling
      },
    });
  }

  // --- Tip Handling ---
  private initializeTipSelection(rest: PublicRestaurantDetails): void {
    const hints = rest.tipsHints || [];
    if (rest.showTips && hints.length > 0) {
      const def = hints.find((h) => h.isDefault && h.percentage > 0);
      if (def) {
        this.selectedTipMode.set('percentage');
        this.selectedTipPercentage.set(def.percentage);
        this.recalculateTipAmount();
      } else {
        this.selectedTipMode.set('none');
        this.selectedTipPercentage.set(0);
        this.tipAmountCents.set(0);
      }
    } else {
      this.selectedTipMode.set('none');
      this.selectedTipPercentage.set(0);
      this.tipAmountCents.set(0);
    }
    this.tipSelectionInitialized = true;
  }

  toggleExplicitTipForm(): void {
    const next = !this.showExplicitTipForm();
    this.showExplicitTipForm.set(next);
    if (next) {
      const rest = this.restaurant();
      if (rest?.tipsHints && rest.tipsHints.length > 0 && this.selectedTipMode() === 'none') {
        const def = rest.tipsHints.find((h) => h.isDefault && h.percentage > 0);
        if (def) {
          this.selectTipPercentage(def.percentage);
          return;
        }
      }
    } else {
      this.selectTipMode('none');
    }
  }

  selectTipMode(mode: string): void {
    if (this.isBusy() || this.isInitializingStripe()) return;
    this.selectedTipMode.set(mode);
    if (mode === 'none') {
      this.selectedTipPercentage.set(0);
      this.customTipPercentageInput.set(null);
      this.customTipFixedInput.set(null);
    } else if (mode === 'custom_percentage' && this.customTipPercentageInput() === null) {
      this.customTipPercentageInput.set(10);
    } else if (mode === 'fixed' && this.customTipFixedInput() === null) {
      this.customTipFixedInput.set(2.0);
    }
    this.isHighTipConfirmed.set(false);
    this.updateTipAndReinitializeStripe();
  }

  selectTipPercentage(pct: number): void {
    if (this.isBusy() || this.isInitializingStripe()) return;
    this.selectedTipMode.set('percentage');
    this.selectedTipPercentage.set(pct);
    this.isHighTipConfirmed.set(false);
    this.updateTipAndReinitializeStripe();
  }

  onCustomTipPercentageChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const val = parseFloat(target.value);
    this.customTipPercentageInput.set(!isNaN(val) && val > 0 ? val : null);
    this.isHighTipConfirmed.set(false);
    this.updateTipAndReinitializeStripe();
  }

  onCustomTipFixedChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const val = parseFloat(target.value);
    this.customTipFixedInput.set(!isNaN(val) && val > 0 ? val : null);
    this.isHighTipConfirmed.set(false);
    this.updateTipAndReinitializeStripe();
  }

  onToggleHighTipConfirmed(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.isHighTipConfirmed.set(target.checked);
  }

  private getSelectedTipAmount(): number {
    const grp = this.group();
    if (!grp) return 0;
    const subtotal = grp.totalAmount;
    const mode = this.selectedTipMode();
    if (mode === 'percentage' && this.selectedTipPercentage() > 0) {
      return Math.round(subtotal * (this.selectedTipPercentage() / 100) * 100) / 100;
    }
    if (mode === 'custom_percentage' && (this.customTipPercentageInput() ?? 0) > 0) {
      return Math.round(subtotal * (this.customTipPercentageInput()! / 100) * 100) / 100;
    }
    if (mode === 'fixed' && (this.customTipFixedInput() ?? 0) > 0) {
      return Math.round(this.customTipFixedInput()! * 100) / 100;
    }
    return 0;
  }

  isTipOver50PercentThreshold(): boolean {
    const grp = this.group();
    if (!grp || grp.totalAmount <= 0) return false;
    const tip = this.getSelectedTipAmount();
    return tip / grp.totalAmount > 0.5;
  }

  private recalculateTipAmount(): void {
    const tipVal = this.getSelectedTipAmount();
    this.tipAmountCents.set(Math.round(tipVal * 100));
  }

  private updateTipAndReinitializeStripe(): void {
    this.recalculateTipAmount();
    this.initializeStripePaymentElement();
  }

  // --- Fiscal Metadata ---
  setFiscalOption(opt: 'none' | 'cf' | 'lotteria'): void {
    this.selectedFiscalOption.set(opt);
    this.fiscalValidationError.set(null);
    if (opt === 'none') {
      this.fiscalInputText.set('');
    }
  }

  onFiscalInputTextChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.fiscalInputText.set(target.value.toUpperCase());
    this.fiscalValidationError.set(null);
  }

  // --- Flexible Redistribution (Adopt & Remove) ---
  getAdoptableGroups(): PaymentGroupModel[] {
    const set = this.groupSet();
    const current = this.group();
    if (!set || !current) return [];
    return set.groups.filter(
      (g) =>
        g.groupId.toLowerCase() !== current.groupId.toLowerCase() &&
        g.status !== 'Paid' &&
        g.items.some((i) => !i.isCommonShared && !i.originalGroupId)
    );
  }

  getAdoptableItemsForGroup(grp: PaymentGroupModel): PaymentGroupItemModel[] {
    return grp.items.filter((i) => !i.isCommonShared && !i.originalGroupId);
  }

  adoptItem(sourceGroupId: string, sessionId: string, menuItemName: string): void {
    const set = this.groupSet();
    const current = this.group();
    if (!set || !current || this.isBusy()) return;

    this.isBusy.set(true);
    this.paymentError.set(null);

    this.restaurantService
      .adoptPaymentGroupItem({
        setId: set.setId,
        targetGroupId: current.groupId,
        sourceGroupId,
        sessionId,
        menuItemName,
      })
      .subscribe({
        next: (updatedSet) => {
          this.groupSet.set(updatedSet);
          const updatedCurrent = updatedSet.groups.find((g) => g.groupId.toLowerCase() === current.groupId.toLowerCase());
          if (updatedCurrent) {
            this.group.set(updatedCurrent);
          }
          this.recalculateTipAmount();
          this.initializeStripePaymentElement();
          this.isBusy.set(false);
        },
        error: (err) => {
          this.paymentError.set(err?.error?.detail || err?.error || err?.message || 'Error adopting dish.');
          this.isBusy.set(false);
        },
      });
  }

  removeAdoptedItem(sessionId: string, menuItemName: string): void {
    const set = this.groupSet();
    const current = this.group();
    if (!set || !current || this.isBusy()) return;

    this.isBusy.set(true);
    this.paymentError.set(null);

    this.restaurantService
      .removeAdoptedPaymentGroupItem({
        setId: set.setId,
        groupId: current.groupId,
        sessionId,
        menuItemName,
      })
      .subscribe({
        next: (updatedSet) => {
          this.groupSet.set(updatedSet);
          const updatedCurrent = updatedSet.groups.find((g) => g.groupId.toLowerCase() === current.groupId.toLowerCase());
          if (updatedCurrent) {
            this.group.set(updatedCurrent);
          }
          this.recalculateTipAmount();
          this.initializeStripePaymentElement();
          this.isBusy.set(false);
        },
        error: (err) => {
          this.paymentError.set(err?.error?.detail || err?.error || err?.message || 'Error removing dish.');
          this.isBusy.set(false);
        },
      });
  }

  // --- Stripe Payment Element ---
  private destroyStripe(): void {
    if (this.stripePaymentElement) {
      try {
        this.stripePaymentElement.unmount();
        this.stripePaymentElement.destroy();
      } catch {
        // ignore
      }
      this.stripePaymentElement = null;
    }
    this.stripeElements = null;
    this.stripeInstance = null;
    this.isStripeReady.set(false);
    const container = document.getElementById('stripe-payment-element-container');
    if (container) {
      container.innerHTML = '';
    }
  }

  private initializeStripePaymentElement(): void {
    const set = this.groupSet();
    const grp = this.group();
    if (!set || !grp || grp.status === 'Paid') return;

    this.recalculateTipAmount();
    const totalCents = Math.round(grp.totalAmount * 100) + this.tipAmountCents();
    if (totalCents <= 0) {
      this.destroyStripe();
      return;
    }

    this.isInitializingStripe.set(true);
    this.isStripeReady.set(false);
    this.paymentError.set(null);

    const itemsSummary = grp.items.map((i) => `${i.quantity}x ${i.menuItemName}`).join(', ');
    const tipCents = this.tipAmountCents() > 0 ? this.tipAmountCents() : null;

    this.restaurantService
      .createPaymentIntentForGroup(set.restaurantId, {
        tableNum: set.tableNum,
        tableId: set.tableId,
        amount: totalCents,
        currency: 'eur',
        setId: set.setId,
        groupId: grp.groupId,
        items: itemsSummary || null,
        tipAmount: tipCents,
      })
      .subscribe({
        next: ({ clientSecret, paymentIntentId }) => {
          this.clientSecret = clientSecret;
          this.paymentIntentId = paymentIntentId;

          this.restaurantService.getStripePublishableKey().subscribe({
            next: (pubKey) => {
              this.mountStripeElement(pubKey, clientSecret);
            },
            error: (err) => {
              this.paymentError.set(`Error loading Stripe publishable key: ${err?.message || err}`);
              this.isInitializingStripe.set(false);
            },
          });
        },
        error: (err) => {
          this.paymentError.set(err?.error?.detail || err?.error || err?.message || 'Error creating payment intent.');
          this.isInitializingStripe.set(false);
        },
      });
  }

  private mountStripeElement(publishableKey: string, secret: string): void {
    if (typeof (window as any).Stripe === 'undefined') {
      this.paymentError.set('Stripe.js library not loaded.');
      this.isInitializingStripe.set(false);
      return;
    }

    try {
      this.destroyStripe();

      const rest = this.restaurant();
      const connectedAccountId =
        rest?.paymentConfig?.destination?.value ||
        rest?.paymentConfig?.stripeAccountId ||
        null;
      const stripeOptions = connectedAccountId ? { stripeAccount: connectedAccountId } : {};

      this.stripeInstance = (window as any).Stripe(publishableKey, stripeOptions);
      this.stripeElements = this.stripeInstance.elements({
        clientSecret: secret,
        wallets: {
          applePay: 'auto',
          googlePay: 'auto',
        },
      });

      this.stripePaymentElement = this.stripeElements.create('payment');

      setTimeout(() => {
        const container = document.getElementById('stripe-payment-element-container');
        if (container) {
          container.innerHTML = '';
          this.stripePaymentElement.mount('#stripe-payment-element-container');
          this.isStripeReady.set(true);
        }
        this.isInitializingStripe.set(false);
      }, 150);
    } catch (e: any) {
      this.paymentError.set(`Error mounting Stripe payment element: ${e?.message || e}`);
      this.isInitializingStripe.set(false);
    }
  }

  // --- Payment Execution ---
  executePayment(): void {
    const set = this.groupSet();
    const grp = this.group();
    if (!set || !grp || this.isBusy() || !this.clientSecret || !this.stripeInstance || !this.stripeElements) return;

    // Validate fiscal code lengths
    this.fiscalValidationError.set(null);
    const opt = this.selectedFiscalOption();
    const cleanText = this.fiscalInputText().trim().toUpperCase();

    if (opt === 'cf') {
      if (cleanText.length !== 16) {
        this.fiscalValidationError.set(this.loc.translate('CustomerGroupPay_CfLengthError'));
        return;
      }
    } else if (opt === 'lotteria') {
      if (cleanText.length !== 8) {
        this.fiscalValidationError.set(this.loc.translate('CustomerGroupPay_LotteryLengthError'));
        return;
      }
    }

    this.isBusy.set(true);
    this.paymentError.set(null);

    const returnUrl = typeof window !== 'undefined' ? window.location.href : '';

    this.stripeInstance
      .confirmPayment({
        elements: this.stripeElements,
        confirmParams: {
          return_url: returnUrl,
        },
        redirect: 'if_required',
      })
      .then((res: any) => {
        if (res.error) {
          this.paymentError.set(res.error.message || 'Payment confirmation failed.');
          this.isBusy.set(false);
        } else {
          // Stripe confirmed payment intent -> notify backend to settle group
          const tipVal = this.tipAmountCents() > 0 ? this.tipAmountCents() / 100 : null;
          const optCf = opt === 'cf' && cleanText ? cleanText : null;
          const optCl = opt === 'lotteria' && cleanText ? cleanText : null;

          this.restaurantService
            .settlePaymentGroupWithStripe({
              setId: set.setId,
              groupId: grp.groupId,
              paymentIntentId: this.paymentIntentId || this.clientSecret!,
              codiceFiscale: optCf,
              codiceLotteria: optCl,
              tipAmount: tipVal,
            })
            .subscribe({
              next: () => {
                this.isPaidSuccess.set(true);
                this.destroyStripe();
                this.isBusy.set(false);
              },
              error: (settleErr) => {
                const errMsg =
                  settleErr?.error?.detail || settleErr?.error || settleErr?.message || 'Failed to record settlement.';
                this.paymentError.set(this.formatText('CustomerGroupPay_SettleError', errMsg));
                this.isBusy.set(false);
              },
            });
        }
      })
      .catch((err: any) => {
        this.paymentError.set(err?.message || 'Payment execution failed.');
        this.isBusy.set(false);
      });
  }
}
