import { Module } from '@nestjs/common';
import { UnitsModule } from '../../common/units/units.module';
import { ExercisesModule } from '../exercises';
import { PrismaModule } from '../prisma';
import { WorkoutsController } from './controllers';
import { WorkoutRepository } from './repositories';
import { LogWorkoutService, WorkoutHistoryService } from './services';

@Module({
  imports: [PrismaModule, ExercisesModule, UnitsModule],
  controllers: [WorkoutsController],
  providers: [WorkoutRepository, LogWorkoutService, WorkoutHistoryService],
  exports: [WorkoutRepository, LogWorkoutService, WorkoutHistoryService],
})
export class WorkoutsModule {}
