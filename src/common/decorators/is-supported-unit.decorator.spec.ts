import { validate } from 'class-validator';
import { IsSupportedUnit } from './is-supported-unit.decorator';

class TestUnitDto {
  @IsSupportedUnit()
  unit!: string;

  constructor(unit: string) {
    this.unit = unit;
  }
}

describe('IsSupportedUnit Decorator', () => {
  it('should pass validation for supported units (kg, lb, case-insensitive)', async () => {
    for (const validUnit of ['kg', 'lb', 'KG', 'LB', 'Kg', 'Lb']) {
      const dto = new TestUnitDto(validUnit);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    }
  });

  it('should fail validation and provide descriptive message for unsupported unit', async () => {
    const dto = new TestUnitDto('oz');
    const errors = await validate(dto);
    expect(errors.length).toBe(1);
    expect(errors[0].constraints?.isSupportedUnit).toBe(
      "Unsupported weight unit 'oz'. Supported units are: kg, lb.",
    );
  });

  it('should fail validation for empty string or non-string', async () => {
    const dto = new TestUnitDto('');
    const errors = await validate(dto);
    expect(errors.length).toBe(1);
    expect(errors[0].constraints?.isSupportedUnit).toBe(
      "Unsupported weight unit ''. Supported units are: kg, lb.",
    );
  });
});
