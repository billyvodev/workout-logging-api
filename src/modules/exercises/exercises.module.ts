import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma';
import { ExerciseMetadataService } from './exercise-metadata.service';

@Module({
  imports: [PrismaModule],
  providers: [ExerciseMetadataService],
  exports: [ExerciseMetadataService],
})
export class ExercisesModule {}
