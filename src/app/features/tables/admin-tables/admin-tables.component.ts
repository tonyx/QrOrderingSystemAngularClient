import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LocPipe } from '../../../core/pipes/loc.pipe';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { RestaurantItem, TableModel } from '../../../core/models/restaurant.models';
import { MainLayoutComponent } from '../../../shared/components/main-layout/main-layout.component';

@Component({
  selector: 'app-admin-tables',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, MainLayoutComponent, LocPipe],
  templateUrl: './admin-tables.component.html',
  styleUrls: ['./admin-tables.component.css'],
})
export class AdminTablesComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly restaurantService = inject(RestaurantService);

  restaurantId = signal<string>('');
  restaurant = signal<RestaurantItem | null>(null);
  loading = signal<boolean>(true);
  errorMessage = signal<string | null>(null);

  // Form signals
  newTableInfo = '';
  newTableMaxSessions = 4;
  createErrorMessage = signal<string | null>(null);
  createSuccessMessage = signal<string | null>(null);
  deleteErrorMessage = signal<string | null>(null);
  isSubmitting = signal<boolean>(false);

  // Table update status tracking
  updatingTableSelfOrdering = signal<Set<number>>(new Set());

  // Modal QR signals
  showModal = signal<boolean>(false);
  modalTitle = signal<string>('');
  modalQrUrl = signal<string>('');
  targetFilename = signal<string>('');

  // Regeneration Confirmation
  tableNumberToRegenerate = signal<number | null>(null);

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
        this.loading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err?.error?.message || err?.message || 'Failed to load restaurant details.');
        this.loading.set(false);
      },
    });
  }

  addTable(): void {
    const rest = this.restaurant();
    if (!rest || this.isSubmitting()) return;

    this.createErrorMessage.set(null);
    this.createSuccessMessage.set(null);

    if (this.newTableMaxSessions <= 0) {
      this.createErrorMessage.set('Seats / Max Sessions must be greater than 0.');
      return;
    }

    this.isSubmitting.set(true);
    this.restaurantService
      .addTable(rest.restaurantId, {
        additionalInfo: this.newTableInfo.trim() || null,
        maxSessions: this.newTableMaxSessions,
      })
      .subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.createSuccessMessage.set('Table added successfully!');
          this.newTableInfo = '';
          this.newTableMaxSessions = 4;
          this.loadRestaurant(rest.restaurantId, true);
        },
        error: (err) => {
          this.isSubmitting.set(false);
          this.createErrorMessage.set(err?.error?.message || err?.message || 'Failed to add table.');
        },
      });
  }

  removeTopTable(): void {
    const rest = this.restaurant();
    if (!rest || this.isSubmitting()) return;

    this.deleteErrorMessage.set(null);
    this.isSubmitting.set(true);

    this.restaurantService.removeTopTable(rest.restaurantId).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.deleteErrorMessage.set(err?.error?.message || err?.message || 'Failed to remove table.');
      },
    });
  }

  updateMaxSessions(tableNumber: number, value: any): void {
    const rest = this.restaurant();
    if (!rest) return;

    const maxSessions = Number(value);
    if (!maxSessions || maxSessions <= 0) {
      this.errorMessage.set('Max Sessions must be a positive integer.');
      return;
    }

    this.restaurantService.changeMaxSessions(rest.restaurantId, tableNumber, maxSessions).subscribe({
      next: () => this.loadRestaurant(rest.restaurantId, true),
      error: (err) => this.errorMessage.set(err?.error?.message || err?.message || 'Failed to update max sessions.'),
    });
  }

  updateSkipSeatFee(tableNumber: number, event: Event): void {
    const rest = this.restaurant();
    if (!rest) return;

    const target = event.target as HTMLInputElement;
    const skip = target.checked;

    this.restaurantService.setSkipSeatFee(rest.restaurantId, tableNumber, skip).subscribe({
      next: () => this.loadRestaurant(rest.restaurantId, true),
      error: (err) => this.errorMessage.set(err?.error?.message || err?.message || 'Failed to update cover fee setting.'),
    });
  }

  updateTableSelfOrdering(tableNumber: number, option: 'reset' | 'no' | 'cash-only' | 'cache-and-stripe' | 'only-stripe'): void {
    const rest = this.restaurant();
    if (!rest) return;

    const s = new Set(this.updatingTableSelfOrdering());
    s.add(tableNumber);
    this.updatingTableSelfOrdering.set(s);

    this.restaurantService.setTableSelfOrdering(rest.restaurantId, tableNumber, option).subscribe({
      next: () => {
        const nextSet = new Set(this.updatingTableSelfOrdering());
        nextSet.delete(tableNumber);
        this.updatingTableSelfOrdering.set(nextSet);
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        const nextSet = new Set(this.updatingTableSelfOrdering());
        nextSet.delete(tableNumber);
        this.updatingTableSelfOrdering.set(nextSet);
        this.errorMessage.set(err?.error?.message || err?.message || 'Failed to update table self-ordering.');
      },
    });
  }

  showQrCode(tableNumber: number, tableId: string): void {
    const origin = window.location.origin;
    const targetUrl = `${origin}/order?restaurantId=${this.restaurantId()}&tableNumber=${tableNumber}&tableId=${tableId}`;
    this.modalQrUrl.set(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(targetUrl)}`);
    this.modalTitle.set(`Table #${tableNumber} QR Code`);
    this.targetFilename.set(`table-${tableNumber}-qr.png`);
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
  }

  async downloadQr(): Promise<void> {
    const url = this.modalQrUrl();
    const filename = this.targetFilename();
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, '_blank');
    }
  }

  requestRegenerateId(tableNumber: number): void {
    this.tableNumberToRegenerate.set(tableNumber);
  }

  cancelRegenerateId(): void {
    this.tableNumberToRegenerate.set(null);
  }

  confirmRegenerateId(): void {
    const rest = this.restaurant();
    const tableNum = this.tableNumberToRegenerate();
    if (!rest || tableNum === null) return;

    this.tableNumberToRegenerate.set(null);
    this.errorMessage.set(null);

    this.restaurantService.regenerateTableId(rest.restaurantId, tableNum).subscribe({
      next: () => this.loadRestaurant(rest.restaurantId, true),
      error: (err) => this.errorMessage.set(err?.error?.message || err?.message || 'Failed to regenerate table ID.'),
    });
  }

  getTableTestOrderUrl(tableNumber: number, tableId: string): string {
    return `/order?restaurantId=${this.restaurantId()}&tableNumber=${tableNumber}&tableId=${tableId}`;
  }

  getTableWaiterOrderUrl(tableNumber: number, tableId: string): string {
    return `/waiter-order?RestaurantId=${this.restaurantId()}&TableNumber=${tableNumber}&TableId=${tableId}`;
  }
}

