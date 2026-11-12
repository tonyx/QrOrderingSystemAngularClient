import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LocPipe } from '../../../core/pipes/loc.pipe';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { RestaurantItem, TableModel } from '../../../core/models/restaurant.models';
import { MainLayoutComponent } from '../../../shared/components/main-layout/main-layout.component';

@Component({
  selector: 'app-table-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, MainLayoutComponent, LocPipe],
  templateUrl: './table-detail.component.html',
  styleUrls: ['./table-detail.component.css'],
})
export class TableDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly restaurantService = inject(RestaurantService);

  restaurantId = signal<string>('');
  tableNumber = signal<number>(0);
  restaurant = signal<RestaurantItem | null>(null);
  table = signal<TableModel | null>(null);
  loading = signal<boolean>(true);
  errorMessage = signal<string | null>(null);

  // Rejection modal
  rejectItemTarget = signal<{ sessionId: string; itemName: string } | null>(null);
  rejectReason = '';
  isRejectingItem = signal<boolean>(false);
  rejectItemError = signal<string | null>(null);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('restaurantId');
    const tableNum = Number(this.route.snapshot.paramMap.get('tableNumber'));

    if (id && tableNum) {
      this.restaurantId.set(id);
      this.tableNumber.set(tableNum);
      this.loadTableData(id, tableNum);
    } else {
      this.errorMessage.set('Invalid restaurant ID or table number.');
      this.loading.set(false);
    }
  }

  loadTableData(id: string, tableNum: number, isSilent = false): void {
    if (!isSilent) {
      this.loading.set(true);
    }
    this.errorMessage.set(null);

    this.restaurantService.getRestaurant(id).subscribe({
      next: (data) => {
        this.restaurant.set(data);
        const matched = (data.parsedTables || []).find((t) => t.tableNumber === tableNum);
        if (matched) {
          this.table.set(matched);
        } else {
          this.errorMessage.set(`Table #${tableNum} does not exist in this restaurant.`);
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err?.error?.message || err?.message || 'Failed to load table details.');
        this.loading.set(false);
      },
    });
  }

  markItemAsDone(sessionId: string, itemName: string): void {
    const rest = this.restaurant();
    const tbl = this.table();
    if (!rest || !tbl) return;

    this.restaurantService
      .makeOrderItemDone(rest.restaurantId, tbl.tableNumber, tbl.tableId, sessionId, itemName)
      .subscribe({
        next: () => this.loadTableData(rest.restaurantId, tbl.tableNumber, true),
        error: (err) => this.errorMessage.set(err?.error?.message || err?.message || 'Failed to mark item done.'),
      });
  }

  markAllAsDone(sessionId: string, items: any[]): void {
    const rest = this.restaurant();
    const tbl = this.table();
    if (!rest || !tbl) return;

    const unDoneItems = items.filter((i) => !i.isDone);
    if (!unDoneItems.length) return;

    // Trigger done on items sequentially or first
    unDoneItems.forEach((it) => {
      this.restaurantService
        .makeOrderItemDone(rest.restaurantId, tbl.tableNumber, tbl.tableId, sessionId, it.dishName)
        .subscribe({
          next: () => this.loadTableData(rest.restaurantId, tbl.tableNumber, true),
          error: (err) => this.errorMessage.set(err?.error?.message || err?.message || 'Failed to complete order item.'),
        });
    });
  }

  promptRejectItem(sessionId: string, itemName: string): void {
    this.rejectReason = '';
    this.rejectItemError.set(null);
    this.rejectItemTarget.set({ sessionId, itemName });
  }

  cancelRejectItem(): void {
    this.rejectItemTarget.set(null);
  }

  confirmRejectItem(): void {
    const rest = this.restaurant();
    const tbl = this.table();
    const target = this.rejectItemTarget();
    if (!rest || !tbl || !target || this.isRejectingItem()) return;

    this.isRejectingItem.set(true);
    this.rejectItemError.set(null);

    this.restaurantService
      .rejectOrderItem(
        rest.restaurantId,
        tbl.tableNumber,
        tbl.tableId,
        target.sessionId,
        target.itemName,
        this.rejectReason.trim()
      )
      .subscribe({
        next: () => {
          this.isRejectingItem.set(false);
          this.rejectItemTarget.set(null);
          this.loadTableData(rest.restaurantId, tbl.tableNumber, true);
        },
        error: (err) => {
          this.isRejectingItem.set(false);
          this.rejectItemError.set(err?.error?.message || err?.message || 'Failed to reject order item.');
        },
      });
  }

  getStatusBadgeClass(status: string): string {
    const s = (status || '').toLowerCase();
    if (s.includes('confirm')) return 'bg-success text-white';
    if (s.includes('pending')) return 'bg-warning text-dark';
    if (s.includes('done')) return 'bg-secondary text-white';
    if (s.includes('reject')) return 'bg-danger text-white';
    return 'bg-light text-dark border';
  }
}

