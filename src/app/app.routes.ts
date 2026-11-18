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
import { ManualLedgerComponent } from './features/settlement/manual-ledger/manual-ledger.component';
import { EpaymentsComponent } from './features/settlement/epayments/epayments.component';
import { RestaurantMembersComponent } from './features/restaurant/restaurant-members/restaurant-members.component';
import { RestaurantCidrComponent } from './features/restaurant/restaurant-cidr/restaurant-cidr.component';
import { RestaurantHistoryComponent } from './features/restaurant/restaurant-history/restaurant-history.component';
import { RestaurantGeoLocComponent } from './features/restaurant/restaurant-geoloc/restaurant-geoloc.component';
import { InventorySettingsComponent } from './features/restaurant/inventory-settings/inventory-settings.component';
import { CustomerGroupPaymentComponent } from './features/settlement/customer-group-payment/customer-group-payment.component';
import { WaiterViewPaymentQrsComponent } from './features/settlement/waiter-view-payment-qrs/waiter-view-payment-qrs.component';
import { PrintPaymentReceiptsComponent } from './features/settlement/print-payment-receipts/print-payment-receipts.component';
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
  // Restaurant Members page matching Blazor (@page "/restaurantsAdmin/{RestaurantId}/members")
  {
    path: 'restaurantsAdmin/:restaurantId/members',
    component: RestaurantMembersComponent,
    canActivate: [authGuard],
  },
  // Restaurant CIDR restriction page matching Blazor (@page "/restaurantsAdmin/{RestaurantId}/cidr")
  {
    path: 'restaurantsAdmin/:restaurantId/cidr',
    component: RestaurantCidrComponent,
    canActivate: [authGuard],
  },
  // Restaurant History page matching Blazor (@page "/restaurantsAdmin/{RestaurantId}/history")
  {
    path: 'restaurantsAdmin/:restaurantId/history',
    component: RestaurantHistoryComponent,
    canActivate: [authGuard],
  },
  // Restaurant Geolocation page matching Blazor (@page "/restaurantsAdmin/{RestaurantId}/geoloc" and "/coordinates")
  {
    path: 'restaurantsAdmin/:restaurantId/geoloc',
    component: RestaurantGeoLocComponent,
    canActivate: [authGuard],
  },
  {
    path: 'restaurantsAdmin/:restaurantId/coordinates',
    component: RestaurantGeoLocComponent,
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
  // Inventory Settings pages matching Blazor (@page "/restaurantsAdmin/{RestaurantId}/inventory-settings", "/restaurantsAdmin/{RestaurantId}/inventory")
  {
    path: 'restaurantsAdmin/:restaurantId/inventory-settings',
    component: InventorySettingsComponent,
    canActivate: [authGuard],
  },
  {
    path: 'restaurantsAdmin/:restaurantId/inventory',
    component: InventorySettingsComponent,
    canActivate: [authGuard],
  },
  {
    path: 'inventory-settings/:restaurantId',
    component: InventorySettingsComponent,
    canActivate: [authGuard],
  },
  {
    path: 'inventory-settings',
    component: InventorySettingsComponent,
    canActivate: [authGuard],
  },
  // Extra Catalogue page
  {
    path: 'restaurantsAdmin/:restaurantId/extra-catalogue',
    component: EditExtraCatalogueComponent,
    canActivate: [authGuard],
  },
  // Manual Ledger pages matching Blazor (@page "/restaurantsAdmin/{RestaurantId}/manual-ledger", "/manualLedger/{RestaurantId}", "/manualLedger")
  {
    path: 'restaurantsAdmin/:restaurantId/manual-ledger',
    component: ManualLedgerComponent,
    canActivate: [authGuard],
  },
  {
    path: 'manualLedger/:restaurantId',
    component: ManualLedgerComponent,
    canActivate: [authGuard],
  },
  {
    path: 'manualLedger',
    component: ManualLedgerComponent,
    canActivate: [authGuard],
  },
  // E-Payments pages matching Blazor (@page "/restaurantsAdmin/{RestaurantId}/epayments", "/epayments/{RestaurantId}", "/epayments")
  {
    path: 'restaurantsAdmin/:restaurantId/epayments',
    component: EpaymentsComponent,
    canActivate: [authGuard],
  },
  {
    path: 'epayments/:restaurantId',
    component: EpaymentsComponent,
    canActivate: [authGuard],
  },
  {
    path: 'epayments',
    component: EpaymentsComponent,
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
  // Split bill payment group checkout matching Blazor (@page "/pay/group/{GroupId}")
  {
    path: 'pay/group/:groupId',
    component: CustomerGroupPaymentComponent,
  },
  // Waiter Showcase of group payment QRs matching Blazor (@page "/waiter/table/{TableNum:int}/payment-groups/{SetId}")
  {
    path: 'waiter/table/:tableNum/payment-groups/:setId',
    component: WaiterViewPaymentQrsComponent,
    canActivate: [authGuard],
  },
  // Thermal print pre-bills and payment QRs matching Blazor (@page "/restaurantsAdmin/{RestaurantId}/table/{TableNum:int}/payment-groups/{SetId}/print")
  {
    path: 'restaurantsAdmin/:restaurantId/table/:tableNum/payment-groups/:setId/print',
    component: PrintPaymentReceiptsComponent,
    canActivate: [authGuard],
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
