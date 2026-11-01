import { encodeCursor, decodeCursor, CursorPayload } from './cursor.util';
import { InvalidCursorException } from '../exceptions';
import { ErrorCode } from '../constants';
import { HttpStatus } from '@nestjs/common';

describe('cursor.util', () => {
  describe('encodeCursor', () => {
    it('should successfully encode a valid Date and ID into Base64', () => {
      const date = new Date('2026-10-29T10:30:00.000Z');
      const id = 'entry_01jcbe99z8x';

      const cursor = encodeCursor({ performedAt: date, id });
      expect(typeof cursor).toBe('string');
      expect(cursor.length).toBeGreaterThan(0);

      const decodedJson = JSON.parse(
        Buffer.from(cursor, 'base64').toString('utf8'),
      ) as CursorPayload;
      expect(decodedJson).toEqual({
        performedAt: '2026-10-29T10:30:00.000Z',
        id: 'entry_01jcbe99z8x',
      });
    });

    it('should successfully encode when performedAt is provided as an ISO string', () => {
      const dateStr = '2026-10-29T10:30:00.000Z';
      const id = 'entry_01jcbe99z8x';

      const cursor = encodeCursor({ performedAt: dateStr, id });
      const decodedJson = JSON.parse(
        Buffer.from(cursor, 'base64').toString('utf8'),
      ) as CursorPayload;
      expect(decodedJson).toEqual({
        performedAt: '2026-10-29T10:30:00.000Z',
        id: 'entry_01jcbe99z8x',
      });
    });

    it('should trim ID and normalize date to ISO UTC format', () => {
      const date = new Date('2026-10-29T17:30:00+07:00');
      const id = '  entry_with_spaces  ';

      const cursor = encodeCursor({ performedAt: date, id });
      const decodedJson = JSON.parse(
        Buffer.from(cursor, 'base64').toString('utf8'),
      ) as CursorPayload;
      expect(decodedJson.id).toBe('entry_with_spaces');
      expect(decodedJson.performedAt).toBe('2026-10-29T10:30:00.000Z');
    });

    it('should throw Error if id is missing or empty', () => {
      expect(() => encodeCursor({ performedAt: new Date(), id: '' })).toThrow(
        'Cursor id must be a non-empty string',
      );

      expect(() =>
        encodeCursor({ performedAt: new Date(), id: '   ' }),
      ).toThrow('Cursor id must be a non-empty string');

      expect(() =>
        encodeCursor({
          performedAt: new Date(),
          id: null as unknown as string,
        }),
      ).toThrow('Cursor id must be a non-empty string');
    });

    it('should throw Error if performedAt is an invalid date', () => {
      expect(() =>
        encodeCursor({ performedAt: 'invalid-date', id: 'entry_1' }),
      ).toThrow('Cursor performedAt must be a valid date');

      expect(() =>
        encodeCursor({ performedAt: new Date('invalid'), id: 'entry_1' }),
      ).toThrow('Cursor performedAt must be a valid date');
    });
  });

  describe('decodeCursor', () => {
    it('should round-trip encode and decode seamlessly', () => {
      const date = new Date('2026-10-29T10:30:00.000Z');
      const id = 'entry_01jcbe99z8x';

      const cursor = encodeCursor({ performedAt: date, id });
      const decoded = decodeCursor(cursor);

      expect(decoded.performedAt.toISOString()).toBe(
        '2026-10-29T10:30:00.000Z',
      );
      expect(decoded.id).toBe('entry_01jcbe99z8x');
    });

    it('should throw InvalidCursorException on empty, null, or non-string inputs', () => {
      expect(() => decodeCursor('')).toThrow(InvalidCursorException);
      expect(() => decodeCursor('   ')).toThrow(InvalidCursorException);
      expect(() => decodeCursor(null as unknown as string)).toThrow(
        InvalidCursorException,
      );
      expect(() => decodeCursor(undefined as unknown as string)).toThrow(
        InvalidCursorException,
      );
    });

    it('should throw InvalidCursorException on malformed non-Base64 characters', () => {
      expect(() => decodeCursor('not_base64!@#$*()')).toThrow(
        InvalidCursorException,
      );
      expect(() => decodeCursor('abc')).toThrow(InvalidCursorException);
      expect(() => decodeCursor('==')).toThrow(InvalidCursorException);
    });

    it('should throw InvalidCursorException on valid Base64 that is not JSON', () => {
      const plainTextBase64 = Buffer.from('hello world plain text').toString(
        'base64',
      );
      expect(() => decodeCursor(plainTextBase64)).toThrow(
        InvalidCursorException,
      );
    });

    it('should throw InvalidCursorException on Base64 JSON that is not an object or is an array', () => {
      const arrayBase64 = Buffer.from(
        JSON.stringify([1, 2, 'entry_1']),
      ).toString('base64');
      expect(() => decodeCursor(arrayBase64)).toThrow(InvalidCursorException);

      const primitiveBase64 = Buffer.from(JSON.stringify('a string')).toString(
        'base64',
      );
      expect(() => decodeCursor(primitiveBase64)).toThrow(
        InvalidCursorException,
      );
    });

    it('should throw InvalidCursorException if performedAt is missing or invalid', () => {
      const missingDateBase64 = Buffer.from(
        JSON.stringify({ id: 'entry_1' }),
      ).toString('base64');
      expect(() => decodeCursor(missingDateBase64)).toThrow(
        InvalidCursorException,
      );

      const invalidDateBase64 = Buffer.from(
        JSON.stringify({ performedAt: 'not-a-valid-date', id: 'entry_1' }),
      ).toString('base64');
      expect(() => decodeCursor(invalidDateBase64)).toThrow(
        InvalidCursorException,
      );
    });

    it('should throw InvalidCursorException if id is missing, not a string, or empty', () => {
      const missingIdBase64 = Buffer.from(
        JSON.stringify({ performedAt: '2026-10-29T10:30:00.000Z' }),
      ).toString('base64');
      expect(() => decodeCursor(missingIdBase64)).toThrow(
        InvalidCursorException,
      );

      const emptyIdBase64 = Buffer.from(
        JSON.stringify({
          performedAt: '2026-10-29T10:30:00.000Z',
          id: '   ',
        }),
      ).toString('base64');
      expect(() => decodeCursor(emptyIdBase64)).toThrow(InvalidCursorException);

      const nonStringIdBase64 = Buffer.from(
        JSON.stringify({
          performedAt: '2026-10-29T10:30:00.000Z',
          id: 12345,
        }),
      ).toString('base64');
      expect(() => decodeCursor(nonStringIdBase64)).toThrow(
        InvalidCursorException,
      );

      const excessiveIdBase64 = Buffer.from(
        JSON.stringify({
          performedAt: '2026-10-29T10:30:00.000Z',
          id: 'a'.repeat(129),
        }),
      ).toString('base64');
      expect(() => decodeCursor(excessiveIdBase64)).toThrow(
        InvalidCursorException,
      );
    });

    it('should throw InvalidCursorException on payload with extra fields (tampered payload)', () => {
      const tamperedBase64 = Buffer.from(
        JSON.stringify({
          performedAt: '2026-10-29T10:30:00.000Z',
          id: 'entry_1',
          role: 'admin',
        }),
      ).toString('base64');
      expect(() => decodeCursor(tamperedBase64)).toThrow(
        InvalidCursorException,
      );
    });

    it('should throw InvalidCursorException on out-of-range dates', () => {
      const pastDateBase64 = Buffer.from(
        JSON.stringify({
          performedAt: '1800-01-01T00:00:00.000Z',
          id: 'entry_1',
        }),
      ).toString('base64');
      expect(() => decodeCursor(pastDateBase64)).toThrow(
        InvalidCursorException,
      );

      const futureDateBase64 = Buffer.from(
        JSON.stringify({
          performedAt: '2200-01-01T00:00:00.000Z',
          id: 'entry_1',
        }),
      ).toString('base64');
      expect(() => decodeCursor(futureDateBase64)).toThrow(
        InvalidCursorException,
      );
    });

    it('should verify InvalidCursorException properties match RFC 7807 expectations', () => {
      try {
        decodeCursor('invalid-cursor');
        fail('Should have thrown InvalidCursorException');
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidCursorException);
        const exception = err as InvalidCursorException;
        expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
        expect(exception.code).toBe(ErrorCode.INVALID_CURSOR);
        expect(exception.message).toContain(
          'Pagination cursor cannot be decoded',
        );
      }
    });
  });
});
