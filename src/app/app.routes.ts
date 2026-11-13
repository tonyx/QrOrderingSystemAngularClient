import { Routes } from '@angular/router';
import { LoginComponent } from './features/auth/login/login.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { OnboardingComponent } from './features/restaurant/onboarding/onboarding.component';
import { ManageRestaurantSubscriptionComponent } from './features/settlement/manage-restaurant-subscription/manage-restaurant-subscription.component';
import { PublicMenuComponent } from './features/menu/public-menu/public-menu.component';
import { MenuQrComponent } from './features/menu/menu-qr/menu-qr.component';
import { RestaurantAdminComponent } from './features/restaurant/restaurant-admin/restaurant-admin.component';
import { AdminTablesComponent } from './features/tables/admin-tables/admin-tables.component';
import { TableDetailComponent } from './features/tables/table-detail/table-detail.component';
import { ShowQrsComponent } from './features/tables/show-qrs/show-qrs.component';
import { EditMenuItemComponent } from './features/restaurant/edit-menu-item/edit-menu-item.component';
import { EditExtraCatalogueComponent } from './features/restaurant/edit-extra-catalogue/edit-extra-catalogue.component';
import { OrderComponent } from './features/ordering/order/order.component';
import { WaiterOrderComponent } from './features/ordering/waiter-order/waiter-order.component';
import { AllOrdersComponent } from './features/settlement/all-orders/all-orders.component';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent,
  },
  {
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [authGuard],
  },
  {
    path: 'restaurantsAdmin',
    component: DashboardComponent,
    canActivate: [authGuard],
  },
  {
    path: 'restaurantsAdmin/:restaurantId/onboarding',
    component: OnboardingComponent,
    canActivate: [authGuard],
  },
  {
    path: 'restaurantsAdmin/:restaurantId/subscription',
    component: ManageRestaurantSubscriptionComponent,
    canActivate: [authGuard],
  },
  // Menu QR Code page
  {
    path: 'restaurantsAdmin/:restaurantId/menu-qr',
    component: MenuQrComponent,
    canActivate: [authGuard],
  },
  // Table Management pages
  {
    path: 'restaurantsAdmin/:restaurantId/orders',
    component: AllOrdersComponent,
    canActivate: [authGuard],
  },
  {
    path: 'restaurantsAdmin/:restaurantId/tables',
    component: AdminTablesComponent,
    canActivate: [authGuard],
  },
  {
    path: 'restaurantsAdmin/:restaurantId/table/:tableNumber',
    component: TableDetailComponent,
    canActivate: [authGuard],
  },
  {
    path: 'restaurantsAdmin/:restaurantId/qrs',
    component: ShowQrsComponent,
    canActivate: [authGuard],
  },
  // Extra Catalogue page
  {
    path: 'restaurantsAdmin/:restaurantId/extra-catalogue',
    component: EditExtraCatalogueComponent,
    canActivate: [authGuard],
  },
  // Manage Menu page
  {
    path: 'restaurantsAdmin/:restaurantId',
    component: RestaurantAdminComponent,
    canActivate: [authGuard],
  },
  // Edit Menu Item Translations page (matches Blazor /restaurantsAdmin/{id}/editMenuItem/{category}/{index})
  {
    path: 'restaurantsAdmin/:restaurantId/editMenuItem/:categoryParam/:index',
    component: EditMenuItemComponent,
    canActivate: [authGuard],
  },
  // Public Menu routes matching Blazor (/m/:restaurantId and /m)
  {
    path: 'm/:restaurantId',
    component: PublicMenuComponent,
  },
  {
    path: 'm',
    component: PublicMenuComponent,
  },
  // Customer Table Ordering route matching Blazor (/order)
  {
    path: 'order',
    component: OrderComponent,
  },
  // Waiter Table Ordering route matching Blazor (/waiter-order)
  {
    path: 'waiter-order',
    component: WaiterOrderComponent,
    canActivate: [authGuard],
  },
  {
    path: '',
    redirectTo: 'restaurantsAdmin',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'restaurantsAdmin',
  },
];
