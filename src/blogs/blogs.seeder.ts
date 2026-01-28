import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Seeder } from 'nestjs-seeder';
import { Repository } from 'typeorm';
import { Blog } from './entity/blog.entity';
import { faker } from '@faker-js/faker';

@Injectable()
export class BlogSeeder implements Seeder {
  constructor(
    @InjectRepository(Blog)
    private readonly blogRepository: Repository<Blog>,
  ) {}

  private readonly logger = new Logger(BlogSeeder.name);

  async seed(): Promise<any> {
    const existingCount = await this.blogRepository.count();

    if (existingCount > 0) {
      this.logger.log(
        `Found ${existingCount} existing blogs, skipping seeding...`,
      );
      return;
    }

    const numberOfBlogs = 15;

    // Blog post templates for realistic content
    const blogTopics = [
      {
        title: 'The Evolution of Streaming: How We Watch Movies Today',
        description:
          'Exploring the dramatic shift from traditional cinema to on-demand streaming platforms.',
        category: 'industry',
      },
      {
        title: 'Top 10 Must-Watch Films of the Year',
        description:
          'Our curated list of the most acclaimed and entertaining movies released this year.',
        category: 'recommendations',
      },
      {
        title: 'Behind the Scenes: The Art of Film Production',
        description:
          'A deep dive into the intricate process of bringing a movie from script to screen.',
        category: 'education',
      },
      {
        title: 'The Rise of Independent Cinema',
        description:
          'How indie filmmakers are reshaping the movie landscape with bold storytelling.',
        category: 'industry',
      },
      {
        title: 'Understanding Film Genres: A Complete Guide',
        description:
          'Breaking down the characteristics that define each movie genre.',
        category: 'education',
      },
      {
        title: 'Iconic Movie Soundtracks That Defined Generations',
        description:
          'Celebrating the composers and songs that made movie moments unforgettable.',
        category: 'features',
      },
      {
        title: 'The Future of Virtual Reality in Cinema',
        description:
          'Exploring how VR technology is poised to revolutionize the movie-watching experience.',
        category: 'technology',
      },
      {
        title: 'Classic Films Everyone Should Watch at Least Once',
        description:
          'Timeless masterpieces that continue to influence filmmaking today.',
        category: 'recommendations',
      },
      {
        title: 'How CGI Changed Modern Filmmaking Forever',
        description:
          'The technological revolution that transformed visual storytelling in cinema.',
        category: 'technology',
      },
      {
        title: 'Documentary Films That Will Change Your Perspective',
        description:
          'Powerful documentaries that inform, inspire, and challenge our worldview.',
        category: 'recommendations',
      },
      {
        title: 'The Psychology of Why We Love Movies',
        description:
          'Understanding the emotional and cognitive reasons behind our love for cinema.',
        category: 'features',
      },
      {
        title: 'Award Season Preview: Oscar Contenders to Watch',
        description:
          'Early predictions and analysis of films likely to dominate this awards season.',
        category: 'industry',
      },
      {
        title: 'Family-Friendly Films for Every Age Group',
        description:
          'Recommendations for movies the whole family can enjoy together.',
        category: 'recommendations',
      },
      {
        title: 'The Art of Film Criticism: How to Review Movies',
        description:
          'Tips and techniques for analyzing and reviewing films like a professional critic.',
        category: 'education',
      },
      {
        title: 'Streaming Wars: Comparing Major Platforms',
        description:
          'An in-depth comparison of content libraries, features, and value across streaming services.',
        category: 'industry',
      },
    ];

    const authors = [
      'Sarah Mitchell',
      'James Rodriguez',
      'Emily Chen',
      'Michael Thompson',
      'Amanda Foster',
      'David Kim',
      'Rachel Adams',
    ];

    const blogPosts: Partial<Blog>[] = [];

    for (let i = 0; i < numberOfBlogs; i++) {
      const topic = blogTopics[i % blogTopics.length];

      // Generate realistic blog content
      const paragraphs = faker.number.int({ min: 4, max: 8 });
      let content = '';

      for (let p = 0; p < paragraphs; p++) {
        content += faker.lorem.paragraph({ min: 4, max: 8 }) + '\n\n';
      }

      blogPosts.push({
        title: topic.title,
        description: topic.description,
        content: content.trim(),
        author: faker.helpers.arrayElement(authors),
      });
    }

    try {
      await this.blogRepository.save(blogPosts);
      this.logger.log(`Successfully seeded ${numberOfBlogs} blog posts`);
    } catch (error) {
      this.logger.error('Failed to seed blog posts', error);
      throw error;
    }
  }

  async drop(): Promise<any> {
    return this.blogRepository.delete({});
  }
}
