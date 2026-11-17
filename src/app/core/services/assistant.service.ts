import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { HowtoAssistantService } from '../api/endpoints/howto-assistant/howto-assistant.service';

export interface HowToItemRecord {
  id?: string;
  Id?: string;
  section?: string;
  Section?: string;
  name?: string;
  Name?: string;
  content?: string;
  Content?: string;
  referenceIds?: string[];
  ReferenceIds?: string[];
  language?: string;
  Language?: string;
}

export interface AssistantAnswerResponse {
  hasAnswer: boolean;
  HasAnswer?: boolean;
  answer: string | null;
  Answer?: string | null;
  sources: HowToItemRecord[];
  Sources?: HowToItemRecord[];
  referenceIds: string[];
  ReferenceIds?: string[];
  referenceItems: HowToItemRecord[];
  ReferenceItems?: HowToItemRecord[];
}

@Injectable({
  providedIn: 'root',
})
export class AssistantService {
  private readonly howtoApi = inject(HowtoAssistantService);

  getOrCreateGuestDeviceId(): string {
    const key = 'qr_assistant_guest_id';
    try {
      let guestId = localStorage.getItem(key);
      if (!guestId) {
        guestId = 'g_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        localStorage.setItem(key, guestId);
      }
      return guestId;
    } catch {
      return 'g_guest_device';
    }
  }

  askAssistant(question: string, topN: number = 5, language?: string): Observable<AssistantAnswerResponse> {
    const guestDeviceId = this.getOrCreateGuestDeviceId();
    return this.howtoApi.postApiHowToAsk(
      {
        question,
        topN,
        language: language || undefined,
      },
      'application/json',
      {
        headers: {
          'X-Guest-Device-Id': guestDeviceId,
        },
      }
    ) as unknown as Observable<AssistantAnswerResponse>;
  }

  getHowToItem(id: string): Observable<HowToItemRecord> {
    return this.howtoApi.getApiHowToId(id, 'application/json') as unknown as Observable<HowToItemRecord>;
  }

  openQuery(prompt: string, restaurantId?: string | null): void {
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('query-qr-assistant', {
        detail: {
          prompt,
          restaurantId: restaurantId || null,
        },
      });
      window.dispatchEvent(event);
    }
  }

  toggle(): void {
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('toggle-qr-assistant');
      window.dispatchEvent(event);
    }
  }
}
