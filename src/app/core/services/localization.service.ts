import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export type SupportedLanguage = 'it' | 'en' | 'es' | 'fr' | 'de';

@Injectable({
  providedIn: 'root',
})
export class LocalizationService {
  private readonly http = inject(HttpClient);

  readonly currentLang = signal<SupportedLanguage>('it');
  private readonly dictionary = signal<Record<string, string>>({});
  readonly isLoaded = signal<boolean>(false);

  private readonly cache: Record<string, Record<string, string>> = {};

  constructor() {
    const saved = (typeof localStorage !== 'undefined' ? localStorage.getItem('app_lang') : null) as SupportedLanguage | null;
    const initialLang: SupportedLanguage = saved && (['it', 'en', 'es', 'fr', 'de'] as SupportedLanguage[]).includes(saved)
      ? saved
      : 'it';

    this.setLanguage(initialLang);
  }

  async setLanguage(lang: SupportedLanguage): Promise<void> {
    this.currentLang.set(lang);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('app_lang', lang);
      } catch {
        // ignore localStorage errors
      }
    }

    if (this.cache[lang]) {
      this.dictionary.set(this.cache[lang]);
      this.isLoaded.set(true);
      return;
    }

    // Determine translation file: currently 'it' and 'en' are full resource dictionaries.
    // Fall back to 'en' for other European languages if specific dictionary is not present.
    const fileToLoad = lang === 'it' ? 'it' : 'en';

    try {
      const data = await firstValueFrom(
        this.http.get<Record<string, string>>(`/assets/i18n/${fileToLoad}.json`)
      );
      this.cache[lang] = data;
      this.dictionary.set(data);
      this.isLoaded.set(true);
    } catch (err) {
      console.warn(`[LocalizationService] Failed to load translations for ${lang}, falling back to IT`, err);
      if (lang !== 'it') {
        await this.setLanguage('it');
      }
    }
  }

  /**
   * Translate key with optional string interpolation {0}, {1}, etc.
   */
  translate(key: string, ...args: (string | number)[]): string {
    const dict = this.dictionary();
    let text = dict[key] ?? key;

    if (args && args.length > 0) {
      args.forEach((val, idx) => {
        text = text.replace(new RegExp(`\\{${idx}\\}`, 'g'), String(val));
      });
    }

    return text;
  }

  t(key: string, ...args: (string | number)[]): string {
    return this.translate(key, ...args);
  }
}

