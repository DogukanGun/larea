import { Body, Controller, Delete, Get, HttpCode, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { unauthorized } from '../common/errors.js';
import type { UserSnapshot } from '../common/types.js';
import { UpdateMeDto } from './dto/update-me.dto.js';
import { type MeView, UsersService } from './users.service.js';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Current user profile and status' })
  async me(@CurrentUser() user: UserSnapshot): Promise<MeView> {
    const me = await this.users.me(user.id);
    if (!me) throw unauthorized();
    return me;
  }

  @Patch()
  @ApiOperation({ summary: 'Change display name' })
  update(@CurrentUser() user: UserSnapshot, @Body() dto: UpdateMeDto): Promise<MeView> {
    return this.users.updateDisplayName(user.id, dto.displayName.trim());
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete (anonymise) the account' })
  async remove(@CurrentUser() user: UserSnapshot): Promise<void> {
    await this.users.deleteAccount(user.id);
  }
}
