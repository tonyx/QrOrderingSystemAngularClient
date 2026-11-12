import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { LocPipe } from '../../../core/pipes/loc.pipe';
import { PublicRestaurantDetails, MenuItemModel } from '../../../core/models/menu.models';

interface CategoryGroup {
  category: string;
  items: MenuItemModel[];
}

@Component({
  selector: 'app-public-menu',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LocPipe],
  templateUrl: './public-menu.component.html',
  styleUrl: './public-menu.component.css',
})
export class PublicMenuComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly restaurantService = inject(RestaurantService);

  protected restaurant = signal<PublicRestaurantDetails | null>(null);
  protected isLoading = signal<boolean>(true);
  protected errorMessage = signal<string | null>(null);

  protected selectedLang = signal<string>('default');

  // Selected item for allergen modal
  protected activeAllergenItem = signal<{ name: string; allergens: string[] } | null>(null);

  protected groupedCategories = computed<CategoryGroup[]>(() => {
    const rest = this.restaurant();
    if (!rest || !rest.items) return [];

    const map = new Map<string, MenuItemModel[]>();
    for (const item of rest.items) {
      const cat = item.category || 'Dishes';
      if (!map.has(cat)) {
        map.set(cat, []);
      }
      map.get(cat)!.push(item);
    }

    const groups: CategoryGroup[] = [];
    map.forEach((items, category) => {
      groups.push({ category, items });
    });
    return groups;
  });

  ngOnInit(): void {
    const id =
      this.route.snapshot.paramMap.get('restaurantId') ||
      this.route.snapshot.queryParamMap.get('restaurantId') ||
      '';

    if (!id) {
      this.errorMessage.set('Invalid or missing restaurant identifier.');
      this.isLoading.set(false);
      return;
    }

    this.loadPublicMenu(id);
  }

  loadPublicMenu(id: string): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.restaurantService.getRestaurantPublic(id).subscribe({
      next: (data) => {
        this.restaurant.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(
          err?.error || err?.message || 'Restaurant not found or digital menu unavailable.'
        );
      },
    });
  }

  getItemName(item: MenuItemModel): string {
    const lang = this.selectedLang();
    if (lang !== 'default' && item.translations && item.translations[lang]) {
      const t = item.translations[lang];
      return t.name || t.Name || item.name;
    }
    return item.name;
  }

  getItemDescription(item: MenuItemModel): string {
    const lang = this.selectedLang();
    if (lang !== 'default' && item.translations && item.translations[lang]) {
      const t = item.translations[lang];
      return t.description || t.Description || item.description;
    }
    return item.description;
  }

  hasAllergens(item: MenuItemModel): boolean {
    if (!item.allergens) return false;
    const keys = Object.keys(item.allergens);
    return keys.length > 0 && keys.some((k) => !!item.allergens![k]);
  }

  getAllergensList(item: MenuItemModel): string[] {
    if (!item.allergens) return [];
    const list: string[] = [];
    const lang = this.selectedLang();

    if (lang !== 'default' && item.allergens[lang]) {
      const val = item.allergens[lang];
      return val.split(',').map((s) => s.trim()).filter((s) => !!s);
    }

    Object.values(item.allergens).forEach((val) => {
      if (typeof val === 'string') {
        val.split(',').forEach((s) => {
          const trimmed = s.trim();
          if (trimmed && !list.includes(trimmed)) list.push(trimmed);
        });
      }
    });

    return list;
  }

  openAllergensModal(item: MenuItemModel): void {
    this.activeAllergenItem.set({
      name: this.getItemName(item),
      allergens: this.getAllergensList(item),
    });
  }

  closeAllergensModal(): void {
    this.activeAllergenItem.set(null);
  }
}
