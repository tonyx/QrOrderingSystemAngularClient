import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { LocalizationService } from '../../../core/services/localization.service';
import { LocPipe } from '../../../core/pipes/loc.pipe';
import {
  PaymentGroupSetModel,
  PaymentGroupModel,
} from '../../../core/models/restaurant.models';

@Component({
  selector: 'app-waiter-view-payment-qrs',
  standalone: true,
  imports: [CommonModule, RouterModule, LocPipe],
  templateUrl: './waiter-view-payment-qrs.component.html',
  styleUrls: ['./waiter-view-payment-qrs.component.css'],
})
export class WaiterViewPaymentQrsComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly restaurantService = inject(RestaurantService);
  private readonly loc = inject(LocalizationService);

  tableNum = signal<number>(0);
  setId = signal<string>('');
  groupSet = signal<PaymentGroupSetModel | null>(null);
  selectedIndex = signal<number>(0);

  isLoading = signal<boolean>(true);
  errorMessage = signal<string | null>(null);
  copyFeedback = signal<string | null>(null);

  private pollIntervalId: any = null;

  currentGroup = computed<PaymentGroupModel | null>(() => {
    const set = this.groupSet();
    if (!set || !set.groups || set.groups.length === 0) return null;
    const idx = Math.min(Math.max(0, this.selectedIndex()), set.groups.length - 1);
    return set.groups[idx];
  });

  ngOnInit(): void {
    const tNum = parseInt(this.route.snapshot.paramMap.get('tableNum') || '0', 10);
    const sid = this.route.snapshot.paramMap.get('setId') || '';
    this.tableNum.set(tNum);
    this.setId.set(sid);

    if (!sid) {
      this.errorMessage.set('SetId non valido');
      this.isLoading.set(false);
      return;
    }

    this.loadGroupSet(sid);

    // Poll every 3 seconds to keep payment status up-to-date
    this.pollIntervalId = setInterval(() => {
      if (!this.isLoading()) {
        this.loadGroupSet(this.setId());
      }
    }, 3000);
  }

  ngOnDestroy(): void {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }

  formatText(key: string, ...args: Array<string | number>): string {
    return this.loc.translate(key, ...args);
  }

  private loadGroupSet(sid: string): void {
    const emptyGuid = '00000000-0000-0000-0000-000000000000';
    // First try public getPaymentGroup endpoint with empty groupId (backend returns full set in item1)
    this.restaurantService.getPaymentGroup(sid, emptyGuid).subscribe({
      next: ({ set }) => {
        this.groupSet.set(set);
        this.isLoading.set(false);
      },
      error: () => {
        // Fallback: try direct set endpoint
        this.restaurantService.getPaymentGroupSet(emptyGuid, sid).subscribe({
          next: (set) => {
            this.groupSet.set(set);
            this.isLoading.set(false);
          },
          error: (err) => {
            if (this.isLoading()) {
              this.errorMessage.set(err?.error?.detail || err?.error || err?.message || 'Error loading group set.');
              this.isLoading.set(false);
            }
          },
        });
      },
    });
  }

  selectGroup(index: number): void {
    this.selectedIndex.set(index);
  }

  prevGroup(): void {
    if (this.selectedIndex() > 0) {
      this.selectedIndex.update((i) => i - 1);
    }
  }

  nextGroup(): void {
    const set = this.groupSet();
    if (set && this.selectedIndex() < set.groups.length - 1) {
      this.selectedIndex.update((i) => i + 1);
    }
  }

  getPaidCount(): number {
    const set = this.groupSet();
    if (!set) return 0;
    return set.groups.filter((g) => g.status === 'Paid').length;
  }

  getGroupPayUrl(groupId: string): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/pay/group/${groupId}`;
  }

  getQrCodeUrl(url: string): string {
    return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(url)}`;
  }

  formatPaidTime(paidAtStr: string): string {
    try {
      const d = new Date(paidAtStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  copyToClipboard(text: string): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        () => {
          this.copyFeedback.set(this.loc.translate('WaiterView_LinkCopied'));
          setTimeout(() => this.copyFeedback.set(null), 2500);
        },
        () => {
          this.copyFeedback.set(this.loc.translate('WaiterView_CopyFailed'));
          setTimeout(() => this.copyFeedback.set(null), 2500);
        }
      );
    }
  }
}
