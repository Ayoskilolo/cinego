import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BlogsService } from './blogs.service'
import { BlogsController } from './blogs.controller'
import { AdminBlogsController } from './admin-blogs.controller'
import { Blog } from './entity/blog.entity'
import { BlogComment } from './entity/blog-comment.entity'
import { BlogCommentService } from './blog-comment.service'
import { BlogCommentController } from './blog-comment.controller'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [TypeOrmModule.forFeature([Blog, BlogComment]), AuthModule],
  providers: [BlogsService, BlogCommentService],
  controllers: [BlogsController, AdminBlogsController, BlogCommentController],
  exports: [BlogsService, BlogCommentService],
})
export class BlogsModule {}
