import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { getSupportedUnits, UNIT_REGISTRY } from '../../common/units';
import { ExerciseMetadataService } from '../exercises';
import { ResponseMessage } from '../../common/decorators';

@ApiTags('Metadata')
@Controller('metadata')
export class MetadataController {
  constructor(
    private readonly exerciseMetadataService: ExerciseMetadataService,
  ) {}

  @Get('config')
  @ResponseMessage('Configuration metadata retrieved successfully.')
  @ApiOperation({
    summary: 'System configuration metadata',
    description:
      'Returns active weight unit registries, conversion factors, and exercise-to-muscle group catalog mappings.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Configuration metadata successfully retrieved.',
  })
  getConfig() {
    return {
      supportedUnits: getSupportedUnits(),
      unitDetails: UNIT_REGISTRY,
      exerciseCatalog: this.exerciseMetadataService.getAllCanonicalExercises(),
      keywordFallbacks: this.exerciseMetadataService.getKeywordFallbacks(),
    };
  }
}
