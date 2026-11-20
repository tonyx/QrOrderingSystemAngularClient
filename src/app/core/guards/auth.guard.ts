import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { of, map, catchError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    // If the access token is expired but a valid refresh token is available,
    // refresh proactively before activating the target route.
    if (authService.isTokenExpired() && authService.hasRefreshToken()) {
      return authService.refreshAccessToken().pipe(
        map(() => true),
        catchError(() =>
          of(
            router.createUrlTree(['/login'], {
              queryParams: { returnUrl: state.url },
            })
          )
        )
      );
    }
    return true;
  }

  // Redirect to login page and preserve target url as query parameter
  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url },
  });
};

