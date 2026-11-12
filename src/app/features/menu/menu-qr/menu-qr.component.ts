import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { RestaurantItem } from '../../../core/models/restaurant.models';
import { MainLayoutComponent } from '../../../shared/components/main-layout/main-layout.component';

@Component({
  selector: 'app-menu-qr',
  standalone: true,
  imports: [CommonModule, RouterModule, MainLayoutComponent],
  templateUrl: './menu-qr.component.html',
  styleUrl: './menu-qr.component.css',
})
export class MenuQrComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly restaurantService = inject(RestaurantService);

  protected restaurant = signal<RestaurantItem | null>(null);
  protected restaurantId = signal<string>('');
  protected isLoading = signal<boolean>(true);
  protected errorMessage = signal<string | null>(null);

  protected publicMenuUrl = computed(() => {
    const id = this.restaurantId();
    if (!id) return '';
    const origin = window.location.origin;
    return `${origin}/m/${id}`;
  });

  protected qrCodeImageUrl = computed(() => {
    const url = this.publicMenuUrl();
    if (!url) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(url)}`;
  });

  ngOnInit(): void {
    const id =
      this.route.snapshot.paramMap.get('restaurantId') ||
      this.route.snapshot.queryParamMap.get('restaurantId') ||
      '';

    if (!id) {
      this.errorMessage.set('Missing restaurant identifier in URL.');
      this.isLoading.set(false);
      return;
    }

    this.restaurantId.set(id);
    this.loadRestaurant(id);
  }

  loadRestaurant(id: string): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.restaurantService.getRestaurant(id).subscribe({
      next: (data) => {
        this.restaurant.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(
          err?.error || err?.message || 'Failed to retrieve restaurant for QR menu.'
        );
      },
    });
  }

  printQr(): void {
    window.print();
  }

  downloadQr(): void {
    const qrUrl = this.qrCodeImageUrl();
    if (!qrUrl) return;

    fetch(qrUrl)
      .then((res) => res.blob())
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        const safeName = (this.restaurant()?.restaurantName || 'restaurant')
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .toLowerCase();
        a.href = url;
        a.download = `${safeName}_menu_qr.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      })
      .catch(() => {
        window.open(qrUrl, '_blank');
      });
  }
}

