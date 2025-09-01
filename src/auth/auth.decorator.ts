import { SetMetadata } from '@nestjs/common';
export const IS_PUBLIC = 'IS_PUBLIC';

export const IS_PRE_PROFILE = 'IS_PRE_PROFILE';

export function Public() {
  return SetMetadata('IS_PUBLIC', true);
}

export function AllowPreProfile() {
  return SetMetadata('IS_PRE_PROFILE', true);
}
