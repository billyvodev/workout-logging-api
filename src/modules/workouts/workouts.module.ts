import { Module } from '@nestjs/common';
import { UnitsModule } from '../../common/units/units.module';
import { ExercisesModule } from '../exercises';
import { PrismaModule } from '../prisma';
import { WorkoutsController } from './controllers';
import { WorkoutRepository } from './repositories';
import { LogWorkoutService } from './services';

@Module({
  imports: [PrismaModule, ExercisesModule, UnitsModule],
  controllers: [WorkoutsController],
  providers: [WorkoutRepository, LogWorkoutService],
  exports: [WorkoutRepository, LogWorkoutService],
})
export class WorkoutsModule {}
