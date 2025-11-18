import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { RtmTokenBuilder } from 'agora-token';
import { v4 as uuidv4 } from 'uuid';
import { WatchParty } from './entities/watch-party.entity';
import { Movie } from '../movie/entities/movie.entity';
import { User } from '../user/entities/user.entity';
import { SubscriptionType } from '../user/enum/userType';

@Injectable()
export class WatchPartyService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(WatchParty)
    private readonly partyRepo: Repository<WatchParty>,
    @InjectRepository(Movie)
    private readonly movieRepo: Repository<Movie>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  private rateMap = new Map<string, { windowStart: number; count: number }>();

  private checkRateLimit(op: 'start' | 'join' | 'rotate', userId: string, maxPerSec = 5) {
    const key = `${op}:${userId}`;
    const now = Date.now();
    const windowMs = 1000;
    const entry = this.rateMap.get(key);
    if (!entry || now - entry.windowStart >= windowMs) {
      this.rateMap.set(key, { windowStart: now, count: 1 });
      return;
    }
    entry.count++;
    if (entry.count > maxPerSec) {
      throw new ForbiddenException('Too many requests, please slow down');
    }
  }

  async generateAgoraRTMToken(uid: string, expireSeconds?: number) {
    if (!uid) {
      throw new BadRequestException('uid is required');
    }

    const appId =
      this.configService.get<string>('AGORA_APP_ID') ||
      this.configService.get<string>('agora.appId');
    const appCertificate =
      this.configService.get<string>('AGORA_APP_CERTIFICATE') ||
      this.configService.get<string>('agora.appCertificate');

    if (!appId || !appCertificate) {
      throw new InternalServerErrorException(
        'Missing AGORA_APP_ID or AGORA_APP_CERTIFICATE',
      );
    }

    const ttl = Number.isFinite(expireSeconds as number)
      ? Number(expireSeconds)
      : Number(this.configService.get<string>('AGORA_TOKEN_EXPIRE_SECONDS')) ||
        7200;

    const token = RtmTokenBuilder.buildToken(appId, appCertificate, uid, ttl);
    return { token, expireSeconds: ttl };
  }

  async refreshAgoraRTMToken(uid: string, expireSeconds?: number) {
    return this.generateAgoraRTMToken(uid, expireSeconds);
  }

  private ensureEligible(user: User) {
    if (
      user.subscriptionType === SubscriptionType.FREEMIUM ||
      user.subscriptionType === SubscriptionType.PREMIUM
    ) {
      return true;
    }
    throw new ForbiddenException(
      'Your plan does not allow starting or joining watch parties. Upgrade to Freemium or Premium.',
    );
  }

  private async userHasActiveParty(userId: string) {
    const count = await this.partyRepo
      .createQueryBuilder('party')
      .leftJoin('party.participants', 'p')
      .where('party.status = :status', { status: 'ACTIVE' })
      .andWhere('(party.hostId = :uid OR p.id = :uid)', { uid: userId })
      .getCount();
    return count > 0;
  }

  private async userHasScheduledOrActiveParty(userId: string) {
    const count = await this.partyRepo
      .createQueryBuilder('party')
      .leftJoin('party.participants', 'p')
      .where('party.status IN (:...statuses)', { statuses: ['SCHEDULED', 'ACTIVE'] })
      .andWhere('(party.hostId = :uid OR p.id = :uid)', { uid: userId })
      .getCount();
    return count > 0;
  }

  private generateJoinCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  async startParty(movieId: string, channelName: string | undefined, requestingUserId: string, idempotencyKey?: string) {
    if (!movieId) throw new BadRequestException('movieId is required');
    this.checkRateLimit('start', requestingUserId);

    const movie = await this.movieRepo.findOne({ where: { id: movieId } });

    if (!movie) throw new NotFoundException('Movie not found');

    const host = await this.userRepo.findOne({ where: { id: requestingUserId } });
    if (!host) throw new NotFoundException('User not found');
    this.ensureEligible(host);

    if (await this.userHasActiveParty(host.id)) {
      throw new ForbiddenException('You already have an active party');
    }
    if (host.subscriptionType === SubscriptionType.FREEMIUM) {
      if (await this.userHasScheduledOrActiveParty(host.id)) {
        throw new ForbiddenException('Freemium users can only have one scheduled or active party');
      }
    }

    if (idempotencyKey) {
      const existing = await this.partyRepo.findOne({ where: { startKey: idempotencyKey, hostId: requestingUserId } });
      if (existing && existing.status === 'ACTIVE') {
        const tok = await this.generateAgoraRTMToken(requestingUserId);
        return {
          party: existing,
          rtmToken: tok.token,
          expireSeconds: tok.expireSeconds,
          role: 'HOST',
          channelName: existing.channelName,
        };
      }
    }
    const suffix = uuidv4();
    const base = (channelName && channelName.trim()) || movie.title;
    const finalName = `${base}-${suffix}`;
    const party = this.partyRepo.create({
      channelName: finalName,
      movieId,
      hostId: host.id,
      host,
      status: 'ACTIVE',
      participants: host ? [host] : [],
      joinCode: this.generateJoinCode(),
      startKey: idempotencyKey,
    });
    const saved = await this.partyRepo.save(party);
    const tok = await this.generateAgoraRTMToken(requestingUserId);
    return {
      party: saved,
      rtmToken: tok.token,
      expireSeconds: tok.expireSeconds,
      role: 'HOST',
      channelName: saved.channelName,
    };
  }

  async joinParty(partyId: string, requestingUserId: string) {
    if (!partyId || !requestingUserId) {
      throw new BadRequestException('partyId and userId are required');
    }
    this.checkRateLimit('join', requestingUserId);

    const party = await this.partyRepo.findOne({ where: { id: partyId }, relations: { participants: true, host: true, bannedUsers: true } });
    if (!party) throw new NotFoundException('Party not found');

    if (party.status === 'ENDED') {
      throw new BadRequestException('Party has ended');
    }
    const user = await this.userRepo.findOne({ where: { id: requestingUserId } });
    if (!user) throw new NotFoundException('User not found');
    this.ensureEligible(user);
    if (party.status === 'ACTIVE') {
      if (await this.userHasActiveParty(user.id)) {
        throw new ForbiddenException('You already have an active party');
      }
    }
    if (user.subscriptionType === SubscriptionType.FREEMIUM) {
      if (await this.userHasScheduledOrActiveParty(user.id)) {
        throw new ForbiddenException('Freemium users can only have one scheduled or active party');
      }
    }

    const exists = (party.participants || []).some((u) => u.id === user.id);
    if (!exists) {
      party.participants = [...(party.participants || []), user];
    }
    await this.partyRepo.save(party);
    const tok = await this.generateAgoraRTMToken(requestingUserId);
    return {
      party,
      rtmToken: tok.token,
      expireSeconds: tok.expireSeconds,
      role: 'PARTICIPANT',
      channelName: party.channelName,
    };
  }

  async endParty(partyId: string, requestingUserId: string, idempotencyKey?: string) {
    const party = await this.partyRepo.findOne({ where: { id: partyId }, relations: { participants: true, host: true } });
    if (!party) throw new NotFoundException('Party not found');
    if (party.hostId && party.hostId !== requestingUserId) {
      throw new ForbiddenException('Only the host can end the party');
    }
    if (party.status === 'ENDED') {
      if (idempotencyKey && party.lastEndKey === idempotencyKey) {
        return party;
      }
      return party;
    }
    party.status = 'ENDED';
    party.endedAt = new Date();
    party.lastEndKey = idempotencyKey;
    await this.partyRepo.save(party);
    const freemiumUsers = (party.participants || []).filter(
      (u) => u.subscriptionType === SubscriptionType.FREEMIUM,
    );
    if (freemiumUsers.length) {
      const ids = freemiumUsers.map((u) => u.id);
      await this.userRepo.update(
        { id: In(ids) },
        {
          subscriptionType: SubscriptionType.FREE_TIER,
          isSubscribed: false,
          subscriptionExpiresAt: null,
          nextBillingDate: null,
        },
      );
    }
    return party;
  }

  async getPartyMetadata(partyId: string) {
    const party = await this.partyRepo.findOne({ where: { id: partyId }, relations: { participants: true, host: true, invitedUsers: true, bannedUsers: true, mutedUsers: true } });
    if (!party) throw new NotFoundException('Party not found');
    const movie = await this.movieRepo.findOne({
      where: { id: party.movieId },
    });
    return {
      party,
      movie: movie
        ? { id: movie.id, title: (movie as any).title || movie['title'] }
        : null,
    };
  }

  async scheduleParty(
    movieId: string,
    channelName: string | undefined,
    scheduledFor: Date,
    requestingUserId: string,
    inviteeIds?: string[],
    emails?: string[],
    phones?: string[],
  ) {
    if (!movieId) throw new BadRequestException('movieId is required');
    if (!scheduledFor || isNaN(new Date(scheduledFor).getTime())) {
      throw new BadRequestException('scheduledFor must be a valid date');
    }
    const now = new Date();
    const sched = new Date(scheduledFor);
    if (sched <= now) throw new BadRequestException('scheduledFor must be in the future');

    const movie = await this.movieRepo.findOne({ where: { id: movieId } });
    if (!movie) throw new NotFoundException('Movie not found');

    const host = await this.userRepo.findOne({ where: { id: requestingUserId } });
    if (!host) throw new NotFoundException('User not found');
    this.ensureEligible(host);

    if (host.subscriptionType === SubscriptionType.FREEMIUM) {
      if (await this.userHasScheduledOrActiveParty(host.id)) {
        throw new ForbiddenException('Freemium users can only have one scheduled or active party');
      }
    }

    let invited: User[] = [];
    const ids = inviteeIds || [];
    const emailList = emails || [];
    const phoneList = phones || [];
    const byIds = ids.length ? await this.userRepo.find({ where: { id: In(ids) } }) : [];
    const byEmails = emailList.length ? await this.userRepo.find({ where: { email: In(emailList) } }) : [];
    const byPhones = phoneList.length ? await this.userRepo.find({ where: { phoneNumber: In(phoneList) } }) : [];
    const seen = new Set<string>();
    for (const u of [...byIds, ...byEmails, ...byPhones]) {
      if (!seen.has(u.id)) {
        seen.add(u.id);
        invited.push(u);
      }
    }

    const suffix = uuidv4();
    const base = (channelName && channelName.trim()) || movie.title;
    const finalName = `${base}-${suffix}`;
    const party = this.partyRepo.create({
      channelName: finalName,
      movieId,
      hostId: host.id,
      host,
      status: 'SCHEDULED',
      scheduledFor: sched,
      participants: host ? [host] : [],
      invitedUsers: invited,
      joinCode: this.generateJoinCode(),
    });
    return await this.partyRepo.save(party);
  }

  async inviteToParty(partyId: string, requestingUserId: string, userIds?: string[], emails?: string[], phones?: string[]) {
    const ids = userIds || [];
    const emailList = emails || [];
    const phoneList = phones || [];
    if (!ids.length && !emailList.length && !phoneList.length) return this.getPartyMetadata(partyId);
    const party = await this.partyRepo.findOne({ where: { id: partyId }, relations: { invitedUsers: true, host: true } });
    if (!party) throw new NotFoundException('Party not found');
    if (party.hostId !== requestingUserId) throw new ForbiddenException('Only host can invite');
    const byIds = ids.length ? await this.userRepo.find({ where: { id: In(ids) } }) : [];
    const byEmails = emailList.length ? await this.userRepo.find({ where: { email: In(emailList) } }) : [];
    const byPhones = phoneList.length ? await this.userRepo.find({ where: { phoneNumber: In(phoneList) } }) : [];
    const users = [...byIds, ...byEmails, ...byPhones];
    const existingIds = new Set((party.invitedUsers || []).map((u) => u.id));
    const toAdd = users.filter((u) => !existingIds.has(u.id));
    party.invitedUsers = [...(party.invitedUsers || []), ...toAdd];
    await this.partyRepo.save(party);
    const tok = await this.generateAgoraRTMToken(requestingUserId);
    return {
      party,
      rtmToken: tok.token,
      expireSeconds: tok.expireSeconds,
      role: 'PARTICIPANT',
      channelName: party.channelName,
    };
  }

  async rejectInvite(partyId: string, requestingUserId: string) {
    const party = await this.partyRepo.findOne({ where: { id: partyId }, relations: { invitedUsers: true } });
    if (!party) throw new NotFoundException('Party not found');
    party.invitedUsers = (party.invitedUsers || []).filter((u) => u.id !== requestingUserId);
    await this.partyRepo.save(party);
    return party;
  }

  async removeInvite(partyId: string, requestingUserId: string, userId: string) {
    const party = await this.partyRepo.findOne({ where: { id: partyId }, relations: { invitedUsers: true, host: true } });
    if (!party) throw new NotFoundException('Party not found');
    if (party.hostId !== requestingUserId) throw new ForbiddenException('Only host can remove invite');
    party.invitedUsers = (party.invitedUsers || []).filter((u) => u.id !== userId);
    await this.partyRepo.save(party);
    return party;
  }

  async rotateJoinCode(partyId: string, requestingUserId: string) {
    const party = await this.partyRepo.findOne({ where: { id: partyId } });
    if (!party) throw new NotFoundException('Party not found');
    if (party.hostId !== requestingUserId) throw new ForbiddenException('Only host can rotate code');
    this.checkRateLimit('rotate', requestingUserId);
    party.joinCode = this.generateJoinCode();
    party.rotatedAt = new Date();
    await this.partyRepo.save(party);
    return { partyId: party.id, joinCode: party.joinCode };
  }

  async listScheduledPartiesForUser(userId: string) {
    return await this.partyRepo
      .createQueryBuilder('party')
      .leftJoinAndSelect('party.invitedUsers', 'inv')
      .leftJoinAndSelect('party.host', 'host')
      .where('party.status = :status', { status: 'SCHEDULED' })
      .andWhere('(party.hostId = :uid OR inv.id = :uid)', { uid: userId })
      .orderBy('party.scheduledFor', 'ASC')
      .getMany();
  }

  async joinPartyByCode(code: string, requestingUserId: string) {
    if (!code || !requestingUserId) {
      throw new BadRequestException('code and userId are required');
    }
    this.checkRateLimit('join', requestingUserId);
    const party = await this.partyRepo.findOne({ where: { joinCode: code }, relations: { participants: true, host: true, bannedUsers: true } });
    if (!party) throw new NotFoundException('Party not found');
    if (party.status === 'ENDED') {
      throw new BadRequestException('Party has ended');
    }
    const user = await this.userRepo.findOne({ where: { id: requestingUserId } });
    if (!user) throw new NotFoundException('User not found');
    this.ensureEligible(user);
    if (party.status === 'ACTIVE') {
      if (await this.userHasActiveParty(user.id)) {
        throw new ForbiddenException('You already have an active party');
      }
    }
    if (user.subscriptionType === SubscriptionType.FREEMIUM) {
      if (await this.userHasScheduledOrActiveParty(user.id)) {
        throw new ForbiddenException('Freemium users can only have one scheduled or active party');
      }
    }
    const exists = (party.participants || []).some((u) => u.id === user.id);
    if (!exists) {
      party.participants = [...(party.participants || []), user];
    }
    await this.partyRepo.save(party);
    const tok = await this.generateAgoraRTMToken(requestingUserId);
    return {
      party,
      rtmToken: tok.token,
      expireSeconds: tok.expireSeconds,
      role: 'HOST',
      channelName: party.channelName,
    };
  }

  async startScheduledParty(partyId: string, requestingUserId: string, idempotencyKey?: string) {
    const party = await this.partyRepo.findOne({ where: { id: partyId }, relations: { participants: true, host: true } });
    if (!party) throw new NotFoundException('Party not found');
    if (party.hostId && party.hostId !== requestingUserId) {
      throw new ForbiddenException('Only the host can start the scheduled party');
    }
    // Idempotency: if previous activation with same key already made party ACTIVE, return
    if (idempotencyKey && party.lastStartScheduledKey === idempotencyKey && party.status === 'ACTIVE') {
      const tok = await this.generateAgoraRTMToken(requestingUserId);
      return { party, rtmToken: tok.token, expireSeconds: tok.expireSeconds, role: 'HOST', channelName: party.channelName };
    }
    if (party.status !== 'SCHEDULED') throw new BadRequestException('Party is not scheduled');
    this.checkRateLimit('start', requestingUserId);
    const host = party.host;
    if (!host) {
      const h = await this.userRepo.findOne({ where: { id: party.hostId } });
      if (!h) throw new NotFoundException('Host not found');
    }
    if (await this.userHasActiveParty(requestingUserId)) {
      throw new ForbiddenException('You already have an active party');
    }
    party.status = 'ACTIVE';
    party.lastStartScheduledKey = idempotencyKey;
    await this.partyRepo.save(party);
    const tok = await this.generateAgoraRTMToken(requestingUserId);
    return { party, rtmToken: tok.token, expireSeconds: tok.expireSeconds, role: 'HOST', channelName: party.channelName };
  }
  async kickUser(partyId: string, requestingUserId: string, userId: string) {
    const party = await this.partyRepo.findOne({ where: { id: partyId }, relations: { participants: true, host: true } });
    if (!party) throw new NotFoundException('Party not found');
    if (party.hostId !== requestingUserId) throw new ForbiddenException('Only host can kick');
    party.participants = (party.participants || []).filter((u) => u.id !== userId);
    await this.partyRepo.save(party);
    return party;
  }

  async banUser(partyId: string, requestingUserId: string, userId: string) {
    const party = await this.partyRepo.findOne({ where: { id: partyId }, relations: { participants: true, invitedUsers: true, bannedUsers: true, host: true } });
    if (!party) throw new NotFoundException('Party not found');
    if (party.hostId !== requestingUserId) throw new ForbiddenException('Only host can ban');
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const bannedIds = new Set((party.bannedUsers || []).map((u) => u.id));
    if (!bannedIds.has(user.id)) {
      party.bannedUsers = [...(party.bannedUsers || []), user];
    }
    party.participants = (party.participants || []).filter((u) => u.id !== user.id);
    party.invitedUsers = (party.invitedUsers || []).filter((u) => u.id !== user.id);
    await this.partyRepo.save(party);
    return party;
  }

  async unbanUser(partyId: string, requestingUserId: string, userId: string) {
    const party = await this.partyRepo.findOne({ where: { id: partyId }, relations: { bannedUsers: true, host: true } });
    if (!party) throw new NotFoundException('Party not found');
    if (party.hostId !== requestingUserId) throw new ForbiddenException('Only host can unban');
    party.bannedUsers = (party.bannedUsers || []).filter((u) => u.id !== userId);
    await this.partyRepo.save(party);
    return party;
  }

  async muteUser(partyId: string, requestingUserId: string, userId: string) {
    const party = await this.partyRepo.findOne({ where: { id: partyId }, relations: { mutedUsers: true, host: true } });
    if (!party) throw new NotFoundException('Party not found');
    if (party.hostId !== requestingUserId) throw new ForbiddenException('Only host can mute');
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const mutedIds = new Set((party.mutedUsers || []).map((u) => u.id));
    if (!mutedIds.has(user.id)) {
      party.mutedUsers = [...(party.mutedUsers || []), user];
    }
    await this.partyRepo.save(party);
    return party;
  }

  async unmuteUser(partyId: string, requestingUserId: string, userId: string) {
    const party = await this.partyRepo.findOne({ where: { id: partyId }, relations: { mutedUsers: true, host: true } });
    if (!party) throw new NotFoundException('Party not found');
    if (party.hostId !== requestingUserId) throw new ForbiddenException('Only host can unmute');
    party.mutedUsers = (party.mutedUsers || []).filter((u) => u.id !== userId);
    await this.partyRepo.save(party);
    return party;
  }
}