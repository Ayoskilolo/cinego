import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from 'src/user/user.module';
import { AuthModule } from 'src/auth/auth.module';
import { AdminTransactionsController } from './admin-transactions.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction]),
    HttpModule,
    ConfigModule,
    UserModule,
    AuthModule,
  ],
  controllers: [TransactionsController, AdminTransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
