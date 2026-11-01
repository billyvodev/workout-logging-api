import { validate } from 'class-validator';
import { IsDefinedTogetherWith } from './is-defined-together-with.decorator';

class TestComparisonDto {
  @IsDefinedTogetherWith('compareTo')
  compareFrom?: string;

  @IsDefinedTogetherWith('compareFrom')
  compareTo?: string;
}

class TestCustomMessageDto {
  @IsDefinedTogetherWith('otherProp', {
    message: 'Both fields must be provided together.',
  })
  prop?: string;

  otherProp?: string;
}

describe('IsDefinedTogetherWith Decorator', () => {
  it('should pass validation when both paired properties are provided', async () => {
    const dto = new TestComparisonDto();
    dto.compareFrom = '2026-09-01T00:00:00.000Z';
    dto.compareTo = '2026-09-30T23:59:59.999Z';

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should pass validation when both paired properties are omitted', async () => {
    const dto = new TestComparisonDto();

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail validation when compareFrom is provided without compareTo', async () => {
    const dto = new TestComparisonDto();
    dto.compareFrom = '2026-09-01T00:00:00.000Z';

    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('compareFrom');
    expect(errors[0].constraints?.isDefinedTogetherWith).toBe(
      "'compareFrom' requires 'compareTo' to also be specified.",
    );
  });

  it('should fail validation when compareTo is provided without compareFrom', async () => {
    const dto = new TestComparisonDto();
    dto.compareTo = '2026-09-30T23:59:59.999Z';

    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('compareTo');
    expect(errors[0].constraints?.isDefinedTogetherWith).toBe(
      "'compareTo' requires 'compareFrom' to also be specified.",
    );
  });

  it('should fail validation when related property is an empty or whitespace string', async () => {
    const dto = new TestComparisonDto();
    dto.compareFrom = '2026-09-01T00:00:00.000Z';
    dto.compareTo = '   ';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    const compareFromError = errors.find((e) => e.property === 'compareFrom');
    expect(compareFromError).toBeDefined();
    expect(compareFromError?.constraints?.isDefinedTogetherWith).toBe(
      "'compareFrom' requires 'compareTo' to also be specified.",
    );
  });

  it('should respect custom validation message when provided', async () => {
    const dto = new TestCustomMessageDto();
    dto.prop = 'value';

    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('prop');
    expect(errors[0].constraints?.isDefinedTogetherWith).toBe(
      'Both fields must be provided together.',
    );
  });
});
