import { Routes } from '@angular/router';
import { LoginComponent } from './features/auth/login/login.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { OnboardingComponent } from './features/restaurant/onboarding/onboarding.component';
import { PublicMenuComponent } from './features/menu/public-menu/public-menu.component';
import { MenuQrComponent } from './features/menu/menu-qr/menu-qr.component';
import { RestaurantAdminComponent } from './features/restaurant/restaurant-admin/restaurant-admin.component';
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
  // Menu QR Code page
  {
    path: 'restaurantsAdmin/:restaurantId/menu-qr',
    component: MenuQrComponent,
    canActivate: [authGuard],
  },
  // Manage Menu page
  {
    path: 'restaurantsAdmin/:restaurantId',
    component: RestaurantAdminComponent,
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
