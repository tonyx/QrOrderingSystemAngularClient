import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.token();
  const accessKey = environment.accessKey?.trim();

  let headers = req.headers;

  // 1. Attach JWT Bearer token if user is signed in
  if (token) {
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

  const clonedReq = req.clone({ headers });
  return next(clonedReq);
};
