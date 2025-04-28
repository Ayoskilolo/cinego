import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config'; // ConfigModule might already be global or imported elsewhere
import { UserModule } from 'src/user/user.module'; // Import UserModule if UserService is needed by AuthGuard
import { AuthModule } from 'src/auth/auth.module'; // Import AuthModule

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction]),
    HttpModule, // For httpService used in TransactionsService
    ConfigModule, // Needed if ConfigService is used directly or by AuthGuard
    UserModule, // Needed because AuthGuard depends on UserService
    AuthModule, // Import AuthModule to provide JwtService and AuthGuard
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService], // AuthGuard is often provided in AuthModule, not here
  exports: [TransactionsService],
})
export class TransactionsModule {}
