import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ManualLedgerService } from '../../../core/services/manual-ledger.service';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { LocalizationService } from '../../../core/services/localization.service';
import { LocPipe } from '../../../core/pipes/loc.pipe';
import { MainLayoutComponent } from '../../../shared/components/main-layout/main-layout.component';
import {
  ManualLedger,
  ManualLedgerEntry,
  ManualLedgerDishItem,
  ManualLedgerPaymentMethodType,
} from '../../../core/models/manual-ledger.models';
import { MenuItemModel } from '../../../core/models/menu.models';

export interface DishLineModel {
  dishName: string;
  quantity: number;
  unitPrice: number;
  vatCode: string;
}

export interface EntryWrapper {
  rawEntry: ManualLedgerEntry;
  entryId: string;
  timestamp: string;
  timestampLocalDisplay: string;
  amount: number;
  tipAmount: number;
  totalWithTip: number;
  referenceNumberDisplay: string;
  notesDisplay: string;
  paymentMethodDisplay: string;
  paymentMethodGroup: string;
  publishStatusDisplay: string;
  fiscalType?: 'cf' | 'lotteria' | null;
  fiscalValue?: string | null;
}

@Component({
  selector: 'app-manual-ledger',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LocPipe, MainLayoutComponent],
  templateUrl: './manual-ledger.component.html',
  styleUrls: ['./manual-ledger.component.css'],
})
export class ManualLedgerComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly manualLedgerService = inject(ManualLedgerService);
  private readonly restaurantService = inject(RestaurantService);
  readonly loc = inject(LocalizationService);

  restaurantId = '';
  inputRestaurantId = '';

  newStartDate = '';
  newEndDate = '';

  entryAmount = 0.0;
  entryTipAmount = 0.0;
  entryPaymentMethodStr: ManualLedgerPaymentMethodType = 'Cash';
  entryReferenceNumber = '';
  entryNotes = '';
  entryFiscalOption: 'none' | 'cf' | 'lotteria' = 'none';
  entryFiscalInputText = '';

  selectedLedgerId: string | null = null;
  ledgers: ManualLedger[] = [];
  isLoading = signal<boolean>(false);
  isAddingEntry = signal<boolean>(false);
  hasFetched = false;
  errorMessage: string | null = null;
  successMessage: string | null = null;

  unconsumedEntriesCount = 0;
  isIntegrationEnabled = false;
  integrationAuthHeader: string | null = null;

  selectedEntryIds = new Set<string>();
  showPublishGroupModal = false;
  customPublishRef = '';
  isPublishingGroup = signal<boolean>(false);
  publishFiscalOption: 'none' | 'cf' | 'lotteria' = 'none';
  publishFiscalInputText = '';

  // Catalogue & Dish Lines
  dishLines: DishLineModel[] = [];
  showCataloguePicker = false;
  isCatalogueLoading = false;
  menuItemsList: MenuItemModel[] | null = null;
  catalogueFilterText = '';
  readonly NO_CATEGORY_KEY = '__NO_CATEGORY__';
  availableCatalogueCategories: string[] = [];
  selectedCatalogueCategories = new Set<string>();

  // Filtering & Pagination
  filterPaymentMethod = 'All';
  searchFilterText = '';
  currentPage = 1;
  pageSize = 15;

  ngOnInit(): void {
    const today = new Date();
    this.newStartDate = this.formatDate(today);
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    this.newEndDate = this.formatDate(nextWeek);

    this.route.paramMap.subscribe((params) => {
      const restId = params.get('restaurantId');
      if (restId) {
        this.restaurantId = restId;
        this.inputRestaurantId = restId;
        this.loadLedgers();
        this.checkIntegrationStatus();
      }
    });
  }

  formatDate(d: Date | string | null | undefined): string {
    if (!d) return '';
    if (typeof d === 'string') {
      if (d.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(d)) {
        return d.slice(0, 10);
      }
      const parsed = new Date(d);
      if (!isNaN(parsed.getTime())) {
        d = parsed;
      } else {
        return d;
      }
    }
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  getTargetRestaurantId(): string {
    return this.restaurantId || this.inputRestaurantId;
  }

  checkIntegrationStatus(): void {
    const restId = this.getTargetRestaurantId();
    if (!restId) return;

    this.manualLedgerService.getIntegrationStatus(restId).subscribe({
      next: (res) => {
        this.unconsumedEntriesCount = res.unconsumedCount;
        this.isIntegrationEnabled = res.enabled;
      },
      error: () => {
        // Ignore status fetch errors on client render
      },
    });
  }

  loadIntegrationCredentials(): void {
    const restId = this.getTargetRestaurantId();
    if (!restId) return;

    this.manualLedgerService.getApiKey(restId).subscribe({
      next: (res) => {
        if (res.authorizationHeader) {
          this.integrationAuthHeader = res.authorizationHeader;
        } else if (res.apiKey) {
          this.integrationAuthHeader = `Bearer ${res.apiKey}`;
        }
      },
      error: (err) => {
        this.errorMessage = `Failed to load credentials: ${err.message || err}`;
      },
    });
  }

  copyAuthHeader(): void {
    if (this.integrationAuthHeader && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(this.integrationAuthHeader).then(() => {
        this.successMessage = 'Authorization header copied to clipboard!';
      });
    }
  }

  setCurrentMonth(): void {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    this.newStartDate = this.formatDate(firstDay);
    this.newEndDate = this.formatDate(lastDay);
  }

  selectLedger(id: string): void {
    this.selectedLedgerId = this.selectedLedgerId === id ? null : id;
    this.selectedEntryIds.clear();
    this.currentPage = 1;
  }

  loadLedgers(): void {
    const restId = this.getTargetRestaurantId();
    if (!restId) return;

    this.isLoading.set(true);
    this.errorMessage = null;

    this.manualLedgerService.getLedgersByRestaurant(restId).subscribe({
      next: (data) => {
        this.ledgers = (data || []).sort(
          (a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime()
        );
        this.hasFetched = true;
        this.isLoading.set(false);

        if (this.ledgers.length > 0) {
          if (!this.selectedLedgerId) {
            this.selectedLedgerId = this.ledgers[0].manualLedgerId;
          }
          const latest = this.ledgers[0];
          const latestEndDate = new Date(latest.endDate);
          const nextStart = new Date(latestEndDate.getTime() + 24 * 60 * 60 * 1000);
          const nextEnd = new Date(nextStart.getTime() + 6 * 24 * 60 * 60 * 1000);
          this.newStartDate = this.formatDate(nextStart);
          this.newEndDate = this.formatDate(nextEnd);
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage = err.error || err.message || 'Failed to load ledgers';
      },
    });
  }

  createLedger(): void {
    const restId = this.getTargetRestaurantId();
    if (!restId) {
      this.errorMessage = 'Invalid Restaurant ID';
      return;
    }

    this.errorMessage = null;
    this.successMessage = null;

    this.manualLedgerService
      .createLedger(restId, {
        startDate: new Date(this.newStartDate).toISOString(),
        endDate: new Date(this.newEndDate).toISOString(),
      })
      .subscribe({
        next: () => {
          this.successMessage = 'Shift ledger created successfully!';
          this.loadLedgers();
        },
        error: (err) => {
          this.errorMessage = err.error || err.message || 'Failed to create ledger';
        },
      });
  }

  addEntry(ledgerId: string): void {
    const restId = this.getTargetRestaurantId();
    if (!restId) return;

    this.errorMessage = null;
    this.successMessage = null;

    if (this.dishLines.length > 0) {
      const dishSum = this.dishLines
        .filter((l) => l.dishName && l.quantity > 0)
        .reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
      if (this.entryAmount <= 0 && dishSum > 0) {
        this.entryAmount = Math.max(0, Math.round(dishSum * 100) / 100);
      }
    }

    if (this.entryAmount < 0) {
      this.errorMessage = 'Entry amount cannot be negative';
      return;
    }

    if (this.entryPaymentMethodStr !== 'DiscountOmaggio' && this.entryAmount <= 0) {
      this.errorMessage = 'Entry amount must be greater than 0';
      return;
    }

    const currentLedger = this.ledgers.find((l) => l.manualLedgerId === ledgerId);
    let entryTimestamp = new Date();
    if (currentLedger) {
      const start = new Date(currentLedger.startDate);
      const end = new Date(currentLedger.endDate);
      if (entryTimestamp < start) entryTimestamp = start;
      else if (entryTimestamp > end) entryTimestamp = end;
    }

    let fiscalMeta: any = null;
    if (this.entryFiscalOption === 'cf' && this.entryFiscalInputText.trim()) {
      fiscalMeta = { Case: 'CodiceFiscale', Fields: [this.entryFiscalInputText.trim().toUpperCase()] };
    } else if (this.entryFiscalOption === 'lotteria' && this.entryFiscalInputText.trim()) {
      fiscalMeta = { Case: 'CodiceLotteria', Fields: [this.entryFiscalInputText.trim().toUpperCase()] };
    }

    const dishItems: ManualLedgerDishItem[] = this.dishLines
      .filter((l) => l.dishName && l.quantity > 0)
      .map((l) => ({
        dishName: l.dishName,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        vatDepartmentCode: l.vatCode || 'Rep1',
      }));

    let pmValue: any = this.entryPaymentMethodStr;
    if (this.entryPaymentMethodStr === 'Other') {
      pmValue = { Case: 'Other', Fields: ['Other'] };
    }

    const entryPayload: Partial<ManualLedgerEntry> = {
      amount: this.entryAmount,
      tipAmount: this.entryTipAmount,
      paymentMethod: pmValue,
      referenceNumber: this.entryReferenceNumber ? this.entryReferenceNumber.trim() : null,
      notes: this.entryNotes ? this.entryNotes.trim() : null,
      items: dishItems,
      timestamp: entryTimestamp.toISOString(),
      fiscalMetadata: fiscalMeta,
    };

    this.isAddingEntry.set(true);

    this.manualLedgerService.addEntry(restId, ledgerId, entryPayload).subscribe({
      next: () => {
        this.isAddingEntry.set(false);
        this.successMessage = 'Receipt entry added successfully!';
        this.entryAmount = 0.0;
        this.entryTipAmount = 0.0;
        this.entryReferenceNumber = '';
        this.entryNotes = '';
        this.entryFiscalOption = 'none';
        this.entryFiscalInputText = '';
        this.dishLines = [];
        this.loadLedgers();
      },
      error: (err) => {
        this.isAddingEntry.set(false);
        this.errorMessage = err.error || err.message || 'Failed to add entry';
      },
    });
  }

  removeEntry(ledgerId: string, entryId: string): void {
    const restId = this.getTargetRestaurantId();
    if (!restId) return;

    this.errorMessage = null;
    this.successMessage = null;

    this.manualLedgerService.removeEntry(restId, ledgerId, entryId).subscribe({
      next: () => {
        this.successMessage = 'Entry removed successfully!';
        this.loadLedgers();
      },
      error: (err) => {
        this.errorMessage = err.error || err.message || 'Failed to remove entry';
      },
    });
  }

  closeLedger(ledgerId: string): void {
    const restId = this.getTargetRestaurantId();
    if (!restId) return;

    this.errorMessage = null;
    this.successMessage = null;

    this.manualLedgerService.closeLedger(restId, ledgerId).subscribe({
      next: () => {
        this.successMessage = 'Ledger closed and locked!';
        this.loadLedgers();
      },
      error: (err) => {
        this.errorMessage = err.error || err.message || 'Failed to close ledger';
      },
    });
  }

  reopenLedger(ledgerId: string): void {
    const restId = this.getTargetRestaurantId();
    if (!restId) return;

    this.errorMessage = null;
    this.successMessage = null;

    this.manualLedgerService.reopenLedger(restId, ledgerId).subscribe({
      next: () => {
        this.successMessage = 'Ledger reopened!';
        this.loadLedgers();
      },
      error: (err) => {
        this.errorMessage = err.error || err.message || 'Failed to reopen ledger';
      },
    });
  }

  removeLedger(ledgerId: string): void {
    const confirmMsg =
      this.loc.translate('ManualLedger_ConfirmRemoveShift') ||
      'Are you sure you want to remove this empty ledger shift? This action cannot be undone.';
    if (!confirm(confirmMsg)) return;

    const restId = this.getTargetRestaurantId();
    if (!restId) return;

    this.errorMessage = null;
    this.successMessage = null;

    this.manualLedgerService.removeLedger(restId, ledgerId).subscribe({
      next: () => {
        this.successMessage =
          this.loc.translate('ManualLedger_ShiftRemovedSuccess') ||
          'Ledger shift removed successfully!';
        if (this.selectedLedgerId === ledgerId) {
          this.selectedLedgerId = null;
        }
        this.loadLedgers();
      },
      error: (err) => {
        this.errorMessage = err.error || err.message || 'Failed to remove ledger shift';
      },
    });
  }

  // Catalogue & Dish Lines
  toggleCataloguePicker(): void {
    this.showCataloguePicker = !this.showCataloguePicker;
    if (!this.showCataloguePicker) {
      this.catalogueFilterText = '';
    } else if (this.menuItemsList === null) {
      this.loadCatalogueItems();
    } else if (this.availableCatalogueCategories.length === 0 && this.menuItemsList.length > 0) {
      this.populateCatalogueCategories();
    }
  }

  loadCatalogueItems(): void {
    const restId = this.getTargetRestaurantId();
    if (!restId) return;

    this.isCatalogueLoading = true;
    this.restaurantService.getRestaurant(restId).subscribe({
      next: (rest) => {
        this.isCatalogueLoading = false;
        if (rest && rest.items) {
          this.menuItemsList = rest.items;
          this.populateCatalogueCategories();
        } else {
          this.menuItemsList = [];
        }
      },
      error: () => {
        this.isCatalogueLoading = false;
        this.menuItemsList = [];
      },
    });
  }

  getItemCategory(item: MenuItemModel): string | null {
    if (!item) return null;
    return item.category || null;
  }

  getItemVatCode(item: MenuItemModel): string {
    if (!item) return 'Rep1';
    const raw = item.vatDepartmentCode as any;
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
    if (raw && typeof raw === 'object') {
      const code = raw.Value ?? raw.value ?? raw.fields?.[0];
      if (typeof code === 'string' && code.trim()) {
        return code.trim();
      }
    }
    return 'Rep1';
  }

  populateCatalogueCategories(): void {
    if (!this.menuItemsList) return;

    const distinct = new Set<string>();
    let hasNoCategory = false;

    for (const item of this.menuItemsList) {
      const cat = this.getItemCategory(item);
      if (!cat) {
        hasNoCategory = true;
      } else {
        distinct.add(cat);
      }
    }

    const sorted = Array.from(distinct).sort((a, b) => a.localeCompare(b));
    if (hasNoCategory) {
      sorted.push(this.NO_CATEGORY_KEY);
    }

    this.availableCatalogueCategories = sorted;
    this.selectedCatalogueCategories = new Set(sorted);
  }

  selectAllCatalogueCategories(): void {
    this.selectedCatalogueCategories = new Set(this.availableCatalogueCategories);
  }

  selectNoCatalogueCategories(): void {
    this.selectedCatalogueCategories.clear();
  }

  toggleCatalogueCategory(categoryKey: string, checked: boolean): void {
    if (checked) {
      this.selectedCatalogueCategories.add(categoryKey);
    } else {
      this.selectedCatalogueCategories.delete(categoryKey);
    }
  }

  get filteredCatalogueItems(): MenuItemModel[] {
    if (!this.menuItemsList) return [];
    return this.menuItemsList.filter((item) => {
      const cat = this.getItemCategory(item);
      const catKey = !cat ? this.NO_CATEGORY_KEY : cat;
      if (!this.selectedCatalogueCategories.has(catKey)) return false;

      if (this.catalogueFilterText.trim()) {
        const query = this.catalogueFilterText.trim().toLowerCase();
        if (!item.name || !item.name.toLowerCase().includes(query)) {
          return false;
        }
      }
      return true;
    });
  }

  pickCatalogueItem(item: MenuItemModel): void {
    const vatCode = this.getItemVatCode(item);

    this.dishLines.push({
      dishName: item.name,
      quantity: 1,
      unitPrice: typeof item.price === 'number' ? item.price : 0.0,
      vatCode: vatCode || 'Rep1',
    });

    this.recalculateEntryAmount();
  }

  addDishLine(): void {
    this.dishLines.push({ dishName: '', quantity: 1, unitPrice: 0.0, vatCode: 'Rep1' });
    this.recalculateEntryAmount();
  }

  addDiscountLine(): void {
    this.dishLines.push({
      dishName: 'Sconto Cassa',
      quantity: 1,
      unitPrice: -5.0,
      vatCode: 'Rep1',
    });
    this.recalculateEntryAmount();
  }

  removeDishLine(line: DishLineModel): void {
    this.dishLines = this.dishLines.filter((l) => l !== line);
    this.recalculateEntryAmount();
  }

  clearAllDishLines(): void {
    this.dishLines = [];
    this.recalculateEntryAmount();
  }

  recalculateEntryAmount(): void {
    if (this.dishLines.length > 0) {
      const sum = this.dishLines.reduce((acc, l) => acc + (l.quantity || 0) * (l.unitPrice || 0), 0);
      this.entryAmount = Math.max(0, Math.round(sum * 100) / 100);
    } else {
      this.entryAmount = 0.0;
    }
  }

  // Wrapper & Calculations
  wrapEntry(raw: ManualLedgerEntry): EntryWrapper {
    let pmGroup = 'Cash';
    let pmDisplay = 'Cash';

    if (raw.paymentMethod) {
      if (typeof raw.paymentMethod === 'string') {
        pmGroup = raw.paymentMethod;
        pmDisplay = raw.paymentMethod;
      } else if (raw.paymentMethod.Case) {
        pmGroup = raw.paymentMethod.Case;
        pmDisplay = raw.paymentMethod.Case;
      }
    }

    if (pmGroup === 'Omaggio') pmGroup = 'DiscountOmaggio';

    let pubDisplay = 'Unrequired';
    if (raw.publishStatus) {
      if (typeof raw.publishStatus === 'string') {
        pubDisplay = raw.publishStatus;
      } else if (raw.publishStatus.Case) {
        pubDisplay = raw.publishStatus.Case === 'Published' ? 'Spooled' : raw.publishStatus.Case;
      } else if (raw.publishStatus.case) {
        pubDisplay = raw.publishStatus.case === 'Published' ? 'Spooled' : raw.publishStatus.case;
      }
    }

    let fType: 'cf' | 'lotteria' | null = null;
    let fValue: string | null = null;
    if (raw.fiscalMetadata) {
      if (raw.fiscalMetadata.Case === 'CodiceFiscale' && raw.fiscalMetadata.Fields) {
        fType = 'cf';
        fValue = raw.fiscalMetadata.Fields[0];
      } else if (raw.fiscalMetadata.Case === 'CodiceLotteria' && raw.fiscalMetadata.Fields) {
        fType = 'lotteria';
        fValue = raw.fiscalMetadata.Fields[0];
      } else if (raw.fiscalMetadata.case === 'CodiceFiscale' && raw.fiscalMetadata.item) {
        fType = 'cf';
        fValue = raw.fiscalMetadata.item;
      } else if (raw.fiscalMetadata.case === 'CodiceLotteria' && raw.fiscalMetadata.item) {
        fType = 'lotteria';
        fValue = raw.fiscalMetadata.item;
      }
    }

    const tip =
      pmGroup === 'Stripe' && raw.tipAmount >= 100.0 ? raw.tipAmount / 100.0 : raw.tipAmount || 0.0;
    const total = (raw.amount || 0.0) + tip;

    const dt = new Date(raw.timestamp);
    const tsLocal = !isNaN(dt.getTime())
      ? dt.toLocaleString()
      : raw.timestamp;

    return {
      rawEntry: raw,
      entryId: raw.entryId,
      timestamp: raw.timestamp,
      timestampLocalDisplay: tsLocal,
      amount: raw.amount || 0.0,
      tipAmount: tip,
      totalWithTip: Math.round(total * 100) / 100,
      referenceNumberDisplay: raw.referenceNumber || '',
      notesDisplay: raw.notes || '',
      paymentMethodDisplay: pmDisplay,
      paymentMethodGroup: pmGroup,
      publishStatusDisplay: pubDisplay,
      fiscalType: fType,
      fiscalValue: fValue,
    };
  }

  get selectedLedger(): ManualLedger | undefined {
    return this.ledgers.find((l) => l.manualLedgerId === this.selectedLedgerId);
  }

  get filteredEntries(): EntryWrapper[] {
    const ledger = this.selectedLedger;
    if (!ledger || !ledger.entries) return [];

    let list = ledger.entries.map((e) => this.wrapEntry(e));

    if (this.searchFilterText.trim()) {
      const q = this.searchFilterText.trim().toLowerCase();
      list = list.filter(
        (e) =>
          e.notesDisplay.toLowerCase().includes(q) ||
          e.referenceNumberDisplay.toLowerCase().includes(q)
      );
    }

    if (this.filterPaymentMethod !== 'All') {
      list = list.filter((e) => e.paymentMethodGroup === this.filterPaymentMethod);
    }

    return list;
  }

  get paginatedEntries(): EntryWrapper[] {
    const entries = this.filteredEntries;
    const start = (this.currentPage - 1) * this.pageSize;
    return entries.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.ceil(this.filteredEntries.length / this.pageSize) || 1;
  }

  get allEntriesInSelectedLedger(): EntryWrapper[] {
    const ledger = this.selectedLedger;
    if (!ledger || !ledger.entries) return [];
    return ledger.entries.map((e) => this.wrapEntry(e));
  }

  get totalVolumeForSelected(): number {
    return this.allEntriesInSelectedLedger.reduce((sum, e) => sum + e.amount, 0);
  }

  get totalOmaggioForSelected(): number {
    return this.allEntriesInSelectedLedger
      .filter((e) => e.paymentMethodGroup === 'DiscountOmaggio')
      .reduce((sum, e) => sum + e.amount, 0);
  }

  get totalCollectedForSelected(): number {
    return this.allEntriesInSelectedLedger
      .filter((e) => e.paymentMethodGroup !== 'DiscountOmaggio')
      .reduce((sum, e) => sum + e.amount, 0);
  }

  get totalTipsForSelected(): number {
    return this.allEntriesInSelectedLedger.reduce((sum, e) => sum + e.tipAmount, 0);
  }

  get paymentTotals(): {
    all: number;
    cash: number;
    pos: number;
    stripe: number;
    voucher: number;
    omaggio: number;
    other: number;
  } {
    const list = this.allEntriesInSelectedLedger;
    return {
      all: list.reduce((s, e) => s + e.totalWithTip, 0),
      cash: list.filter((e) => e.paymentMethodGroup === 'Cash').reduce((s, e) => s + e.totalWithTip, 0),
      pos: list.filter((e) => e.paymentMethodGroup === 'ExternalCardTerminal').reduce((s, e) => s + e.totalWithTip, 0),
      stripe: list.filter((e) => e.paymentMethodGroup === 'Stripe').reduce((s, e) => s + e.totalWithTip, 0),
      voucher: list.filter((e) => e.paymentMethodGroup === 'Voucher').reduce((s, e) => s + e.totalWithTip, 0),
      omaggio: list.filter((e) => e.paymentMethodGroup === 'DiscountOmaggio').reduce((s, e) => s + e.totalWithTip, 0),
      other: list.filter((e) => e.paymentMethodGroup === 'Other').reduce((s, e) => s + e.totalWithTip, 0),
    };
  }

  get filteredTotals(): {
    totalAmount: number;
    totalTip: number;
    grandTotal: number;
    collectedAmount: number;
    compedAmount: number;
  } {
    const list = this.filteredEntries;
    const totalAmount = list.reduce((s, e) => s + e.amount, 0);
    const totalTip = list.reduce((s, e) => s + e.tipAmount, 0);
    const grandTotal = list.reduce((s, e) => s + e.totalWithTip, 0);
    const collectedAmount = list
      .filter((e) => e.paymentMethodGroup !== 'DiscountOmaggio')
      .reduce((s, e) => s + e.amount, 0);
    const compedAmount = list
      .filter((e) => e.paymentMethodGroup === 'DiscountOmaggio')
      .reduce((s, e) => s + e.amount, 0);

    return { totalAmount, totalTip, grandTotal, collectedAmount, compedAmount };
  }

  // Selection & Group Publishing
  toggleEntrySelection(entryId: string): void {
    if (this.selectedEntryIds.has(entryId)) {
      this.selectedEntryIds.delete(entryId);
    } else {
      this.selectedEntryIds.add(entryId);
    }
  }

  selectAllUnpublished(): void {
    const ledger = this.selectedLedger;
    if (!ledger || !ledger.entries) return;
    this.selectedEntryIds.clear();
    for (const e of ledger.entries) {
      const w = this.wrapEntry(e);
      if (w.publishStatusDisplay === 'Unpublished') {
        this.selectedEntryIds.add(e.entryId);
      }
    }
  }

  selectLatestUnpublished(count: number): void {
    const ledger = this.selectedLedger;
    if (!ledger || !ledger.entries) return;
    this.selectedEntryIds.clear();
    const unpub = ledger.entries
      .map((e) => this.wrapEntry(e))
      .filter((w) => w.publishStatusDisplay === 'Unpublished')
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, count);

    for (const w of unpub) {
      this.selectedEntryIds.add(w.entryId);
    }
  }

  clearSelection(): void {
    this.selectedEntryIds.clear();
  }

  get selectedSum(): number {
    return this.allEntriesInSelectedLedger
      .filter((e) => this.selectedEntryIds.has(e.entryId))
      .reduce((sum, e) => sum + e.totalWithTip, 0);
  }

  get selectedWrappers(): EntryWrapper[] {
    return this.allEntriesInSelectedLedger.filter((e) => this.selectedEntryIds.has(e.entryId));
  }

  openPublishGroupModal(): void {
    this.customPublishRef = `Manual Batch (${this.selectedEntryIds.size} entries)`;
    this.publishFiscalOption = 'none';
    this.publishFiscalInputText = '';
    this.showPublishGroupModal = true;
  }

  confirmPublishGroup(): void {
    if (this.selectedEntryIds.size === 0 || !this.selectedLedgerId) return;

    const restId = this.getTargetRestaurantId();
    if (!restId) return;

    this.isPublishingGroup.set(true);
    this.errorMessage = null;
    this.successMessage = null;

    let cf: string | null = null;
    let lotteria: string | null = null;
    if (this.publishFiscalOption === 'cf' && this.publishFiscalInputText.trim()) {
      cf = this.publishFiscalInputText.trim().toUpperCase();
    } else if (this.publishFiscalOption === 'lotteria' && this.publishFiscalInputText.trim()) {
      lotteria = this.publishFiscalInputText.trim().toUpperCase();
    }

    this.manualLedgerService
      .publishGroupedEntries(restId, this.selectedLedgerId, {
        entryIds: Array.from(this.selectedEntryIds),
        customRef: this.customPublishRef ? this.customPublishRef.trim() : null,
        codiceFiscale: cf,
        codiceLotteria: lotteria,
      })
      .subscribe({
        next: () => {
          this.isPublishingGroup.set(false);
          this.successMessage = `Successfully published grouped receipt with ${this.selectedEntryIds.size} items to local spooler!`;
          this.selectedEntryIds.clear();
          this.showPublishGroupModal = false;
          this.loadLedgers();
          this.checkIntegrationStatus();
        },
        error: (err) => {
          this.isPublishingGroup.set(false);
          this.errorMessage = err.error || err.message || 'Failed to publish grouped entries';
        },
      });
  }

  // CSV Export
  exportLedgerCsv(ledger: ManualLedger): void {
    const wrappers = (ledger.entries || []).map((e) => this.wrapEntry(e));
    const filename = `manual_ledger_${ledger.startDate.slice(0, 10)}_${ledger.endDate.slice(0, 10)}.csv`;
    this.downloadCsv(wrappers, filename);
  }

  exportFilteredLedgerCsv(): void {
    const ledger = this.selectedLedger;
    if (!ledger) return;
    const filename = `manual_ledger_filtered_${ledger.startDate.slice(0, 10)}_${ledger.endDate.slice(0, 10)}.csv`;
    this.downloadCsv(this.filteredEntries, filename);
  }

  private downloadCsv(list: EntryWrapper[], filename: string): void {
    const lines = [
      'Timestamp,Fiscal Reference,Payment Method,Notes,Amount (EUR),Tip (EUR),Total (EUR),Revenue Type',
    ];

    for (const item of list) {
      const isFinancial = item.paymentMethodGroup !== 'DiscountOmaggio';
      const revenueType = isFinancial ? 'Collected Revenue' : 'Omaggio / Non-Revenue';
      const row = [
        this.escapeCsvField(item.timestampLocalDisplay),
        this.escapeCsvField(item.referenceNumberDisplay),
        this.escapeCsvField(item.paymentMethodDisplay),
        this.escapeCsvField(item.notesDisplay),
        item.amount.toFixed(2),
        item.tipAmount.toFixed(2),
        item.totalWithTip.toFixed(2),
        this.escapeCsvField(revenueType),
      ];
      lines.push(row.join(','));
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(lines.join('\n'));
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  private escapeCsvField(field: string): string {
    if (!field) return '""';
    if (field.includes(',') || field.includes('"') || field.includes('\n') || field.includes('\r')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }
}
