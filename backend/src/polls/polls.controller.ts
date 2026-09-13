import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/decorators/rate-limit.decorator.js';
import { AgeVerifiedGuard } from '../common/guards/age-verified.guard.js';
import { NotSuspendedGuard } from '../common/guards/not-suspended.guard.js';
import { RateLimitGuard } from '../common/guards/rate-limit.guard.js';
import type { UserSnapshot } from '../common/types.js';
import type { SendResult } from '../messages/messages.service.js';
import type { ChatPollView } from '../realtime/protocol.js';
import { CreatePollDto, VoteDto } from './dto/polls.dto.js';
import { PollsService } from './polls.service.js';

@ApiTags('polls')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard, NotSuspendedGuard, AgeVerifiedGuard, RateLimitGuard)
export class PollsController {
  constructor(private readonly polls: PollsService) {}

  @Post('venues/:id/polls')
  @HttpCode(200)
  @RateLimit({ limit: 1, windowSec: 5 }, { limit: 10, windowSec: 3600 })
  @ApiOperation({ summary: 'Start a poll in the chat (a message of kind POLL); question and options are moderated together' })
  create(@CurrentUser() user: UserSnapshot, @Param('id') venueId: string, @Body() dto: CreatePollDto): Promise<SendResult> {
    return this.polls.create(user, venueId, dto);
  }

  @Post('polls/:id/vote')
  @HttpCode(200)
  @RateLimit({ limit: 30, windowSec: 60 })
  @ApiOperation({ summary: 'Vote (or change your vote) while the poll is open; members only' })
  vote(@CurrentUser() user: UserSnapshot, @Param('id') pollId: string, @Body() dto: VoteDto): Promise<{ poll: ChatPollView }> {
    return this.polls.vote(user, pollId, dto.optionId);
  }

  @Post('polls/:id/close')
  @HttpCode(200)
  @RateLimit({ limit: 10, windowSec: 60 })
  @ApiOperation({ summary: 'Close the poll (author or moderator)' })
  close(@CurrentUser() user: UserSnapshot, @Param('id') pollId: string): Promise<{ poll: ChatPollView }> {
    return this.polls.close(user, pollId);
  }
}
