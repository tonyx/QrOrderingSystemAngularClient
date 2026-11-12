import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { RestaurantItem, SelfOrderingMode } from '../../../core/models/restaurant.models';
import { MainLayoutComponent } from '../../../shared/components/main-layout/main-layout.component';

@Component({
  selector: 'app-restaurant-admin',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, MainLayoutComponent],
  templateUrl: './restaurant-admin.component.html',
  styleUrls: ['./restaurant-admin.component.css'],
})
export class RestaurantAdminComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly restaurantService = inject(RestaurantService);

  restaurantId = signal<string>('');
  restaurant = signal<RestaurantItem | null>(null);
  loading = signal<boolean>(true);
  errorMessage = signal<string | null>(null);

  // Loading flags for interactive sections
  isUpdatingSelfOrdering = signal<boolean>(false);
  isUpdatingExtraCatalogue = signal<boolean>(false);
  isUpdatingTips = signal<boolean>(false);
  isUpdatingSeatingFee = signal<boolean>(false);
  isUpdatingVat = signal<boolean>(false);

  // Section error signals
  tipError = signal<string | null>(null);
  seatingFeeError = signal<string | null>(null);
  vatError = signal<string | null>(null);

  // Inputs
  newTipHintInput: number | null = null;
  newSeatingFeeInput: number | null = null;
  newVatCodeInput = '';
  newVatRateInput: number | null = null;

  // Assistant & Menu QR Modals
  assistantTopic = signal<string | null>(null);
  showMenuQrModal = signal<boolean>(false);

  askAssistant(topic: string, restaurantId?: string): void {
    this.assistantTopic.set(restaurantId ? `${topic} (${restaurantId})` : topic);
  }

  closeAssistant(): void {
    this.assistantTopic.set(null);
  }

  openMenuQrModal(): void {
    this.showMenuQrModal.set(true);
  }

  closeMenuQrModal(): void {
    this.showMenuQrModal.set(false);
  }

  printMenuQr(): void {
    window.print();
  }

  getMenuQrUrl(restaurantId: string): string {
    return `${window.location.origin}/m/${restaurantId}`;
  }

  getMenuQrImageUrl(restaurantId: string): string {
    const targetUrl = encodeURIComponent(this.getMenuQrUrl(restaurantId));
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${targetUrl}`;
  }

  noopAction(event?: Event): void {
    if (event) {
      event.preventDefault();
    }
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('restaurantId');
    if (id) {
      this.restaurantId.set(id);
      this.loadRestaurant(id);
    } else {
      this.errorMessage.set('No restaurant ID provided in route.');
      this.loading.set(false);
    }
  }

  loadRestaurant(id: string, isSilent = false): void {
    if (!isSilent) {
      this.loading.set(true);
    }
    this.errorMessage.set(null);
    this.restaurantService.getRestaurant(id).subscribe({
      next: (data) => {
        this.restaurant.set(data);
        if (!isSilent) {
          this.newSeatingFeeInput = data.seatingFee ?? 0;
          this.loading.set(false);
        }
      },
      error: (err) => {
        this.errorMessage.set(err?.error?.message || err?.message || 'Failed to load restaurant.');
        this.loading.set(false);
      },
    });
  }

  // --- 1. Self-Ordering Mode Actions ---
  selectSelfOrdering(mode: SelfOrderingMode): void {
    const rest = this.restaurant();
    if (!rest || this.isUpdatingSelfOrdering()) return;
    if (rest.hasActiveOrders && mode === 'no') return;

    this.isUpdatingSelfOrdering.set(true);
    this.errorMessage.set(null);

    this.restaurantService.setSelfOrderingMode(rest.restaurantId, mode).subscribe({
      next: () => {
        this.isUpdatingSelfOrdering.set(false);
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.isUpdatingSelfOrdering.set(false);
        this.errorMessage.set(err?.error?.message || err?.message || 'Failed to update self-ordering mode.');
      },
    });
  }

  // --- 2. Extra Catalogue Actions ---
  initializeExtraCatalogue(): void {
    const rest = this.restaurant();
    if (!rest || this.isUpdatingExtraCatalogue()) return;

    this.isUpdatingExtraCatalogue.set(true);
    this.errorMessage.set(null);

    this.restaurantService.initializeExtraCatalogue(rest.restaurantId).subscribe({
      next: () => {
        this.isUpdatingExtraCatalogue.set(false);
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.isUpdatingExtraCatalogue.set(false);
        this.errorMessage.set(err?.error?.message || err?.message || 'Failed to initialize extra catalogue.');
      },
    });
  }

  toggleExtraCatalogueSwitch(): void {
    const rest = this.restaurant();
    if (!rest || this.isUpdatingExtraCatalogue()) return;

    this.isUpdatingExtraCatalogue.set(true);
    this.errorMessage.set(null);

    const isCurrentlyEnabled = rest.extraCatalogueSetting?.isEnabled;
    const action$ = isCurrentlyEnabled
      ? this.restaurantService.disableExtraCatalogue(rest.restaurantId)
      : this.restaurantService.enableExtraCatalogue(rest.restaurantId);

    action$.subscribe({
      next: () => {
        this.isUpdatingExtraCatalogue.set(false);
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.isUpdatingExtraCatalogue.set(false);
        this.errorMessage.set(err?.error?.message || err?.message || 'Failed to toggle extra catalogue.');
      },
    });
  }

  // --- 3. Tip Options Actions ---
  toggleShowTips(event: Event): void {
    const rest = this.restaurant();
    if (!rest || this.isUpdatingTips()) return;
    const target = event.target as HTMLInputElement;
    const showTips = target.checked;

    this.isUpdatingTips.set(true);
    this.tipError.set(null);

    this.restaurantService.setShowTips(rest.restaurantId, showTips).subscribe({
      next: () => {
        this.isUpdatingTips.set(false);
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.isUpdatingTips.set(false);
        this.tipError.set(err?.error?.message || err?.message || 'Failed to update tip display setting.');
      },
    });
  }

  addTipHint(): void {
    const rest = this.restaurant();
    if (!rest || this.isUpdatingTips() || this.newTipHintInput == null) return;

    const val = Number(this.newTipHintInput);
    if (val < 1 || val > 100) {
      this.tipError.set('Tip percentage must be between 1 and 100.');
      return;
    }

    this.isUpdatingTips.set(true);
    this.tipError.set(null);

    this.restaurantService.addTipHint(rest.restaurantId, val).subscribe({
      next: () => {
        this.newTipHintInput = null;
        this.isUpdatingTips.set(false);
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.isUpdatingTips.set(false);
        this.tipError.set(err?.error?.message || err?.message || 'Failed to add tip hint.');
      },
    });
  }

  removeTipHint(tipHint: number): void {
    const rest = this.restaurant();
    if (!rest || this.isUpdatingTips()) return;

    this.isUpdatingTips.set(true);
    this.tipError.set(null);

    this.restaurantService.removeTipHint(rest.restaurantId, tipHint).subscribe({
      next: () => {
        this.isUpdatingTips.set(false);
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.isUpdatingTips.set(false);
        this.tipError.set(err?.error?.message || err?.message || 'Failed to remove tip hint.');
      },
    });
  }

  setDefaultTipHint(tipHint: number): void {
    const rest = this.restaurant();
    if (!rest || this.isUpdatingTips()) return;

    this.isUpdatingTips.set(true);
    this.tipError.set(null);

    this.restaurantService.setDefaultTipHint(rest.restaurantId, tipHint).subscribe({
      next: () => {
        this.isUpdatingTips.set(false);
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.isUpdatingTips.set(false);
        this.tipError.set(err?.error?.message || err?.message || 'Failed to set default tip hint.');
      },
    });
  }

  removeDefaultTipHint(): void {
    const rest = this.restaurant();
    if (!rest || this.isUpdatingTips()) return;

    this.isUpdatingTips.set(true);
    this.tipError.set(null);

    this.restaurantService.setNoDefaultTipHint(rest.restaurantId).subscribe({
      next: () => {
        this.isUpdatingTips.set(false);
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.isUpdatingTips.set(false);
        this.tipError.set(err?.error?.message || err?.message || 'Failed to clear default tip hint.');
      },
    });
  }

  resetTipsHints(): void {
    const rest = this.restaurant();
    if (!rest || this.isUpdatingTips()) return;

    this.isUpdatingTips.set(true);
    this.tipError.set(null);

    this.restaurantService.resetTipsHints(rest.restaurantId).subscribe({
      next: () => {
        this.isUpdatingTips.set(false);
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.isUpdatingTips.set(false);
        this.tipError.set(err?.error?.message || err?.message || 'Failed to reset tip hints.');
      },
    });
  }

  // --- 4. Seating Fee Actions ---
  saveSeatingFee(): void {
    const rest = this.restaurant();
    if (!rest || this.isUpdatingSeatingFee() || this.newSeatingFeeInput == null) return;

    const fee = Number(this.newSeatingFeeInput);
    if (fee < 0) {
      this.seatingFeeError.set('Seating fee must be non-negative.');
      return;
    }

    this.isUpdatingSeatingFee.set(true);
    this.seatingFeeError.set(null);

    this.restaurantService.setSeatingFee(rest.restaurantId, fee).subscribe({
      next: () => {
        this.isUpdatingSeatingFee.set(false);
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.isUpdatingSeatingFee.set(false);
        this.seatingFeeError.set(err?.error?.message || err?.message || 'Failed to set seating fee.');
      },
    });
  }

  // --- 5. VAT Department Codes & Rates Actions ---
  addVatDepartment(): void {
    const rest = this.restaurant();
    if (!rest || this.isUpdatingVat() || !this.newVatCodeInput.trim() || this.newVatRateInput == null) return;

    const code = this.newVatCodeInput.trim();
    const rate = Number(this.newVatRateInput);

    if (rate < 0 || rate > 99) {
      this.vatError.set('VAT rate must be between 0% and 99%.');
      return;
    }

    this.isUpdatingVat.set(true);
    this.vatError.set(null);

    this.restaurantService.addExtraVatDepartment(rest.restaurantId, { code, rate }).subscribe({
      next: () => {
        this.newVatCodeInput = '';
        this.newVatRateInput = null;
        this.isUpdatingVat.set(false);
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.isUpdatingVat.set(false);
        this.vatError.set(err?.error?.message || err?.message || 'Failed to add VAT department.');
      },
    });
  }

  removeVatDepartment(code: string): void {
    const rest = this.restaurant();
    if (!rest || this.isUpdatingVat()) return;

    this.isUpdatingVat.set(true);
    this.vatError.set(null);

    this.restaurantService.removeExtraVatDepartment(rest.restaurantId, code).subscribe({
      next: () => {
        this.isUpdatingVat.set(false);
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.isUpdatingVat.set(false);
        this.vatError.set(err?.error?.message || err?.message || 'Failed to remove VAT department.');
      },
    });
  }
}

