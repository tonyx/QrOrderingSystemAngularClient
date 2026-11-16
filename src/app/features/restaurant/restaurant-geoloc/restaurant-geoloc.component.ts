import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { AuthService } from '../../../core/services/auth.service';
import { LocalizationService } from '../../../core/services/localization.service';
import { LocPipe } from '../../../core/pipes/loc.pipe';
import { RestaurantItem } from '../../../core/models/restaurant.models';
import { MainLayoutComponent } from '../../../shared/components/main-layout/main-layout.component';

declare const window: any;

@Component({
  selector: 'app-restaurant-geoloc',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LocPipe, MainLayoutComponent],
  templateUrl: './restaurant-geoloc.component.html',
  styleUrls: ['./restaurant-geoloc.component.css'],
})
export class RestaurantGeoLocComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly restaurantService = inject(RestaurantService);
  private readonly authService = inject(AuthService);
  private readonly loc = inject(LocalizationService);

  restaurantId = signal<string>('');
  restaurant = signal<RestaurantItem | null>(null);

  isLoading = signal<boolean>(true);
  isSaving = signal<boolean>(false);
  isDisabling = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  latitude = signal<number | null>(null);
  longitude = signal<number | null>(null);
  radiusInMeters = signal<number>(50.0);
  isGeoLocCurrentlyEnabled = signal<boolean>(false);

  private mapInitialized = false;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('restaurantId');
    if (!id) {
      this.errorMessage.set(this.loc.translate('RestaurantGeoLoc_NotFound'));
      this.isLoading.set(false);
      return;
    }

    this.restaurantId.set(id);
    this.loadRestaurantData(id);
  }

  loadRestaurantData(id: string): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.restaurantService.getRestaurant(id).subscribe({
      next: (rest) => {
        this.restaurant.set(rest);

        const geo = rest.geoLocSettings;
        if (geo && geo.isEnabled && geo.coordinates) {
          this.isGeoLocCurrentlyEnabled.set(true);
          this.latitude.set(geo.coordinates.latitude);
          this.longitude.set(geo.coordinates.longitude);
          this.radiusInMeters.set(geo.coordinates.radiusInMeters > 0 ? geo.coordinates.radiusInMeters : 50.0);
        } else {
          this.isGeoLocCurrentlyEnabled.set(false);
          if (this.latitude() === null || this.longitude() === null) {
            this.radiusInMeters.set(50.0);
          }
        }

        this.isLoading.set(false);

        // Initialize map once view is updated
        setTimeout(() => {
          this.initMap();
        }, 100);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err?.error?.message || err?.message || 'Failed to load restaurant details.');
      },
    });
  }

  private initMap(): void {
    if (typeof window === 'undefined' || !window.restaurantMap) {
      setTimeout(() => this.initMap(), 150);
      return;
    }

    const container = document.getElementById('restaurant-map');
    if (!container) {
      setTimeout(() => this.initMap(), 150);
      return;
    }

    const dotNetHelper = {
      invokeMethodAsync: (method: string, ...args: any[]) => {
        if (method === 'UpdateCoordinatesFromMap') {
          const lat = Math.round(Number(args[0]) * 1000000) / 1000000;
          const lng = Math.round(Number(args[1]) * 1000000) / 1000000;
          this.latitude.set(lat);
          this.longitude.set(lng);
        } else if (method === 'OnLocationSuccess') {
          const lat = Math.round(Number(args[0]) * 1000000) / 1000000;
          const lng = Math.round(Number(args[1]) * 1000000) / 1000000;
          this.latitude.set(lat);
          this.longitude.set(lng);
          if (window.restaurantMap?.updateMarker) {
            window.restaurantMap.updateMarker(lat, lng, this.radiusInMeters());
          }
        } else if (method === 'OnLocationError') {
          this.errorMessage.set(String(args[0] || 'Unable to retrieve location.'));
        }
        return Promise.resolve();
      },
    };

    window.restaurantMap.initialize(
      'restaurant-map',
      dotNetHelper,
      this.latitude(),
      this.longitude(),
      this.radiusInMeters()
    );
    this.mapInitialized = true;
  }

  locateUser(): void {
    this.errorMessage.set(null);
    if (typeof window !== 'undefined' && window.restaurantMap?.getUserLocation) {
      const helper = {
        invokeMethodAsync: (method: string, ...args: any[]) => {
          if (method === 'OnLocationSuccess') {
            const lat = Math.round(Number(args[0]) * 1000000) / 1000000;
            const lng = Math.round(Number(args[1]) * 1000000) / 1000000;
            this.latitude.set(lat);
            this.longitude.set(lng);
            if (window.restaurantMap?.updateMarker) {
              window.restaurantMap.updateMarker(lat, lng, this.radiusInMeters());
            }
          } else if (method === 'OnLocationError') {
            this.errorMessage.set(String(args[0] || 'Unable to retrieve location.'));
          }
          return Promise.resolve();
        },
      };
      window.restaurantMap.getUserLocation(helper);
    }
  }

  onLatitudeChange(val: string | number): void {
    const num = Number(val);
    if (!isNaN(num)) {
      this.latitude.set(num);
      const lng = this.longitude();
      if (lng !== null && typeof window !== 'undefined' && window.restaurantMap?.updateMarker) {
        window.restaurantMap.updateMarker(num, lng, this.radiusInMeters());
      }
    }
  }

  onLongitudeChange(val: string | number): void {
    const num = Number(val);
    if (!isNaN(num)) {
      this.longitude.set(num);
      const lat = this.latitude();
      if (lat !== null && typeof window !== 'undefined' && window.restaurantMap?.updateMarker) {
        window.restaurantMap.updateMarker(lat, num, this.radiusInMeters());
      }
    }
  }

  onRadiusChange(val: string | number): void {
    const num = Number(val);
    if (!isNaN(num) && num > 0) {
      this.radiusInMeters.set(num);
      if (typeof window !== 'undefined' && window.restaurantMap?.updateRadius) {
        window.restaurantMap.updateRadius(num);
      }
    }
  }

  saveAndEnableGeoLoc(): void {
    const restId = this.restaurantId();
    const lat = this.latitude();
    const lng = this.longitude();
    const radius = this.radiusInMeters();

    if (lat === null || isNaN(lat) || lat < -90.0 || lat > 90.0 || lng === null || isNaN(lng) || lng < -180.0 || lng > 180.0) {
      this.errorMessage.set(this.loc.translate('RestaurantGeoLoc_InvalidCoordinates'));
      return;
    }

    if (radius <= 0) {
      this.errorMessage.set(this.loc.translate('RestaurantGeoLoc_InvalidRadius'));
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.restaurantService.setGeoLocSettings(restId, lat, lng, radius).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.isGeoLocCurrentlyEnabled.set(true);
        this.successMessage.set(this.loc.translate('RestaurantGeoLoc_SaveSuccess'));
        this.loadRestaurantData(restId);
      },
      error: (err) => {
        this.isSaving.set(false);
        this.errorMessage.set(err?.error?.message || err?.error || err?.message || 'Failed to save geolocation settings.');
      },
    });
  }

  disableGeoLoc(): void {
    const promptMsg = this.loc.translate('RestaurantGeoLoc_ConfirmDisable');
    if (typeof window !== 'undefined' && !window.confirm(promptMsg)) {
      return;
    }

    const restId = this.restaurantId();
    this.isDisabling.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.restaurantService.disableGeoLocSettings(restId).subscribe({
      next: () => {
        this.isDisabling.set(false);
        this.isGeoLocCurrentlyEnabled.set(false);
        this.successMessage.set(this.loc.translate('RestaurantGeoLoc_DisableSuccess'));
        this.loadRestaurantData(restId);
      },
      error: (err) => {
        this.isDisabling.set(false);
        this.errorMessage.set(err?.error?.message || err?.error || err?.message || 'Failed to disable geolocation.');
      },
    });
  }

  ngOnDestroy(): void {
    // cleanup
  }
}
