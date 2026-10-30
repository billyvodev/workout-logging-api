import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { isSupportedUnit, getSupportedUnits } from '../units/unit.registry';

export const IS_SUPPORTED_UNIT = 'isSupportedUnit';

/**
 * Validates that the property value is a supported weight unit in UNIT_REGISTRY (e.g. 'kg', 'lb').
 * Comparison is case-insensitive.
 */
export function IsSupportedUnit(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: IS_SUPPORTED_UNIT,
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && isSupportedUnit(value);
        },
        defaultMessage(args: ValidationArguments): string {
          const supported = getSupportedUnits().join(', ');
          return `Unsupported weight unit '${args.value}'. Supported units are: ${supported}.`;
        },
      },
    });
  };
}
