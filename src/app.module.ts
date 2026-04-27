import { ClassSerializerInterceptor, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { SubscriptionModule } from './subscription/subscription.module';
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
import { UtilModule } from './util/util.module';
import { ProvidersModule } from './providers/providers.module';
import { MyListModule } from './my-list/my-list.module';
import { User } from './user/entities/user.entity';
import { MailModule } from './mail/mail.module';
import { MovieNewsModule } from './movie-news/movie-news.module';
import { CommentModule } from './comment/comment.module';
import { ReviewModule } from './review/review.module';
import { RecommendationModule } from './recommendation/recommendation.module';
import { SessionEntity } from './auth/entities/session.entity';
import { AwsServicesModule } from './aws-services/aws-services.module';
import { BlogsModule } from './blogs/blogs.module'
import { WatchPartyModule } from './watch-party/watch-party.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: config }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const db = configService.get('database') as Record<string, unknown>;
        return db;
      },
      inject: [ConfigService],
    }),

    TypeOrmModule.forFeature([User, SessionEntity]),

    AuthModule,

    UserModule,

    SubscriptionModule,

    MovieModule,

    PaymentModule,

    UtilModule,

    TransactionsModule,

    ProvidersModule,

    MyListModule,

    ScheduleModule.forRoot(),

    MailModule,

    BlogsModule,
    MovieNewsModule,

    CommentModule,

    ReviewModule,

    RecommendationModule,

    AwsServicesModule,

    WatchPartyModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    JwtService,
    { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_GUARD, useClass: AuthGuard },
    // FileResolver,
  ],
})
export class AppModule {}
