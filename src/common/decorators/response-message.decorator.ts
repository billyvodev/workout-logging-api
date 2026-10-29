import { SetMetadata, CustomDecorator } from '@nestjs/common';

export const RESPONSE_MESSAGE_KEY = 'RESPONSE_MESSAGE';

/**
 * Decorator to set a response message in the standard API envelope meta.
 */
export const ResponseMessage = (message: string): CustomDecorator<string> =>
  SetMetadata(RESPONSE_MESSAGE_KEY, message);
