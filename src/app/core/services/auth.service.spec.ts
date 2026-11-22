import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { of, throwError, Subject } from 'rxjs';
import { AuthService } from './auth.service';
import { AuthenticationService } from '../api/endpoints/authentication/authentication.service';
import { TokenResponse } from '../api/models';

describe('AuthService', () => {
  let service: AuthService;
  let authApiSpy: any;

  // Helper to create a fake JWT with a specific expiration timestamp (in seconds)
  function createFakeJwt(expSeconds: number): string {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({
      sub: '123',
      email: 'test@example.com',
      role: 'PlatformAdmin',
      exp: expSeconds,
    }));
    return `${header}.${payload}.fakeSignature`;
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();

    authApiSpy = {
      postApiAuthToken: vi.fn(),
      postApiAuthRefreshToken: vi.fn(),
      postApiAuthRevokeToken: vi.fn().mockReturnValue(of({ message: 'Revoked' })),
      getApiAuthMe: vi.fn().mockReturnValue(of({ userId: 'u1', email: 'test@example.com' })),
    };

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: AuthenticationService, useValue: authApiSpy },
      ],
    });

    service = TestBed.inject(AuthService);
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('should be created and default to unauthenticated when storage is empty', () => {
    expect(service).toBeTruthy();
    expect(service.token()).toBeNull();
    expect(service.refreshToken()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.hasRefreshToken()).toBe(false);
  });

  it('should store access token and refresh token upon successful login', () => {
    const token = createFakeJwt(Math.floor(Date.now() / 1000) + 3600);
    const mockResponse: TokenResponse = {
      token,
      refreshToken: 'sample_refresh_token_123',
      userId: 'user_42',
      email: 'owner@restaurant.com',
      roles: ['RestaurantOwner'],
    };

    authApiSpy.postApiAuthToken.mockReturnValue(of(mockResponse));

    service.login({ email: 'owner@restaurant.com', password: 'Password123!' }).subscribe();

    expect(service.token()).toBe(token);
    expect(service.refreshToken()).toBe('sample_refresh_token_123');
    expect(service.hasRefreshToken()).toBe(true);
    expect(service.isAuthenticated()).toBe(true);
    // Tokens are kept purely in memory to protect against XSS/malicious JS readers
    expect(localStorage.getItem('qr_auth_token')).toBeNull();
    expect(localStorage.getItem('qr_auth_refresh_token')).toBeNull();
  });

  it('should correctly evaluate token expiration', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const expiredToken = createFakeJwt(nowSec - 100);
    const validToken = createFakeJwt(nowSec + 3600);

    expect(service.isTokenExpired(expiredToken)).toBe(true);
    expect(service.isTokenExpired(validToken)).toBe(false);
    expect(service.isTokenExpired(null)).toBe(true);
  });

  it('should refresh token successfully and update stored credentials', () => {
    const oldToken = createFakeJwt(Math.floor(Date.now() / 1000) - 10);
    const newToken = createFakeJwt(Math.floor(Date.now() / 1000) + 3600);

    // Initial session with refresh token
    (service as any).setSession(
      { token: oldToken, refreshToken: 'old_refresh_tok' },
      oldToken
    );

    expect(service.refreshToken()).toBe('old_refresh_tok');

    authApiSpy.postApiAuthRefreshToken.mockReturnValue(
      of({
        token: newToken,
        refreshToken: 'new_rotated_refresh_tok',
        userId: 'user_42',
        email: 'owner@restaurant.com',
      })
    );

    let receivedToken = '';
    service.refreshAccessToken().subscribe((tok) => {
      receivedToken = tok;
    });

    expect(receivedToken).toBe(newToken);
    expect(service.token()).toBe(newToken);
    expect(service.refreshToken()).toBe('new_rotated_refresh_tok');
    expect(localStorage.getItem('qr_auth_token')).toBeNull();
    expect(localStorage.getItem('qr_auth_refresh_token')).toBeNull();
    expect(authApiSpy.postApiAuthRefreshToken).toHaveBeenCalledWith({
      refreshToken: 'old_refresh_tok',
    });
  });

  it('should coalesce multiple concurrent refresh requests into a single API call', () => {
    const oldToken = createFakeJwt(Math.floor(Date.now() / 1000) - 10);
    const newToken = createFakeJwt(Math.floor(Date.now() / 1000) + 3600);

    (service as any).setSession(
      { token: oldToken, refreshToken: 'active_refresh_tok' },
      oldToken
    );

    const refreshSubject = new Subject<any>();
    authApiSpy.postApiAuthRefreshToken.mockReturnValue(refreshSubject.asObservable());

    let res1 = '';
    let res2 = '';
    let res3 = '';

    // Three concurrent refresh calls while request is pending
    service.refreshAccessToken().subscribe((t) => (res1 = t));
    service.refreshAccessToken().subscribe((t) => (res2 = t));
    service.refreshAccessToken().subscribe((t) => (res3 = t));

    refreshSubject.next({
      token: newToken,
      refreshToken: 'new_refresh_tok',
    });
    refreshSubject.complete();

    expect(res1).toBe(newToken);
    expect(res2).toBe(newToken);
    expect(res3).toBe(newToken);
    // Crucial: API was called only ONCE!
    expect(authApiSpy.postApiAuthRefreshToken).toHaveBeenCalledTimes(1);
  });

  it('should logout and clear session if refresh request fails with 401', () => {
    (service as any).setSession(
      { token: 'some_tok', refreshToken: 'invalid_refresh_tok' },
      'some_tok'
    );

    authApiSpy.postApiAuthRefreshToken.mockReturnValue(
      throwError(() => ({ status: 401, error: 'Invalid refresh token.' }))
    );

    let errorThrown: any = null;
    service.refreshAccessToken().subscribe({
      error: (err) => {
        errorThrown = err;
      },
    });

    expect(errorThrown).toBeTruthy();
    expect(service.token()).toBeNull();
    expect(service.refreshToken()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('qr_auth_token')).toBeNull();
    expect(localStorage.getItem('qr_auth_refresh_token')).toBeNull();
  });

  it('should revoke refresh token on server and clear local state during logout', () => {
    (service as any).setSession(
      { token: 'some_tok', refreshToken: 'revoke_me_tok' },
      'some_tok'
    );

    service.logout();

    expect(authApiSpy.postApiAuthRevokeToken).toHaveBeenCalledWith({
      refreshToken: 'revoke_me_tok',
    });
    expect(service.token()).toBeNull();
    expect(service.refreshToken()).toBeNull();
    expect(localStorage.getItem('qr_auth_token')).toBeNull();
    expect(localStorage.getItem('qr_auth_refresh_token')).toBeNull();
  });
});
