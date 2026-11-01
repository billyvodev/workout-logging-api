import { Module } from '@nestjs/common';
import { MetadataController } from './metadata.controller';
import { ExercisesModule } from '../exercises';

@Module({
  imports: [ExercisesModule],
  controllers: [MetadataController],
})
export class MetadataModule {}
