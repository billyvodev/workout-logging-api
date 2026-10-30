import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../../common';
import { LogWorkoutDto, LoggedWorkoutResponseDto } from '../dto';
import { LogWorkoutService } from '../services';

@ApiTags('Workouts')
@Controller('users/:userId/workouts')
export class WorkoutsController {
  private readonly logger = new Logger(WorkoutsController.name);

  constructor(private readonly logWorkoutService: LogWorkoutService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Log workout entries for a user (single or bulk)',
    description:
      'Logs one or multiple exercise entries for a user in a single atomic transaction with write-time metric pre-computation.',
  })
  @ApiParam({
    name: 'userId',
    required: true,
    description: 'Unique identifier of the user logging workouts',
    example: 'user_123',
  })
  @ApiHeader({
    name: 'idempotency-key',
    required: false,
    description:
      'Optional unique UUID v4 string to safely retry workout logging requests without duplicating records.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Workout entries successfully created.',
    type: LoggedWorkoutResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed for input fields.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Idempotency key reused with different payload.',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Business rule violation (e.g. bulk batch > 100 entries).',
    type: ErrorResponseDto,
  })
  async logWorkout(
    @Param('userId') userId: string,
    @Body() dto: LogWorkoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<LoggedWorkoutResponseDto> {
    const startTime = Date.now();
    const effectiveUserId = userId?.trim();

    const result = await this.logWorkoutService.logWorkouts(
      effectiveUserId,
      dto,
      idempotencyKey,
    );

    const durationMs = Date.now() - startTime;
    this.logger.log({
      msg: 'Workout entry created successfully',
      userId: effectiveUserId,
      entriesCount: result.meta.entriesLogged,
      setsCount: result.meta.totalSetsLogged,
      durationMs,
    });

    return result;
  }
}
