import {
  Controller,
  Get,
  HttpStatus,
  Logger,
  Param,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorResponseDto } from '../../../common';
import { PersonalRecordsQueryDto, PersonalRecordsResponseDto } from '../dto';
import { PersonalRecordsService } from '../services';

@ApiTags('Personal Records')
@Controller('users/:userId/personal-records')
export class PersonalRecordsController {
  private readonly logger = new Logger(PersonalRecordsController.name);

  constructor(
    private readonly personalRecordsService: PersonalRecordsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get personal records and time-range comparison for an exercise',
    description:
      'Calculates Personal Records (heaviest set, highest volume set, best estimated 1RM) and optional period-over-period comparisons for an exercise with zero-drift unit preservation.',
  })
  @ApiParam({
    name: 'userId',
    required: true,
    description: 'Unique identifier of the user',
    example: 'user_123',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'Personal records retrieved successfully (or null records if no matching data).',
    type: PersonalRecordsResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description:
      'Validation failed for query parameters, missing required fields, or unsupported unit.',
    type: ErrorResponseDto,
  })
  async getPersonalRecords(
    @Param('userId') userId: string,
    @Query() query: PersonalRecordsQueryDto,
  ): Promise<PersonalRecordsResponseDto> {
    const startTime = Date.now();
    const effectiveUserId = userId?.trim();

    const result = await this.personalRecordsService.getPersonalRecords(
      effectiveUserId,
      query,
    );

    const durationMs = Date.now() - startTime;
    this.logger.log({
      msg: 'Personal records retrieved successfully',
      userId: effectiveUserId,
      exerciseName: query.exerciseName,
      hasComparison: Boolean(query.compareFrom && query.compareTo),
      durationMs,
    });

    return result;
  }
}
