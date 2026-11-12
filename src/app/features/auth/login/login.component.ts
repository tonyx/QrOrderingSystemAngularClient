import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

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
  protected errorMessage = signal<string | null>(null);
  protected successMessage = signal<string | null>(null);

  private returnUrl: string = '/dashboard';

  ngOnInit(): void {
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/dashboard';

    // If already authenticated when landing here, immediately navigate to dashboard
    if (this.authService.isAuthenticated()) {
      this.router.navigateByUrl(this.returnUrl);
    }
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
      next: (res) => {
        const userEmail = res?.email || res?.Email || this.authService.currentUser()?.email || emailVal;
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
