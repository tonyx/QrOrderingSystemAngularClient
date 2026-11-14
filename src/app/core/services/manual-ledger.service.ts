import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  ManualLedger,
  ManualLedgerEntry,
  CreateManualLedgerRequest,
  PublishGroupRequest,
  ApiKeyResponse,
  IntegrationStatusResponse,
} from '../models/manual-ledger.models';

@Injectable({
  providedIn: 'root',
})
export class ManualLedgerService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/ManualLedger';

  getLedgersByRestaurant(restaurantId: string): Observable<ManualLedger[]> {
    return this.http
      .get<any[]>(`${this.baseUrl}/restaurant/${restaurantId}/list`)
      .pipe(map((list) => (Array.isArray(list) ? list.map((l) => this.normalizeLedger(l)) : [])));
  }

  getLedger(restaurantId: string, ledgerId: string): Observable<ManualLedger> {
    return this.http
      .get<any>(`${this.baseUrl}/restaurant/${restaurantId}/ledger/${ledgerId}`)
      .pipe(map((l) => this.normalizeLedger(l)));
  }

  createLedger(restaurantId: string, request: CreateManualLedgerRequest): Observable<ManualLedger> {
    return this.http
      .post<any>(`${this.baseUrl}/restaurant/${restaurantId}/create`, request)
      .pipe(map((l) => this.normalizeLedger(l)));
  }

  addEntry(restaurantId: string, ledgerId: string, entry: Partial<ManualLedgerEntry>): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/restaurant/${restaurantId}/ledger/${ledgerId}/add-entry`, entry);
  }

  removeEntry(restaurantId: string, ledgerId: string, entryId: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/restaurant/${restaurantId}/ledger/${ledgerId}/remove-entry/${entryId}`, null);
  }

  closeLedger(restaurantId: string, ledgerId: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/restaurant/${restaurantId}/ledger/${ledgerId}/close`, null);
  }

  reopenLedger(restaurantId: string, ledgerId: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/restaurant/${restaurantId}/ledger/${ledgerId}/reopen`, null);
  }

  removeLedger(restaurantId: string, ledgerId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/restaurant/${restaurantId}/ledger/${ledgerId}`);
  }

  publishGroupedEntries(
    restaurantId: string,
    ledgerId: string,
    request: PublishGroupRequest
  ): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/restaurant/${restaurantId}/ledger/${ledgerId}/publish-group`, request);
  }

  getApiKey(restaurantId: string): Observable<ApiKeyResponse> {
    return this.http.get<any>(`${this.baseUrl}/restaurant/${restaurantId}/api-key`).pipe(
      map((res) => ({
        apiKey: typeof res === 'string' ? res : res?.apiKey ?? res?.ApiKey ?? '',
        authorizationHeader: res?.authorizationHeader ?? res?.AuthorizationHeader,
      }))
    );
  }

  getIntegrationStatus(restaurantId: string): Observable<IntegrationStatusResponse> {
    return this.http.get<any>(`${this.baseUrl}/restaurant/${restaurantId}/integration-status`).pipe(
      map((res) => ({
        enabled: Boolean(res?.enabled ?? res?.Enabled ?? false),
        unconsumedCount: Number(res?.unconsumedCount ?? res?.UnconsumedCount ?? 0),
      }))
    );
  }

  private normalizeDate(val: any): string {
    if (!val) return '';
    if (typeof val === 'string') {
      // Check if already a valid date string
      const d = new Date(val);
      if (!isNaN(d.getTime())) return val;
      return val;
    }
    if (val instanceof Date) return val.toISOString();
    if (typeof val === 'object') {
      const nested = val?.value ?? val?.Value ?? val?.fields?.[0] ?? val?.Fields?.[0];
      if (nested) return this.normalizeDate(nested);
    }
    return String(val);
  }

  private unwrapId(val: any): string {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'object') {
      return String(val?.fields?.[0] ?? val?.Fields?.[0] ?? val?.value ?? val?.Value ?? '');
    }
    return String(val);
  }

  private normalizeEntry(raw: any): ManualLedgerEntry {
    return {
      entryId: this.unwrapId(raw?.entryId ?? raw?.EntryId),
      timestamp: this.normalizeDate(raw?.timestamp ?? raw?.Timestamp),
      amount: Number(raw?.amount ?? raw?.Amount ?? 0),
      tipAmount: Number(raw?.tipAmount ?? raw?.TipAmount ?? 0),
      paymentMethod: raw?.paymentMethod ?? raw?.PaymentMethod,
      referenceNumber: raw?.referenceNumber ?? raw?.ReferenceNumber ?? null,
      notes: raw?.notes ?? raw?.Notes ?? null,
      items: (raw?.items ?? raw?.Items ?? []).map((it: any) => ({
        dishName: String(it?.dishName ?? it?.DishName ?? ''),
        quantity: Number(it?.quantity ?? it?.Quantity ?? 1),
        unitPrice: Number(it?.unitPrice ?? it?.UnitPrice ?? 0),
        vatDepartmentCode: it?.vatDepartmentCode ?? it?.VatDepartmentCode ?? null,
      })),
      createdByUserId: raw?.createdByUserId ?? raw?.CreatedByUserId ?? null,
      publishStatus: raw?.publishStatus ?? raw?.PublishStatus,
      fiscalMetadata: raw?.fiscalMetadata ?? raw?.FiscalMetadata,
    };
  }

  private normalizeLedger(raw: any): ManualLedger {
    const rawEntries = raw?.entries ?? raw?.Entries ?? [];
    const entries = Array.isArray(rawEntries)
      ? rawEntries.map((e) => this.normalizeEntry(e))
      : [];

    return {
      manualLedgerId: this.unwrapId(raw?.manualLedgerId ?? raw?.ManualLedgerId ?? raw?.id ?? raw?.Id),
      restaurantId: this.unwrapId(raw?.restaurantId ?? raw?.RestaurantId),
      startDate: this.normalizeDate(raw?.startDate ?? raw?.StartDate),
      endDate: this.normalizeDate(raw?.endDate ?? raw?.EndDate),
      entries,
      isClosed: Boolean(raw?.isClosed ?? raw?.IsClosed ?? false),
      closedAt: raw?.closedAt ?? raw?.ClosedAt ? this.normalizeDate(raw?.closedAt ?? raw?.ClosedAt) : null,
      closedByUserId: raw?.closedByUserId ?? raw?.ClosedByUserId ? this.unwrapId(raw?.closedByUserId ?? raw?.ClosedByUserId) : null,
    };
  }
}
