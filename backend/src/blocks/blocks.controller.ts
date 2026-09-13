import { Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { UserSnapshot } from '../common/types.js';
import { type BlockedUserView, BlocksService } from './blocks.service.js';

@ApiTags('blocks')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class BlocksController {
  constructor(private readonly blocks: BlocksService) {}

  @Post('users/:id/block')
  @HttpCode(204)
  @ApiOperation({ summary: 'Block a user (they are not told)' })
  async block(@CurrentUser() user: UserSnapshot, @Param('id') id: string): Promise<void> {
    await this.blocks.block(user.id, id);
  }

  @Delete('users/:id/block')
  @HttpCode(204)
  @ApiOperation({ summary: 'Unblock a user' })
  async unblock(@CurrentUser() user: UserSnapshot, @Param('id') id: string): Promise<void> {
    await this.blocks.unblock(user.id, id);
  }

  @Get('me/blocks')
  @ApiOperation({ summary: 'Users I have blocked' })
  async list(@CurrentUser() user: UserSnapshot): Promise<{ blocks: BlockedUserView[] }> {
    return { blocks: await this.blocks.list(user.id) };
  }
}
