import { HttpInterceptorFn, HttpErrorResponse, HttpContextToken } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

export const RETRY_ATTEMPTED = new HttpContextToken<boolean>(() => false);

function isAuthEndpoint(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes('/api/auth/token') ||
    lower.includes('/api/auth/refresh-token') ||
    lower.includes('/api/auth/revoke-token') ||
    lower.includes('/api/auth/external-login') ||
    lower.includes('/api/auth/external-callback')
  );
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.token();
  const accessKey = environment.accessKey?.trim();

  let headers = req.headers;

  // 1. Attach JWT Bearer token if user is signed in and request is not to an anonymous auth endpoint
  if (token && !isAuthEndpoint(req.url)) {
    headers = headers.set('Authorization', `Bearer ${token}`);
  }

  // 2. Only attach X-API-Key if it matches a valid format (starts with qr_test_ or qr_live_)
  // This avoids passing placeholders or invalid tokens that trigger ApiKeyAuthenticationHandler failures.
  const isValidApiKeyFormat =
    accessKey &&
    (accessKey.startsWith('qr_test_') || accessKey.startsWith('qr_live_'));

  if (isValidApiKeyFormat && !headers.has('X-Api-Key')) {
    headers = headers.set('X-Api-Key', accessKey);
  }

  // 3. Rewrite relative API URLs to absolute backend URLs only when explicitly configured and not using dev proxy or cloud proxy
  let url = req.url;
  const isLocalDev =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.port === '4200');

  const rawApiBase = environment.apiBaseUrl?.trim();
  // Do not rewrite relative URLs when running in local dev (dev server proxy handles /api)
  // or when targeting restaurantsystem.cloud (which requires same-origin proxy due to CORS restrictions)
  if (
    !isLocalDev &&
    rawApiBase &&
    rawApiBase !== '.' &&
    rawApiBase !== '/api' &&
    !rawApiBase.includes('restaurantsystem.cloud')
  ) {
    const backendOrigin = rawApiBase.replace(/\/api\/?$/, '').replace(/\/$/, '');
    if (url.startsWith('/api/') || url === '/api') {
      url = `${backendOrigin}${url}`;
    }
  }

  // Include credentials (cookies) with all requests so HttpOnly refresh tokens are sent/received
  const clonedReq = req.clone({ headers, url, withCredentials: true });

  // 4. Proactive refresh: If token is expired and refresh token is available, refresh before calling API
  const isRetry = req.context.get(RETRY_ATTEMPTED);
  if (!isRetry && !isAuthEndpoint(req.url) && authService.hasRefreshToken() && authService.isTokenExpired(token)) {
    return authService.refreshAccessToken().pipe(
      switchMap((newToken) => {
        const retriedHeaders = clonedReq.headers.set('Authorization', `Bearer ${newToken}`);
        const retriedReq = clonedReq.clone({
          headers: retriedHeaders,
          context: clonedReq.context.set(RETRY_ATTEMPTED, true),
        });
        return next(retriedReq);
      }),
      catchError((refreshErr) => {
        return throwError(() => refreshErr);
      })
    );
  }

  // 5. Reactive refresh: catch 401 Unauthorized errors and retry once with a refreshed token
  return next(clonedReq).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !isRetry &&
        !isAuthEndpoint(clonedReq.url) &&
        authService.hasRefreshToken()
      ) {
        return authService.refreshAccessToken().pipe(
          switchMap((newToken) => {
            const retriedHeaders = clonedReq.headers.set('Authorization', `Bearer ${newToken}`);
            const retriedReq = clonedReq.clone({
              headers: retriedHeaders,
              context: clonedReq.context.set(RETRY_ATTEMPTED, true),
            });
            return next(retriedReq);
          }),
          catchError((refreshErr) => {
            return throwError(() => refreshErr);
          })
        );
      }
      return throwError(() => error);
    })
  );
};
