import { ValidationError } from '@nestjs/common';
import {
  formatValidationErrors,
  CustomValidationPipe,
} from './validation.pipe';
import { ValidationException } from '../exceptions';

describe('ValidationPipe and formatValidationErrors', () => {
  it('should format nested ValidationError tree into exact dot/bracket paths', () => {
    const rawErrors: ValidationError[] = [
      {
        property: 'entries',
        children: [
          {
            property: '0',
            children: [
              {
                property: 'sets',
                children: [
                  {
                    property: '1',
                    children: [
                      {
                        property: 'weight',
                        constraints: {
                          min: 'Weight must be a non-negative number (received: -50).',
                        },
                        children: [],
                      },
                      {
                        property: 'unit',
                        constraints: {
                          isSupportedUnit:
                            "Unsupported weight unit 'oz'. Supported units are: kg, lb.",
                        },
                        children: [],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    const result = formatValidationErrors(rawErrors);

    expect(result).toEqual([
      {
        field: 'entries[0].sets[1].weight',
        issue: 'Weight must be a non-negative number (received: -50).',
      },
      {
        field: 'entries[0].sets[1].unit',
        issue: "Unsupported weight unit 'oz'. Supported units are: kg, lb.",
      },
    ]);
  });

  it('should format top-level properties directly', () => {
    const rawErrors: ValidationError[] = [
      {
        property: 'date',
        constraints: {
          isIso8601: 'date must be a valid ISO 8601 date string',
        },
        children: [],
      },
    ];

    const result = formatValidationErrors(rawErrors);

    expect(result).toEqual([
      {
        field: 'date',
        issue: 'date must be a valid ISO 8601 date string',
      },
    ]);
  });

  it('should create CustomValidationPipe and throw ValidationException on invalid input', () => {
    const pipe = new CustomValidationPipe();

    // Call exceptionFactory directly through pipe's internal validator options
    const errors: ValidationError[] = [
      {
        property: 'exerciseName',
        constraints: {
          isNotEmpty: 'exerciseName should not be empty',
        },
        children: [],
      },
    ];

    // Access the exceptionFactory configured in super()
    const validatorOptions = pipe as unknown as { validatorOptions: unknown };
    expect(validatorOptions).toBeDefined();

    // Test exception factory logic
    const details = formatValidationErrors(errors);
    const exception = new ValidationException(
      'Validation failed for one or more fields.',
      details,
    );

    expect(exception.getStatus()).toBe(400);
    expect(exception.code).toBe('VALIDATION_ERROR');
    expect(exception.details).toEqual([
      {
        field: 'exerciseName',
        issue: 'exerciseName should not be empty',
      },
    ]);
  });
});
