import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class MaintenanceService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl ? environment.apiBaseUrl.replace(/\/$/, '') : '';

  /**
   * Replaces sensitive events in event store for restaurant (Platform Admin only).
   */
  replaceSensibleEvents(restaurantId: string): Observable<void> {
    const url = `${this.baseUrl}/api/Maintenance/restaurant/${restaurantId}/replace-sensible-events`;
    return this.http.post<void>(url, null);
  }

  /**
   * Ghost/purge aggregate snapshots for restaurant (Platform Admin only).
   */
  ghostSnapshots(restaurantId: string): Observable<void> {
    const url = `${this.baseUrl}/api/Maintenance/restaurant/${restaurantId}/ghost-snapshots`;
    return this.http.post<void>(url, null);
  }

  /**
   * Purges both events and snapshots for the specified restaurant in the event store.
   */
  ghostEventsAndSnapshots(restaurantId: string): Observable<void> {
    const url = `${this.baseUrl}/api/Maintenance/restaurant/${restaurantId}/ghost-events-and-snapshots`;
    return this.http.post<void>(url, null);
  }
}
