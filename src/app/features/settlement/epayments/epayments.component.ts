import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { StripePaymentService } from '../../../core/services/stripe-payment.service';
import { LocalizationService } from '../../../core/services/localization.service';
import { LocPipe } from '../../../core/pipes/loc.pipe';
import { MainLayoutComponent } from '../../../shared/components/main-layout/main-layout.component';
import { PaymentModel } from '../../../core/models/payment.models';

export interface PaymentDisplayWrapper {
  raw: PaymentModel;
  paymentId: string;
  paymentIntentId: string;
  orderId: string;
  tableNum: string | null;
  createdAt: Date;
  currency: string;
  initialAmount: number;
  currentAmount: number;
  initialTipAmount: number;
  currentTipAmount: number;
  platformFee: number;
  stripeFee: number;
  netAmount: number;
  merchantNetAmount: number;
  currentStatus: string;
  isCaptured: boolean;
  isPartiallyRefunded: boolean;
  isFullyRefunded: boolean;
  isFailed: boolean;
  amountMatchesInitialAmount: boolean;
  issues: { timestamp: Date; text: string }[];
  statuses: string[];
  metadata: Record<string, string>;
  items: string | null;
}

@Component({
  selector: 'app-epayments',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LocPipe, MainLayoutComponent],
  templateUrl: './epayments.component.html',
  styleUrls: ['./epayments.component.css'],
})
export class EpaymentsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly stripePaymentService = inject(StripePaymentService);
  readonly loc = inject(LocalizationService);

  restaurantId = '';
  inputRestaurantId = '';

  startDateStr = '';
  endDateStr = '';

  isLoading = false;
  hasFetched = false;
  errorMessage: string | null = null;
  successMessage: string | null = null;

  payments = signal<PaymentDisplayWrapper[]>([]);
  searchFilter = signal<string>('');

  // Pagination
  currentPage = signal<number>(1);
  pageSize = signal<number>(10);

  // Sorting
  sortColumn = signal<string>('createdAt');
  sortDirection = signal<'asc' | 'desc'>('desc');

  // Active View Tab
  activeTab: 'table' | 'analytics' = 'table';
  isExportDropdownOpen = false;

  // Row Expansion
  expandedPaymentIds = signal<Set<string>>(new Set());

  // Issue reporting form
  activeIssuePaymentId: string | null = null;
  issueTextInput = '';
  isSubmittingIssue = false;

  readonly Math = Math;

  // Print Receipt modal
  printReceiptPayment: PaymentDisplayWrapper | null = null;

  ngOnInit(): void {
    this.setCurrentDay();

    this.route.params.subscribe((params) => {
      const restId = params['restaurantId'] || params['id'];
      if (restId) {
        this.restaurantId = restId;
        this.inputRestaurantId = restId;
        this.fetchPayments();
      }
    });
  }

  setCurrentDay(): void {
    const today = new Date();
    this.startDateStr = this.formatDateInput(today);
    this.endDateStr = this.formatDateInput(today);
  }

  setYesterday(): void {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    this.startDateStr = this.formatDateInput(yesterday);
    this.endDateStr = this.formatDateInput(yesterday);
  }

  setLast7Days(): void {
    const today = new Date();
    const last7 = new Date();
    last7.setDate(today.getDate() - 6);
    this.startDateStr = this.formatDateInput(last7);
    this.endDateStr = this.formatDateInput(today);
  }

  setThisMonth(): void {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    this.startDateStr = this.formatDateInput(firstDay);
    this.endDateStr = this.formatDateInput(today);
  }

  private formatDateInput(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  setActiveTab(tab: 'table' | 'analytics'): void {
    this.activeTab = tab;
  }

  toggleExportDropdown(): void {
    this.isExportDropdownOpen = !this.isExportDropdownOpen;
  }

  fetchPayments(): void {
    this.errorMessage = null;
    this.successMessage = null;

    const targetRestId = this.restaurantId || this.inputRestaurantId;
    if (!targetRestId) {
      this.errorMessage = this.loc.t('EPay_ErrRestaurantIdRequired');
      return;
    }

    if (!this.startDateStr || !this.endDateStr) {
      this.errorMessage = 'Please select both start and end date.';
      return;
    }

    const start = new Date(this.startDateStr + 'T00:00:00');
    const end = new Date(this.endDateStr + 'T23:59:59.999');

    if (start > end) {
      this.errorMessage = this.loc.t('EPay_ErrStartDateAfterEnd');
      return;
    }

    this.isLoading = true;
    this.hasFetched = true;

    this.stripePaymentService.getPaymentsByTimeInterval(targetRestId, start, end).subscribe({
      next: (list) => {
        this.isLoading = false;
        const mapped = (list || []).map((p) => this.mapPayment(p));
        this.payments.set(mapped);
        this.currentPage.set(1);
      },
      error: (err) => {
        this.isLoading = false;
        this.payments.set([]);
        const msg = err?.error || err?.message || 'Unknown error';
        this.errorMessage = this.loc.t('EPay_ErrFailedFetchPayments').replace('{0}', msg);
      },
    });
  }

  private mapPayment(rawP: any): PaymentDisplayWrapper {
    const unwrapId = (val: any): string => {
      if (!val) return '';
      if (typeof val === 'string') return val;
      if (typeof val === 'object') {
        return String(val.value ?? val.Value ?? val.fields?.[0] ?? val.Fields?.[0] ?? '');
      }
      return String(val);
    };

    const payId = unwrapId(rawP?.paymentId ?? rawP?.PaymentId);
    const intentId = String(rawP?.paymentIntentId ?? rawP?.PaymentIntentId ?? '');
    const meta: Record<string, string> = rawP?.metadata ?? rawP?.Metadata ?? {};
    const tableNum = meta['table_num'] || meta['tableNum'] || null;
    const items = meta['items'] || null;

    const rawOrderId = rawP?.orderId ?? rawP?.OrderId;
    const orderIdStr = unwrapId(rawOrderId);

    // Initial amount & Current amount
    let initialAmount = Number(rawP?.initialAmount ?? rawP?.InitialAmount ?? 0);
    let currentAmount = Number(rawP?.currentAmount ?? rawP?.CurrentAmount ?? 0);

    // Fallback if amounts were 0 or missing but stored in metadata
    if (initialAmount === 0 && meta['items_total']) {
      const parsed = parseFloat(meta['items_total']);
      if (!isNaN(parsed) && parsed > 0) initialAmount = parsed;
    }
    if (initialAmount === 0 && meta['goods_amount']) {
      const parsed = parseFloat(meta['goods_amount']);
      if (!isNaN(parsed) && parsed > 0) {
        // goods_amount might be in cents or euros
        initialAmount = parsed >= 100 ? parsed / 100 : parsed;
      }
    }
    if (currentAmount === 0 && initialAmount > 0 && !meta['is_refunded']) {
      // Check if refund status is not full refund
      const statusesList = rawP?.statuses ?? rawP?.Statuses ?? [];
      const hasFullRefund = Array.isArray(statusesList) && statusesList.some((s: any) => {
        const c = s?.case ?? s?.Case ?? (typeof s === 'string' ? s : '');
        return c === 'Refunded' && (s?.fields?.[0] === initialAmount || s?.Fields?.[0] === initialAmount);
      });
      if (!hasFullRefund) {
        currentAmount = initialAmount;
      }
    }

    // Platform fee
    let platformFee = Number(rawP?.platformFee ?? rawP?.PlatformFee ?? 0);
    if (platformFee === 0 && meta['platform_fee']) {
      const parsed = parseFloat(meta['platform_fee']);
      if (!isNaN(parsed) && parsed > 0) platformFee = parsed;
    }

    // Stripe fee
    let stripeFee = Number(rawP?.stripeFee ?? rawP?.StripeFee ?? 0);
    if (stripeFee === 0 && meta['stripe_fee']) {
      const parsed = parseFloat(meta['stripe_fee']);
      if (!isNaN(parsed) && parsed > 0) stripeFee = parsed;
    } else if (stripeFee === 0 && meta['stripe_fee_cents']) {
      const parsed = parseFloat(meta['stripe_fee_cents']);
      if (!isNaN(parsed) && parsed > 0) stripeFee = parsed / 100;
    }

    // Initial tip calculation matching Payment.fs
    let initTip = 0;
    if (meta['tip_amount']) {
      const cleaned = meta['tip_amount'].replace(',', '.').replace(/[^0-9.]/g, '');
      const parsed = parseFloat(cleaned);
      if (!isNaN(parsed)) {
        if (initialAmount > 0 && parsed > initialAmount) {
          initTip = parsed / 100.0;
        } else if (initialAmount <= 0 && parsed >= 100.0) {
          initTip = parsed / 100.0;
        } else {
          initTip = parsed;
        }
      }
    }

    // Current tip
    const initialNet = initialAmount - initTip;
    const totalRefunded = initialAmount - currentAmount;
    const tipRefunded = Math.max(0, totalRefunded - Math.max(0, initialNet));
    const currTip = Math.max(0, initTip - tipRefunded);

    const netAmount = Math.max(0, currentAmount - currTip);
    const merchantNetAmount = Math.max(0, netAmount - platformFee - stripeFee);

    // Statuses
    const rawStatuses = rawP?.statuses ?? rawP?.Statuses ?? [];
    const statusLabels: string[] = [];
    let isCaptured = false;
    let isPartiallyRefunded = false;
    let isFullyRefunded = currentAmount === 0 && initialAmount > 0;
    let isFailed = false;

    if (Array.isArray(rawStatuses)) {
      for (const st of rawStatuses) {
        let stName = '';
        if (typeof st === 'string') {
          stName = st;
        } else if (typeof st === 'object' && st !== null) {
          const caseName = st.case ?? st.Case;
          if (caseName) {
            if (caseName === 'Refunded') {
              const refundFields = st.fields ?? st.Fields;
              const refundVal = refundFields && refundFields[0] ? Number(refundFields[0]) : 0;
              stName = `Refunded (${refundVal.toFixed(2)})`;
            } else {
              stName = caseName;
            }
          }
        }
        statusLabels.push(stName || 'Captured');
      }
    }

    const currentStatus = statusLabels.length > 0 ? statusLabels[statusLabels.length - 1] : 'Captured';
    if (currentStatus.startsWith('Captured')) isCaptured = true;
    if (currentStatus.startsWith('Failed')) isFailed = true;
    if (currentAmount > 0 && initialAmount > currentAmount) isPartiallyRefunded = true;

    // Issues
    const rawIssues = rawP?.issues ?? rawP?.Issues ?? [];
    const parsedIssues: { timestamp: Date; text: string }[] = [];
    if (Array.isArray(rawIssues)) {
      for (const issueItem of rawIssues) {
        if (Array.isArray(issueItem)) {
          parsedIssues.push({
            timestamp: new Date(issueItem[0]),
            text: String(issueItem[1]),
          });
        } else if (issueItem && typeof issueItem === 'object') {
          const tVal = (issueItem as any).item1 ?? (issueItem as any).Item1 ?? (issueItem as any).timestamp ?? (issueItem as any).Timestamp;
          const txtVal = (issueItem as any).item2 ?? (issueItem as any).Item2 ?? (issueItem as any).issue ?? (issueItem as any).Issue;
          if (tVal && txtVal) {
            parsedIssues.push({
              timestamp: new Date(tVal),
              text: String(txtVal),
            });
          }
        }
      }
    }

    const rawCreatedAt = rawP?.createdAt ?? rawP?.CreatedAt;
    const createdAtDate = rawCreatedAt ? new Date(rawCreatedAt) : new Date();
    const currencyStr = String(rawP?.currency ?? rawP?.Currency ?? 'EUR').toUpperCase();

    return {
      raw: rawP,
      paymentId: payId,
      paymentIntentId: intentId,
      orderId: orderIdStr,
      tableNum,
      createdAt: createdAtDate,
      currency: currencyStr,
      initialAmount,
      currentAmount,
      initialTipAmount: initTip,
      currentTipAmount: currTip,
      platformFee,
      stripeFee,
      netAmount,
      merchantNetAmount,
      currentStatus,
      isCaptured,
      isPartiallyRefunded,
      isFullyRefunded,
      isFailed,
      amountMatchesInitialAmount: initialAmount === currentAmount,
      issues: parsedIssues,
      statuses: statusLabels,
      metadata: meta,
      items,
    };
  }

  // Filtered payments list
  filteredPayments = computed(() => {
    const list = this.payments();
    const term = this.searchFilter().trim().toLowerCase();
    if (!term) return list;

    return list.filter((p) => {
      return (
        p.paymentIntentId.toLowerCase().includes(term) ||
        p.orderId.toLowerCase().includes(term) ||
        (p.tableNum && p.tableNum.toLowerCase().includes(term)) ||
        p.currency.toLowerCase().includes(term) ||
        p.currentStatus.toLowerCase().includes(term) ||
        p.paymentId.toLowerCase().includes(term)
      );
    });
  });

  // Sorted and Paginated payments
  sortedPayments = computed(() => {
    const list = [...this.filteredPayments()];
    const col = this.sortColumn();
    const dir = this.sortDirection();

    list.sort((a, b) => {
      let valA: any = (a as any)[col];
      let valB: any = (b as any)[col];

      if (col === 'tableNum') {
        valA = a.tableNum || '';
        valB = b.tableNum || '';
      } else if (col === 'issueCount') {
        valA = a.issues.length;
        valB = b.issues.length;
      } else if (col === 'createdAt') {
        valA = a.createdAt.getTime();
        valB = b.createdAt.getTime();
      }

      if (valA < valB) return dir === 'asc' ? -1 : 1;
      if (valA > valB) return dir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  });

  paginatedPayments = computed(() => {
    const list = this.sortedPayments();
    const page = this.currentPage();
    const size = this.pageSize();
    const start = (page - 1) * size;
    return list.slice(start, start + size);
  });

  totalPages = computed(() => {
    const total = this.filteredPayments().length;
    return Math.max(1, Math.ceil(total / this.pageSize()));
  });

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  setSort(column: string): void {
    if (this.sortColumn() === column) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('asc');
    }
  }

  getCurrency(): string {
    const list = this.payments();
    return list.length > 0 ? list[0].currency : 'EUR';
  }

  get filteredNetVolume(): number {
    return this.filteredPayments().reduce((acc, p) => acc + p.netAmount, 0);
  }

  get filteredGrossVolume(): number {
    return this.filteredPayments().reduce((acc, p) => acc + p.currentAmount, 0);
  }

  get filteredTipsVolume(): number {
    return this.filteredPayments().reduce((acc, p) => acc + p.currentTipAmount, 0);
  }

  get filteredTipCount(): number {
    return this.filteredPayments().filter((p) => p.currentTipAmount > 0).length;
  }

  get filteredRefundsVolume(): number {
    return this.filteredPayments().reduce((acc, p) => acc + Math.max(0, p.initialAmount - p.currentAmount), 0);
  }

  get countPaymentsWithIssues(): number {
    return this.filteredPayments().filter((p) => p.issues.length > 0).length;
  }

  // Row Classes
  getRowClass(payment: PaymentDisplayWrapper): string {
    if (payment.isFullyRefunded) {
      return 'table-danger';
    } else if (payment.isPartiallyRefunded) {
      return 'table-warning';
    } else if (payment.amountMatchesInitialAmount) {
      return 'table-success';
    }
    return '';
  }

  getShortId(id: string | null | undefined): string {
    if (!id) return '-';
    return id.length > 12 ? `${id.substring(0, 10)}...` : id;
  }

  toggleExpandRow(paymentId: string): void {
    const current = new Set(this.expandedPaymentIds());
    if (current.has(paymentId)) {
      current.delete(paymentId);
    } else {
      current.add(paymentId);
    }
    this.expandedPaymentIds.set(current);
  }

  isRowExpanded(paymentId: string): boolean {
    return this.expandedPaymentIds().has(paymentId);
  }

  toggleAddIssueForm(paymentId: string): void {
    if (this.activeIssuePaymentId === paymentId) {
      this.activeIssuePaymentId = null;
      this.issueTextInput = '';
    } else {
      this.activeIssuePaymentId = paymentId;
      this.issueTextInput = '';
    }
  }

  handleIssueKeyUp(event: KeyboardEvent, paymentId: string): void {
    if (event.key === 'Enter') {
      this.submitIssue(paymentId);
    }
  }

  submitIssue(paymentId: string): void {
    if (!this.issueTextInput || !this.issueTextInput.trim()) {
      this.errorMessage = this.loc.t('EPay_ErrIssueEmpty');
      return;
    }

    const targetRestId = this.restaurantId || this.inputRestaurantId;
    if (!targetRestId) {
      this.errorMessage = this.loc.t('EPay_ErrRestaurantIdRequired');
      return;
    }

    this.isSubmittingIssue = true;
    this.errorMessage = null;
    this.successMessage = null;

    this.stripePaymentService.addIssue(targetRestId, paymentId, this.issueTextInput.trim()).subscribe({
      next: () => {
        this.isSubmittingIssue = false;
        this.successMessage = this.loc.t('EPay_SuccessIssueAdded');
        this.issueTextInput = '';
        this.activeIssuePaymentId = null;
        this.fetchPayments();
      },
      error: (err) => {
        this.isSubmittingIssue = false;
        const msg = err?.error || err?.message || 'Unknown error';
        this.errorMessage = this.loc.t('EPay_ErrFailedAddIssue').replace('{0}', msg);
      },
    });
  }

  openPrintReceiptModal(payment: PaymentDisplayWrapper): void {
    this.printReceiptPayment = payment;
  }

  closeReceiptModal(): void {
    this.printReceiptPayment = null;
  }

  triggerPrint(): void {
    window.print();
  }

  // Daily Summary Grouping for Analytics
  dailySummary = computed(() => {
    const list = this.filteredPayments();
    const map = new Map<string, {
      date: string;
      count: number;
      gross: number;
      net: number;
      tips: number;
      platformFees: number;
      stripeFees: number;
      merchantNet: number;
      issues: number;
    }>();

    for (const p of list) {
      const d = this.formatDateInput(p.createdAt);
      if (!map.has(d)) {
        map.set(d, {
          date: d,
          count: 0,
          gross: 0,
          net: 0,
          tips: 0,
          platformFees: 0,
          stripeFees: 0,
          merchantNet: 0,
          issues: 0,
        });
      }
      const entry = map.get(d)!;
      entry.count += 1;
      entry.gross += p.currentAmount;
      entry.net += p.netAmount;
      entry.tips += p.currentTipAmount;
      entry.platformFees += p.platformFee;
      entry.stripeFees += p.stripeFee;
      entry.merchantNet += p.merchantNetAmount;
      entry.issues += p.issues.length;
    }

    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  });

  statusDistribution = computed(() => {
    const list = this.filteredPayments();
    const captured = list.filter((p) => p.isCaptured && !p.isPartiallyRefunded && !p.isFullyRefunded).length;
    const partial = list.filter((p) => p.isPartiallyRefunded).length;
    const full = list.filter((p) => p.isFullyRefunded).length;
    const other = list.filter((p) => p.isFailed || (!p.isCaptured && !p.isFullyRefunded && !p.isPartiallyRefunded)).length;
    return { captured, partial, full, other };
  });

  private escapeCsv(val: any): string {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  private downloadCsvFile(filename: string, content: string): void {
    const bom = '\uFEFF';
    const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
      URL.revokeObjectURL(url);
    }, 500);
  }

  exportDetailedCsv(): void {
    this.isExportDropdownOpen = false;
    const list = this.filteredPayments();
    if (list.length === 0) {
      this.errorMessage = this.loc.t('EPay_NoPaymentsTitle');
      return;
    }

    const headers = [
      'PaymentId',
      'DateTime',
      'TableNum',
      'Status',
      'Currency',
      'InitialAmount',
      'CurrentAmount',
      'CurrentTip',
      'InitialTip',
      'PlatformFee',
      'StripeFee',
      'NetAmount',
      'MerchantNet',
      'PaymentIntentId',
      'OrderId',
      'IssuesCount',
      'PurchasedItems',
    ];

    const rows = list.map((p) => [
      this.escapeCsv(p.paymentId),
      this.escapeCsv(p.createdAt.toISOString().replace('T', ' ').substring(0, 19)),
      this.escapeCsv(p.tableNum || ''),
      this.escapeCsv(p.currentStatus),
      this.escapeCsv(p.currency),
      p.initialAmount.toFixed(2),
      p.currentAmount.toFixed(2),
      p.currentTipAmount.toFixed(2),
      p.initialTipAmount.toFixed(2),
      p.platformFee.toFixed(2),
      p.stripeFee.toFixed(2),
      p.netAmount.toFixed(2),
      p.merchantNetAmount.toFixed(2),
      this.escapeCsv(p.paymentIntentId),
      this.escapeCsv(p.orderId),
      p.issues.length,
      this.escapeCsv(p.items || ''),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const filename = `epayments_detailed_${this.startDateStr}_to_${this.endDateStr}.csv`;
    this.downloadCsvFile(filename, csvContent);
    this.successMessage = `Exported ${list.length} record(s) to '${filename}'.`;
  }

  exportSummaryCsv(): void {
    this.isExportDropdownOpen = false;
    const summary = this.dailySummary();
    if (summary.length === 0) {
      this.errorMessage = this.loc.t('EPay_NoPaymentsTitle');
      return;
    }

    const headers = [
      'Date',
      'TotalTransactions',
      'Currency',
      'GrossVolume',
      'RefundsVolume',
      'NetVolume',
      'TipsVolume',
      'PlatformFeesVolume',
      'StripeFeesVolume',
      'MerchantNetVolume',
      'IssuesCount',
    ];

    const currency = this.getCurrency();
    const rows = summary.map((g) => [
      this.escapeCsv(g.date),
      g.count,
      this.escapeCsv(currency),
      g.gross.toFixed(2),
      (g.gross - g.net).toFixed(2),
      g.net.toFixed(2),
      g.tips.toFixed(2),
      g.platformFees.toFixed(2),
      g.stripeFees.toFixed(2),
      g.merchantNet.toFixed(2),
      g.issues,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const filename = `epayments_daily_summary_${this.startDateStr}_to_${this.endDateStr}.csv`;
    this.downloadCsvFile(filename, csvContent);
    this.successMessage = `Exported daily summary (${summary.length} days) to '${filename}'.`;
  }
}
