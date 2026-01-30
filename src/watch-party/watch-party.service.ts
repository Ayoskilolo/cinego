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
import { RtmTokenBuilder, RtcTokenBuilder, RtcRole } from 'agora-token';
import { v4 as uuidv4 } from 'uuid';
import { WatchParty } from './entities/watch-party.entity';
import { Movie } from '../movie/entities/movie.entity';
import { User } from '../user/entities/user.entity';
import { SubscriptionType } from '../user/enum/userType';
import { Profile } from '../user/entities/profile.entity';
import { SessionEntity } from '../auth/entities/session.entity';

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
    @InjectRepository(Profile)
    private readonly profileRepo: Repository<Profile>,
    @InjectRepository(SessionEntity)
    private readonly sessionRepo: Repository<SessionEntity>,
  ) {}

  private rateMap = new Map<string, { windowStart: number; count: number }>();

  private checkRateLimit(
    op: 'start' | 'join' | 'rotate',
    userId: string,
    maxPerSec = 5,
  ) {
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

  async generateAgoraRTMToken(profileId: string, expireSeconds?: number) {
    if (!profileId) {
      throw new BadRequestException('profileId is required');
    }

    const appId =
      this.configService.get<string>('app.agoraAppId') ||
      this.configService.get<string>('AGORA_APP_ID');
    const appCertificate =
      this.configService.get<string>('app.agoraAppCertificate') ||
      this.configService.get<string>('AGORA_APP_CERTIFICATE');

    if (!appId || !appCertificate) {
      throw new InternalServerErrorException(
        'Missing AGORA_APP_ID or AGORA_APP_CERTIFICATE',
      );
    }

    const ttl = Number.isFinite(expireSeconds as number)
      ? Number(expireSeconds)
      : Number(
          this.configService.get<string>('app.agoraTokenExpiry') ??
            this.configService.get<string>('AGORA_TOKEN_EXPIRY'),
        ) || 7200;

    const token = RtmTokenBuilder.buildToken(
      appId,
      appCertificate,
      profileId,
      ttl,
    );
    return { token, expireSeconds: ttl };
  }

  async refreshAgoraRTMToken(profileId: string, expireSeconds?: number) {
    return this.generateAgoraRTMToken(profileId, expireSeconds);
  }

  async generateAgoraRTCToken(
    profileId: string,
    channelName: string,
    expireSeconds?: number,
  ) {
    if (!profileId) {
      throw new BadRequestException('profileId is required');
    }
    if (!channelName) {
      throw new BadRequestException('channelName is required');
    }
    const appId =
      this.configService.get<string>('app.agoraAppId') ||
      this.configService.get<string>('AGORA_APP_ID');
    const appCertificate =
      this.configService.get<string>('app.agoraAppCertificate') ||
      this.configService.get<string>('AGORA_APP_CERTIFICATE');
    if (!appId || !appCertificate) {
      throw new InternalServerErrorException(
        'Missing AGORA_APP_ID or AGORA_APP_CERTIFICATE',
      );
    }
    const ttl = Number.isFinite(expireSeconds as number)
      ? Number(expireSeconds)
      : Number(
          this.configService.get<string>('app.agoraTokenExpiry') ??
            this.configService.get<string>('AGORA_TOKEN_EXPIRY'),
        ) || 7200;
    const role = RtcRole.PUBLISHER;
    const token = RtcTokenBuilder.buildTokenWithUserAccount(
      appId,
      appCertificate,
      channelName,
      profileId,
      role,
      ttl,
      ttl,
    );
    return { token, expireSeconds: ttl };
  }

  async refreshAgoraRTCToken(
    profileId: string,
    channelName: string,
    expireSeconds?: number,
  ) {
    return this.generateAgoraRTCToken(profileId, channelName, expireSeconds);
  }

  async getPartyRoster(partyId: string) {
    const party = await this.partyRepo.findOne({
      where: { id: partyId },
      relations: { participants: true, host: true },
    });
    if (!party) throw new NotFoundException('Party not found');
    const users: User[] = [
      ...(party.participants || []),
      ...(party.host ? [party.host] : []),
    ];
    const userIds = Array.from(new Set(users.map((u) => u.id)));
    const sessions = await this.sessionRepo.find({
      where: { userId: In(userIds), isActive: true },
      order: { dateCreated: 'DESC' },
    });
    const latestByUser = new Map<string, SessionEntity>();
    for (const s of sessions) {
      const prev = latestByUser.get(s.userId);
      if (!prev || s.dateCreated > prev.dateCreated) {
        latestByUser.set(s.userId, s);
      }
    }
    const profileIds = Array.from(
      new Set(
        Array.from(latestByUser.values())
          .map((s) => s.currentProfileId)
          .filter((id) => !!id),
      ),
    );
    const profiles = profileIds.length
      ? await this.profileRepo.find({ where: { id: In(profileIds) } })
      : [];
    const nameByProfile = new Map<string, string>();
    for (const p of profiles) {
      nameByProfile.set(p.id, p.profileName);
    }
    const roster = users.map((u) => {
      const s = latestByUser.get(u.id);
      const pid = s?.currentProfileId || null;
      const pname = pid ? nameByProfile.get(pid) || null : null;
      const isHost = party.hostId === u.id;
      return {
        userId: u.id,
        profileId: pid,
        profileName: pname,
        role: isHost ? 'HOST' : 'PARTICIPANT',
      };
    });
    return { partyId, roster };
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

  private async userHasScheduledOrActiveParty(userId: string) {
    const count = await this.partyRepo
      .createQueryBuilder('party')
      .leftJoin('party.participants', 'p')
      .where('party.status IN (:...statuses)', {
        statuses: ['SCHEDULED', 'ACTIVE'],
      })
      .andWhere('(party.hostId = :uid OR p.id = :uid)', { uid: userId })
      .getCount();
    return count > 0;
  }

  private generateJoinCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 9; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }
  private async generateUniqueJoinCode(
    maxAttempts: number = 5,
  ): Promise<string> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidate = this.generateJoinCode();
      const exists = await this.partyRepo.findOne({
        where: { joinCode: candidate },
      });
      if (!exists) return candidate;
    }
    throw new InternalServerErrorException(
      'Unable to allocate a unique join code. Please retry.',
    );
  }

  private async savePartyWithJoinCodeRetry(
    party: WatchParty,
    maxAttempts: number = 8,
  ): Promise<WatchParty> {
    let lastErr: any;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await this.partyRepo.save(party);
      } catch (err) {
        lastErr = err;
        const driverErr = (err as any)?.driverError || err;
        const code = (driverErr && driverErr.code) || (err as any)?.code;
        const msg = String(
          (driverErr && driverErr.detail) || driverErr?.message || '',
        );
        const constraint = String((driverErr && driverErr.constraint) || '');
        const isUniqueViolation = code === '23505';
        const mentionsJoinCode =
          /join[_\s]?code/i.test(msg) ||
          /join[_\s]?code/i.test(constraint) ||
          /watch[_\s-]?party.*join[_\s]?code/i.test(msg);
        if (isUniqueViolation && mentionsJoinCode) {
          party.joinCode = await this.generateUniqueJoinCode();
          continue;
        }
        throw err;
      }
    }
    throw new InternalServerErrorException(
      'Unable to save party due to join code collision. Please retry.',
    );
  }

  private async getActivePartyForUser(userId: string) {
    return await this.partyRepo
      .createQueryBuilder('party')
      .leftJoinAndSelect('party.participants', 'p')
      .where('party.status = :status', { status: 'ACTIVE' })
      .andWhere('(party.hostId = :uid OR p.id = :uid)', { uid: userId })
      .getOne();
  }

  async startParty(
    movieId: string,
    channelName: string | undefined,
    requestingUserId: string,
    idempotencyKey?: string,
    profileIdForToken?: string,
  ) {
    if (!movieId) throw new BadRequestException('movieId is required');
    this.checkRateLimit('start', requestingUserId);

    const movie = await this.movieRepo.findOne({ where: { id: movieId } });

    if (!movie) throw new NotFoundException('Movie not found');

    const host = await this.userRepo.findOne({
      where: { id: requestingUserId },
    });
    if (!host) throw new NotFoundException('User not found');
    this.ensureEligible(host);
    if (
      host.subscriptionType === SubscriptionType.FREEMIUM &&
      (host as any).hasUsedWatchPartyTrial
    ) {
      throw new ForbiddenException('Freemium watch party trial already used');
    }

    if (host.subscriptionType === SubscriptionType.FREEMIUM) {
      const lastMovie = (host as any).lastFreemiumMovieId;
      if (lastMovie && lastMovie !== movieId) {
        throw new ForbiddenException(
          'Freemium limited to one watch party for selected movie',
        );
      }
    }

    const activeParty = await this.getActivePartyForUser(host.id);
    if (activeParty) {
      if (activeParty.hostId === host.id) {
        // NOTE: We end the previous party here.
        // For Freemium users, endParty() triggers a downgrade to FREE_TIER (consuming their trial).
        // However, since we fetched the 'host' object at the start of this method (before the downgrade),
        // we use that stale, eligible 'host' object to create the new party below.
        // This effectively allows a Freemium host to "restart" a party (e.g. for technical reasons)
        // without being immediately locked out, while the 'lastFreemiumMovieId' check ensures
        // they cannot switch to a different movie.
        await this.endParty(activeParty.id, host.id);
      } else {
        activeParty.participants = activeParty.participants.filter(
          (p) => p.id !== host.id,
        );
        await this.partyRepo.save(activeParty);
      }
    }

    if (host.subscriptionType === SubscriptionType.FREEMIUM) {
      if (await this.userHasScheduledOrActiveParty(host.id)) {
        throw new ForbiddenException(
          'Freemium users can only have one scheduled or active party',
        );
      }
    }

    if (idempotencyKey) {
      const existing = await this.partyRepo.findOne({
        where: { startKey: idempotencyKey, hostId: requestingUserId },
      });
      if (existing && existing.status === 'ACTIVE') {
        const tok = await this.generateAgoraRTMToken(
          profileIdForToken || requestingUserId,
        );
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
      joinCode: await this.generateUniqueJoinCode(),
      startKey: idempotencyKey,
    });
    const saved = await this.savePartyWithJoinCodeRetry(party);
    if (host.subscriptionType === SubscriptionType.FREEMIUM) {
      await this.userRepo.update(
        { id: host.id },
        { lastFreemiumMovieId: movieId },
      );
    }
    const tok = await this.generateAgoraRTMToken(
      profileIdForToken || requestingUserId,
    );
    return {
      party: saved,
      rtmToken: tok.token,
      expireSeconds: tok.expireSeconds,
      role: 'HOST',
      channelName: saved.channelName,
    };
  }

  async joinParty(
    partyId: string,
    requestingUserId: string,
    profileIdForToken?: string,
  ) {
    if (!partyId || !requestingUserId) {
      throw new BadRequestException('partyId and userId are required');
    }
    this.checkRateLimit('join', requestingUserId);

    const party = await this.partyRepo.findOne({
      where: { id: partyId },
      relations: { participants: true, host: true, bannedUsers: true },
    });
    if (!party) throw new NotFoundException('Party not found');

    if (party.hostId !== requestingUserId) {
      throw new ForbiddenException('Only the host can join by ID');
    }

    if (party.status === 'ENDED') {
      throw new BadRequestException('Party has ended');
    }
    const user = await this.userRepo.findOne({
      where: { id: requestingUserId },
    });
    if (!user) throw new NotFoundException('User not found');
    this.ensureEligible(user);
    if (
      user.subscriptionType === SubscriptionType.FREEMIUM &&
      (user as any).hasUsedWatchPartyTrial
    ) {
      throw new ForbiddenException('Freemium watch party trial already used');
    }
    if (user.subscriptionType === SubscriptionType.FREEMIUM) {
      const lastMovie = (user as any).lastFreemiumMovieId;
      if (lastMovie && lastMovie !== party.movieId) {
        throw new ForbiddenException(
          'Freemium limited to one watch party for selected movie',
        );
      }
    }
    const exists = (party.participants || []).some((u) => u.id === user.id);
    if (party.status === 'ACTIVE') {
      if (!exists) {
        const activeParty = await this.getActivePartyForUser(user.id);
        if (activeParty && activeParty.id !== party.id) {
          if (activeParty.hostId === user.id) {
            await this.endParty(activeParty.id, user.id);
          } else {
            activeParty.participants = activeParty.participants.filter(
              (p) => p.id !== user.id,
            );
            await this.partyRepo.save(activeParty);
          }
        }
      }
    }
    if (user.subscriptionType === SubscriptionType.FREEMIUM) {
      if (await this.userHasScheduledOrActiveParty(user.id)) {
        throw new ForbiddenException(
          'Freemium users can only have one scheduled or active party',
        );
      }
    }

    if (!exists) {
      party.participants = [...(party.participants || []), user];
    }
    party.hostLeftAt = null;
    await this.partyRepo.save(party);
    if (user.subscriptionType === SubscriptionType.FREEMIUM) {
      await this.userRepo.update(
        { id: user.id },
        { lastFreemiumMovieId: party.movieId },
      );
    }
    const tok = await this.generateAgoraRTMToken(
      profileIdForToken || requestingUserId,
    );
    return {
      party,
      rtmToken: tok.token,
      expireSeconds: tok.expireSeconds,
      role: 'HOST',
      channelName: party.channelName,
    };
  }

  async endParty(
    partyId: string,
    requestingUserId: string,
    idempotencyKey?: string,
  ) {
    const party = await this.partyRepo.findOne({
      where: { id: partyId },
      relations: { participants: true, host: true },
    });
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
          hasUsedWatchPartyTrial: true,
          lastFreemiumMovieId: null,
          lastFreemiumActivePartyId: null,
        },
      );
    }
    return party;
  }

  async getPartyMetadata(partyId: string) {
    let party = await this.partyRepo.findOne({
      where: { id: partyId },
      relations: {
        participants: true,
        host: true,
        invitedUsers: true,
        bannedUsers: true,
        mutedUsers: true,
      },
    });
    if (!party) throw new NotFoundException('Party not found');
    party = await this.maybeReassignHost(party);
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
    if (sched <= now)
      throw new BadRequestException('scheduledFor must be in the future');

    const movie = await this.movieRepo.findOne({ where: { id: movieId } });
    if (!movie) throw new NotFoundException('Movie not found');

    const host = await this.userRepo.findOne({
      where: { id: requestingUserId },
    });
    if (!host) throw new NotFoundException('User not found');
    this.ensureEligible(host);

    if (host.subscriptionType === SubscriptionType.FREEMIUM) {
      if (await this.userHasScheduledOrActiveParty(host.id)) {
        throw new ForbiddenException(
          'Freemium users can only have one scheduled or active party',
        );
      }
    }

    let invited: User[] = [];
    const ids = inviteeIds || [];
    const emailList = emails || [];
    const phoneList = phones || [];
    const byIds = ids.length
      ? await this.userRepo.find({ where: { id: In(ids) } })
      : [];
    const byEmails = emailList.length
      ? await this.userRepo.find({ where: { email: In(emailList) } })
      : [];
    const byPhones = phoneList.length
      ? await this.userRepo.find({ where: { phoneNumber: In(phoneList) } })
      : [];
    const unresolvedIds = ids.filter((id) => !byIds.some((u) => u.id === id));
    const unresolvedEmails = emailList.filter(
      (em) => !byEmails.some((u) => u.email === em),
    );
    const unresolvedPhones = phoneList.filter(
      (ph) => !byPhones.some((u) => u.phoneNumber === ph),
    );
    if (
      unresolvedIds.length ||
      unresolvedEmails.length ||
      unresolvedPhones.length
    ) {
      throw new BadRequestException(
        'Some invitees could not be resolved to existing accounts',
      );
    }
    const seen = new Set<string>();
    for (const u of [...byIds, ...byEmails, ...byPhones]) {
      if (!seen.has(u.id)) {
        seen.add(u.id);
        invited.push(u);
      }
    }
    const disallowedSched = invited.filter(
      (u) => u.subscriptionType === SubscriptionType.FREE_TIER,
    );
    if (disallowedSched.length) {
      throw new ForbiddenException('Free tier users cannot be invited');
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
      joinCode: await this.generateUniqueJoinCode(),
    });
    return await this.savePartyWithJoinCodeRetry(party);
  }

  async inviteToParty(
    partyId: string,
    requestingUserId: string,
    userIds?: string[],
    emails?: string[],
    phones?: string[],
  ) {
    const ids = userIds || [];
    const emailList = emails || [];
    const phoneList = phones || [];
    if (!ids.length && !emailList.length && !phoneList.length)
      return this.getPartyMetadata(partyId);
    const party = await this.partyRepo.findOne({
      where: { id: partyId },
      relations: { invitedUsers: true, host: true },
    });
    if (!party) throw new NotFoundException('Party not found');
    if (party.hostId !== requestingUserId)
      throw new ForbiddenException('Only host can invite');
    const byIds = ids.length
      ? await this.userRepo.find({ where: { id: In(ids) } })
      : [];
    const byEmails = emailList.length
      ? await this.userRepo.find({ where: { email: In(emailList) } })
      : [];
    const byPhones = phoneList.length
      ? await this.userRepo.find({ where: { phoneNumber: In(phoneList) } })
      : [];
    const unresolvedIds = ids.filter((id) => !byIds.some((u) => u.id === id));
    const unresolvedEmails = emailList.filter(
      (em) => !byEmails.some((u) => u.email === em),
    );
    const unresolvedPhones = phoneList.filter(
      (ph) => !byPhones.some((u) => u.phoneNumber === ph),
    );
    if (
      unresolvedIds.length ||
      unresolvedEmails.length ||
      unresolvedPhones.length
    ) {
      throw new BadRequestException(
        'Some invitees could not be resolved to existing accounts',
      );
    }
    const users = [...byIds, ...byEmails, ...byPhones];
    const existingIds = new Set((party.invitedUsers || []).map((u) => u.id));
    const toAdd = users.filter((u) => !existingIds.has(u.id));
    const disallowed = toAdd.filter(
      (u) => u.subscriptionType === SubscriptionType.FREE_TIER,
    );
    if (disallowed.length) {
      throw new ForbiddenException('Free tier users cannot be invited');
    }
    party.invitedUsers = [...(party.invitedUsers || []), ...toAdd];
    await this.partyRepo.save(party);
    return party;
  }

  async rejectInvite(partyId: string, requestingUserId: string) {
    const party = await this.partyRepo.findOne({
      where: { id: partyId },
      relations: { invitedUsers: true },
    });
    if (!party) throw new NotFoundException('Party not found');
    party.invitedUsers = (party.invitedUsers || []).filter(
      (u) => u.id !== requestingUserId,
    );
    await this.partyRepo.save(party);
    return party;
  }

  async removeInvite(
    partyId: string,
    requestingUserId: string,
    userId: string,
  ) {
    const party = await this.partyRepo.findOne({
      where: { id: partyId },
      relations: { invitedUsers: true, host: true },
    });
    if (!party) throw new NotFoundException('Party not found');
    if (party.hostId !== requestingUserId)
      throw new ForbiddenException('Only host can remove invite');
    party.invitedUsers = (party.invitedUsers || []).filter(
      (u) => u.id !== userId,
    );
    await this.partyRepo.save(party);
    return party;
  }

  async rotateJoinCode(partyId: string, requestingUserId: string) {
    const party = await this.partyRepo.findOne({ where: { id: partyId } });
    if (!party) throw new NotFoundException('Party not found');
    if (party.hostId !== requestingUserId)
      throw new ForbiddenException('Only host can rotate code');
    this.checkRateLimit('rotate', requestingUserId);
    party.joinCode = await this.generateUniqueJoinCode();
    party.rotatedAt = new Date();
    await this.savePartyWithJoinCodeRetry(party);
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

  async joinPartyByCode(
    code: string,
    requestingUserId: string,
    profileIdForToken?: string,
  ) {
    if (!code || !requestingUserId) {
      throw new BadRequestException('code and userId are required');
    }
    this.checkRateLimit('join', requestingUserId);
    const normalizedCode = code.trim().toUpperCase();
    const party = await this.partyRepo.findOne({
      where: { joinCode: normalizedCode },
      relations: {
        participants: true,
        host: true,
        bannedUsers: true,
        invitedUsers: true,
      },
    });
    if (!party) throw new NotFoundException('Party not found');
    if (party.status === 'ENDED') {
      throw new BadRequestException('Party has ended');
    }
    const user = await this.userRepo.findOne({
      where: { id: requestingUserId },
    });
    if (!user) throw new NotFoundException('User not found');
    this.ensureEligible(user);
    const bannedIds = new Set((party.bannedUsers || []).map((u) => u.id));
    if (bannedIds.has(requestingUserId)) {
      throw new ForbiddenException('You are banned from this party');
    }
    const exists = (party.participants || []).some((u) => u.id === user.id);
    if (
      user.subscriptionType === SubscriptionType.FREEMIUM &&
      (user as any).hasUsedWatchPartyTrial
    ) {
      if (!exists) {
        throw new ForbiddenException('Freemium watch party trial already used');
      }
    }
    if (user.subscriptionType === SubscriptionType.FREEMIUM) {
      const lastMovie = (user as any).lastFreemiumMovieId;
      if (lastMovie && lastMovie !== party.movieId) {
        throw new ForbiddenException(
          'Freemium limited to one watch party for selected movie',
        );
      }
    }
    if (party.status === 'ACTIVE') {
      if (!exists) {
        const activeParty = await this.getActivePartyForUser(user.id);
        if (activeParty && activeParty.id !== party.id) {
          if (activeParty.hostId === user.id) {
            await this.endParty(activeParty.id, user.id);
          } else {
            activeParty.participants = activeParty.participants.filter(
              (p) => p.id !== user.id,
            );
            await this.partyRepo.save(activeParty);
          }
        }
      }
    }
    if (user.subscriptionType === SubscriptionType.FREEMIUM) {
      if (!exists && (await this.userHasScheduledOrActiveParty(user.id))) {
        throw new ForbiddenException(
          'Freemium users can only have one scheduled or active party',
        );
      }
    }
    if (!exists) {
      party.participants = [...(party.participants || []), user];
    }
    if (party.hostId === requestingUserId) {
      party.hostLeftAt = null;
    }
    // For scheduled parties, require invite to join-by-code
    if (party.status === 'SCHEDULED') {
      const invitedIds = new Set((party.invitedUsers || []).map((u) => u.id));
      if (!invitedIds.has(user.id) && party.hostId !== user.id) {
        throw new ForbiddenException('Invite required until party starts');
      }
    }
    await this.partyRepo.save(party);
    if (user.subscriptionType === SubscriptionType.FREEMIUM) {
      await this.userRepo.update(
        { id: user.id },
        { lastFreemiumMovieId: party.movieId },
      );
    }
    const tok = await this.generateAgoraRTMToken(
      profileIdForToken || requestingUserId,
    );
    return {
      party,
      rtmToken: tok.token,
      expireSeconds: tok.expireSeconds,
      role: party.hostId === requestingUserId ? 'HOST' : 'PARTICIPANT',
      channelName: party.channelName,
    };
  }

  private async maybeReassignHost(party: WatchParty) {
    if (!party || party.status !== 'ACTIVE' || !party.hostLeftAt) return party;
    const elapsed = Date.now() - new Date(party.hostLeftAt).getTime();
    if (elapsed < 60_000) return party;
    const participants = party.participants || [];
    const candidate = participants.sort((a, b) =>
      String(a.id).localeCompare(String(b.id)),
    )[0];
    if (!candidate) return party;
    party.hostId = candidate.id;
    party.host = candidate;
    party.hostLeftAt = null;
    await this.partyRepo.save(party);
    return party;
  }

  async startScheduledParty(
    partyId: string,
    requestingUserId: string,
    idempotencyKey?: string,
    profileIdForToken?: string,
  ) {
    const party = await this.partyRepo.findOne({
      where: { id: partyId },
      relations: { participants: true, host: true },
    });
    if (!party) throw new NotFoundException('Party not found');
    if (party.hostId && party.hostId !== requestingUserId) {
      throw new ForbiddenException(
        'Only the host can start the scheduled party',
      );
    }
    // Idempotency: if previous activation with same key already made party ACTIVE, return
    if (
      idempotencyKey &&
      party.lastStartScheduledKey === idempotencyKey &&
      party.status === 'ACTIVE'
    ) {
      const tok = await this.generateAgoraRTMToken(
        profileIdForToken || requestingUserId,
      );
      return {
        party,
        rtmToken: tok.token,
        expireSeconds: tok.expireSeconds,
        role: 'HOST',
        channelName: party.channelName,
      };
    }
    if (party.status !== 'SCHEDULED')
      throw new BadRequestException('Party is not scheduled');
    this.checkRateLimit('start', requestingUserId);
    const host = party.host;
    if (!host) {
      const h = await this.userRepo.findOne({ where: { id: party.hostId } });
      if (!h) throw new NotFoundException('Host not found');
    }
    const activeParty = await this.getActivePartyForUser(requestingUserId);
    if (activeParty && activeParty.id !== party.id) {
      if (activeParty.hostId === requestingUserId) {
        await this.endParty(activeParty.id, requestingUserId);
      } else {
        activeParty.participants = activeParty.participants.filter(
          (p) => p.id !== requestingUserId,
        );
        await this.partyRepo.save(activeParty);
      }
    }
    const requester = await this.userRepo.findOne({
      where: { id: requestingUserId },
    });
    if (requester) {
      this.ensureEligible(requester);
    }
    if (requester && requester.subscriptionType === SubscriptionType.FREEMIUM) {
      const lastMovie = (requester as any).lastFreemiumMovieId;
      if (lastMovie && lastMovie !== party.movieId) {
        throw new ForbiddenException(
          'Freemium limited to one watch party for selected movie',
        );
      }
    }
    party.status = 'ACTIVE';
    party.lastStartScheduledKey = idempotencyKey;
    await this.partyRepo.save(party);
    if (requester && requester.subscriptionType === SubscriptionType.FREEMIUM) {
      await this.userRepo.update(
        { id: requestingUserId },
        { lastFreemiumMovieId: party.movieId },
      );
    }
    const tok = await this.generateAgoraRTMToken(
      profileIdForToken || requestingUserId,
    );
    return {
      party,
      rtmToken: tok.token,
      expireSeconds: tok.expireSeconds,
      role: 'HOST',
      channelName: party.channelName,
    };
  }
  async kickUser(partyId: string, requestingUserId: string, userId: string) {
    const party = await this.partyRepo.findOne({
      where: { id: partyId },
      relations: { participants: true, host: true },
    });
    if (!party) throw new NotFoundException('Party not found');
    if (party.hostId !== requestingUserId)
      throw new ForbiddenException('Only host can kick');
    const removed =
      (party.participants || []).find((u) => u.id === userId) || null;
    party.participants = (party.participants || []).filter(
      (u) => u.id !== userId,
    );
    await this.partyRepo.save(party);
    if (removed) {
      const u = await this.userRepo.findOne({ where: { id: userId } });
      if (u && u.subscriptionType === SubscriptionType.FREEMIUM) {
        await this.userRepo.update(
          { id: u.id },
          { lastFreemiumMovieId: party.movieId },
        );
      }
    }
    return party;
  }

  async banUser(partyId: string, requestingUserId: string, userId: string) {
    const party = await this.partyRepo.findOne({
      where: { id: partyId },
      relations: {
        participants: true,
        invitedUsers: true,
        bannedUsers: true,
        host: true,
      },
    });
    if (!party) throw new NotFoundException('Party not found');
    if (party.hostId !== requestingUserId)
      throw new ForbiddenException('Only host can ban');
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const bannedIds = new Set((party.bannedUsers || []).map((u) => u.id));
    if (!bannedIds.has(user.id)) {
      party.bannedUsers = [...(party.bannedUsers || []), user];
    }
    party.participants = (party.participants || []).filter(
      (u) => u.id !== user.id,
    );
    party.invitedUsers = (party.invitedUsers || []).filter(
      (u) => u.id !== user.id,
    );
    await this.partyRepo.save(party);
    if (user.subscriptionType === SubscriptionType.FREEMIUM) {
      await this.userRepo.update(
        { id: user.id },
        { lastFreemiumMovieId: party.movieId },
      );
    }
    return party;
  }

  async unbanUser(partyId: string, requestingUserId: string, userId: string) {
    const party = await this.partyRepo.findOne({
      where: { id: partyId },
      relations: { bannedUsers: true, host: true },
    });
    if (!party) throw new NotFoundException('Party not found');
    if (party.hostId !== requestingUserId)
      throw new ForbiddenException('Only host can unban');
    party.bannedUsers = (party.bannedUsers || []).filter(
      (u) => u.id !== userId,
    );
    await this.partyRepo.save(party);
    return party;
  }

  async muteUser(partyId: string, requestingUserId: string, userId: string) {
    const party = await this.partyRepo.findOne({
      where: { id: partyId },
      relations: { mutedUsers: true, host: true },
    });
    if (!party) throw new NotFoundException('Party not found');
    if (party.hostId !== requestingUserId)
      throw new ForbiddenException('Only host can mute');
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
    const party = await this.partyRepo.findOne({
      where: { id: partyId },
      relations: { mutedUsers: true, host: true },
    });
    if (!party) throw new NotFoundException('Party not found');
    if (party.hostId !== requestingUserId)
      throw new ForbiddenException('Only host can unmute');
    party.mutedUsers = (party.mutedUsers || []).filter((u) => u.id !== userId);
    await this.partyRepo.save(party);
    return party;
  }

  async transferHost(
    partyId: string,
    requestingUserId: string,
    newHostId: string,
  ) {
    const party = await this.partyRepo.findOne({
      where: { id: partyId },
      relations: { participants: true, host: true },
    });
    if (!party) throw new NotFoundException('Party not found');
    if (party.status !== 'ACTIVE')
      throw new BadRequestException('Party is not active');
    if (party.hostId !== requestingUserId)
      throw new ForbiddenException('Only host can transfer');
    const candidate = (party.participants || []).find(
      (u) => u.id === newHostId,
    );
    if (!candidate)
      throw new BadRequestException('New host must be a participant');
    party.hostId = candidate.id;
    party.host = candidate;
    party.hostLeftAt = null;
    await this.partyRepo.save(party);
    return { partyId: party.id, hostId: party.hostId };
  }

  async leaveParty(partyId: string, requestingUserId: string) {
    const party = await this.partyRepo.findOne({
      where: { id: partyId },
      relations: { participants: true, host: true },
    });
    if (!party) throw new NotFoundException('Party not found');
    const user = await this.userRepo.findOne({
      where: { id: requestingUserId },
    });
    if (!user) throw new NotFoundException('User not found');
    party.participants = (party.participants || []).filter(
      (u) => u.id !== requestingUserId,
    );
    if (party.hostId === requestingUserId) {
      party.hostLeftAt = new Date();
    }
    await this.partyRepo.save(party);
    if (user.subscriptionType === SubscriptionType.FREEMIUM) {
      await this.userRepo.update(
        { id: user.id },
        { lastFreemiumMovieId: party.movieId },
      );
    }
    return { partyId: party.id, status: 'left' };
  }
}
