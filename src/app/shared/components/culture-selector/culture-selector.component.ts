import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LocalizationService, SupportedLanguage } from '../../../core/services/localization.service';

@Component({
  selector: 'app-culture-selector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="culture-selector d-inline-flex align-items-center">
      <span class="me-1 fs-5" aria-hidden="true" title="Language / Lingua">🌐</span>
      <select
        [ngModel]="loc.currentLang()"
        (ngModelChange)="onLanguageChange($event)"
        class="form-select form-select-sm d-inline-block w-auto py-1 px-2 border-secondary-subtle"
        aria-label="Select Language"
      >
        <option value="en">English</option>
        <option value="it">Italiano</option>
      </select>
    </div>
  `,
  styles: [`
    .culture-selector {
      user-select: none;
    }
    .culture-selector select {
      cursor: pointer;
      font-size: 0.875rem;
      border-radius: 0.375rem;
      background-color: #f8fafc;
      color: #334155;
      font-weight: 500;
    }
    .culture-selector select:focus {
      border-color: #6366f1;
      box-shadow: 0 0 0 0.2rem rgba(99, 102, 241, 0.25);
    }
  `]
})
export class CultureSelectorComponent {
  readonly loc = inject(LocalizationService);

  onLanguageChange(lang: string): void {
    if (lang === 'it' || lang === 'en') {
      this.loc.setLanguage(lang as SupportedLanguage);
    }
  }
}

