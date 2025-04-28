import { SetMetadata } from '@nestjs/common';
export const PLANS_KEY = 'plans';
export type Plan = 'FREE_TIER' | 'FREEMIUM' | 'PREMIUM';
export const Plans = (...plans: Plan[]) => SetMetadata(PLANS_KEY, plans);
