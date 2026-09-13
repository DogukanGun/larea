import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { DISPLAY_NAME_PATTERN, DISPLAY_NAME_RULE } from '../../auth/dto/auth.dto.js';

export class UpdateMeDto {
  @ApiProperty({ description: DISPLAY_NAME_RULE })
  @IsString()
  @Matches(DISPLAY_NAME_PATTERN, { message: DISPLAY_NAME_RULE })
  displayName!: string;
}
