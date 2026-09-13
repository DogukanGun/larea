import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MAX_POLL_OPTION, MAX_POLL_OPTIONS, MAX_POLL_QUESTION, MIN_POLL_OPTIONS } from '../poll-view.js';

export class CreatePollDto {
  @ApiProperty({ maxLength: MAX_POLL_QUESTION, example: 'Pizza or ramen tonight?' })
  @IsString()
  @MinLength(1, { message: 'Ask a question.' })
  @MaxLength(MAX_POLL_QUESTION, { message: `Questions can be at most ${MAX_POLL_QUESTION} characters.` })
  question!: string;

  @ApiProperty({ type: [String], minItems: MIN_POLL_OPTIONS, maxItems: MAX_POLL_OPTIONS, example: ['Pizza', 'Ramen'] })
  @IsArray()
  @ArrayMinSize(MIN_POLL_OPTIONS, { message: 'A poll needs at least two options.' })
  @ArrayMaxSize(MAX_POLL_OPTIONS, { message: `A poll can have at most ${MAX_POLL_OPTIONS} options.` })
  @IsString({ each: true })
  @MinLength(1, { each: true, message: 'Options cannot be empty.' })
  @MaxLength(MAX_POLL_OPTION, { each: true, message: `Options can be at most ${MAX_POLL_OPTION} characters.` })
  options!: string[];

  @ApiPropertyOptional({ description: 'Minutes until the poll closes on its own (5 minutes to 7 days); open until closed when omitted' })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(10_080)
  durationMinutes?: number;

  @ApiProperty({ description: 'Client-generated idempotency key' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,64}$/, { message: 'clientKey must be 8-64 URL-safe characters.' })
  clientKey!: string;
}

export class VoteDto {
  @ApiProperty()
  @IsUUID()
  optionId!: string;
}
