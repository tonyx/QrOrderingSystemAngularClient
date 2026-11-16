import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { AuthService } from '../../../core/services/auth.service';
import { LocalizationService } from '../../../core/services/localization.service';
import { LocPipe } from '../../../core/pipes/loc.pipe';
import { RestaurantItem } from '../../../core/models/restaurant.models';
import { MainLayoutComponent } from '../../../shared/components/main-layout/main-layout.component';

@Component({
  selector: 'app-restaurant-history',
  standalone: true,
  imports: [CommonModule, RouterLink, LocPipe, MainLayoutComponent],
  templateUrl: './restaurant-history.component.html',
  styleUrls: ['./restaurant-history.component.css'],
})
export class RestaurantHistoryComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly restaurantService = inject(RestaurantService);
  private readonly authService = inject(AuthService);
  private readonly loc = inject(LocalizationService);

  restaurantId = signal<string | null>(null);
  restaurant = signal<RestaurantItem | null>(null);
  isLoading = signal<boolean>(true);
  errorMessage = signal<string | null>(null);
  historyJson = signal<string | null>(null);

  previewText = computed(() => {
    const json = this.historyJson();
    if (!json) return '';
    return json.length > 1000
      ? json.substring(0, 1000) + `...\n${this.loc.translate('RestaurantHistory_TruncatedPreview')}`
      : json;
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('restaurantId');
    if (!id) {
      this.errorMessage.set(this.loc.translate('RestaurantHistory_InvalidRestaurantId'));
      this.isLoading.set(false);
      return;
    }

    if (!this.authService.isAuthenticated()) {
      this.errorMessage.set(this.loc.translate('RestaurantHistory_UserNotAuthenticated'));
      this.isLoading.set(false);
      return;
    }

    this.restaurantId.set(id);
    this.loadRestaurantAndHistory(id);
  }

  loadRestaurantAndHistory(id: string): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.historyJson.set(null);

    // Fetch restaurant details first for name formatting
    this.restaurantService.getRestaurant(id).subscribe({
      next: (rest) => {
        this.restaurant.set(rest);
        this.fetchHistory(id);
      },
      error: () => {
        // If restaurant lookup fails, we can still attempt history fetch
        this.fetchHistory(id);
      },
    });
  }

  retry(): void {
    const id = this.restaurantId();
    if (id) {
      this.loadRestaurantAndHistory(id);
    }
  }

  private fetchHistory(id: string): void {
    this.restaurantService.getHistory(id).subscribe({
      next: (json) => {
        this.historyJson.set(json);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err?.error || err?.message || 'Failed to load restaurant history.');
      },
    });
  }

  downloadFile(): void {
    const json = this.historyJson();
    if (!json) return;

    const restName = this.restaurant()?.restaurantName || 'restaurant';
    const fileName = `${restName}_history.json`;

    const blob = new Blob([json], { type: 'application/json' });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  }
}
