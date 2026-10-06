import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/decorators/rate-limit.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { AgeVerifiedGuard } from '../common/guards/age-verified.guard.js';
import { NotSuspendedGuard } from '../common/guards/not-suspended.guard.js';
import { RateLimitGuard } from '../common/guards/rate-limit.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import type { UserSnapshot } from '../common/types.js';
import type { LocationFix } from '../presence/presence.service.js';
import type { PinMessageView } from '../realtime/protocol.js';
import { SolanaEnabledGuard } from '../solana/solana-enabled.guard.js';
import { BanUserDto, type OptionalFixQueryDto, PinHistoryQueryDto, PinNearbyQueryDto, PinTextDto, PurchasePinDto, QuotePinDto, SendPinMessageDto, SubmitPinPaymentDto } from './dto/pins.dto.js';
import { PinsEnabledGuard } from './pins-enabled.guard.js';
import { type PinQuote, type PinSendResult, type PinSolanaPayment, PinsService, type PinView, type PurchaseInput } from './pins.service.js';

function fixFrom(q: OptionalFixQueryDto): LocationFix | undefined {
  if (q.lat === undefined || q.lng === undefined || q.accuracy === undefined) return undefined;
  return { lat: q.lat, lng: q.lng, accuracy: q.accuracy, mocked: q.mocked };
}

@ApiTags('pins')
@ApiBearerAuth()
@Controller('pins')
@UseGuards(JwtAuthGuard, NotSuspendedGuard, AgeVerifiedGuard, PinsEnabledGuard, RateLimitGuard)
export class PinsController {
  constructor(private readonly pins: PinsService) {}

  @Post('quote')
  @RateLimit({ limit: 10, windowSec: 60 }, { limit: 60, windowSec: 3600 })
  @ApiOperation({ summary: 'Price a message pin and create it unpaid; the text is moderated before anyone pays' })
  quote(@CurrentUser() user: UserSnapshot, @Body() dto: QuotePinDto): Promise<PinQuote> {
    return this.pins.quote(user, dto);
  }

  @Post(':id/purchase')
  @HttpCode(200)
  @RateLimit({ limit: 30, windowSec: 60 })
  @ApiOperation({ summary: 'Activate a pin with an App Store or Google Play purchase (idempotent per transaction)' })
  purchase(@CurrentUser() user: UserSnapshot, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PurchasePinDto): Promise<PinView> {
    const input: PurchaseInput =
      dto.platform === 'apple' ? { platform: 'apple', signedTransaction: dto.signedTransaction! } : { platform: 'google', productId: dto.productId!, purchaseToken: dto.purchaseToken! };
    return this.pins.purchase(user, id, input);
  }

  @Post(':id/solana/pay')
  @UseGuards(SolanaEnabledGuard)
  @RateLimit({ limit: 10, windowSec: 60 })
  @ApiOperation({ summary: 'dApp Store build: build the USDC payment for a pin, to sign with Mobile Wallet Adapter' })
  solanaPay(@CurrentUser() user: UserSnapshot, @Param('id', ParseUUIDPipe) id: string): Promise<PinSolanaPayment> {
    return this.pins.solanaPay(user, id);
  }

  @Post(':id/solana/submit')
  @HttpCode(200)
  @UseGuards(SolanaEnabledGuard)
  @RateLimit({ limit: 20, windowSec: 60 })
  @ApiOperation({ summary: 'dApp Store build: send the signed USDC payment; the pin goes live once it confirms' })
  solanaSubmit(@CurrentUser() user: UserSnapshot, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitPinPaymentDto): Promise<PinView> {
    return this.pins.solanaSubmit(user, id, dto.signedTransaction);
  }

  @Get('nearby')
  @ApiOperation({ summary: 'Live pins in the map viewport, with distance and whether their chat can be opened from the fix' })
  async nearby(@CurrentUser() user: UserSnapshot, @Query() query: PinNearbyQueryDto): Promise<{ pins: PinView[] }> {
    return { pins: await this.pins.nearby(user, query) };
  }

  @Get('mine')
  @ApiOperation({ summary: "The caller's pins, including unpaid ones" })
  async mine(@CurrentUser() user: UserSnapshot): Promise<{ pins: PinView[] }> {
    return { pins: await this.pins.mine(user) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'One pin; pass the fix as lat/lng/accuracy to get distance and eligibility' })
  get(@CurrentUser() user: UserSnapshot, @Param('id', ParseUUIDPipe) id: string, @Query() query: PinHistoryQueryDto): Promise<PinView> {
    return this.pins.get(user, id, fixFrom(query));
  }

  @Patch(':id')
  @RateLimit({ limit: 10, windowSec: 600 })
  @ApiOperation({ summary: 'Owner: change the pinned text (moderated again)' })
  edit(@CurrentUser() user: UserSnapshot, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PinTextDto): Promise<PinView> {
    return this.pins.edit(user, id, dto.text);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: "The pin's chat, oldest first; needs a fix near the pin unless you own it" })
  async history(@CurrentUser() user: UserSnapshot, @Param('id', ParseUUIDPipe) id: string, @Query() query: PinHistoryQueryDto): Promise<{ messages: PinMessageView[] }> {
    return { messages: await this.pins.history(user, id, { fix: fixFrom(query), afterId: query.afterId, limit: query.limit }) };
  }

  @Post(':id/messages')
  @HttpCode(200)
  @RateLimit({ limit: 1, windowSec: 1 }, { limit: 20, windowSec: 60 })
  @ApiOperation({ summary: "Write in the pin's chat; moderated before anyone sees it" })
  send(@CurrentUser() user: UserSnapshot, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SendPinMessageDto): Promise<PinSendResult> {
    return this.pins.send(user, id, dto);
  }

  @Post(':id/messages/:messageId/hide')
  @HttpCode(204)
  @ApiOperation({ summary: 'Owner: hide a message in the chat' })
  async hide(@CurrentUser() user: UserSnapshot, @Param('id', ParseUUIDPipe) id: string, @Param('messageId', ParseUUIDPipe) messageId: string): Promise<void> {
    await this.pins.ownerHide(user, id, messageId);
  }

  @Get(':id/bans')
  @ApiOperation({ summary: 'Owner: people removed from the chat' })
  async bans(@CurrentUser() user: UserSnapshot, @Param('id', ParseUUIDPipe) id: string) {
    return { users: await this.pins.bans(user, id) };
  }

  @Post(':id/bans')
  @HttpCode(204)
  @ApiOperation({ summary: 'Owner: remove someone from the chat; they cannot come back' })
  async ban(@CurrentUser() user: UserSnapshot, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BanUserDto): Promise<void> {
    await this.pins.ban(user, id, dto.userId);
  }

  @Delete(':id/bans/:userId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Owner: let someone back in' })
  async unban(@CurrentUser() user: UserSnapshot, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string): Promise<void> {
    await this.pins.unban(user, id, userId);
  }
}

/** App Store Server Notifications v2 (set this URL in App Store Connect). Authenticity comes from Apple's signature. */
@Controller('pins/apple')
export class AppleNotificationsController {
  constructor(private readonly pins: PinsService) {}

  @Post('notifications')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  notify(@Body() body: { signedPayload?: string }): Promise<{ handled: boolean }> {
    return this.pins.appleNotification(String(body?.signedPayload ?? ''));
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/pins')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('MODERATOR', 'ADMIN')
export class PinsAdminController {
  constructor(private readonly pins: PinsService) {}

  @Post(':id/remove')
  @HttpCode(200)
  @ApiOperation({ summary: 'Take a pin off the map' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ removed: boolean }> {
    return { removed: await this.pins.remove(id, 'moderator') };
  }
}
