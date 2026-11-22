import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { of } from 'rxjs';
import { authInterceptor, RETRY_ATTEMPTED } from './auth.interceptor';
import { AuthService } from '../services/auth.service';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let authServiceSpy: any;

  beforeEach(() => {
    authServiceSpy = {
      token: vi.fn().mockReturnValue('valid_jwt_token_123'),
      refreshToken: vi.fn().mockReturnValue('valid_refresh_token_xyz'),
      hasRefreshToken: vi.fn().mockReturnValue(true),
      isTokenExpired: vi.fn().mockReturnValue(false),
      refreshAccessToken: vi.fn(),
      logout: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authServiceSpy },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('should attach Authorization Bearer token to normal API calls', () => {
    http.get('/api/DiningOrders').subscribe();

    const req = httpMock.expectOne((r) => r.url.includes('/api/DiningOrders'));
    expect(req.request.headers.get('Authorization')).toBe('Bearer valid_jwt_token_123');
    expect(req.request.withCredentials).toBe(true);
    req.flush({});
  });

  it('should NOT attach Authorization header to anonymous auth endpoints, but should include credentials', () => {
    http.post('/api/Auth/refresh-token', { refreshToken: 'rt' }).subscribe();

    const req = httpMock.expectOne((r) => r.url.includes('/api/Auth/refresh-token'));
    expect(req.request.headers.has('Authorization')).toBe(false);
    expect(req.request.withCredentials).toBe(true);
    req.flush({});
  });

  it('should catch 401 error, refresh token, and retry the failed request with the new token', () => {
    authServiceSpy.refreshAccessToken.mockReturnValue(of('fresh_renewed_jwt_token_999'));

    let responseData: any = null;
    http.get('/api/DiningOrders').subscribe((res) => {
      responseData = res;
    });

    // 1. Initial request with original token
    const firstReq = httpMock.expectOne((r) => r.url.includes('/api/DiningOrders'));
    expect(firstReq.request.headers.get('Authorization')).toBe('Bearer valid_jwt_token_123');

    // Simulate 401 Unauthorized from backend
    firstReq.flush('Session expired', { status: 401, statusText: 'Unauthorized' });

    // Refresh should have been triggered
    expect(authServiceSpy.refreshAccessToken).toHaveBeenCalledTimes(1);

    // 2. Retried request with renewed token
    const retriedReq = httpMock.expectOne((r) => r.url.includes('/api/DiningOrders'));
    expect(retriedReq.request.headers.get('Authorization')).toBe('Bearer fresh_renewed_jwt_token_999');
    expect(retriedReq.request.context.get(RETRY_ATTEMPTED)).toBe(true);

    retriedReq.flush({ orderId: 'ord_1', total: 45.0 });

    expect(responseData).toEqual({ orderId: 'ord_1', total: 45.0 });
  });

  it('should not retry if the retried request fails with 401 a second time', () => {
    authServiceSpy.refreshAccessToken.mockReturnValue(of('fresh_renewed_jwt_token_999'));

    let errorThrown: any = null;
    http.get('/api/DiningOrders').subscribe({
      error: (err) => {
        errorThrown = err;
      },
    });

    const firstReq = httpMock.expectOne((r) => r.url.includes('/api/DiningOrders'));
    firstReq.flush('Expired', { status: 401, statusText: 'Unauthorized' });

    const retriedReq = httpMock.expectOne((r) => r.url.includes('/api/DiningOrders'));
    retriedReq.flush('Forbidden', { status: 401, statusText: 'Unauthorized' });

    expect(authServiceSpy.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(errorThrown.status).toBe(401);
  });

  it('should not attempt refresh if no refresh token is available on 401', () => {
    authServiceSpy.hasRefreshToken.mockReturnValue(false);

    let errorThrown: any = null;
    http.get('/api/DiningOrders').subscribe({
      error: (err) => {
        errorThrown = err;
      },
    });

    const req = httpMock.expectOne((r) => r.url.includes('/api/DiningOrders'));
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(authServiceSpy.refreshAccessToken).not.toHaveBeenCalled();
    expect(errorThrown.status).toBe(401);
  });

  it('should proactively refresh expired tokens before making the API request', () => {
    authServiceSpy.isTokenExpired.mockReturnValue(true);
    authServiceSpy.refreshAccessToken.mockReturnValue(of('proactive_refreshed_jwt'));

    let responseData: any = null;
    http.get('/api/DiningOrders').subscribe((res) => {
      responseData = res;
    });

    expect(authServiceSpy.refreshAccessToken).toHaveBeenCalledTimes(1);

    const req = httpMock.expectOne((r) => r.url.includes('/api/DiningOrders'));
    expect(req.request.headers.get('Authorization')).toBe('Bearer proactive_refreshed_jwt');
    expect(req.request.context.get(RETRY_ATTEMPTED)).toBe(true);

    req.flush({ success: true });
    expect(responseData).toEqual({ success: true });
  });

  it('should not intercept 401 on /api/Auth/token (login endpoint)', () => {
    let errorThrown: any = null;
    http.post('/api/Auth/token', { email: 'wrong', password: 'bad' }).subscribe({
      error: (err) => {
        errorThrown = err;
      },
    });

    const req = httpMock.expectOne((r) => r.url.includes('/api/Auth/token'));
    req.flush('Bad credentials', { status: 401, statusText: 'Unauthorized' });

    expect(authServiceSpy.refreshAccessToken).not.toHaveBeenCalled();
    expect(errorThrown.status).toBe(401);
  });
});
