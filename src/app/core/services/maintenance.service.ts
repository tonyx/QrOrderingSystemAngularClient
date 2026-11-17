import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { MaintenanceService as MaintenanceApiService } from '../api/endpoints/maintenance/maintenance.service';

@Injectable({
  providedIn: 'root',
})
export class MaintenanceService {
  private readonly maintenanceApi = inject(MaintenanceApiService);

  /**
   * Replaces sensitive events in event store for restaurant (Platform Admin only).
   */
  replaceSensibleEvents(restaurantId: string): Observable<void> {
    return this.maintenanceApi.postApiMaintenanceRestaurantRestaurantIdReplaceSensibleEvents(restaurantId);
  }

  /**
   * Ghost/purge aggregate snapshots for restaurant (Platform Admin only).
   */
  ghostSnapshots(restaurantId: string): Observable<void> {
    return this.maintenanceApi.postApiMaintenanceRestaurantRestaurantIdGhostSnapshots(restaurantId);
  }

  /**
   * Purges both events and snapshots for the specified restaurant in the event store.
   */
  ghostEventsAndSnapshots(restaurantId: string): Observable<void> {
    return this.maintenanceApi.postApiMaintenanceRestaurantRestaurantIdGhostEventsAndSnapshots(restaurantId);
  }
}
