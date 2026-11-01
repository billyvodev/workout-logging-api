import { validate } from 'class-validator';
import { IsEarlierThanOrEqualTo } from './is-earlier-than-or-equal-to.decorator';

class TestDateRangeDto {
  @IsEarlierThanOrEqualTo('to')
  from?: string;

  to?: string;
}

describe('IsEarlierThanOrEqualTo Decorator', () => {
  it('should pass validation when from is earlier than to', async () => {
    const dto = new TestDateRangeDto();
    dto.from = '2026-10-01T00:00:00.000Z';
    dto.to = '2026-10-31T23:59:59.999Z';

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should pass validation when from is equal to to', async () => {
    const dto = new TestDateRangeDto();
    dto.from = '2026-10-15T12:00:00.000Z';
    dto.to = '2026-10-15T12:00:00.000Z';

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail validation when from is later than to', async () => {
    const dto = new TestDateRangeDto();
    dto.from = '2026-10-31T00:00:00.000Z';
    dto.to = '2026-10-01T23:59:59.999Z';

    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('from');
    expect(errors[0].constraints?.isEarlierThanOrEqualTo).toBe(
      "'from' date must be earlier than or equal to 'to' date.",
    );
  });

  it('should pass validation when from is omitted', async () => {
    const dto = new TestDateRangeDto();
    dto.to = '2026-10-31T23:59:59.999Z';

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should pass validation when to is omitted', async () => {
    const dto = new TestDateRangeDto();
    dto.from = '2026-10-01T00:00:00.000Z';

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should pass validation when both are omitted', async () => {
    const dto = new TestDateRangeDto();

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should pass validation if one of the values is an invalid date string (leaves format check to IsISO8601)', async () => {
    const dto = new TestDateRangeDto();
    dto.from = 'invalid-date';
    dto.to = '2026-10-31T23:59:59.999Z';

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
