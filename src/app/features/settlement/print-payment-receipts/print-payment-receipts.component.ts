import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { LocalizationService } from '../../../core/services/localization.service';
import { LocPipe } from '../../../core/pipes/loc.pipe';
import { PaymentGroupSetModel } from '../../../core/models/restaurant.models';
import { PublicRestaurantDetails } from '../../../core/models/menu.models';

@Component({
  selector: 'app-print-payment-receipts',
  standalone: true,
  imports: [CommonModule, RouterModule, LocPipe],
  templateUrl: './print-payment-receipts.component.html',
  styleUrls: ['./print-payment-receipts.component.css'],
})
export class PrintPaymentReceiptsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly restaurantService = inject(RestaurantService);
  private readonly loc = inject(LocalizationService);

  restaurantId = signal<string>('');
  tableNum = signal<number>(0);
  setId = signal<string>('');

  restaurant = signal<PublicRestaurantDetails | null>(null);
  groupSet = signal<PaymentGroupSetModel | null>(null);

  isLoading = signal<boolean>(true);
  errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    const rid = this.route.snapshot.paramMap.get('restaurantId') || '';
    const tNum = parseInt(this.route.snapshot.paramMap.get('tableNum') || '0', 10);
    const sid = this.route.snapshot.paramMap.get('setId') || '';

    this.restaurantId.set(rid);
    this.tableNum.set(tNum);
    this.setId.set(sid);

    if (!sid) {
      this.errorMessage.set('SetId non valido');
      this.isLoading.set(false);
      return;
    }

    if (rid) {
      this.restaurantService.getRestaurantPublic(rid).subscribe({
        next: (rest) => this.restaurant.set(rest),
        error: () => {},
      });
    }

    this.loadGroupSet(rid, sid);
  }

  formatText(key: string, ...args: Array<string | number>): string {
    return this.loc.translate(key, ...args);
  }

  private loadGroupSet(rid: string, sid: string): void {
    const emptyGuid = '00000000-0000-0000-0000-000000000000';
    this.restaurantService.getPaymentGroup(sid, emptyGuid).subscribe({
      next: ({ set }) => {
        this.groupSet.set(set);
        this.isLoading.set(false);
      },
      error: () => {
        this.restaurantService.getPaymentGroupSet(rid || emptyGuid, sid).subscribe({
          next: (set) => {
            this.groupSet.set(set);
            this.isLoading.set(false);
          },
          error: (err) => {
            this.errorMessage.set(err?.error?.detail || err?.error || err?.message || 'Error loading pre-bill receipts.');
            this.isLoading.set(false);
          },
        });
      },
    });
  }

  getGroupPayUrl(groupId: string): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/pay/group/${groupId}`;
  }

  getQrCodeUrl(url: string): string {
    return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(url)}`;
  }

  triggerPrint(): void {
    if (typeof window !== 'undefined') {
      window.print();
    }
  }
}
