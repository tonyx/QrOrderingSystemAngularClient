import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { AuthenticationService } from '../api/endpoints/authentication/authentication.service';
import type { TokenRequest, TokenResponse, CurrentUserResponse } from '../api/models';
import { ExternalAuthProvider } from '../models/auth.models';
import { environment } from '../../../environments/environment';

export type { ExternalAuthProvider };

const TOKEN_STORAGE_KEY = 'qr_auth_token';
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

  // Reactive state signals
  readonly token = signal<string | null>(this.getStoredToken());
  readonly currentUser = signal<CurrentUserResponse | null>(this.getStoredUser());
  readonly isAuthenticated = computed(() => {
    const t = this.token();
    return !!t && t.trim().length > 0;
  });

  login(credentials: TokenRequest): Observable<TokenResponse | string> {
    return this.authApi.postApiAuthToken(credentials).pipe(
      tap((res) => {
        // Robust extraction supporting token response or plain string
        const extractedToken =
          typeof res === 'string'
            ? res
            : (res as TokenResponse)?.token || '';
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
    email?: string | null;
    userId?: string | null;
    roles?: string[];
  }): string {
    this.setSession(
      {
        token: params.token,
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
      tap((user) => {
        const normalized: CurrentUserResponse = {
          userId: user.userId ?? null,
          email: user.email ?? null,
          isPlatformAdmin: user.isPlatformAdmin ?? false,
          userContext: user.userContext ?? null,
        };
        this.currentUser.set(normalized);
        this.persistUser(normalized);
      })
    );
  }

  logout(): void {
    this.token.set(null);
    this.currentUser.set(null);
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(USER_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }

  private setSession(authResult: TokenResponse, extractedToken: string): void {
    this.token.set(extractedToken);
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, extractedToken);
    } catch {
      // Ignore storage errors
    }

    // Try decoding claims from JWT payload if available
    let emailFromJwt = '';
    let rolesFromJwt: string[] = [];
    try {
      const parts = extractedToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        emailFromJwt = payload.email || payload['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] || '';
        const roleClaim = payload.role || payload['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'];
        if (roleClaim) {
          rolesFromJwt = Array.isArray(roleClaim) ? roleClaim : [roleClaim];
        }
      }
    } catch {
      // Ignore JWT parse failures
    }

    const email = authResult?.email ?? emailFromJwt ?? '';
    const userId = authResult?.userId ?? '';
    const roles = authResult?.roles ?? rolesFromJwt;
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

  private getStoredToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
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
