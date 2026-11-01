import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

export const IS_DEFINED_TOGETHER_WITH = 'isDefinedTogetherWith';

/**
 * Helper to determine if a property has a meaningful defined value (not undefined, null, or whitespace-only string).
 */
function isValueDefined(val: unknown): boolean {
  if (val === undefined || val === null) {
    return false;
  }
  if (typeof val === 'string' && val.trim() === '') {
    return false;
  }
  return true;
}

/**
 * Validates that if the decorated property has a defined value, the related property
 * must also have a defined value.
 *
 * If the decorated property is omitted or empty, validation succeeds.
 */
export function IsDefinedTogetherWith(
  property: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: IS_DEFINED_TOGETHER_WITH,
      target: object.constructor,
      propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const constraints = args.constraints as unknown[];
          const relatedPropertyName =
            Array.isArray(constraints) && typeof constraints[0] === 'string'
              ? constraints[0]
              : '';

          if (!relatedPropertyName) {
            return true;
          }

          // If current property is not defined, validation succeeds
          if (!isValueDefined(value)) {
            return true;
          }

          // If current property is defined, related property must also be defined
          const target = args.object as Record<string, unknown>;
          const relatedValue = target[relatedPropertyName];

          return isValueDefined(relatedValue);
        },
        defaultMessage(args: ValidationArguments): string {
          const constraints = args.constraints as unknown[];
          const targetProperty =
            Array.isArray(constraints) && typeof constraints[0] === 'string'
              ? constraints[0]
              : 'related property';
          return `'${args.property}' requires '${targetProperty}' to also be specified.`;
        },
      },
    });
  };
}
