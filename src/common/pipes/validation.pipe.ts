import {
  Injectable,
  ValidationPipe as NestValidationPipe,
  ValidationError,
} from '@nestjs/common';
import { ErrorDetail } from '../interfaces';
import { ValidationException } from '../exceptions';

/**
 * Formats a hierarchy of class-validator ValidationErrors into a flat list of ErrorDetail items
 * with exact field paths like 'entries[0].sets[1].weight'.
 */
export function formatValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): ErrorDetail[] {
  const details: ErrorDetail[] = [];

  for (const error of errors) {
    const isIndex = /^\d+$/.test(error.property);
    const currentPath = parentPath
      ? isIndex
        ? `${parentPath}[${error.property}]`
        : `${parentPath}.${error.property}`
      : isIndex
        ? `[${error.property}]`
        : error.property;

    if (error.constraints) {
      for (const issue of Object.values(error.constraints)) {
        details.push({
          field: currentPath,
          issue,
        });
      }
    }

    if (error.children && error.children.length > 0) {
      details.push(...formatValidationErrors(error.children, currentPath));
    }
  }

  return details;
}

@Injectable()
export class CustomValidationPipe extends NestValidationPipe {
  constructor() {
    super({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) => {
        const details = formatValidationErrors(errors);
        return new ValidationException(
          'Validation failed for one or more fields.',
          details,
        );
      },
    });
  }
}
