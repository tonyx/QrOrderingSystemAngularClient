import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

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
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl ? environment.apiBaseUrl.replace(/\/$/, '') : '';

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
    const url = `${this.baseUrl}/api/HowTo/ask`;
    const guestDeviceId = this.getOrCreateGuestDeviceId();
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'X-Guest-Device-Id': guestDeviceId,
    });

    const payload: { question: string; topN: number; language?: string } = {
      question,
      topN,
    };
    if (language) {
      payload.language = language;
    }

    return this.http.post<AssistantAnswerResponse>(url, payload, { headers });
  }

  getHowToItem(id: string): Observable<HowToItemRecord> {
    const url = `${this.baseUrl}/api/HowTo/${id}`;
    return this.http.get<HowToItemRecord>(url);
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
