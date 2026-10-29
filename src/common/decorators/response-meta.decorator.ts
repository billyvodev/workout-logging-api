import { SetMetadata, CustomDecorator } from '@nestjs/common';

export const RESPONSE_META_KEY = 'RESPONSE_META';

/**
 * Decorator to set arbitrary metadata fields in the standard API envelope meta.
 */
export const ResponseMeta = (
  meta: Record<string, unknown>,
): CustomDecorator<string> => SetMetadata(RESPONSE_META_KEY, meta);
