import { User } from '../entities/user.entity';
import { MaturityRatings } from '../enum/maturityRatings';

export interface ProfileResponse {
  id: string;
  profileName: string;
  maturityRatings: MaturityRatings;
  profileImageUrl?: string;
  dateCreated: Date;
  dateUpdated: Date;
  isActive: boolean;
}

export interface ProfileWithTokenResponse {
  profile: ProfileResponse;
  accessToken: string;
}

export interface UserWithProfileResponse {
  user: User;
  activeProfile: ProfileResponse;
}
