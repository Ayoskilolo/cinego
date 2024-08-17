import { ClassSerializerInterceptor, Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { SimExperienceModule } from './sim-experience/sim-experience.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import config from './config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ResponseInterceptor } from './response/response.interceptor';
import { HttpExceptionFilter } from './http-exception/http-exception.filter';
import { AuthGuard } from './auth/auth.guard';
import { JwtService } from '@nestjs/jwt';
import { MovieModule } from './movie/movie.module';
import { TransactionsModule } from './transactions/transactions.module';
import { PaymentModule } from './payment/payment.module';
import { FlutterwaveModule } from './flutterwave/flutterwave.module';
import { UtilModule } from './util/util.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: config }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],

      useFactory: (configService: ConfigService) =>
        configService.get('database'),

      inject: [ConfigService],
    }),

    AuthModule,

    UserModule,

    SubscriptionModule,

    SimExperienceModule,

    MovieModule,

    TransactionsModule,

    PaymentModule,

    FlutterwaveModule,

    UtilModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    JwtService,
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
