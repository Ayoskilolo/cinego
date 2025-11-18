import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WatchPartyService } from './watch-party.service';
import { WatchPartyController } from './watch-party.controller';
import { WatchParty } from './entities/watch-party.entity';
import { Movie } from '../movie/entities/movie.entity';
import { User } from '../user/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WatchParty, Movie, User])],
  providers: [WatchPartyService],
  controllers: [WatchPartyController],
})
export class WatchPartyModule {}
