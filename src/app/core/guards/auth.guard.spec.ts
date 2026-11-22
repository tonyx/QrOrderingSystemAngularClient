import { TestBed } from '@angular/core/testing';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { of, throwError, firstValueFrom } from 'rxjs';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('authGuard', () => {
  let authServiceSpy: any;
  let routerSpy: any;

  const mockRoute = {} as ActivatedRouteSnapshot;
  const mockState = { url: '/dashboard' } as RouterStateSnapshot;

  beforeEach(() => {
    authServiceSpy = {
      isAuthenticated: vi.fn(),
      isTokenExpired: vi.fn(),
      hasRefreshToken: vi.fn(),
      refreshAccessToken: vi.fn(),
    };

    routerSpy = {
      createUrlTree: vi.fn((commands, extras) => ({ commands, extras } as unknown as UrlTree)),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should allow activation immediately when user is authenticated with a valid token', () => {
    authServiceSpy.isAuthenticated.mockReturnValue(true);
    authServiceSpy.isTokenExpired.mockReturnValue(false);
    authServiceSpy.hasRefreshToken.mockReturnValue(true);

    const result = TestBed.runInInjectionContext(() => authGuard(mockRoute, mockState));

    expect(result).toBe(true);
    expect(authServiceSpy.refreshAccessToken).not.toHaveBeenCalled();
  });

  it('should proactively refresh access token when token is expired but refresh token is available', async () => {
    authServiceSpy.isAuthenticated.mockReturnValue(true);
    authServiceSpy.isTokenExpired.mockReturnValue(true);
    authServiceSpy.hasRefreshToken.mockReturnValue(true);
    authServiceSpy.refreshAccessToken.mockReturnValue(of('fresh_token_123'));

    const result = TestBed.runInInjectionContext(() => authGuard(mockRoute, mockState));

    expect(result).not.toBe(true);
    const res = await firstValueFrom(result as any);
    expect(res).toBe(true);
    expect(authServiceSpy.refreshAccessToken).toHaveBeenCalledTimes(1);
  });

  it('should redirect to /login if proactive token refresh fails', async () => {
    authServiceSpy.isAuthenticated.mockReturnValue(true);
    authServiceSpy.isTokenExpired.mockReturnValue(true);
    authServiceSpy.hasRefreshToken.mockReturnValue(true);
    authServiceSpy.refreshAccessToken.mockReturnValue(
      throwError(() => new Error('Refresh token revoked'))
    );

    const result = TestBed.runInInjectionContext(() => authGuard(mockRoute, mockState));

    const tree: any = await firstValueFrom(result as any);
    expect(tree.commands).toEqual(['/login']);
    expect(tree.extras).toEqual({ queryParams: { returnUrl: '/dashboard' } });
    expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/dashboard' },
    });
  });

  it('should attempt silent refresh when user is not authenticated in-memory, and allow route if successful', async () => {
    authServiceSpy.isAuthenticated.mockReturnValue(false);
    authServiceSpy.refreshAccessToken.mockReturnValue(of('fresh_bootstrapped_token'));

    const result = TestBed.runInInjectionContext(() => authGuard(mockRoute, mockState));

    expect(result).not.toBe(true);
    const res = await firstValueFrom(result as any);
    expect(res).toBe(true);
    expect(authServiceSpy.refreshAccessToken).toHaveBeenCalledTimes(1);
  });

  it('should redirect to /login when user is not authenticated and silent refresh fails', async () => {
    authServiceSpy.isAuthenticated.mockReturnValue(false);
    authServiceSpy.refreshAccessToken.mockReturnValue(
      throwError(() => new Error('No valid cookie / session'))
    );

    const result = TestBed.runInInjectionContext(() => authGuard(mockRoute, mockState));

    const tree: any = await firstValueFrom(result as any);
    expect(tree.commands).toEqual(['/login']);
    expect(tree.extras).toEqual({ queryParams: { returnUrl: '/dashboard' } });
    expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/dashboard' },
    });
  });
});
