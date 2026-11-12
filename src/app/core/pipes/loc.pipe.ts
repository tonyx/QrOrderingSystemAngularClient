import { Pipe, PipeTransform, inject } from '@angular/core';
import { LocalizationService } from '../services/localization.service';

@Pipe({
  name: 'loc',
  standalone: true,
  pure: false, // Re-evaluate when language signal updates
})
export class LocPipe implements PipeTransform {
  private readonly loc = inject(LocalizationService);

  transform(key: string, ...args: (string | number)[]): string {
    if (!key) return '';
    return this.loc.translate(key, ...args);
  }
}

