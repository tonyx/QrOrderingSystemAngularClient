import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, NavigationEnd } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { filter, Subscription } from 'rxjs';
import { AssistantService, HowToItemRecord } from '../../../core/services/assistant.service';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { RestaurantItem } from '../../../core/models/restaurant.models';

declare const marked: {
  parse(markdown: string, options?: any): string;
  Renderer: new () => any;
};

@Component({
  selector: 'app-qr-assistant-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './qr-assistant-modal.component.html',
  styleUrls: ['./qr-assistant-modal.component.css'],
})
export class QrAssistantModalComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly assistantService = inject(AssistantService);
  private readonly restaurantService = inject(RestaurantService);
  private readonly sanitizer = inject(DomSanitizer);

  private routerSub?: Subscription;
  private customEventSubToggle?: (e: Event) => void;
  private customEventSubQuery?: (e: Event) => void;

  isOpen = signal<boolean>(false);
  isClosing = signal<boolean>(false);
  isHidden = signal<boolean>(false);
  isLoading = signal<boolean>(false);

  searchQuestion = '';
  noticeText = signal<string | null>(null);
  errorText = signal<string | null>(null);
  showEmptyAlert = signal<boolean>(false);

  // Assistant & Sources state
  viewMode = signal<'answer' | 'source'>('answer');
  selectedIndex = signal<number>(0);
  assistantAnswer = signal<string | null>(null);
  sources = signal<HowToItemRecord[]>([]);
  referenceIds = signal<string[]>([]);
  referenceItemsCache: Record<string, HowToItemRecord> = {};

  hasResults = computed(() => {
    return (
      (this.assistantAnswer() !== null && this.assistantAnswer()!.trim().length > 0) ||
      this.sources().length > 0
    );
  });

  // Current Card Display
  currentBadge = computed(() => {
    if (this.viewMode() === 'answer') {
      return 'AI Answer';
    }
    return `Source ${this.selectedIndex() + 1}`;
  });

  currentTitle = computed(() => {
    if (this.viewMode() === 'answer') {
      return 'Based on Documentation';
    }
    const item = this.sources()[this.selectedIndex()];
    return item?.name || item?.Name || '';
  });

  currentSection = computed(() => {
    if (this.viewMode() === 'answer') {
      const count = this.sources().length;
      return count > 0 ? `${count} source(s)` : '';
    }
    const item = this.sources()[this.selectedIndex()];
    return item?.section || item?.Section || '';
  });

  displayedReferenceIds = computed(() => {
    if (this.viewMode() === 'answer') {
      return this.referenceIds();
    }
    const item = this.sources()[this.selectedIndex()];
    const itemRefs = item?.referenceIds || item?.ReferenceIds || [];
    return Array.from(itemRefs);
  });

  renderedContentHtml = computed<SafeHtml>(() => {
    let rawText = '';
    if (this.viewMode() === 'answer') {
      rawText = this.assistantAnswer() || '';
    } else {
      const item = this.sources()[this.selectedIndex()];
      rawText = item?.content || item?.Content || '';
    }

    if (!rawText) return '';

    if (typeof marked !== 'undefined' && marked && marked.parse) {
      try {
        const renderer = new marked.Renderer();
        renderer.link = (arg1: any, arg2: any, arg3: any) => {
          let href = '';
          let text = '';
          let title = '';
          if (typeof arg1 === 'object' && arg1 !== null) {
            href = arg1.href || '';
            text = arg1.text || href;
            title = arg1.title || '';
          } else {
            href = arg1 || '';
            title = arg2 || '';
            text = arg3 || href;
          }
          const titleAttr = title ? ` title="${title.replace(/"/g, '&quot;')}"` : '';
          return `<a href="${href}"${titleAttr} data-assistant-link="true">${text}</a>`;
        };

        const html = marked.parse(rawText, { renderer });
        return this.sanitizer.bypassSecurityTrustHtml(html);
      } catch {
        // Fallback below
      }
    }

    // Fallback if marked is unavailable or failed
    const escaped = rawText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br/>');
    return this.sanitizer.bypassSecurityTrustHtml(escaped);
  });

  // Multiple Restaurants Selector Modal
  isPickerModalOpen = signal<boolean>(false);
  userRestaurants = signal<RestaurantItem[]>([]);
  pendingTargetUrl: string | null = null;
  contextRestaurantId = signal<string | null>(null);

  ngOnInit(): void {
    this.checkRouteVisibility(this.router.url);

    this.routerSub = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        this.checkRouteVisibility(event.urlAfterRedirects || event.url);
      });

    this.customEventSubToggle = () => {
      this.toggleModal();
    };

    this.customEventSubQuery = (e: any) => {
      const payload = e.detail || e;
      const promptText = typeof payload === 'string' ? payload : payload?.prompt || '';
      const restId = payload && typeof payload === 'object' ? payload.restaurantId : null;
      this.queryPrompt(promptText, restId);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('toggle-qr-assistant', this.customEventSubToggle);
      window.addEventListener('query-qr-assistant', this.customEventSubQuery);
    }
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
    if (typeof window !== 'undefined') {
      if (this.customEventSubToggle) {
        window.removeEventListener('toggle-qr-assistant', this.customEventSubToggle);
      }
      if (this.customEventSubQuery) {
        window.removeEventListener('query-qr-assistant', this.customEventSubQuery);
      }
    }
  }

  private checkRouteVisibility(url: string): void {
    const path = url.replace(/^\//, '').split('?')[0].toLowerCase();
    const hidden =
      path === 'menu' ||
      path.startsWith('menu/') ||
      path === 'm' ||
      path.startsWith('m/') ||
      path === 'order' ||
      path.startsWith('order/');
    this.isHidden.set(hidden);
  }

  toggleModal(): void {
    if (this.isOpen()) {
      this.closeModal();
    } else {
      this.isClosing.set(false);
      this.isOpen.set(true);
    }
  }

  closeModal(): void {
    if (!this.isOpen() || this.isClosing()) return;
    this.isClosing.set(true);
    setTimeout(() => {
      this.isOpen.set(false);
      this.isClosing.set(false);
    }, 180);
  }

  queryPrompt(promptText: string, restaurantId?: string | null): void {
    this.isOpen.set(true);
    this.contextRestaurantId.set(restaurantId || null);
    this.searchQuestion = promptText;
    this.handleChatbotSubmit();
  }

  handleChatbotSubmit(event?: Event): void {
    if (event) event.preventDefault();
    const query = this.searchQuestion.trim();
    if (!query) return;

    this.isLoading.set(true);
    this.errorText.set(null);
    this.noticeText.set(null);
    this.showEmptyAlert.set(false);

    this.assistantService.askAssistant(query, 5).subscribe({
      next: (data) => {
        this.isLoading.set(false);
        const hasAns = !!(data.hasAnswer ?? data.HasAnswer);
        const answer = data.answer ?? data.Answer;
        const sources = (data.sources ?? data.Sources ?? []) as HowToItemRecord[];
        const refIds = (data.referenceIds ?? data.ReferenceIds ?? []) as string[];
        const refItems = (data.referenceItems ?? data.ReferenceItems ?? []) as HowToItemRecord[];

        sources.forEach((item) => {
          const id = item.id || item.Id;
          if (id) this.referenceItemsCache[id] = item;
        });

        refItems.forEach((item) => {
          const id = item.id || item.Id;
          if (id) this.referenceItemsCache[id] = item;
        });

        if (hasAns && answer && answer.trim().length > 0) {
          this.assistantAnswer.set(answer);
          this.sources.set(sources);
          this.referenceIds.set(refIds);
          this.viewMode.set('answer');
          this.selectedIndex.set(0);
        } else if (sources && sources.length > 0) {
          const first = sources[0];
          const title = first.name || first.Name || '';
          const section = first.section || first.Section || '';
          const content = first.content || first.Content || '';
          const fallback = `${title ? `### ${title}\n\n` : ''}${section ? `*Section: ${section}*\n\n` : ''}${content}`;
          this.assistantAnswer.set(fallback);
          this.sources.set(sources);
          this.referenceIds.set(refIds);
          this.viewMode.set('answer');
          this.selectedIndex.set(0);
        } else {
          this.assistantAnswer.set(null);
          this.sources.set([]);
          this.referenceIds.set([]);
          this.showEmptyAlert.set(true);
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorText.set(
          err?.error?.message || err?.error || err?.message || 'Failed to search questions.'
        );
      },
    });
  }

  switchToAnswerMode(): void {
    this.viewMode.set('answer');
  }

  selectSource(index: number): void {
    this.viewMode.set('source');
    this.selectedIndex.set(index);
  }

  loadReferenceItem(refId: string): void {
    const existingIdx = this.sources().findIndex((item) => (item.id || item.Id) === refId);
    if (existingIdx >= 0) {
      this.selectedIndex.set(existingIdx);
      this.viewMode.set('source');
      return;
    }

    const cached = this.referenceItemsCache[refId];
    if (cached) {
      this.sources.update((list) => [...list, cached]);
      this.selectedIndex.set(this.sources().length - 1);
      this.viewMode.set('source');
      return;
    }

    this.isLoading.set(true);
    this.assistantService.getHowToItem(refId).subscribe({
      next: (item) => {
        this.isLoading.set(false);
        const id = item.id || item.Id;
        if (id) {
          this.referenceItemsCache[id] = item;
        }
        this.sources.update((list) => [...list, item]);
        this.selectedIndex.set(this.sources().length - 1);
        this.viewMode.set('source');
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorText.set(err?.error || err?.message || 'Failed to load reference item.');
      },
    });
  }

  getReferenceLabel(refId: string): string {
    const cached = this.referenceItemsCache[refId];
    if (cached) {
      return cached.name || cached.Name || `Section ${refId.substring(0, 8)}...`;
    }
    return `Section ${refId.substring(0, 8)}...`;
  }

  onContentClick(event: MouseEvent): void {
    const target = (event.target as HTMLElement).closest('a[data-assistant-link="true"]');
    if (!target) return;

    event.preventDefault();
    const href = target.getAttribute('href') || '';
    this.handleHowToLinkClick(href);
  }

  handleHowToLinkClick(href: string): void {
    let cleanHref = href.trim();
    if (cleanHref.startsWith('#')) {
      const anchorName = cleanHref.substring(1).replace(/[-_]/g, ' ');
      this.searchQuestion = anchorName;
      this.handleChatbotSubmit();
      return;
    }

    if (cleanHref.startsWith('./')) {
      cleanHref = cleanHref.substring(1);
    }
    if (!cleanHref.startsWith('/') && !cleanHref.startsWith('http://') && !cleanHref.startsWith('https://')) {
      cleanHref = '/' + cleanHref;
    }

    const regex = /\{restaurantid\}/i;
    if (!regex.test(cleanHref)) {
      this.navigateTo(cleanHref);
      return;
    }

    const ctxRestId = this.contextRestaurantId();
    if (ctxRestId) {
      const target = cleanHref.replace(regex, ctxRestId);
      this.navigateTo(target);
      return;
    }

    this.restaurantService.getMyRestaurants().subscribe({
      next: (restaurants) => {
        if (!restaurants || restaurants.length === 0) {
          this.noticeText.set(
            'No active restaurant found. Please create a restaurant first to access this page.'
          );
          return;
        }

        if (restaurants.length === 1) {
          const target = cleanHref.replace(regex, restaurants[0].restaurantId);
          this.navigateTo(target);
          return;
        }

        // Multiple restaurants -> open selection modal
        this.pendingTargetUrl = cleanHref;
        this.userRestaurants.set(restaurants);
        this.isPickerModalOpen.set(true);
      },
      error: () => {
        this.noticeText.set('Unable to retrieve user restaurants.');
      },
    });
  }

  selectRestaurantAndNavigate(restaurantId: string): void {
    const pending = this.pendingTargetUrl;
    this.closeRestaurantPickerModal();

    if (pending) {
      const target = pending.replace(/\{restaurantid\}/i, restaurantId);
      this.navigateTo(target);
    }
  }

  closeRestaurantPickerModal(): void {
    this.isPickerModalOpen.set(false);
    this.pendingTargetUrl = null;
  }

  private navigateTo(url: string): void {
    this.closeModal();
    if (url.startsWith('http://') || url.startsWith('https://')) {
      window.location.href = url;
    } else {
      this.router.navigateByUrl(url);
    }
  }
}
