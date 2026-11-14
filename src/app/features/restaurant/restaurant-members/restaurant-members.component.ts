import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { RestaurantService } from '../../../core/services/restaurant.service';
import { AuthService } from '../../../core/services/auth.service';
import { RestaurantItem } from '../../../core/models/restaurant.models';
import { MainLayoutComponent } from '../../../shared/components/main-layout/main-layout.component';

export interface UserDisplayInfo {
  id: string;
  username: string;
  email: string;
}

@Component({
  selector: 'app-restaurant-members',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MainLayoutComponent],
  templateUrl: './restaurant-members.component.html',
  styleUrls: ['./restaurant-members.component.css'],
})
export class RestaurantMembersComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly restaurantService = inject(RestaurantService);
  private readonly authService = inject(AuthService);

  restaurantId = signal<string | null>(null);
  restaurant = signal<RestaurantItem | null>(null);
  isLoading = signal<boolean>(true);
  errorMessage = signal<string | null>(null);

  newMemberEmail = signal<string>('');
  actionErrorMessage = signal<string | null>(null);
  actionSuccessMessage = signal<string | null>(null);
  isBusy = signal<boolean>(false);
  showCopiedFeedback = signal<boolean>(false);

  adminInfo = signal<UserDisplayInfo>({
    id: '',
    username: 'Owner',
    email: 'Unknown',
  });
  membersInfo = signal<UserDisplayInfo[]>([]);
  confirmTransferAdminMember = signal<UserDisplayInfo | null>(null);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('restaurantId');
    if (!id) {
      this.errorMessage.set('Invalid Restaurant ID.');
      this.isLoading.set(false);
      return;
    }
    this.restaurantId.set(id);
    this.loadRestaurant(id);
  }

  loadRestaurant(id: string): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.restaurantService.getRestaurant(id).subscribe({
      next: (rest) => {
        this.restaurant.set(rest);
        this.isLoading.set(false);

        const currentUserId = this.authService.currentUser()?.userId;
        if (rest.admin && currentUserId && rest.admin.toLowerCase() !== currentUserId.toLowerCase()) {
          this.errorMessage.set('Access Denied: Only the restaurant owner can manage members.');
          this.restaurant.set(null);
          return;
        }

        this.loadUsersInfo(rest);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err?.error?.message || err?.message || 'Failed to load restaurant details.');
      },
    });
  }

  private loadUsersInfo(rest: RestaurantItem): void {
    const adminId = rest.admin || '';
    const currentUser = this.authService.currentUser();
    const isCurrentAdmin = adminId && currentUser?.userId && adminId.toLowerCase() === currentUser.userId.toLowerCase();

    this.adminInfo.set({
      id: adminId,
      username: isCurrentAdmin ? currentUser?.email || 'Owner' : 'Owner',
      email: isCurrentAdmin ? currentUser?.email || 'Unknown' : 'Unknown',
    });

    const members: UserDisplayInfo[] = (rest.members || []).map((mId) => {
      return {
        id: mId,
        username: `User ${mId.substring(0, 8)}...`,
        email: mId,
      };
    });
    this.membersInfo.set(members);
  }

  onEmailInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.newMemberEmail.set(input.value);
  }

  addMember(): void {
    this.actionErrorMessage.set(null);
    this.actionSuccessMessage.set(null);

    const emailOrId = this.newMemberEmail().trim();
    if (!emailOrId) {
      this.actionErrorMessage.set('Email address or User ID cannot be empty.');
      return;
    }

    const rest = this.restaurant();
    if (!rest) return;

    if (rest.admin && emailOrId.toLowerCase() === rest.admin.toLowerCase()) {
      this.actionErrorMessage.set('This user is already the owner of the restaurant.');
      return;
    }

    if ((rest.members || []).some((m) => m.toLowerCase() === emailOrId.toLowerCase())) {
      this.actionErrorMessage.set('This user is already a member of the restaurant.');
      return;
    }

    this.isBusy.set(true);
    this.restaurantService.addMember(rest.restaurantId, emailOrId).subscribe({
      next: () => {
        this.actionSuccessMessage.set('Member added successfully!');
        this.newMemberEmail.set('');
        this.isBusy.set(false);
        this.loadRestaurant(rest.restaurantId);
      },
      error: (err) => {
        this.isBusy.set(false);
        this.actionErrorMessage.set(
          err?.error?.message || err?.error || err?.message || 'Failed to add member to restaurant.'
        );
      },
    });
  }

  removeMember(memberId: string): void {
    this.actionErrorMessage.set(null);
    this.actionSuccessMessage.set(null);

    const rest = this.restaurant();
    if (!rest) return;

    this.isBusy.set(true);
    this.restaurantService.removeMember(rest.restaurantId, memberId).subscribe({
      next: () => {
        this.actionSuccessMessage.set('Member removed successfully!');
        this.isBusy.set(false);
        this.loadRestaurant(rest.restaurantId);
      },
      error: (err) => {
        this.isBusy.set(false);
        this.actionErrorMessage.set(
          err?.error?.message || err?.error || err?.message || 'Failed to remove member.'
        );
      },
    });
  }

  requestTransferAdmin(member: UserDisplayInfo): void {
    this.confirmTransferAdminMember.set(member);
  }

  cancelTransferAdmin(): void {
    this.confirmTransferAdminMember.set(null);
  }

  confirmTransferAdmin(): void {
    const member = this.confirmTransferAdminMember();
    const rest = this.restaurant();
    if (!member || !rest) return;

    this.isBusy.set(true);
    this.actionErrorMessage.set(null);
    this.actionSuccessMessage.set(null);

    this.restaurantService.transferAdmin(rest.restaurantId, member.id).subscribe({
      next: () => {
        this.isBusy.set(false);
        this.confirmTransferAdminMember.set(null);
        this.router.navigate(['/restaurantsAdmin']);
      },
      error: (err) => {
        this.isBusy.set(false);
        this.confirmTransferAdminMember.set(null);
        this.actionErrorMessage.set(
          err?.error?.message || err?.error || err?.message || 'An error occurred during ownership transfer.'
        );
      },
    });
  }

  getRegisterUrl(): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/login`;
  }

  copyRegisterUrl(): void {
    const url = this.getRegisterUrl();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        this.showCopiedFeedback.set(true);
        setTimeout(() => {
          this.showCopiedFeedback.set(false);
        }, 2000);
      });
    }
  }
}
