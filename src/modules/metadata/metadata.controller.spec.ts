import { MetadataController } from './metadata.controller';
import { ExerciseMetadataService } from '../exercises';

describe('MetadataController', () => {
  let controller: MetadataController;
  let exerciseMetadataServiceMock: {
    getAllCanonicalExercises: jest.Mock;
    getKeywordFallbacks: jest.Mock;
  };

  beforeEach(() => {
    exerciseMetadataServiceMock = {
      getAllCanonicalExercises: jest.fn().mockReturnValue([
        {
          canonicalName: 'barbell bench press',
          displayName: 'Barbell Bench Press',
          primaryMuscleGroup: 'chest',
          aliases: ['bench press'],
        },
      ]),
      getKeywordFallbacks: jest.fn().mockReturnValue([
        {
          keyword: 'bench',
          muscleGroup: 'chest',
        },
      ]),
    };

    controller = new MetadataController(
      exerciseMetadataServiceMock as unknown as ExerciseMetadataService,
    );
  });

  it('should return system configuration metadata with supported units and exercises', () => {
    const result = controller.getConfig();

    expect(result).toBeDefined();
    expect(result.supportedUnits).toContain('kg');
    expect(result.supportedUnits).toContain('lb');
    expect(result.unitDetails).toBeDefined();
    expect(result.exerciseCatalog).toHaveLength(1);
    expect(result.keywordFallbacks).toHaveLength(1);
  });
});
