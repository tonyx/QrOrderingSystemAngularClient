import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ExternalAuthProvider } from '../../../core/models/auth.models';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent implements OnInit {
  protected readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // Form model
  protected email = signal('');
  protected password = signal('');

  // UI state
  protected isLoading = signal(false);
  protected externalLoadingProvider = signal<ExternalAuthProvider | null>(null);
  protected errorMessage = signal<string | null>(null);
  protected successMessage = signal<string | null>(null);

  private returnUrl: string = '/dashboard';

  ngOnInit(): void {
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/dashboard';

    // 1. Check if returning from a backend external OAuth callback (Google / Facebook)
    if (this.handleExternalCallbackIfPresent()) {
      return;
    }

    // 2. If already authenticated when landing here, immediately navigate to dashboard
    if (this.authService.isAuthenticated()) {
      this.router.navigateByUrl(this.returnUrl);
    }
  }

  private handleExternalCallbackIfPresent(): boolean {
    const queryParams = this.route.snapshot.queryParams;
    const fragment = this.route.snapshot.fragment;

    const rawSearch = typeof window !== 'undefined' ? window.location.search || '' : '';
    const rawHash = typeof window !== 'undefined' ? window.location.hash || '' : (fragment ? `#${fragment}` : '');

    const searchParams = new URLSearchParams(rawSearch.replace(/^\?/, ''));
    const hashParams = new URLSearchParams(rawHash.replace(/^#/, ''));

    const getParam = (key: string): string | null =>
      hashParams.get(key) ||
      searchParams.get(key) ||
      queryParams[key] ||
      null;

    const errorParam =
      getParam('error') ||
      getParam('errorMessage') ||
      getParam('remoteError');

    if (errorParam) {
      this.errorMessage.set(decodeURIComponent(errorParam));
      return true;
    }

    const externalToken =
      getParam('token') ||
      getParam('access_token') ||
      getParam('jwt');

    if (externalToken) {
      const refreshToken =
        getParam('refreshToken') ||
        getParam('refresh_token');
      const email = getParam('email');
      const userId = getParam('userId');

      const targetUrl = this.authService.completeExternalLoginFromCallback({
        token: externalToken,
        refreshToken,
        email,
        userId,
      });

      const destination = getParam('returnUrl') || targetUrl || '/dashboard';
      this.successMessage.set(`Welcome back${email ? ', ' + email : ''}!`);
      this.router.navigateByUrl(destination, { replaceUrl: true });
      return true;
    }

    return false;
  }

  onExternalLogin(provider: ExternalAuthProvider): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.externalLoadingProvider.set(provider);
    this.authService.initiateExternalLogin(provider, this.returnUrl);
  }

  onSubmit(): void {
    const emailVal = this.email().trim();
    const passwordVal = this.password();

    if (!emailVal || !passwordVal) {
      this.errorMessage.set('Please enter both email and password.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.authService.login({ email: emailVal, password: passwordVal }).subscribe({
      next: (res: any) => {
        const tokenResp = typeof res === 'object' ? res : null;
        const userEmail =
          tokenResp?.email ||
          tokenResp?.Email ||
          this.authService.currentUser()?.email ||
          emailVal;
        this.isLoading.set(false);
        this.successMessage.set(`Welcome back, ${userEmail}!`);

        // Navigate immediately to the dashboard
        this.router.navigateByUrl(this.returnUrl);
      },
      error: (err: Error) => {
        this.isLoading.set(false);
        this.errorMessage.set(err.message || 'An unexpected error occurred during login.');
      },
    });
  }

  onLogout(): void {
    this.authService.logout();
    this.successMessage.set(null);
    this.errorMessage.set(null);
  }

  goToDashboard(): void {
    this.router.navigateByUrl(this.returnUrl);
  }
}
