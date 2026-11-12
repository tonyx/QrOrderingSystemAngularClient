import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LocPipe } from '../../../core/pipes/loc.pipe';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { RestaurantItem } from '../../../core/models/restaurant.models';
import { MainLayoutComponent } from '../../../shared/components/main-layout/main-layout.component';

@Component({
  selector: 'app-show-qrs',
  standalone: true,
  imports: [CommonModule, RouterModule, MainLayoutComponent, LocPipe],
  templateUrl: './show-qrs.component.html',
  styleUrls: ['./show-qrs.component.css'],
})
export class ShowQrsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly restaurantService = inject(RestaurantService);

  restaurantId = signal<string>('');
  restaurant = signal<RestaurantItem | null>(null);
  loading = signal<boolean>(true);
  errorMessage = signal<string | null>(null);

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

  loadRestaurant(id: string): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.restaurantService.getRestaurant(id).subscribe({
      next: (data) => {
        this.restaurant.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err?.error?.message || err?.message || 'Failed to load restaurant QR codes.');
        this.loading.set(false);
      },
    });
  }

  printSheet(): void {
    window.print();
  }

  getTableQrUrl(tableNumber: number, tableId: string): string {
    const targetUrl = `${window.location.origin}/order?restaurantId=${this.restaurantId()}&tableNumber=${tableNumber}&tableId=${tableId}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(targetUrl)}`;
  }
}

