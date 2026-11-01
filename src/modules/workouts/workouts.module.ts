import { Module } from '@nestjs/common';
import { UnitsModule } from '../../common/units/units.module';
import { ExercisesModule } from '../exercises';
import { PrismaModule } from '../prisma';
import { PersonalRecordsController, WorkoutsController } from './controllers';
import { WorkoutRepository } from './repositories';
import {
  LogWorkoutService,
  PersonalRecordsService,
  WorkoutHistoryService,
} from './services';

@Module({
  imports: [PrismaModule, ExercisesModule, UnitsModule],
  controllers: [WorkoutsController, PersonalRecordsController],
  providers: [
    WorkoutRepository,
    LogWorkoutService,
    WorkoutHistoryService,
    PersonalRecordsService,
  ],
  exports: [
    WorkoutRepository,
    LogWorkoutService,
    WorkoutHistoryService,
    PersonalRecordsService,
  ],
})
export class WorkoutsModule {}
