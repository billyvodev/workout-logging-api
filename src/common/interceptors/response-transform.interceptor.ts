import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  StreamableFile,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  BYPASS_RESPONSE_TRANSFORM_KEY,
  RESPONSE_MESSAGE_KEY,
  RESPONSE_META_KEY,
} from '../decorators';
import { ApiResponseEnvelope } from '../interfaces';

@Injectable()
export class ResponseTransformInterceptor<T> implements NestInterceptor<
  T,
  ApiResponseEnvelope<T> | T
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponseEnvelope<T> | T> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const isBypassed = this.reflector.getAllAndOverride<boolean>(
      BYPASS_RESPONSE_TRANSFORM_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isBypassed) {
      return next.handle();
    }

    const message = this.reflector.getAllAndOverride<string>(
      RESPONSE_MESSAGE_KEY,
      [context.getHandler(), context.getClass()],
    );

    const decoratorMeta = this.reflector.getAllAndOverride<
      Record<string, unknown>
    >(RESPONSE_META_KEY, [context.getHandler(), context.getClass()]);

    return next.handle().pipe(
      map((res: unknown) => {
        // Pass through StreamableFile, Buffer, or Stream directly
        if (
          res instanceof StreamableFile ||
          (typeof res === 'object' &&
            res !== null &&
            'pipe' in res &&
            typeof res.pipe === 'function')
        ) {
          return res as T;
        }

        // Build decorator meta if any
        const decoratorMetaObj: Record<string, unknown> = {
          ...(decoratorMeta || {}),
          ...(message ? { message } : {}),
        };

        // If response is null or undefined
        if (res === null || res === undefined) {
          const result: ApiResponseEnvelope<null> = {
            data: null,
            ...(Object.keys(decoratorMetaObj).length > 0
              ? { meta: decoratorMetaObj }
              : {}),
          };
          return result as unknown as T;
        }

        // If response is already an envelope with a "data" property
        if (
          typeof res === 'object' &&
          res !== null &&
          !Array.isArray(res) &&
          'data' in res
        ) {
          const envelope = res as {
            data: unknown;
            pagination?: unknown;
            meta?: Record<string, unknown>;
          };
          const mergedMeta = {
            ...decoratorMetaObj,
            ...(envelope.meta || {}),
          };

          return {
            ...envelope,
            ...(Object.keys(mergedMeta).length > 0 ? { meta: mergedMeta } : {}),
          } as unknown as T;
        }

        // If response already has a status property (e.g. GET /health: { status: 'ok', ... })
        if (
          typeof res === 'object' &&
          res !== null &&
          !Array.isArray(res) &&
          'status' in res &&
          typeof res.status === 'string'
        ) {
          return res as T;
        }

        // Otherwise wrap raw payload in standard ApiResponseEnvelope
        const envelope: ApiResponseEnvelope<unknown> = {
          data: res,
          ...(Object.keys(decoratorMetaObj).length > 0
            ? { meta: decoratorMetaObj }
            : {}),
        };

        return envelope as unknown as T;
      }),
    );
  }
}
