import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { TokenRequest, TokenResponse, CurrentUserResponse } from '../models/auth.models';
import { environment } from '../../../environments/environment';

const TOKEN_STORAGE_KEY = 'qr_auth_token';
const USER_STORAGE_KEY = 'qr_auth_user';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl ? environment.apiBaseUrl.replace(/\/$/, '') : '';

  // Reactive state signals
  readonly token = signal<string | null>(this.getStoredToken());
  readonly currentUser = signal<CurrentUserResponse | null>(this.getStoredUser());
  readonly isAuthenticated = computed(() => {
    const t = this.token();
    return !!t && t.trim().length > 0;
  });

  login(credentials: TokenRequest): Observable<TokenResponse> {
    const url = `${this.baseUrl}/api/Auth/token`;
    return this.http.post<TokenResponse>(url, credentials).pipe(
      tap((res) => {
        // Robust extraction supporting PascalCase, camelCase, or plain token string
        const extractedToken = res?.token || res?.Token || (typeof res === 'string' ? res : '');
        if (extractedToken) {
          this.setSession(res, extractedToken);
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

  fetchCurrentUser(): Observable<CurrentUserResponse> {
    const url = `${this.baseUrl}/api/Auth/me`;
    return this.http.get<CurrentUserResponse>(url).pipe(
      tap((user) => {
        const normalized: CurrentUserResponse = {
          userId: user.userId ?? user.UserId ?? null,
          email: user.email ?? user.Email ?? null,
          isPlatformAdmin: user.isPlatformAdmin ?? user.IsPlatformAdmin ?? false,
          userContext: user.userContext ?? user.UserContext ?? null,
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
