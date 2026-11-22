import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, tap, catchError, throwError, map, finalize, shareReplay } from 'rxjs';
import { AuthenticationService } from '../api/endpoints/authentication/authentication.service';
import type { TokenRequest, TokenResponse, CurrentUserResponse } from '../api/models';
import { ExternalAuthProvider } from '../models/auth.models';
import { environment } from '../../../environments/environment';

export type { ExternalAuthProvider };

// In-memory token storage to protect against XSS/malicious JavaScript storage dumpers
// Refresh token is primarily managed via HttpOnly cookies (with optional in-memory / legacy fallback)
const USER_STORAGE_KEY = 'qr_auth_user';
const RETURN_URL_STORAGE_KEY = 'qr_auth_return_url';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly authApi = inject(AuthenticationService);
  private readonly baseUrl = environment.apiBaseUrl
    ? environment.apiBaseUrl.replace(/\/$/, '').replace(/\/api$/, '')
    : '';

  // Single-flight refresh token observable to coalesce concurrent requests
  private refreshInProgress$: Observable<string> | null = null;

  // Purely in-memory reactive state signals (never stored in localStorage)
  readonly token = signal<string | null>(null);
  readonly refreshToken = signal<string | null>(null);
  readonly currentUser = signal<CurrentUserResponse | null>(this.getStoredUser());
  readonly isAuthenticated = computed(() => {
    const t = this.token();
    return !!t && t.trim().length > 0;
  });

  hasRefreshToken(): boolean {
    const rt = this.refreshToken();
    // Returns true if in-memory refresh token exists OR if relying on HttpOnly cookie
    return (!!rt && rt.trim().length > 0) || this.isAuthenticated();
  }

  getRefreshToken(): string | null {
    return this.refreshToken();
  }

  /**
   * Evaluates if a JWT token has expired based on its 'exp' claim.
   * Includes a 10-second buffer to prevent edge-of-expiry race conditions.
   */
  isTokenExpired(token: string | null = this.token()): boolean {
    if (!token) return true;
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return false;
      let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const json = decodeURIComponent(
        atob(b64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      const payload = JSON.parse(json);
      if (typeof payload.exp === 'number') {
        return Date.now() >= payload.exp * 1000 - 10000;
      }
      return false;
    } catch {
      return false;
    }
  }

  login(credentials: TokenRequest): Observable<TokenResponse | string> {
    return this.authApi.postApiAuthToken(credentials).pipe(
      tap((res: any) => {
        // Robust extraction supporting PascalCase, camelCase, or plain token string
        const extractedToken =
          typeof res === 'string'
            ? res
            : res?.token || res?.Token || '';
        if (extractedToken) {
          const authResult: TokenResponse = typeof res === 'string' ? { token: res } : res;
          this.setSession(authResult, extractedToken);
        }
      }),
      catchError((error: HttpErrorResponse) => {
        let errorMsg = 'Login failed. Please check your credentials.';
        if (error.status === 400) {
          errorMsg = error.error || 'Email and password are required.';
        } else if (error.status === 401) {
          errorMsg = error.error || 'Invalid email or password.';
        } else if (error.status === 423) {
          errorMsg = error.error || 'Account is locked out. Please try again later.';
        } else if (error.error && typeof error.error === 'string') {
          errorMsg = error.error;
        }
        return throwError(() => new Error(errorMsg));
      })
    );
  }

  /**
   * Refreshes the JWT access token.
   * If an in-memory refresh token exists, it is sent in the body;
   * otherwise the request relies on the browser's HttpOnly cookie.
   * Coalesces concurrent calls so only one refresh HTTP request is sent at a time.
   */
  refreshAccessToken(): Observable<string> {
    if (this.refreshInProgress$) {
      return this.refreshInProgress$;
    }

    const currentRefreshToken = this.refreshToken() || '';

    this.refreshInProgress$ = this.authApi
      .postApiAuthRefreshToken({ refreshToken: currentRefreshToken })
      .pipe(
        map((res: any) => {
          const newToken =
            typeof res === 'string'
              ? res
              : res?.token || res?.Token || '';
          const newRefreshToken =
            typeof res === 'object'
              ? res?.refreshToken || res?.RefreshToken || currentRefreshToken
              : currentRefreshToken;

          if (!newToken) {
            throw new Error('Refresh response did not contain an access token');
          }

          const authResult: TokenResponse = typeof res === 'string' ? { token: res } : res;
          this.setSession(
            {
              ...authResult,
              token: newToken,
              refreshToken: newRefreshToken,
            },
            newToken
          );

          return newToken;
        }),
        catchError((err) => {
          // If refresh token is invalid/expired/revoked, clear the session
          this.logout();
          return throwError(() => err);
        }),
        shareReplay(1),
        finalize(() => {
          this.refreshInProgress$ = null;
        })
      );

    return this.refreshInProgress$;
  }

  /**
   * Approach 1: Initiates a backend-driven OAuth redirect flow for Google or Facebook.
   * Redirects the browser to GET /api/Auth/external-login?provider=<Provider>&returnUrl=<CallbackUrl>
   */
  initiateExternalLogin(provider: ExternalAuthProvider, returnUrl: string = '/dashboard'): void {
    try {
      sessionStorage.setItem(RETURN_URL_STORAGE_KEY, returnUrl);
    } catch {
      // Ignore storage errors
    }

    const oauthOrigin = (environment as { oauthBackendOrigin?: string }).oauthBackendOrigin
      ? (environment as { oauthBackendOrigin?: string }).oauthBackendOrigin!.replace(/\/$/, '')
      : this.baseUrl;

    const callbackUrl = `${window.location.origin}/login`;
    const externalLoginUrl = `${oauthOrigin}/api/Auth/external-login?provider=${encodeURIComponent(
      provider
    )}&returnUrl=${encodeURIComponent(callbackUrl)}`;

    window.location.href = externalLoginUrl;
  }

  /**
   * Processes the token returned by the backend after an external OAuth redirect.
   * Supports parameters in either the URL hash fragment (#token=...) or query string (?token=...).
   */
  completeExternalLoginFromCallback(params: {
    token: string;
    refreshToken?: string | null;
    email?: string | null;
    userId?: string | null;
    roles?: string[];
  }): string {
    this.setSession(
      {
        token: params.token,
        refreshToken: params.refreshToken,
        email: params.email ?? undefined,
        userId: params.userId ?? undefined,
        roles: params.roles,
      },
      params.token
    );

    let savedReturnUrl = '/dashboard';
    try {
      savedReturnUrl = sessionStorage.getItem(RETURN_URL_STORAGE_KEY) || '/dashboard';
      sessionStorage.removeItem(RETURN_URL_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
    return savedReturnUrl;
  }

  fetchCurrentUser(): Observable<CurrentUserResponse> {
    return this.authApi.getApiAuthMe('application/json').pipe(
      tap((user: any) => {
        const normalized: CurrentUserResponse = {
          userId: user?.userId ?? user?.UserId ?? null,
          email: user?.email ?? user?.Email ?? null,
          isPlatformAdmin: user?.isPlatformAdmin ?? user?.IsPlatformAdmin ?? false,
          userContext: user?.userContext ?? user?.UserContext ?? null,
        };
        this.currentUser.set(normalized);
        this.persistUser(normalized);
      })
    );
  }

  logout(): void {
    const currentRefreshToken = this.refreshToken() || '';
    // Fire-and-forget token revocation on backend (cookie or body)
    this.authApi.postApiAuthRevokeToken({ refreshToken: currentRefreshToken }).subscribe({
      error: () => {
        // Ignore network errors during logout
      },
    });

    this.token.set(null);
    this.refreshToken.set(null);
    this.currentUser.set(null);
    try {
      localStorage.removeItem(USER_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }

  private setSession(authResult: any, extractedToken: string): void {
    this.token.set(extractedToken);

    const extractedRefreshToken =
      authResult?.refreshToken || authResult?.RefreshToken || null;
    if (extractedRefreshToken) {
      this.refreshToken.set(extractedRefreshToken);
    }

    // Try decoding claims from JWT payload if available
    let emailFromJwt = '';
    let rolesFromJwt: string[] = [];
    try {
      const parts = extractedToken.split('.');
      if (parts.length === 3) {
        let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';
        const json = decodeURIComponent(
          atob(b64)
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        const payload = JSON.parse(json);
        emailFromJwt =
          payload.email ||
          payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] ||
          '';
        const roleClaim =
          payload.role ||
          payload.roles ||
          payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'];
        if (roleClaim) {
          rolesFromJwt = Array.isArray(roleClaim) ? roleClaim : [roleClaim];
        }
      }
    } catch {
      // Ignore JWT parse failures
    }

    const email = authResult?.email ?? authResult?.Email ?? emailFromJwt ?? '';
    const userId = authResult?.userId ?? authResult?.UserId ?? '';
    const roles = authResult?.roles ?? authResult?.Roles ?? rolesFromJwt;
    const isPlatformAdmin = roles.includes('PlatformAdmin');

    const initialUser: CurrentUserResponse = {
      userId,
      email,
      isPlatformAdmin,
      userContext: null,
    };

    this.currentUser.set(initialUser);
    this.persistUser(initialUser);

    // Fetch /api/Auth/me in background
    this.fetchCurrentUser().subscribe({
      error: () => {
        // Keep initialUser if /api/Auth/me is optional or not available
      },
    });
  }

  private getStoredUser(): CurrentUserResponse | null {
    try {
      const raw = localStorage.getItem(USER_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private persistUser(user: CurrentUserResponse): void {
    try {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } catch {
      // Ignore storage quota errors
    }
  }
}
