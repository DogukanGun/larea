import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { MEDIA_ID_RE } from '../../media/media.types.js';
import { MAX_MESSAGE_LENGTH } from '../../moderation/rules.js';

export class SendMessageDto {
  @ApiPropertyOptional({ enum: ['TEXT', 'IMAGE'], default: 'TEXT', description: 'IMAGE messages carry a mediaId from POST /uploads and an optional caption in text' })
  @IsOptional()
  @IsIn(['TEXT', 'IMAGE'])
  kind?: 'TEXT' | 'IMAGE';

  @ApiPropertyOptional({ enum: ['MAIN', 'REGULARS'], default: 'MAIN', description: 'REGULARS: the place\'s room for level 2+ (Solana build)' })
  @IsOptional()
  @IsIn(['MAIN', 'REGULARS'])
  room?: 'MAIN' | 'REGULARS';

  @ApiPropertyOptional({ maxLength: MAX_MESSAGE_LENGTH, example: 'Anyone want to get food?', description: 'Required for TEXT; optional caption for IMAGE' })
  @ValidateIf((o: SendMessageDto) => o.kind !== 'IMAGE' || o.text !== undefined)
  @IsString()
  @MinLength(1, { message: 'Message cannot be empty.' })
  @MaxLength(MAX_MESSAGE_LENGTH, { message: `Messages can be at most ${MAX_MESSAGE_LENGTH} characters.` })
  text?: string;

  @ApiPropertyOptional({ description: 'Upload id for IMAGE messages' })
  @ValidateIf((o: SendMessageDto) => o.kind === 'IMAGE')
  @Matches(MEDIA_ID_RE, { message: 'mediaId must be an upload id.' })
  mediaId?: string;

  @ApiPropertyOptional({ description: 'Answer this message (same place and room); the reply shows a short quote of it' })
  @IsOptional()
  @IsUUID('all', { message: 'replyToId must be a message id.' })
  replyToId?: string;

  @ApiProperty({ description: 'Client-generated idempotency key (e.g. a UUID); resending with the same key returns the original result' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,64}$/, { message: 'clientKey must be 8-64 URL-safe characters.' })
  clientKey!: string;
}

export class HistoryQueryDto {
  @ApiPropertyOptional({ enum: ['MAIN', 'REGULARS'], default: 'MAIN' })
  @IsOptional()
  @IsIn(['MAIN', 'REGULARS'])
  room?: 'MAIN' | 'REGULARS';

  @ApiPropertyOptional({ description: 'Return messages newer than this message id (gap fill after reconnect)' })
  @IsOptional()
  @IsString()
  afterId?: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
