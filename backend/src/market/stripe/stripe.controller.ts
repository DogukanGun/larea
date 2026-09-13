import { Controller, Get, Headers, HttpCode, Param, Post, Query, type RawBodyRequest, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsUUID } from 'class-validator';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RateLimit } from '../../common/decorators/rate-limit.decorator.js';
import { AgeVerifiedGuard } from '../../common/guards/age-verified.guard.js';
import { NotSuspendedGuard } from '../../common/guards/not-suspended.guard.js';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard.js';
import type { UserSnapshot } from '../../common/types.js';
import { InjectEnv } from '../../config/inject-env.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { MarketEnabledGuard } from '../market-enabled.guard.js';
import { type StripeAccountView, StripeConnectService } from './stripe-connect.service.js';
import { StripeWebhookService } from './stripe-webhook.service.js';

class OrderReturnParams {
  @IsUUID()
  id!: string;
}

class OrderReturnQuery {
  @IsIn(['success', 'cancel'])
  checkout!: 'success' | 'cancel';
}

/** Authenticated Connect endpoints. */
@ApiTags('market')
@ApiBearerAuth()
@Controller('market/stripe')
@UseGuards(JwtAuthGuard, NotSuspendedGuard, AgeVerifiedGuard, MarketEnabledGuard, RateLimitGuard)
export class StripeConnectController {
  constructor(
    private readonly connect: StripeConnectService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('account-link')
  @RateLimit({ limit: 5, windowSec: 600 })
  @ApiOperation({ summary: 'Start or continue Stripe Express onboarding; open the returned URL in a browser' })
  async accountLink(@CurrentUser() user: UserSnapshot): Promise<{ url: string; expiresAt: string }> {
    const row = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { email: true } });
    return this.connect.accountLink({ id: user.id, email: row.email });
  }

  @Get('account')
  @RateLimit({ limit: 30, windowSec: 60 })
  @ApiOperation({ summary: 'Payout account status (refresh=1 asks Stripe again)' })
  account(@CurrentUser() user: UserSnapshot, @Query('refresh') refresh?: string): Promise<StripeAccountView> {
    return this.connect.status(user.id, refresh === '1' || refresh === 'true');
  }
}

/** Public endpoints Stripe calls or redirects to; no JWT. */
@ApiTags('market')
@Controller('market')
@UseGuards(RateLimitGuard)
export class StripePublicController {
  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly webhooks: StripeWebhookService,
  ) {}

  private appUrl(path: string): string {
    return `${this.env.MARKET_APP_SCHEME}://${path}`;
  }

  @Get('stripe/return')
  @RateLimit({ limit: 60, windowSec: 60, by: 'ip' })
  @ApiExcludeEndpoint()
  stripeReturn(@Res() res: Response): void {
    res.redirect(302, this.appUrl('market/stripe/return?status=complete'));
  }

  @Get('stripe/refresh')
  @RateLimit({ limit: 60, windowSec: 60, by: 'ip' })
  @ApiExcludeEndpoint()
  stripeRefresh(@Res() res: Response): void {
    res.redirect(302, this.appUrl('market/stripe/return?status=refresh'));
  }

  @Get('orders/:id/return')
  @RateLimit({ limit: 60, windowSec: 60, by: 'ip' })
  @ApiExcludeEndpoint()
  orderReturn(@Param() params: OrderReturnParams, @Query() query: OrderReturnQuery, @Res() res: Response): void {
    res.redirect(302, this.appUrl(`market/order/${params.id}?checkout=${query.checkout}`));
  }

  @Post('stripe/webhook')
  @HttpCode(200)
  @RateLimit({ limit: 600, windowSec: 60, by: 'ip' })
  @ApiExcludeEndpoint()
  async webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string): Promise<{ received: true; duplicate?: true }> {
    return this.webhooks.handle(this.webhooks.verify(req.rawBody, signature, 'account'));
  }

  @Post('stripe/webhook/connect')
  @HttpCode(200)
  @RateLimit({ limit: 600, windowSec: 60, by: 'ip' })
  @ApiExcludeEndpoint()
  async connectWebhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string): Promise<{ received: true; duplicate?: true }> {
    return this.webhooks.handle(this.webhooks.verify(req.rawBody, signature, 'connect'));
  }
}
