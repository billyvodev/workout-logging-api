import { SetMetadata, CustomDecorator } from '@nestjs/common';

export const BYPASS_RESPONSE_TRANSFORM_KEY = 'BYPASS_RESPONSE_TRANSFORM';

/**
 * Decorator to bypass standard API envelope wrapping for endpoints that return
 * custom or raw response structures (e.g., GET /api/v1/health).
 */
export const BypassResponseTransform = (): CustomDecorator<string> =>
  SetMetadata(BYPASS_RESPONSE_TRANSFORM_KEY, true);
