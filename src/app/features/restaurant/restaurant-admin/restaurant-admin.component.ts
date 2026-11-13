import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LocPipe } from '../../../core/pipes/loc.pipe';
import { LocalizationService } from '../../../core/services/localization.service';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { RestaurantItem, SelfOrderingMode, SasResponse } from '../../../core/models/restaurant.models';
import { MenuItemModel } from '../../../core/models/menu.models';
import { MainLayoutComponent } from '../../../shared/components/main-layout/main-layout.component';

export interface AdminCategoryGroup {
  categoryName: string;
  isSome: boolean;
  orderIndex: number;
  items: MenuItemModel[];
}

@Component({
  selector: 'app-restaurant-admin',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, MainLayoutComponent, LocPipe],
  templateUrl: './restaurant-admin.component.html',
  styleUrls: ['./restaurant-admin.component.css'],
})
export class RestaurantAdminComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly restaurantService = inject(RestaurantService);
  private readonly loc = inject(LocalizationService);

  restaurantId = signal<string>('');
  restaurant = signal<RestaurantItem | null>(null);
  loading = signal<boolean>(true);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  // Menu items actions state (Availability, Add/Edit/Remove/Scan image, Remove item)
  updatingAvailabilityItems = signal<Set<string>>(new Set<string>());
  editingItemName = signal<string | null>(null);
  tempImageUrl = signal<string>('');
  imageErrorItemName = signal<string | null>(null);
  imageErrorMsg = signal<string | null>(null);
  uploadingItemName = signal<string | null>(null);
  uploadingStage = signal<'processing' | 'uploading' | null>(null);

  // Item Removal confirmation modal state
  showRemoveItemConsentModal = signal<boolean>(false);
  itemToRemoveName = signal<string | null>(null);
  isRemovingItem = signal<boolean>(false);

  // Menu Item Scan Image Modal state
  scanningItemName = signal<string | null>(null);
  isUploadingScan = signal<boolean>(false);
  scanError = signal<string | null>(null);
  scanStage = signal<'processing' | 'uploading' | null>(null);
  private scanVideoStream: MediaStream | null = null;

  // Capture Menu state (matches RestaurantAdmin.razor)
  cameraActive = signal<boolean>(false);
  resolveComposition = signal<boolean>(false);
  isProcessingImage = signal<boolean>(false);
  processingStatusMessage = signal<string | null>(null);
  capturedImage = signal<string | null>(null);
  private videoStream: MediaStream | null = null;

  // Loading flags for interactive sections
  isUpdatingSelfOrdering = signal<boolean>(false);
  isUpdatingExtraCatalogue = signal<boolean>(false);
  isUpdatingTips = signal<boolean>(false);
  isUpdatingSeatingFee = signal<boolean>(false);
  isUpdatingVat = signal<boolean>(false);
  isImportingMenu = signal<boolean>(false);

  // Section error signals
  tipError = signal<string | null>(null);
  seatingFeeError = signal<string | null>(null);
  vatError = signal<string | null>(null);

  // Inputs
  newTipHintInput: number | null = null;
  newSeatingFeeInput: number | null = null;
  newVatCodeInput = '';
  newVatRateInput: number | null = null;

  // Drag and Drop reordering state (matching RestaurantAdmin.razor HTML5 drag and drop)
  draggedCategory = signal<string | null>(null);
  draggedIndex = signal<number | null>(null);
  draggedCategoryGroup = signal<string | null>(null);
  dragOverCategory = signal<string | null>(null);
  dragOverItemKey = signal<string | null>(null);

  // Category renaming state (matching RestaurantAdmin.razor)
  editingCategoryName = signal<string | null>(null);
  editingCategoryValue = signal<string>('');
  menuResetErrorMessage = signal<string | null>(null);

  // Menu Management modals & state (matching RestaurantAdmin.razor)
  showCreateMenuModal = signal<boolean>(false);
  isCloneMenuSelected = signal<boolean>(false);
  newMenuNameInput = signal<string>('');
  isCreatingMenu = signal<boolean>(false);
  createMenuError = signal<string | null>(null);

  showSwitchMenuPromptModal = signal<boolean>(false);
  createdMenuTuple = signal<[number, string] | null>(null);
  isSwitchingMenu = signal<boolean>(false);
  targetSwitchMenuIdx = signal<number | null>(null);
  switchMenuError = signal<string | null>(null);

  isDroppingMenu = signal<boolean>(false);
  targetDropMenuIdx = signal<number | null>(null);

  // Assistant & Menu QR Modals
  assistantTopic = signal<string | null>(null);
  showMenuQrModal = signal<boolean>(false);

  // Grouped menu items computation matching RestaurantAdmin.razor
  groupedCategories = computed<AdminCategoryGroup[]>(() => {
    const rest = this.restaurant();
    if (!rest || !rest.items || rest.items.length === 0) return [];

    const categoriesOrdering = rest.categoriesOrdering || {};
    const catOrderMap = new Map<string, number>();
    Object.keys(categoriesOrdering).forEach((k) => {
      const idx = Number(k);
      const catVal = categoriesOrdering[idx];
      if (catVal != null) {
        catOrderMap.set(catVal.toLowerCase(), idx);
      }
    });

    const getCategoryIndex = (categoryName: string): number => {
      const lower = categoryName.trim().toLowerCase();
      if (catOrderMap.has(lower)) {
        return catOrderMap.get(lower)!;
      }
      return 9999;
    };

    const map = new Map<string, MenuItemModel[]>();
    for (const item of rest.items) {
      const rawCat = (item.category || '').trim();
      const catKey = rawCat || this.loc.translate('RestAdmin_Uncategorized');
      if (!map.has(catKey)) {
        map.set(catKey, []);
      }
      map.get(catKey)!.push(item);
    }

    const uncategorizedLabel = this.loc.translate('RestAdmin_Uncategorized').toLowerCase();
    const groups: AdminCategoryGroup[] = [];

    map.forEach((items, categoryName) => {
      items.sort((a, b) => a.orderIndex - b.orderIndex);
      const isSome = categoryName.trim().length > 0 && categoryName.toLowerCase() !== uncategorizedLabel && categoryName.toLowerCase() !== 'uncategorized';
      const orderIndex = getCategoryIndex(categoryName);
      groups.push({
        categoryName,
        isSome,
        orderIndex,
        items,
      });
    });

    groups.sort((a, b) => a.orderIndex - b.orderIndex);
    return groups;
  });

  askAssistant(topic: string, restaurantId?: string): void {
    this.assistantTopic.set(restaurantId ? `${topic} (${restaurantId})` : topic);
  }

  closeAssistant(): void {
    this.assistantTopic.set(null);
  }

  openMenuQrModal(): void {
    this.showMenuQrModal.set(true);
  }

  closeMenuQrModal(): void {
    this.showMenuQrModal.set(false);
  }

  printMenuQr(): void {
    window.print();
  }

  getMenuQrUrl(restaurantId: string): string {
    return `${window.location.origin}/m/${restaurantId}`;
  }

  getMenuQrImageUrl(restaurantId: string): string {
    const targetUrl = encodeURIComponent(this.getMenuQrUrl(restaurantId));
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${targetUrl}`;
  }

  downloadMenuJson(): void {
    const rest = this.restaurant();
    if (!rest) return;

    this.errorMessage.set(null);
    this.successMessage.set(null);

    const raw = rest.raw as any;
    let menuObj: any = null;

    if (raw) {
      const rawMenus = raw.menus ?? raw.Menus;
      if (rawMenus) {
        const idx = rawMenus.curentMenuIndex ?? rawMenus.CurentMenuIndex ?? 0;
        const list = rawMenus.menus ?? rawMenus.Menus;
        if (Array.isArray(list) && list.length > 0) {
          menuObj = list[idx] || list[0];
        }
      }
      if (!menuObj) {
        menuObj = raw.currentMenu ?? raw.CurrentMenu;
      }
    }

    if (!menuObj) {
      this.errorMessage.set(this.loc.translate('RestAdmin_MenuDownloadError'));
      return;
    }

    const menuName = menuObj.menuName ?? menuObj.MenuName ?? rest.currentMenuName ?? 'Menu';
    const json = JSON.stringify(menuObj, null, 2);
    const rawSafeName = `${rest.restaurantName}_${menuName}`.replace(/[\\/:*?"<>|]/g, '_');
    const fileName = `${rawSafeName}.json`;

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

  async handleMenuFileImport(event: Event): Promise<void> {
    const rest = this.restaurant();
    if (!rest) return;

    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.isImportingMenu.set(true);

    try {
      const jsonText = await file.text();
      this.restaurantService.importMenu(rest.restaurantId, jsonText).subscribe({
        next: () => {
          this.isImportingMenu.set(false);
          this.successMessage.set(this.loc.translate('RestAdmin_MenuImportSuccess'));
          input.value = '';
          this.loadRestaurant(rest.restaurantId, true);
        },
        error: (err) => {
          this.isImportingMenu.set(false);
          input.value = '';
          const errMsg = typeof err?.error === 'string'
            ? err.error
            : err?.error?.message || err?.message || this.loc.translate('RestAdmin_MenuImportError');
          this.errorMessage.set(errMsg);
        },
      });
    } catch (err: any) {
      this.isImportingMenu.set(false);
      input.value = '';
      this.errorMessage.set(err?.message || this.loc.translate('RestAdmin_MenuImportError'));
    }
  }

  noopAction(event?: Event): void {
    if (event) {
      event.preventDefault();
    }
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('restaurantId');
    if (id) {
      this.restaurantId.set(id);
      this.loadRestaurant(id);
    } else {
      this.errorMessage.set('No restaurant ID provided in route.');
      this.loading.set(false);
    }
  }

  loadRestaurant(id: string, isSilent = false): void {
    if (!isSilent) {
      this.loading.set(true);
    }
    this.errorMessage.set(null);
    this.restaurantService.getRestaurant(id).subscribe({
      next: (data) => {
        this.restaurant.set(data);
        if (!isSilent) {
          this.newSeatingFeeInput = data.seatingFee ?? 0;
          this.loading.set(false);
        }
      },
      error: (err) => {
        this.errorMessage.set(err?.error?.message || err?.message || 'Failed to load restaurant.');
        this.loading.set(false);
      },
    });
  }

  // --- 1. Self-Ordering Mode Actions ---
  selectSelfOrdering(mode: SelfOrderingMode): void {
    const rest = this.restaurant();
    if (!rest || this.isUpdatingSelfOrdering()) return;
    if (rest.hasActiveOrders && mode === 'no') return;

    this.isUpdatingSelfOrdering.set(true);
    this.errorMessage.set(null);

    this.restaurantService.setSelfOrderingMode(rest.restaurantId, mode).subscribe({
      next: () => {
        this.isUpdatingSelfOrdering.set(false);
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.isUpdatingSelfOrdering.set(false);
        this.errorMessage.set(err?.error?.message || err?.message || 'Failed to update self-ordering mode.');
      },
    });
  }

  // --- 2. Extra Catalogue Actions ---
  initializeExtraCatalogue(): void {
    const rest = this.restaurant();
    if (!rest || this.isUpdatingExtraCatalogue()) return;

    this.isUpdatingExtraCatalogue.set(true);
    this.errorMessage.set(null);

    this.restaurantService.initializeExtraCatalogue(rest.restaurantId).subscribe({
      next: () => {
        this.isUpdatingExtraCatalogue.set(false);
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.isUpdatingExtraCatalogue.set(false);
        this.errorMessage.set(err?.error?.message || err?.message || 'Failed to initialize extra catalogue.');
      },
    });
  }

  toggleExtraCatalogueSwitch(): void {
    const rest = this.restaurant();
    if (!rest || this.isUpdatingExtraCatalogue()) return;

    this.isUpdatingExtraCatalogue.set(true);
    this.errorMessage.set(null);

    const isCurrentlyEnabled = rest.extraCatalogueSetting?.isEnabled;
    const action$ = isCurrentlyEnabled
      ? this.restaurantService.disableExtraCatalogue(rest.restaurantId)
      : this.restaurantService.enableExtraCatalogue(rest.restaurantId);

    action$.subscribe({
      next: () => {
        this.isUpdatingExtraCatalogue.set(false);
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.isUpdatingExtraCatalogue.set(false);
        this.errorMessage.set(err?.error?.message || err?.message || 'Failed to toggle extra catalogue.');
      },
    });
  }

  // --- 3. Tip Options Actions ---
  toggleShowTips(event: Event): void {
    const rest = this.restaurant();
    if (!rest || this.isUpdatingTips()) return;
    const target = event.target as HTMLInputElement;
    const showTips = target.checked;

    this.isUpdatingTips.set(true);
    this.tipError.set(null);

    this.restaurantService.setShowTips(rest.restaurantId, showTips).subscribe({
      next: () => {
        this.isUpdatingTips.set(false);
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.isUpdatingTips.set(false);
        this.tipError.set(err?.error?.message || err?.message || 'Failed to update tip display setting.');
      },
    });
  }

  addTipHint(): void {
    const rest = this.restaurant();
    if (!rest || this.isUpdatingTips() || this.newTipHintInput == null) return;

    const val = Number(this.newTipHintInput);
    if (val < 1 || val > 100) {
      this.tipError.set('Tip percentage must be between 1 and 100.');
      return;
    }

    this.isUpdatingTips.set(true);
    this.tipError.set(null);

    this.restaurantService.addTipHint(rest.restaurantId, val).subscribe({
      next: () => {
        this.newTipHintInput = null;
        this.isUpdatingTips.set(false);
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.isUpdatingTips.set(false);
        this.tipError.set(err?.error?.message || err?.message || 'Failed to add tip hint.');
      },
    });
  }

  removeTipHint(tipHint: number): void {
    const rest = this.restaurant();
    if (!rest || this.isUpdatingTips()) return;

    this.isUpdatingTips.set(true);
    this.tipError.set(null);

    this.restaurantService.removeTipHint(rest.restaurantId, tipHint).subscribe({
      next: () => {
        this.isUpdatingTips.set(false);
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.isUpdatingTips.set(false);
        this.tipError.set(err?.error?.message || err?.message || 'Failed to remove tip hint.');
      },
    });
  }

  setDefaultTipHint(tipHint: number): void {
    const rest = this.restaurant();
    if (!rest || this.isUpdatingTips()) return;

    this.isUpdatingTips.set(true);
    this.tipError.set(null);

    this.restaurantService.setDefaultTipHint(rest.restaurantId, tipHint).subscribe({
      next: () => {
        this.isUpdatingTips.set(false);
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.isUpdatingTips.set(false);
        this.tipError.set(err?.error?.message || err?.message || 'Failed to set default tip hint.');
      },
    });
  }

  removeDefaultTipHint(): void {
    const rest = this.restaurant();
    if (!rest || this.isUpdatingTips()) return;

    this.isUpdatingTips.set(true);
    this.tipError.set(null);

    this.restaurantService.setNoDefaultTipHint(rest.restaurantId).subscribe({
      next: () => {
        this.isUpdatingTips.set(false);
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.isUpdatingTips.set(false);
        this.tipError.set(err?.error?.message || err?.message || 'Failed to clear default tip hint.');
      },
    });
  }

  resetTipsHints(): void {
    const rest = this.restaurant();
    if (!rest || this.isUpdatingTips()) return;

    this.isUpdatingTips.set(true);
    this.tipError.set(null);

    this.restaurantService.resetTipsHints(rest.restaurantId).subscribe({
      next: () => {
        this.isUpdatingTips.set(false);
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.isUpdatingTips.set(false);
        this.tipError.set(err?.error?.message || err?.message || 'Failed to reset tip hints.');
      },
    });
  }

  // --- 4. Seating Fee Actions ---
  saveSeatingFee(): void {
    const rest = this.restaurant();
    if (!rest || this.isUpdatingSeatingFee() || this.newSeatingFeeInput == null) return;

    const fee = Number(this.newSeatingFeeInput);
    if (fee < 0) {
      this.seatingFeeError.set('Seating fee must be non-negative.');
      return;
    }

    this.isUpdatingSeatingFee.set(true);
    this.seatingFeeError.set(null);

    this.restaurantService.setSeatingFee(rest.restaurantId, fee).subscribe({
      next: () => {
        this.isUpdatingSeatingFee.set(false);
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.isUpdatingSeatingFee.set(false);
        this.seatingFeeError.set(err?.error?.message || err?.message || 'Failed to set seating fee.');
      },
    });
  }

  // --- 5. VAT Department Codes & Rates Actions ---
  addVatDepartment(): void {
    const rest = this.restaurant();
    if (!rest || this.isUpdatingVat() || !this.newVatCodeInput.trim() || this.newVatRateInput == null) return;

    const code = this.newVatCodeInput.trim();
    const rate = Number(this.newVatRateInput);

    if (rate < 0 || rate > 99) {
      this.vatError.set('VAT rate must be between 0% and 99%.');
      return;
    }

    this.isUpdatingVat.set(true);
    this.vatError.set(null);

    this.restaurantService.addExtraVatDepartment(rest.restaurantId, { code, rate }).subscribe({
      next: () => {
        this.newVatCodeInput = '';
        this.newVatRateInput = null;
        this.isUpdatingVat.set(false);
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.isUpdatingVat.set(false);
        this.vatError.set(err?.error?.message || err?.message || 'Failed to add VAT department.');
      },
    });
  }

  removeVatDepartment(code: string): void {
    const rest = this.restaurant();
    if (!rest || this.isUpdatingVat()) return;

    this.isUpdatingVat.set(true);
    this.vatError.set(null);

    this.restaurantService.removeExtraVatDepartment(rest.restaurantId, code).subscribe({
      next: () => {
        this.isUpdatingVat.set(false);
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.isUpdatingVat.set(false);
        this.vatError.set(err?.error?.message || err?.message || 'Failed to remove VAT department.');
      },
    });
  }

  // --- 5. Capture Menu (AI Digitization) Actions (Matches RestaurantAdmin.razor) ---
  ngOnDestroy(): void {
    this.stopCamera();
    this.stopScanCamera();
  }

  async startCamera(): Promise<void> {
    this.cameraActive.set(true);
    this.processingStatusMessage.set(null);

    // Give Angular a moment to render the video element into DOM
    await new Promise((resolve) => setTimeout(resolve, 100));

    const videoEl = document.querySelector<HTMLVideoElement>('#menuVideo');
    if (!videoEl) {
      this.processingStatusMessage.set('Camera error: Video element not found.');
      this.cameraActive.set(false);
      return;
    }

    try {
      videoEl.muted = true;
      videoEl.playsInline = true;
      videoEl.setAttribute('playsinline', '');
      videoEl.setAttribute('muted', '');

      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      this.videoStream = stream;
      videoEl.srcObject = stream;
      try {
        await videoEl.play();
      } catch {
        videoEl.onloadedmetadata = async () => {
          try {
            await videoEl.play();
          } catch {}
        };
      }
    } catch (err: any) {
      this.cameraActive.set(false);
      this.processingStatusMessage.set(`Camera access failed: ${err?.message || err}`);
    }
  }

  stopCamera(): void {
    if (this.videoStream) {
      this.videoStream.getTracks().forEach((track) => track.stop());
      this.videoStream = null;
    }
    const videoEl = document.querySelector<HTMLVideoElement>('#menuVideo');
    if (videoEl) {
      videoEl.srcObject = null;
    }
    this.cameraActive.set(false);
  }

  clearPreview(): void {
    this.capturedImage.set(null);
    this.processingStatusMessage.set(null);
  }

  async captureFrame(): Promise<void> {
    this.processingStatusMessage.set(null);
    const videoEl = document.querySelector<HTMLVideoElement>('#menuVideo');
    if (!videoEl || videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
      this.processingStatusMessage.set('Error: Camera video feed is not ready.');
      return;
    }

    try {
      let width = videoEl.videoWidth;
      let height = videoEl.videoHeight;
      const limit = 1600;
      if (width > limit || height > limit) {
        if (width > height) {
          height = Math.round((height * limit) / width);
          width = limit;
        } else {
          width = Math.round((width * limit) / height);
          height = limit;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        this.processingStatusMessage.set('Error creating image canvas.');
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(videoEl, 0, 0, width, height);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      if (!dataUrl) {
        this.processingStatusMessage.set('Failed to capture frame from video.');
        return;
      }

      this.capturedImage.set(dataUrl);
      await this.processMenuImageDataUrl(dataUrl);
    } catch (err: any) {
      this.isProcessingImage.set(false);
      this.processingStatusMessage.set(`Error: ${err?.message || err}`);
    }
  }

  async handleMenuImageFileUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.processingStatusMessage.set(null);

    // Stop active camera preview if any
    if (this.cameraActive()) {
      this.stopCamera();
    }

    try {
      const dataUrl = await this.readFileAndResize(file, 1600, 0.85);
      input.value = '';
      this.capturedImage.set(dataUrl);
      await this.processMenuImageDataUrl(dataUrl);
    } catch (err: any) {
      input.value = '';
      this.isProcessingImage.set(false);
      this.processingStatusMessage.set(`File reading error: ${err?.message || err}`);
    }
  }

  private readFileAndResize(file: File, maxDimension: number, quality: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.onload = () => {
        const result = reader.result as string;
        const img = new Image();
        img.onerror = () => reject(new Error('Failed to load image for processing.'));
        img.onload = () => {
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(result);
            return;
          }
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          const resizedDataUrl = canvas.toDataURL(mime, quality);
          resolve(resizedDataUrl);
        };
        img.src = result;
      };
      reader.readAsDataURL(file);
    });
  }

  private async processMenuImageDataUrl(dataUrl: string): Promise<void> {
    const commaIndex = dataUrl.indexOf(',');
    if (commaIndex < 0) {
      this.processingStatusMessage.set('Invalid image data URL.');
      return;
    }

    const header = dataUrl.substring(0, commaIndex);
    const base64Data = dataUrl.substring(commaIndex + 1);
    let mimeType = 'image/jpeg';
    const match = header.match(/data:(.*?);base64/);
    if (match && match[1]) {
      mimeType = match[1];
    }

    const rest = this.restaurant();
    if (!rest) {
      this.processingStatusMessage.set('Restaurant not loaded.');
      return;
    }

    this.isProcessingImage.set(true);
    this.processingStatusMessage.set('Analyzing menu image with AI...');

    const aiObs$ = this.resolveComposition()
      ? this.restaurantService.interpretMenuResolvingComposition(base64Data, mimeType)
      : this.restaurantService.interpretMenu(base64Data, mimeType);

    aiObs$.subscribe({
      next: async (menuItems) => {
        if (!Array.isArray(menuItems) || menuItems.length === 0) {
          this.processingStatusMessage.set('No items detected by AI in the captured image.');
          this.isProcessingImage.set(false);
          return;
        }

        this.processingStatusMessage.set(`Adding ${menuItems.length} items to menu...`);

        let addSuccess = true;
        for (const item of menuItems) {
          try {
            await new Promise<void>((resolve, reject) => {
              this.restaurantService.addMenuItem(rest.restaurantId, item).subscribe({
                next: () => resolve(),
                error: (err) => reject(err),
              });
            });

            // Set human reviewed to false as in Blazor RestaurantAdmin.razor
            await new Promise<void>((resolve, reject) => {
              this.restaurantService.setHumanReviewed(rest.restaurantId, false).subscribe({
                next: () => resolve(),
                error: (err) => reject(err),
              });
            });
          } catch (err: any) {
            addSuccess = false;
            const errStr = typeof err?.error === 'string'
              ? err.error
              : err?.error?.message || err?.message || 'Error adding item';
            this.processingStatusMessage.set(`Failed to add item '${item?.name ?? item?.Name}': ${errStr}`);
            break;
          }
        }

        if (addSuccess) {
          this.processingStatusMessage.set('Menu items populated successfully!');
          this.stopCamera();
          this.loadRestaurant(rest.restaurantId, true);
        }
        this.isProcessingImage.set(false);
      },
      error: (err) => {
        this.isProcessingImage.set(false);
        const errStr = typeof err?.error === 'string'
          ? err.error
          : err?.error?.message || err?.message || 'AI interpretation failed.';
        this.processingStatusMessage.set(`AI Error: ${errStr}`);
      },
    });
  }

  // --- 6. Menu Item Row Actions (Availability, Add/Edit/Remove/Scan image, Remove item, Navigate to Edit) ---

  toggleMenuItemAvailability(item: MenuItemModel): void {
    const rest = this.restaurant();
    if (!rest || !item || this.updatingAvailabilityItems().has(item.name)) return;

    const newSet = new Set(this.updatingAvailabilityItems());
    newSet.add(item.name);
    this.updatingAvailabilityItems.set(newSet);

    const call$ = item.available
      ? this.restaurantService.setMenuItemUnavailable(rest.restaurantId, item.name)
      : this.restaurantService.setMenuItemAvailable(rest.restaurantId, item.name);

    call$.subscribe({
      next: () => {
        const s = new Set(this.updatingAvailabilityItems());
        s.delete(item.name);
        this.updatingAvailabilityItems.set(s);
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        const s = new Set(this.updatingAvailabilityItems());
        s.delete(item.name);
        this.updatingAvailabilityItems.set(s);
        this.errorMessage.set(typeof err?.error === 'string' ? err.error : (err?.message || 'Failed to update item availability.'));
      },
    });
  }

  startEditImage(itemName: string, currentUrl: string): void {
    this.editingItemName.set(itemName);
    this.tempImageUrl.set(currentUrl);
    this.imageErrorItemName.set(null);
    this.imageErrorMsg.set(null);
  }

  cancelEditImage(): void {
    this.editingItemName.set(null);
    this.tempImageUrl.set('');
    this.imageErrorItemName.set(null);
    this.imageErrorMsg.set(null);
  }

  saveImage(itemName: string): void {
    this.imageErrorItemName.set(null);
    this.imageErrorMsg.set(null);

    const url = this.tempImageUrl().trim();
    if (!url) {
      this.imageErrorItemName.set(itemName);
      this.imageErrorMsg.set('Image URL cannot be empty.');
      return;
    }

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Must start with http:// or https://');
      }
    } catch {
      this.imageErrorItemName.set(itemName);
      this.imageErrorMsg.set('Invalid absolute URL. Must start with http:// or https://');
      return;
    }

    const rest = this.restaurant();
    if (!rest) return;

    this.restaurantService.updateMenuItemImageUrl(rest.restaurantId, itemName, url).subscribe({
      next: () => {
        this.cancelEditImage();
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.imageErrorItemName.set(itemName);
        this.imageErrorMsg.set(typeof err?.error === 'string' ? err.error : (err?.message || 'Failed to update image URL.'));
      },
    });
  }

  removeImage(itemName: string): void {
    const rest = this.restaurant();
    if (!rest) return;

    this.restaurantService.removeMenuItemImageUrl(rest.restaurantId, itemName).subscribe({
      next: () => {
        this.cancelEditImage();
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.errorMessage.set(typeof err?.error === 'string' ? err.error : (err?.message || 'Failed to remove image.'));
      },
    });
  }

  async handleDirectFileUpload(event: Event, itemName: string): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const rest = this.restaurant();
    if (!rest) return;

    this.imageErrorItemName.set(null);
    this.imageErrorMsg.set(null);
    this.uploadingItemName.set(itemName);
    this.uploadingStage.set('processing');

    try {
      // 1. Client-side resize and compression to guarantee fast and reliable upload
      const dataUrl = await this.readFileAndResize(file, 960, 0.65);
      input.value = '';

      this.uploadingStage.set('uploading');

      // 2. Request Azure Storage SAS token from backend
      const cleanItemName = itemName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const extension = file.name ? file.name.substring(file.name.lastIndexOf('.')) || '.jpg' : '.jpg';
      const randomSuffix = Math.random().toString(36).substring(2, 10);
      const blobName = `${rest.restaurantId}_${cleanItemName}_${randomSuffix}${extension}`;

      const sasResponse = await new Promise<SasResponse>((resolve, reject) => {
        this.restaurantService.getUploadSasToken(blobName).subscribe({
          next: (res) => resolve(res),
          error: (err) => reject(err),
        });
      });

      if (!sasResponse || !sasResponse.uploadUrl) {
        throw new Error('Failed to retrieve upload authorization token.');
      }

      // 3. Resilient Azure Storage upload directly from browser
      const commaIdx = dataUrl.indexOf(',');
      const mime = dataUrl.substring(5, commaIdx).split(';')[0] || 'image/jpeg';
      const bstr = atob(dataUrl.substring(commaIdx + 1));
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      const blob = new Blob([u8arr], { type: mime });

      await this.uploadBlobWithRetries(blob, sasResponse.uploadUrl, 3);

      // 4. Update the menu item imageUrl in Catalogue
      await new Promise<void>((resolve, reject) => {
        this.restaurantService.updateMenuItemImageUrl(rest.restaurantId, itemName, sasResponse.publicUrl).subscribe({
          next: () => resolve(),
          error: (err) => reject(err),
        });
      });

      this.uploadingItemName.set(null);
      this.uploadingStage.set(null);
      this.loadRestaurant(rest.restaurantId, true);
    } catch (err: any) {
      input.value = '';
      this.uploadingItemName.set(null);
      this.uploadingStage.set(null);
      this.imageErrorItemName.set(itemName);
      this.imageErrorMsg.set(err?.message || 'Error uploading image.');
    }
  }

  // --- Scan Image with Camera Actions ---

  async startScanImage(itemName: string): Promise<void> {
    this.scanningItemName.set(itemName);
    this.scanError.set(null);
    this.isUploadingScan.set(false);
    this.scanStage.set(null);

    // Give Angular time to display modal and mount the #scanVideo element
    await new Promise((resolve) => setTimeout(resolve, 100));

    const videoEl = document.querySelector<HTMLVideoElement>('#scanVideo');
    if (!videoEl) {
      this.scanError.set('Camera error: Video element not found.');
      return;
    }

    try {
      videoEl.muted = true;
      videoEl.playsInline = true;
      videoEl.setAttribute('playsinline', '');
      videoEl.setAttribute('muted', '');

      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      this.scanVideoStream = stream;
      videoEl.srcObject = stream;
      try {
        await videoEl.play();
      } catch {
        videoEl.onloadedmetadata = async () => {
          try {
            await videoEl.play();
          } catch {}
        };
      }
    } catch (err: any) {
      this.scanError.set(`Camera access failed: ${err?.message || err}`);
    }
  }

  stopScanCamera(): void {
    if (this.scanVideoStream) {
      this.scanVideoStream.getTracks().forEach((track) => track.stop());
      this.scanVideoStream = null;
    }
    const videoEl = document.querySelector<HTMLVideoElement>('#scanVideo');
    if (videoEl) {
      videoEl.srcObject = null;
    }
  }

  cancelScan(): void {
    this.stopScanCamera();
    this.scanningItemName.set(null);
    this.scanError.set(null);
    this.isUploadingScan.set(false);
    this.scanStage.set(null);
  }

  async captureAndUploadScan(): Promise<void> {
    const itemName = this.scanningItemName();
    const rest = this.restaurant();
    if (!itemName || !rest) return;

    this.isUploadingScan.set(true);
    this.scanError.set(null);
    this.scanStage.set('processing');

    const videoEl = document.querySelector<HTMLVideoElement>('#scanVideo');
    if (!videoEl || videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
      this.scanError.set('Camera video feed is not ready.');
      this.isUploadingScan.set(false);
      return;
    }

    try {
      // 1. Capture frame to canvas with smart scaling (max 960px)
      let width = videoEl.videoWidth;
      let height = videoEl.videoHeight;
      const limit = 960;
      if (width > limit || height > limit) {
        if (width > height) {
          height = Math.round((height * limit) / width);
          width = limit;
        } else {
          width = Math.round((width * limit) / height);
          height = limit;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to create canvas context.');
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(videoEl, 0, 0, width, height);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
      if (!dataUrl) {
        throw new Error('Failed to capture image frame from video.');
      }

      this.scanStage.set('uploading');

      // 2. Request SAS token from backend
      const cleanItemName = itemName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const randomSuffix = Math.random().toString(36).substring(2, 10);
      const blobName = `${rest.restaurantId}_${cleanItemName}_${randomSuffix}.jpg`;

      const sasResponse = await new Promise<SasResponse>((resolve, reject) => {
        this.restaurantService.getUploadSasToken(blobName).subscribe({
          next: (res) => resolve(res),
          error: (err) => reject(err),
        });
      });

      if (!sasResponse || !sasResponse.uploadUrl) {
        throw new Error('Failed to retrieve upload authorization token.');
      }

      // 3. Upload frame blob to Azure Blob Storage with retries
      const commaIdx = dataUrl.indexOf(',');
      const bstr = atob(dataUrl.substring(commaIdx + 1));
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      const blob = new Blob([u8arr], { type: 'image/jpeg' });

      await this.uploadBlobWithRetries(blob, sasResponse.uploadUrl, 3);

      // 4. Update the menu item with the new imageUrl
      await new Promise<void>((resolve, reject) => {
        this.restaurantService.updateMenuItemImageUrl(rest.restaurantId, itemName, sasResponse.publicUrl).subscribe({
          next: () => resolve(),
          error: (err) => reject(err),
        });
      });

      this.cancelScan();
      this.loadRestaurant(rest.restaurantId, true);
    } catch (err: any) {
      this.isUploadingScan.set(false);
      this.scanStage.set(null);
      this.scanError.set(err?.message || 'Error capturing and uploading scan.');
    }
  }

  private async uploadBlobWithRetries(blob: Blob, uploadUrl: string, maxRetries = 3): Promise<void> {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        attempt++;
        const res = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'x-ms-blob-type': 'BlockBlob',
            'Content-Type': blob.type || 'image/jpeg',
          },
          body: blob,
        });

        if (res.ok) {
          return;
        }
        if (attempt >= maxRetries) {
          const bodyText = await res.text().catch(() => '');
          throw new Error(`Upload failed with status ${res.status}: ${bodyText || res.statusText}`);
        }
      } catch (e: any) {
        if (attempt >= maxRetries) {
          throw e;
        }
      }
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  // --- Remove Menu Item Confirmation Actions ---

  openRemoveItemConfirmation(itemName: string): void {
    if (this.hasOrderForMenuItem(itemName)) return;
    this.itemToRemoveName.set(itemName);
    this.showRemoveItemConsentModal.set(true);
  }

  cancelRemoveItem(): void {
    this.showRemoveItemConsentModal.set(false);
    this.itemToRemoveName.set(null);
  }

  confirmRemoveItem(): void {
    const itemName = this.itemToRemoveName();
    const rest = this.restaurant();
    if (!itemName || !rest) return;

    this.isRemovingItem.set(true);
    this.restaurantService.removeMenuItem(rest.restaurantId, itemName).subscribe({
      next: () => {
        this.isRemovingItem.set(false);
        this.showRemoveItemConsentModal.set(false);
        this.itemToRemoveName.set(null);
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.isRemovingItem.set(false);
        this.errorMessage.set(typeof err?.error === 'string' ? err.error : (err?.message || 'Failed to remove menu item.'));
      },
    });
  }

  hasOrderForMenuItem(itemName: string): boolean {
    const rest = this.restaurant();
    if (!rest || !rest.parsedTables) return false;
    for (const table of rest.parsedTables) {
      if (table.sessions) {
        for (const session of table.sessions) {
          if (session.items && session.items.some((i) => i.dishName === itemName)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  // --- Navigation to Edit Menu Item Translations ---

  navigateToEditItem(categoryName: string, itemOrderIndex: number): void {
    const rest = this.restaurant();
    if (!rest) return;
    const uncategorizedLabel = this.loc.translate('RestAdmin_Uncategorized').toLowerCase();
    const isUncategorized = !categoryName || categoryName.trim().length === 0 || categoryName.toLowerCase() === uncategorizedLabel || categoryName.toLowerCase() === 'uncategorized';
    const categoryParam = isUncategorized ? 'uncategorized' : encodeURIComponent(categoryName.trim());
    this.router.navigate(['/restaurantsAdmin', rest.restaurantId, 'editMenuItem', categoryParam, itemOrderIndex]);
  }

  // --- HTML5 Drag and Drop Reordering (matching RestaurantAdmin.razor) ---

  private getCategoryOrderIndex(categoryName: string | null): number {
    const rest = this.restaurant();
    if (!rest) return 9999;
    const categoriesOrdering = rest.categoriesOrdering || {};
    const lower = (categoryName || '').trim().toLowerCase();
    for (const key of Object.keys(categoriesOrdering)) {
      const idx = Number(key);
      const val = categoriesOrdering[idx];
      const valLower = (val || '').trim().toLowerCase();
      if (valLower === lower) {
        return idx;
      }
    }
    return 9999;
  }

  handleCategoryDragStart(event: DragEvent, categoryName: string): void {
    this.draggedCategoryGroup.set(categoryName);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', `category:${categoryName}`);
    }
  }

  handleCategoryDragOver(event: DragEvent, categoryName: string): void {
    if (this.draggedCategoryGroup() && this.draggedCategoryGroup() !== categoryName) {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
      this.dragOverCategory.set(categoryName);
    }
  }

  handleCategoryDragLeave(event: DragEvent, categoryName: string): void {
    if (this.dragOverCategory() === categoryName) {
      this.dragOverCategory.set(null);
    }
  }

  handleCategoryDrop(event: DragEvent, targetCategoryName: string): void {
    event.preventDefault();
    this.dragOverCategory.set(null);

    const sourceCategory = this.draggedCategoryGroup();
    this.draggedCategoryGroup.set(null);

    if (!sourceCategory || sourceCategory === targetCategoryName) {
      return;
    }

    const rest = this.restaurant();
    if (!rest) return;

    const uncategorizedLabel = this.loc.translate('RestAdmin_Uncategorized').toLowerCase();
    const isSourceUncategorized = !sourceCategory || sourceCategory.trim().toLowerCase() === uncategorizedLabel || sourceCategory.trim().toLowerCase() === 'uncategorized';
    const isTargetUncategorized = !targetCategoryName || targetCategoryName.trim().toLowerCase() === uncategorizedLabel || targetCategoryName.trim().toLowerCase() === 'uncategorized';

    const sourceCatParam = isSourceUncategorized ? null : sourceCategory.trim();
    const targetCatParam = isTargetUncategorized ? null : targetCategoryName.trim();

    const currentPos = this.getCategoryOrderIndex(sourceCatParam);
    const nextPos = this.getCategoryOrderIndex(targetCatParam);

    if (currentPos === 9999 || nextPos === 9999) return;

    this.menuResetErrorMessage.set(null);
    this.restaurantService.moveCategory(rest.restaurantId, sourceCatParam, currentPos, nextPos).subscribe({
      next: () => {
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.menuResetErrorMessage.set(typeof err?.error === 'string' ? err.error : (err?.message || 'Failed to move category.'));
      },
    });
  }

  handleItemDragStart(event: DragEvent, categoryName: string, index: number): void {
    this.draggedCategory.set(categoryName);
    this.draggedIndex.set(index);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', `item:${categoryName}:${index}`);
    }
  }

  handleItemDragOver(event: DragEvent, targetCategoryName: string, targetIndex: number): void {
    if (this.draggedIndex() !== null && this.draggedCategory() === targetCategoryName && this.draggedIndex() !== targetIndex) {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
      this.dragOverItemKey.set(`${targetCategoryName}-${targetIndex}`);
    }
  }

  handleItemDragLeave(event: DragEvent, targetCategoryName: string, targetIndex: number): void {
    if (this.dragOverItemKey() === `${targetCategoryName}-${targetIndex}`) {
      this.dragOverItemKey.set(null);
    }
  }

  handleItemDrop(event: DragEvent, targetCategoryName: string, targetIndex: number): void {
    event.preventDefault();
    this.dragOverItemKey.set(null);

    const sourceCategory = this.draggedCategory();
    const sourceIndex = this.draggedIndex();

    this.draggedCategory.set(null);
    this.draggedIndex.set(null);

    if (sourceIndex === null || sourceCategory !== targetCategoryName || sourceIndex === targetIndex) {
      return;
    }

    const rest = this.restaurant();
    if (!rest || !rest.items) return;

    const uncategorizedLabel = this.loc.translate('RestAdmin_Uncategorized').toLowerCase();
    const isTargetUncategorized = !targetCategoryName || targetCategoryName.trim().toLowerCase() === uncategorizedLabel || targetCategoryName.trim().toLowerCase() === 'uncategorized';

    const itemEntry = rest.items.find((item) => {
      const itemCat = (item.category || '').trim();
      const matchCat = isTargetUncategorized
        ? (!itemCat || itemCat.toLowerCase() === uncategorizedLabel || itemCat.toLowerCase() === 'uncategorized')
        : (itemCat.toLowerCase() === targetCategoryName.trim().toLowerCase());
      return matchCat && item.orderIndex === sourceIndex;
    });

    if (!itemEntry) return;

    this.menuResetErrorMessage.set(null);
    this.restaurantService.moveMenuItem(rest.restaurantId, itemEntry.name, sourceIndex, targetIndex).subscribe({
      next: () => {
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.menuResetErrorMessage.set(typeof err?.error === 'string' ? err.error : (err?.message || 'Failed to move menu item.'));
      },
    });
  }

  // --- Category Renaming (matching RestaurantAdmin.razor) ---

  startCategoryRename(categoryName: string, isSome: boolean): void {
    if (!isSome) return;
    this.editingCategoryName.set(categoryName);
    this.editingCategoryValue.set(categoryName);
  }

  cancelCategoryRename(): void {
    this.editingCategoryName.set(null);
    this.editingCategoryValue.set('');
  }

  handleCategoryRenameKeyUp(event: KeyboardEvent, oldCategoryName: string): void {
    if (event.key === 'Enter') {
      this.saveCategoryRename(oldCategoryName);
    } else if (event.key === 'Escape') {
      this.cancelCategoryRename();
    }
  }

  saveCategoryRename(oldCategoryName: string): void {
    if (!oldCategoryName) return;
    const newName = this.editingCategoryValue().trim();
    if (!newName) {
      this.menuResetErrorMessage.set('Category name cannot be empty.');
      return;
    }

    if (newName === oldCategoryName) {
      this.cancelCategoryRename();
      return;
    }

    const rest = this.restaurant();
    if (!rest) return;

    this.menuResetErrorMessage.set(null);
    this.restaurantService.renameCategory(rest.restaurantId, oldCategoryName, newName).subscribe({
      next: () => {
        this.cancelCategoryRename();
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.menuResetErrorMessage.set(typeof err?.error === 'string' ? err.error : (err?.message || 'Failed to rename category.'));
      },
    });
  }

  // --- Menu Management (Create/Clone, Switch, Drop - matching RestaurantAdmin.razor) ---

  openCreateMenuModal(): void {
    this.createMenuError.set(null);
    this.newMenuNameInput.set('');
    this.isCloneMenuSelected.set(false);
    this.isCreatingMenu.set(false);
    this.showCreateMenuModal.set(true);
  }

  closeCreateMenuModal(): void {
    if (this.isCreatingMenu()) return;
    this.showCreateMenuModal.set(false);
    this.createMenuError.set(null);
  }

  submitCreateMenu(): void {
    const rest = this.restaurant();
    const name = this.newMenuNameInput().trim();
    if (!rest || !name || this.isCreatingMenu()) return;

    this.isCreatingMenu.set(true);
    this.createMenuError.set(null);

    const isClone = this.isCloneMenuSelected();
    const action$ = isClone
      ? this.restaurantService.cloneCurrentMenu(rest.restaurantId, name)
      : this.restaurantService.addNewMenu(rest.restaurantId, name);

    action$.subscribe({
      next: () => {
        this.showCreateMenuModal.set(false);
        this.isCreatingMenu.set(false);

        // Reload restaurant to get updated menus
        this.restaurantService.getRestaurant(rest.restaurantId).subscribe({
          next: (updatedRest) => {
            this.restaurant.set(updatedRest);

            let foundTuple: [number, string] | null = null;
            if (updatedRest.otherAvailableMenus && updatedRest.otherAvailableMenus.length > 0) {
              const match = [...updatedRest.otherAvailableMenus].reverse().find((t) => t[1] === name);
              foundTuple = match || updatedRest.otherAvailableMenus[updatedRest.otherAvailableMenus.length - 1];
            }

            if (foundTuple) {
              this.createdMenuTuple.set(foundTuple);
              this.switchMenuError.set(null);
              this.showSwitchMenuPromptModal.set(true);
            }
          },
          error: (err) => {
            this.errorMessage.set(typeof err?.error === 'string' ? err.error : (err?.message || 'Failed to reload restaurant details.'));
          },
        });
      },
      error: (err) => {
        this.isCreatingMenu.set(false);
        this.createMenuError.set(typeof err?.error === 'string' ? err.error : (err?.message || 'Failed to create menu.'));
      },
    });
  }

  stayInCurrentMenu(): void {
    if (this.isSwitchingMenu()) return;
    this.showSwitchMenuPromptModal.set(false);
    this.createdMenuTuple.set(null);
  }

  switchToNewlyCreatedMenu(): void {
    const tuple = this.createdMenuTuple();
    if (!tuple) return;

    const rest = this.restaurant();
    if (rest?.hasActiveOrders) return;

    this.isSwitchingMenu.set(true);
    this.targetSwitchMenuIdx.set(tuple[0]);
    this.switchMenuError.set(null);

    this.restaurantService.switchToMenu(rest!.restaurantId, tuple[0]).subscribe({
      next: () => {
        this.isSwitchingMenu.set(false);
        this.targetSwitchMenuIdx.set(null);
        this.showSwitchMenuPromptModal.set(false);
        this.createdMenuTuple.set(null);
        this.loadRestaurant(rest!.restaurantId, true);
      },
      error: (err) => {
        this.isSwitchingMenu.set(false);
        this.targetSwitchMenuIdx.set(null);
        this.switchMenuError.set(typeof err?.error === 'string' ? err.error : (err?.message || 'Failed to switch to new menu.'));
      },
    });
  }

  switchToSelectedMenu(menuIdx: number): void {
    const rest = this.restaurant();
    if (!rest || this.isSwitchingMenu() || this.isDroppingMenu() || rest.hasActiveOrders) return;

    this.isSwitchingMenu.set(true);
    this.targetSwitchMenuIdx.set(menuIdx);
    this.errorMessage.set(null);

    this.restaurantService.switchToMenu(rest.restaurantId, menuIdx).subscribe({
      next: () => {
        this.isSwitchingMenu.set(false);
        this.targetSwitchMenuIdx.set(null);
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.isSwitchingMenu.set(false);
        this.targetSwitchMenuIdx.set(null);
        this.errorMessage.set(typeof err?.error === 'string' ? err.error : (err?.message || 'Failed to switch menu.'));
      },
    });
  }

  promptDropMenu(menuIdx: number, menuName: string): void {
    const rest = this.restaurant();
    if (!rest || this.isSwitchingMenu() || this.isDroppingMenu() || menuIdx === 0) return;

    const confirmed = window.confirm(`Are you sure you want to remove menu #${menuIdx} ("${menuName}")?`);
    if (!confirmed) return;

    this.isDroppingMenu.set(true);
    this.targetDropMenuIdx.set(menuIdx);
    this.errorMessage.set(null);

    this.restaurantService.dropMenu(rest.restaurantId, menuIdx).subscribe({
      next: () => {
        this.isDroppingMenu.set(false);
        this.targetDropMenuIdx.set(null);
        this.loadRestaurant(rest.restaurantId, true);
      },
      error: (err) => {
        this.isDroppingMenu.set(false);
        this.targetDropMenuIdx.set(null);
        this.errorMessage.set(typeof err?.error === 'string' ? err.error : (err?.message || 'Failed to drop menu.'));
      },
    });
  }
}

