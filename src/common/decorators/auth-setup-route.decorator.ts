import { SetMetadata } from '@nestjs/common';
import { IS_AUTH_SETUP_ROUTE_KEY } from '../guards/firebase-auth.guard';

// Marks routes that set up the user/business — they require a valid token but not businessId in claims yet.
export const AuthSetupRoute = () => SetMetadata(IS_AUTH_SETUP_ROUTE_KEY, true);
