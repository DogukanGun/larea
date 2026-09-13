import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/decorators/rate-limit.decorator.js';
import { AgeVerifiedGuard } from '../common/guards/age-verified.guard.js';
import { NotSuspendedGuard } from '../common/guards/not-suspended.guard.js';
import { RateLimitGuard } from '../common/guards/rate-limit.guard.js';
import type { UserSnapshot } from '../common/types.js';
import type { ChatMessageView } from '../realtime/protocol.js';
import { HistoryQueryDto, SendMessageDto } from './dto/messages.dto.js';
import { MessagesService, type SendResult } from './messages.service.js';

@ApiTags('messages')
@ApiBearerAuth()
@Controller('venues/:id/messages')
@UseGuards(JwtAuthGuard, NotSuspendedGuard, AgeVerifiedGuard, RateLimitGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Post()
  @HttpCode(200)
  @RateLimit({ limit: 1, windowSec: 1 }, { limit: 20, windowSec: 60 })
  @ApiOperation({ summary: 'Send a message; it is moderated before anyone sees it' })
  send(@CurrentUser() user: UserSnapshot, @Param('id') venueId: string, @Body() dto: SendMessageDto): Promise<SendResult> {
    return this.messages.send(user, venueId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Recent visible messages (oldest first), or everything after a message id' })
  async history(@CurrentUser() user: UserSnapshot, @Param('id') venueId: string, @Query() query: HistoryQueryDto): Promise<{ messages: ChatMessageView[] }> {
    return { messages: await this.messages.history(user.id, venueId, query) };
  }
}
