import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { BypassResponseTransform } from './common/decorators';
import { ErrorResponseDto } from './common/dto';

@ApiTags('App')
@Controller()
@BypassResponseTransform()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({
    summary: 'Health / Root greeting',
    description:
      'Returns a plain text greeting verifying that the API server is online and accepting requests.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Service is alive and reachable.',
    schema: {
      type: 'string',
      example: 'Hello World!',
    },
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Internal server error envelope.',
    type: ErrorResponseDto,
  })
  getHello(): string {
    return this.appService.getHello();
  }
}
