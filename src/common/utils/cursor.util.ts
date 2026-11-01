import { InvalidCursorException } from '../exceptions';

export interface CursorPayload {
  readonly performedAt: string;
  readonly id: string;
}

export interface DecodedCursor {
  readonly performedAt: Date;
  readonly id: string;
}

/**
 * Base64 regex ensuring the string adheres strictly to standard Base64 encoding.
 */
const BASE64_REGEX =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/**
 * Encodes a keyset pagination cursor into an opaque Base64 string.
 *
 * @param payload Object containing performedAt timestamp and entry UUID.
 * @returns Opaque Base64-encoded string.
 */
export function encodeCursor(payload: {
  performedAt: Date | string;
  id: string;
}): string {
  if (
    !payload ||
    !payload.id ||
    typeof payload.id !== 'string' ||
    payload.id.trim().length === 0
  ) {
    throw new Error('Cursor id must be a non-empty string');
  }

  const date =
    payload.performedAt instanceof Date
      ? payload.performedAt
      : new Date(payload.performedAt);

  if (isNaN(date.getTime())) {
    throw new Error('Cursor performedAt must be a valid date');
  }

  const cursorData: CursorPayload = {
    performedAt: date.toISOString(),
    id: payload.id.trim(),
  };

  return Buffer.from(JSON.stringify(cursorData), 'utf8').toString('base64');
}

/**
 * Decodes and validates an opaque Base64 keyset cursor.
 *
 * @param cursor Base64-encoded cursor token from query parameters.
 * @returns Decoded cursor with a parsed UTC Date and entry ID.
 * @throws InvalidCursorException if cursor is malformed, not valid Base64, or has tampered payload.
 */
export function decodeCursor(cursor: string): DecodedCursor {
  if (!cursor || typeof cursor !== 'string' || cursor.trim().length === 0) {
    throw new InvalidCursorException(
      'Pagination cursor cannot be decoded or has been tampered with.',
    );
  }

  const trimmed = cursor.trim();

  if (!BASE64_REGEX.test(trimmed)) {
    throw new InvalidCursorException(
      'Pagination cursor cannot be decoded or has been tampered with.',
    );
  }

  try {
    const jsonStr = Buffer.from(trimmed, 'base64').toString('utf8');
    const parsed: unknown = JSON.parse(jsonStr);

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      !('performedAt' in parsed) ||
      !('id' in parsed)
    ) {
      throw new InvalidCursorException(
        'Pagination cursor cannot be decoded or has been tampered with.',
      );
    }

    const keys = Object.keys(parsed);
    if (keys.length !== 2) {
      throw new InvalidCursorException(
        'Pagination cursor cannot be decoded or has been tampered with.',
      );
    }

    const { performedAt, id } = parsed as Record<string, unknown>;

    if (
      typeof performedAt !== 'string' ||
      typeof id !== 'string' ||
      id.trim().length === 0 ||
      id.trim().length > 128
    ) {
      throw new InvalidCursorException(
        'Pagination cursor cannot be decoded or has been tampered with.',
      );
    }

    const date = new Date(performedAt);
    if (isNaN(date.getTime())) {
      throw new InvalidCursorException(
        'Pagination cursor cannot be decoded or has been tampered with.',
      );
    }

    return {
      performedAt: date,
      id: id.trim(),
    };
  } catch (error) {
    if (error instanceof InvalidCursorException) {
      throw error;
    }
    throw new InvalidCursorException(
      'Pagination cursor cannot be decoded or has been tampered with.',
    );
  }
}
