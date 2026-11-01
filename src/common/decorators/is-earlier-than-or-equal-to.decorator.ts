import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

export const IS_EARLIER_THAN_OR_EQUAL_TO = 'isEarlierThanOrEqualTo';

/**
 * Validates that the property value (a date string or Date) is earlier than or equal to
 * the related property's date.
 * If either property is omitted, null, or cannot be parsed as a valid date, validation
 * succeeds (delegating format validation to format decorators such as @IsISO8601).
 */
export function IsEarlierThanOrEqualTo(
  property: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: IS_EARLIER_THAN_OR_EQUAL_TO,
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

          const target = args.object as Record<string, unknown>;
          const relatedValue = target[relatedPropertyName];

          if (
            value === undefined ||
            value === null ||
            relatedValue === undefined ||
            relatedValue === null
          ) {
            return true;
          }

          const fromDate = new Date(value as string | number | Date);
          const toDate = new Date(relatedValue as string | number | Date);

          if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
            return true;
          }

          return fromDate.getTime() <= toDate.getTime();
        },
        defaultMessage(args: ValidationArguments): string {
          const constraints = args.constraints as unknown[];
          const targetProperty =
            Array.isArray(constraints) && typeof constraints[0] === 'string'
              ? constraints[0]
              : 'target';
          return `'${args.property}' date must be earlier than or equal to '${targetProperty}' date.`;
        },
      },
    });
  };
}
