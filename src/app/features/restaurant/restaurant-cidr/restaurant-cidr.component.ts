import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { AuthService } from '../../../core/services/auth.service';
import { LocalizationService } from '../../../core/services/localization.service';
import { LocPipe } from '../../../core/pipes/loc.pipe';
import { RestaurantItem } from '../../../core/models/restaurant.models';
import { MainLayoutComponent } from '../../../shared/components/main-layout/main-layout.component';

@Component({
  selector: 'app-restaurant-cidr',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LocPipe, MainLayoutComponent],
  templateUrl: './restaurant-cidr.component.html',
  styleUrls: ['./restaurant-cidr.component.css'],
})
export class RestaurantCidrComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly restaurantService = inject(RestaurantService);
  private readonly authService = inject(AuthService);
  private readonly loc = inject(LocalizationService);

  restaurantId = signal<string | null>(null);
  restaurant = signal<RestaurantItem | null>(null);
  isLoading = signal<boolean>(true);
  errorMessage = signal<string | null>(null);

  actionErrorMessage = signal<string | null>(null);
  actionSuccessMessage = signal<string | null>(null);
  validationErrors = signal<string[]>([]);
  isBusy = signal<boolean>(false);

  cidrAddressInput = signal<string>('');
  detectedIp = signal<string>('Detecting...');
  ipType = signal<string>('Unknown');
  rawHeaders = signal<string>('');

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('restaurantId');
    if (!id) {
      this.errorMessage.set(this.loc.translate('RestaurantCidr_InvalidRestaurantId'));
      this.isLoading.set(false);
      return;
    }

    if (!this.authService.isAuthenticated()) {
      this.errorMessage.set(this.loc.translate('RestaurantCidr_UserNotAuthenticated'));
      this.isLoading.set(false);
      return;
    }

    this.restaurantId.set(id);
    this.loadRestaurantDetails(id);
    this.detectClientIp();
  }

  loadRestaurantDetails(id: string): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.restaurantService.getRestaurant(id).subscribe({
      next: (rest) => {
        this.restaurant.set(rest);
        this.cidrAddressInput.set(rest.optCidrAddresses || '');
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err?.error?.message || err?.message || 'Failed to load restaurant details.');
      },
    });
  }

  detectClientIp(): void {
    this.detectedIp.set('Detecting...');
    this.restaurantService.getClientIp().subscribe({
      next: (ip) => {
        const cleanIp = (ip || '').trim().replace(/^"|"$/g, '');
        this.detectedIp.set(cleanIp || 'Could not detect IP');
        if (cleanIp) {
          const isV6 = cleanIp.includes(':');
          this.ipType.set(isV6 ? 'InterNetworkV6' : 'InterNetwork');
          this.rawHeaders.set('Retrieved via Client API endpoint');
        } else {
          this.ipType.set('Unknown');
          this.rawHeaders.set('No proxy headers detected.');
        }
      },
      error: (err) => {
        this.detectedIp.set('Could not detect IP');
        this.ipType.set('Error');
        this.rawHeaders.set(`Error fetching from API: ${err?.message || err}`);
      },
    });
  }

  autoFillDetectedIp(): void {
    const currentDetected = this.detectedIp().trim();
    if (!currentDetected || currentDetected === 'Detecting...' || currentDetected.includes('Could not detect')) {
      return;
    }

    const isV6 = currentDetected.includes(':');
    const suffix = isV6 ? '/128' : '/32';
    const valueToAdd = currentDetected + suffix;

    const currentInput = this.cidrAddressInput().trim();
    if (!currentInput) {
      this.cidrAddressInput.set(valueToAdd);
    } else {
      const currentBlocks = currentInput
        .split(',')
        .map((b) => b.trim())
        .filter((b) => b.length > 0);

      if (!currentBlocks.includes(valueToAdd)) {
        this.cidrAddressInput.set([...currentBlocks, valueToAdd].join(', '));
      }
    }
  }

  saveCidrAddresses(): void {
    this.actionErrorMessage.set(null);
    this.actionSuccessMessage.set(null);
    this.validationErrors.set([]);

    const inputVal = this.cidrAddressInput().trim();
    if (!inputVal) {
      this.actionErrorMessage.set(this.loc.translate('RestaurantCidr_EmptyInputError'));
      return;
    }

    const errors = this.validateCidrAddresses(inputVal);
    if (errors.length > 0) {
      this.validationErrors.set(errors);
      return;
    }

    const id = this.restaurantId();
    if (!id) return;

    this.isBusy.set(true);
    this.restaurantService.setCidrAddresses(id, inputVal).subscribe({
      next: () => {
        this.isBusy.set(false);
        this.actionSuccessMessage.set(this.loc.translate('RestaurantCidr_SaveSuccess'));
        this.loadRestaurantDetails(id);
      },
      error: (err) => {
        this.isBusy.set(false);
        const errMsg = err?.error?.message || err?.error || err?.message || 'Error';
        this.actionErrorMessage.set(this.loc.translate('RestaurantCidr_GenericError', errMsg));
      },
    });
  }

  unsetCidrAddresses(): void {
    this.actionErrorMessage.set(null);
    this.actionSuccessMessage.set(null);
    this.validationErrors.set([]);

    const id = this.restaurantId();
    if (!id) return;

    this.isBusy.set(true);
    this.restaurantService.unsetCidrAddresses(id).subscribe({
      next: () => {
        this.isBusy.set(false);
        this.actionSuccessMessage.set(this.loc.translate('RestaurantCidr_RemoveSuccess'));
        this.loadRestaurantDetails(id);
      },
      error: (err) => {
        this.isBusy.set(false);
        const errMsg = err?.error?.message || err?.error || err?.message || 'Error';
        this.actionErrorMessage.set(this.loc.translate('RestaurantCidr_GenericError', errMsg));
      },
    });
  }

  validateCidrAddresses(value: string): string[] {
    const errors: string[] = [];
    const parts = value.split(',').map((p) => p.trim()).filter((p) => p.length > 0);

    for (const part of parts) {
      const slashIndex = part.indexOf('/');
      if (slashIndex < 0) {
        if (!this.isValidIp(part)) {
          errors.push(this.loc.translate('RestaurantCidr_ErrNotValidIp', part));
        }
      } else {
        const ipPart = part.substring(0, slashIndex);
        const maskPart = part.substring(slashIndex + 1);

        if (!this.isValidIp(ipPart)) {
          errors.push(this.loc.translate('RestaurantCidr_ErrIpInPartNotValid', ipPart, part));
        } else if (!/^\d+$/.test(maskPart)) {
          errors.push(this.loc.translate('RestaurantCidr_ErrMaskNotInteger', maskPart, part));
        } else {
          const mask = parseInt(maskPart, 10);
          const isV4 = this.isValidIpv4(ipPart);
          const isV6 = this.isValidIpv6(ipPart);

          if (isV4 && (mask < 0 || mask > 32)) {
            errors.push(this.loc.translate('RestaurantCidr_ErrIpv4MaskRange', mask, part));
          } else if (isV6 && (mask < 0 || mask > 128)) {
            errors.push(this.loc.translate('RestaurantCidr_ErrIpv6MaskRange', mask, part));
          }
        }
      }
    }

    return errors;
  }

  private isValidIpv4(ip: string): boolean {
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = ip.match(ipv4Regex);
    if (!match) return false;
    for (let i = 1; i <= 4; i++) {
      const num = parseInt(match[i], 10);
      if (num < 0 || num > 255) return false;
      if (match[i].length > 1 && match[i].startsWith('0')) return false; // avoid leading zeroes
    }
    return true;
  }

  private isValidIpv6(ip: string): boolean {
    // Regex for standard and compressed IPv6 addresses
    const ipv6Regex =
      /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]+|::(ffff(:0{1,4})?:)?((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1?[0-9])?[0-9])\.){3}(25[0-5]|(2[0-4]|1?[0-9])?[0-9]))$/;
    return ipv6Regex.test(ip);
  }

  private isValidIp(ip: string): boolean {
    return this.isValidIpv4(ip) || this.isValidIpv6(ip);
  }
}
