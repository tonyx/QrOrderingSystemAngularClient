import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LocPipe } from '../../../core/pipes/loc.pipe';
import { LocalizationService } from '../../../core/services/localization.service';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { RestaurantItem } from '../../../core/models/restaurant.models';
import { MenuItemModel, MenuItemTranslation } from '../../../core/models/menu.models';
import { MainLayoutComponent } from '../../../shared/components/main-layout/main-layout.component';

interface TranslationRowModel {
  langCode: string;
  name: string;
  description: string;
  allergens: string;
}

@Component({
  selector: 'app-edit-menu-item',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, MainLayoutComponent, LocPipe],
  templateUrl: './edit-menu-item.component.html',
  styleUrls: ['./edit-menu-item.component.css'],
})
export class EditMenuItemComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly restaurantService = inject(RestaurantService);
  private readonly loc = inject(LocalizationService);

  restaurantId = signal<string>('');
  categoryParam = signal<string>('');
  index = signal<number>(0);

  restaurant = signal<RestaurantItem | null>(null);
  menuItem = signal<MenuItemModel | null>(null);
  categoryName = signal<string | null>(null);

  loading = signal<boolean>(true);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  // Price editing
  editedPrice = signal<number>(0);
  isSavingPrice = signal<boolean>(false);

  // Multilingual translations
  translationRows = signal<TranslationRowModel[]>([]);
  savingLanguages = signal<Set<string>>(new Set<string>());

  ngOnInit(): void {
    const rId = this.route.snapshot.paramMap.get('restaurantId') || '';
    const cat = this.route.snapshot.paramMap.get('categoryParam') || '';
    const idx = parseInt(this.route.snapshot.paramMap.get('index') || '0', 10);

    this.restaurantId.set(rId);
    this.categoryParam.set(cat);
    this.index.set(isNaN(idx) ? 0 : idx);

    if (!rId) {
      this.errorMessage.set(this.loc.translate('EditMenuItem_InvalidRestaurantId'));
      this.loading.set(false);
      return;
    }

    const decodedCategory = !cat || cat.toLowerCase() === 'uncategorized' ? null : decodeURIComponent(cat);
    this.categoryName.set(decodedCategory);

    this.loadItem();
  }

  loadItem(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.restaurantService.getRestaurant(this.restaurantId()).subscribe({
      next: (rest) => {
        this.restaurant.set(rest);
        this.loading.set(false);

        const targetIndex = this.index();
        const targetCategory = this.categoryName()?.trim().toLowerCase();
        const uncategorizedLabel = this.loc.translate('RestAdmin_Uncategorized').toLowerCase();

        const match = (rest.items || []).find((it) => {
          const itemCat = (it.category || '').trim().toLowerCase();
          const matchesCategory = targetCategory
            ? itemCat === targetCategory
            : !itemCat || itemCat === 'uncategorized' || itemCat === uncategorizedLabel;
          return matchesCategory && it.orderIndex === targetIndex;
        });

        if (match) {
          this.menuItem.set(match);
          this.editedPrice.set(match.price != null ? match.price : 0);

          // Build translation rows (default cultures 'en', 'it', plus existing ones)
          const allLangs = new Set<string>(['en', 'it']);
          if (match.translations) {
            Object.keys(match.translations).forEach((k) => allLangs.add(k.toLowerCase()));
          }
          if (match.allergens) {
            Object.keys(match.allergens).forEach((k) => allLangs.add(k.toLowerCase()));
          }

          const rows: TranslationRowModel[] = [];
          allLangs.forEach((lang) => {
            const trans = match.translations?.[lang];
            const allergens = match.allergens?.[lang] || '';
            rows.push({
              langCode: lang,
              name: trans?.name || (lang === 'en' ? match.name : ''),
              description: trans?.description || (lang === 'en' ? match.description : ''),
              allergens,
            });
          });

          this.translationRows.set(rows);
        } else {
          this.menuItem.set(null);
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(typeof err?.error === 'string' ? err.error : (err?.message || 'Failed to load restaurant details.'));
      },
    });
  }

  savePrice(): void {
    const item = this.menuItem();
    if (!item) return;

    const price = this.editedPrice();
    if (price < 0) {
      this.errorMessage.set(this.loc.translate('EditMenuItem_PriceMustBeGreaterThanZero'));
      return;
    }

    this.isSavingPrice.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.restaurantService
      .updateMenuItemPrice(this.restaurantId(), this.categoryName(), this.index(), price)
      .subscribe({
        next: () => {
          this.isSavingPrice.set(false);
          this.successMessage.set(this.loc.translate('EditMenuItem_PriceUpdatedSuccessfully'));
          this.loadItem();
        },
        error: (err) => {
          this.isSavingPrice.set(false);
          const errDetail = typeof err?.error === 'string' ? err.error : (err?.message || 'Error');
          this.errorMessage.set(this.loc.translate('EditMenuItem_FailedToUpdatePrice', errDetail));
        },
      });
  }

  saveTranslation(row: TranslationRowModel): void {
    const item = this.menuItem();
    if (!item) return;

    const lang = row.langCode;
    const newSet = new Set(this.savingLanguages());
    newSet.add(lang);
    this.savingLanguages.set(newSet);

    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.restaurantService
      .updateMenuItemTranslation(
        this.restaurantId(),
        this.categoryName(),
        this.index(),
        lang,
        row.name,
        row.description,
        row.allergens
      )
      .subscribe({
        next: () => {
          const s = new Set(this.savingLanguages());
          s.delete(lang);
          this.savingLanguages.set(s);
          this.successMessage.set(this.loc.translate('EditMenuItem_TranslationUpdatedSuccessfully', lang));
          this.loadItem();
        },
        error: (err) => {
          const s = new Set(this.savingLanguages());
          s.delete(lang);
          this.savingLanguages.set(s);
          const errDetail = typeof err?.error === 'string' ? err.error : (err?.message || 'Error');
          this.errorMessage.set(this.loc.translate('EditMenuItem_FailedToUpdateTranslation', errDetail));
        },
      });
  }

  navigateBack(): void {
    this.router.navigate(['/restaurantsAdmin', this.restaurantId()]);
  }
}
