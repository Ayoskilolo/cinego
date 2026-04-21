import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Request } from 'express';
import { WatchPartyService } from './watch-party.service';
import { StructuredResponse } from '../response/structured-response';

@ApiTags('watch-party')
@Controller('watch-party')
export class WatchPartyController {
  constructor(private readonly watchPartyService: WatchPartyService) {}

  @ApiBearerAuth()
  @Post('rtm/token')
  @ApiOperation({ summary: 'Generate Agora RTM token' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        uid: { type: 'string' },
        expireSeconds: { type: 'number' },
      },
      required: [],
    },
  })
  @ApiResponse({ status: 201, description: 'Token generated.' })
  async generateAgoraRTMToken(
    @Req() req: Request,
    @Body('expireSeconds') expireSeconds?: number,
  ) {
    const user = req['user'];
    const uid = user?.profileId;
    return this.watchPartyService.generateAgoraRTMToken(uid, expireSeconds);
  }

  @ApiBearerAuth()
  @Post('rtm/token/refresh')
  @ApiOperation({ summary: 'Refresh Agora RTM token' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        expireSeconds: { type: 'number' },
      },
      required: [],
    },
  })
  @ApiResponse({ status: 201, description: 'Token refreshed.' })
  async refreshAgoraRTMToken(
    @Req() req: Request,
    @Body('expireSeconds') expireSeconds?: number,
  ) {
    const user = req['user'];
    const uid = user?.profileId;
    return this.watchPartyService.refreshAgoraRTMToken(uid, expireSeconds);
  }

  @ApiBearerAuth()
  @Post('rtc/token')
  @ApiOperation({ summary: 'Generate Agora RTC token' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        channelName: { type: 'string' },
        expireSeconds: { type: 'number' },
      },
      required: ['channelName'],
    },
  })
  @ApiResponse({ status: 201, description: 'RTC Token generated.' })
  async generateAgoraRTCToken(
    @Req() req: Request,
    @Body('channelName') channelName: string,
    @Body('expireSeconds') expireSeconds?: number,
  ) {
    const user = req['user'];
    const uid = user?.profileId;
    return this.watchPartyService.generateAgoraRTCToken(
      uid,
      channelName,
      expireSeconds,
    );
  }

  @ApiBearerAuth()
  @Post('rtc/token/refresh')
  @ApiOperation({ summary: 'Refresh Agora RTC token' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        channelName: { type: 'string' },
        expireSeconds: { type: 'number' },
      },
      required: ['channelName'],
    },
  })
  @ApiResponse({ status: 201, description: 'RTC Token refreshed.' })
  async refreshAgoraRTCToken(
    @Req() req: Request,
    @Body('channelName') channelName: string,
    @Body('expireSeconds') expireSeconds?: number,
  ) {
    const user = req['user'];
    const uid = user?.profileId;
    return this.watchPartyService.refreshAgoraRTCToken(
      uid,
      channelName,
      expireSeconds,
    );
  }

  @ApiBearerAuth()
  @Post('party/start')
  @ApiOperation({ summary: 'Start/Host a watch party' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        movieId: { type: 'string' },
        channelName: { type: 'string' },
      },
      required: ['movieId'],
    },
  })
  @ApiResponse({ status: 201, description: 'Party started.' })
  async startParty(
    @Req() req: Request,
    @Body('movieId') movieId: string,
    @Body('channelName') channelName?: string,
    @Body('idempotencyKey') idempotencyKey?: string,
  ) {
    const user = req['user'];
    return this.watchPartyService.startParty(
      movieId,
      channelName,
      user?.sub,
      idempotencyKey,
      user?.profileId,
    );
  }

  @ApiBearerAuth()
  @Post('party/join')
  @ApiOperation({ summary: 'Join a watch party' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        partyId: { type: 'string' },
      },
      required: ['partyId'],
    },
  })
  @ApiResponse({ status: 201, description: 'Joined party.' })
  async joinParty(@Req() req: Request, @Body('partyId') partyId: string) {
    const user = req['user'];
    return this.watchPartyService.joinParty(
      partyId,
      user?.sub,
      user?.profileId,
    );
  }

  @ApiBearerAuth()
  @Get('party/:partyId')
  @ApiOperation({ summary: 'Get party metadata' })
  @ApiResponse({ status: 200, description: 'Party metadata.' })
  async getPartyMetadata(@Param('partyId') partyId: string) {
    return this.watchPartyService.getPartyMetadata(partyId);
  }

  @ApiBearerAuth()
  @Get('party/:partyId/roster')
  @ApiOperation({ summary: 'Get party roster with resolved profile names' })
  @ApiResponse({ status: 200, description: 'Party roster.' })
  async getPartyRoster(@Param('partyId') partyId: string) {
    const data = await this.watchPartyService.getPartyRoster(partyId);
    return new StructuredResponse({ data });
  }

  @ApiBearerAuth()
  @Post('party/end')
  @ApiOperation({ summary: 'End a watch party' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        partyId: { type: 'string' },
      },
      required: ['partyId'],
    },
  })
  @ApiResponse({ status: 201, description: 'Party ended.' })
  async endParty(
    @Req() req: Request,
    @Body('partyId') partyId: string,
    @Body('idempotencyKey') idempotencyKey?: string,
  ) {
    const user = req['user'];
    return this.watchPartyService.endParty(partyId, user?.sub, idempotencyKey);
  }

  @ApiBearerAuth()
  @Post('party/schedule')
  @ApiOperation({ summary: 'Schedule a watch party' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        movieId: { type: 'string' },
        channelName: { type: 'string' },
        scheduledFor: { type: 'string', format: 'date-time' },
        inviteeIds: { type: 'array', items: { type: 'string' } },
        emails: { type: 'array', items: { type: 'string' } },
        phones: { type: 'array', items: { type: 'string' } },
      },
      required: ['movieId', 'scheduledFor'],
    },
  })
  @ApiResponse({ status: 201, description: 'Party scheduled.' })
  async scheduleParty(
    @Req() req: Request,
    @Body('movieId') movieId: string,
    @Body('channelName') channelName: string | undefined,
    @Body('scheduledFor') scheduledFor: string,
    @Body('inviteeIds') inviteeIds?: string[],
    @Body('emails') emails?: string[],
    @Body('phones') phones?: string[],
  ) {
    const user = req['user'];
    const party = await this.watchPartyService.scheduleParty(
      movieId,
      channelName,
      new Date(scheduledFor),
      user?.sub,
      inviteeIds,
      emails,
      phones,
    );
    return new StructuredResponse({ data: party });
  }

  @ApiBearerAuth()
  @Post('party/invite')
  @ApiOperation({ summary: 'Invite users to a watch party (host only)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        partyId: { type: 'string' },
        userIds: { type: 'array', items: { type: 'string' } },
        emails: { type: 'array', items: { type: 'string' } },
        phones: { type: 'array', items: { type: 'string' } },
      },
      required: ['partyId'],
    },
  })
  @ApiResponse({ status: 201, description: 'Users invited.' })
  async inviteToParty(
    @Req() req: Request,
    @Body('partyId') partyId: string,
    @Body('userIds') userIds?: string[],
    @Body('emails') emails?: string[],
    @Body('phones') phones?: string[],
  ) {
    const user = req['user'];
    return this.watchPartyService.inviteToParty(
      partyId,
      user?.sub,
      userIds,
      emails,
      phones,
    );
  }

  @ApiBearerAuth()
  @Post('party/reject-invite')
  @ApiOperation({ summary: 'Reject an invitation (invited user)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { partyId: { type: 'string' } },
      required: ['partyId'],
    },
  })
  @ApiResponse({ status: 201, description: 'Invite rejected.' })
  async rejectInvite(@Req() req: Request, @Body('partyId') partyId: string) {
    const user = req['user'];
    return this.watchPartyService.rejectInvite(partyId, user?.sub);
  }

  @ApiBearerAuth()
  @Post('party/remove-invite')
  @ApiOperation({ summary: 'Remove an invitation (host only)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { partyId: { type: 'string' }, userId: { type: 'string' } },
      required: ['partyId', 'userId'],
    },
  })
  @ApiResponse({ status: 201, description: 'Invite removed.' })
  async removeInvite(
    @Req() req: Request,
    @Body('partyId') partyId: string,
    @Body('userId') userId: string,
  ) {
    const user = req['user'];
    return this.watchPartyService.removeInvite(partyId, user?.sub, userId);
  }

  @ApiBearerAuth()
  @Post('party/rotate-code')
  @ApiOperation({ summary: 'Rotate join code (host only)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { partyId: { type: 'string' } },
      required: ['partyId'],
    },
  })
  @ApiResponse({ status: 201, description: 'Join code rotated.' })
  async rotateCode(@Req() req: Request, @Body('partyId') partyId: string) {
    const user = req['user'];
    return this.watchPartyService.rotateJoinCode(partyId, user?.sub);
  }

  @ApiBearerAuth()
  @Post('party/transfer-host')
  @ApiOperation({ summary: 'Transfer host to another participant (host only)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        partyId: { type: 'string' },
        newHostId: { type: 'string' },
      },
      required: ['partyId', 'newHostId'],
    },
  })
  @ApiResponse({ status: 201, description: 'Host transferred.' })
  async transferHost(
    @Req() req: Request,
    @Body('partyId') partyId: string,
    @Body('newHostId') newHostId: string,
  ) {
    const user = req['user'];
    return this.watchPartyService.transferHost(partyId, user?.sub, newHostId);
  }

  @ApiBearerAuth()
  @Post('party/leave')
  @ApiOperation({
    summary: 'Leave a watch party (marks freemium trial used if applicable)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { partyId: { type: 'string' } },
      required: ['partyId'],
    },
  })
  @ApiResponse({ status: 201, description: 'Left party.' })
  async leave(@Req() req: Request, @Body('partyId') partyId: string) {
    const user = req['user'];
    return this.watchPartyService.leaveParty(partyId, user?.sub);
  }

  @ApiBearerAuth()
  @Post('party/kick')
  @ApiOperation({ summary: 'Kick a participant (host only)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { partyId: { type: 'string' }, userId: { type: 'string' } },
      required: ['partyId', 'userId'],
    },
  })
  @ApiResponse({ status: 201, description: 'User kicked.' })
  async kick(
    @Req() req: Request,
    @Body('partyId') partyId: string,
    @Body('userId') userId: string,
  ) {
    const user = req['user'];
    return this.watchPartyService.kickUser(partyId, user?.sub, userId);
  }

  @ApiBearerAuth()
  @Post('party/ban')
  @ApiOperation({ summary: 'Ban a user from the party (host only)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { partyId: { type: 'string' }, userId: { type: 'string' } },
      required: ['partyId', 'userId'],
    },
  })
  @ApiResponse({ status: 201, description: 'User banned.' })
  async ban(
    @Req() req: Request,
    @Body('partyId') partyId: string,
    @Body('userId') userId: string,
  ) {
    const user = req['user'];
    return this.watchPartyService.banUser(partyId, user?.sub, userId);
  }

  @ApiBearerAuth()
  @Post('party/unban')
  @ApiOperation({ summary: 'Unban a user (host only)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { partyId: { type: 'string' }, userId: { type: 'string' } },
      required: ['partyId', 'userId'],
    },
  })
  @ApiResponse({ status: 201, description: 'User unbanned.' })
  async unban(
    @Req() req: Request,
    @Body('partyId') partyId: string,
    @Body('userId') userId: string,
  ) {
    const user = req['user'];
    return this.watchPartyService.unbanUser(partyId, user?.sub, userId);
  }

  @ApiBearerAuth()
  @Post('party/mute')
  @ApiOperation({ summary: 'Mute a user in party (host only)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { partyId: { type: 'string' }, userId: { type: 'string' } },
      required: ['partyId', 'userId'],
    },
  })
  @ApiResponse({ status: 201, description: 'User muted.' })
  async mute(
    @Req() req: Request,
    @Body('partyId') partyId: string,
    @Body('userId') userId: string,
  ) {
    const user = req['user'];
    return this.watchPartyService.muteUser(partyId, user?.sub, userId);
  }

  @ApiBearerAuth()
  @Post('party/unmute')
  @ApiOperation({ summary: 'Unmute a user in party (host only)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { partyId: { type: 'string' }, userId: { type: 'string' } },
      required: ['partyId', 'userId'],
    },
  })
  @ApiResponse({ status: 201, description: 'User unmuted.' })
  async unmute(
    @Req() req: Request,
    @Body('partyId') partyId: string,
    @Body('userId') userId: string,
  ) {
    const user = req['user'];
    return this.watchPartyService.unmuteUser(partyId, user?.sub, userId);
  }

  @ApiBearerAuth()
  @Get('my/scheduled')
  @ApiOperation({
    summary: 'List scheduled parties for current user (hosted or invited)',
  })
  @ApiResponse({ status: 200, description: 'Scheduled parties.' })
  async myScheduled(@Req() req: Request) {
    const user = req['user'];
    return this.watchPartyService.listScheduledPartiesForUser(user?.sub);
  }

  @ApiBearerAuth()
  @Post('party/join-by-code')
  @ApiOperation({ summary: 'Join a watch party with code' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        code: { type: 'string' },
      },
      required: ['code'],
    },
  })
  @ApiResponse({ status: 201, description: 'Joined party.' })
  async joinByCode(@Req() req: Request, @Body('code') code: string) {
    const user = req['user'];
    return this.watchPartyService.joinPartyByCode(
      code,
      user?.sub,
      user?.profileId,
    );
  }

  @ApiBearerAuth()
  @Post('party/start-scheduled')
  @ApiOperation({ summary: 'Start a scheduled party (host only)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        partyId: { type: 'string' },
      },
      required: ['partyId'],
    },
  })
  @ApiResponse({ status: 201, description: 'Scheduled party started.' })
  async startScheduled(
    @Req() req: Request,
    @Body('partyId') partyId: string,
    @Body('idempotencyKey') idempotencyKey?: string,
  ) {
    const user = req['user'];
    return this.watchPartyService.startScheduledParty(
      partyId,
      user?.sub,
      idempotencyKey,
      user?.profileId,
    );
  }
}
