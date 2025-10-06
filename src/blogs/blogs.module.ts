import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BlogsService } from './blogs.service'
import { BlogsController } from './blogs.controller'
import { AdminBlogsController } from './admin-blogs.controller'
import { Blog } from './entity/blog.entity'

@Module({
  imports: [TypeOrmModule.forFeature([Blog])],
  providers: [BlogsService],
  controllers: [BlogsController, AdminBlogsController],
})
export class BlogsModule {}
