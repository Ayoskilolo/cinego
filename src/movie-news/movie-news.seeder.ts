import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Seeder } from 'nestjs-seeder';
import { Repository } from 'typeorm';
import { MovieNews } from './entity/movie-news.entity';
import { Movie } from '../movie/entities/movie.entity';
import { MovieContentType } from '../movie/enums/movie-content-type.enum';
import { faker } from '@faker-js/faker';

@Injectable()
export class MovieNewsSeeder implements Seeder {
  constructor(
    @InjectRepository(MovieNews)
    private readonly movieNewsRepository: Repository<MovieNews>,
    @InjectRepository(Movie)
    private readonly movieRepository: Repository<Movie>,
  ) {}

  private readonly logger = new Logger(MovieNewsSeeder.name);

  async seed(): Promise<any> {
    const existingCount = await this.movieNewsRepository.count();

    if (existingCount > 0) {
      this.logger.log(
        `Found ${existingCount} existing movie news, skipping seeding...`,
      );
      return;
    }

    // Get movies to associate news with (excluding episodes)
    const movies = await this.movieRepository.find({
      where: [
        { contentType: MovieContentType.FILM },
        { contentType: MovieContentType.SERIES },
      ],
      select: { id: true, title: true },
    });

    if (movies.length === 0) {
      this.logger.error(
        'No movies found. Please run the movie seeder first.',
      );
      return;
    }

    // News templates for different types of movie news
    const newsTemplates = [
      {
        titleTemplate: (movieTitle: string) =>
          `"${movieTitle}" Breaks Box Office Records`,
        descriptionTemplate: (movieTitle: string) =>
          `The latest release "${movieTitle}" has exceeded all expectations at the box office.`,
        type: 'box_office',
      },
      {
        titleTemplate: (movieTitle: string) =>
          `Behind the Scenes of "${movieTitle}"`,
        descriptionTemplate: (movieTitle: string) =>
          `Exclusive look at the making of "${movieTitle}" and interviews with the cast.`,
        type: 'behind_scenes',
      },
      {
        titleTemplate: (movieTitle: string) =>
          `"${movieTitle}" Receives Critical Acclaim`,
        descriptionTemplate: (movieTitle: string) =>
          `Critics are praising "${movieTitle}" for its outstanding performances and storytelling.`,
        type: 'reviews',
      },
      {
        titleTemplate: (movieTitle: string) =>
          `Sequel to "${movieTitle}" Officially Announced`,
        descriptionTemplate: (movieTitle: string) =>
          `Fans rejoice as the studio confirms a sequel to the beloved "${movieTitle}".`,
        type: 'announcement',
      },
      {
        titleTemplate: (movieTitle: string) =>
          `"${movieTitle}" Cast Reunites for Anniversary`,
        descriptionTemplate: (movieTitle: string) =>
          `The cast of "${movieTitle}" comes together to celebrate the film's milestone anniversary.`,
        type: 'events',
      },
      {
        titleTemplate: (movieTitle: string) =>
          `Director Discusses the Vision Behind "${movieTitle}"`,
        descriptionTemplate: (movieTitle: string) =>
          `In an exclusive interview, the director shares insights into creating "${movieTitle}".`,
        type: 'interviews',
      },
      {
        titleTemplate: (movieTitle: string) =>
          `"${movieTitle}" Soundtrack Now Available`,
        descriptionTemplate: (movieTitle: string) =>
          `The critically acclaimed soundtrack of "${movieTitle}" is now available on all platforms.`,
        type: 'soundtrack',
      },
      {
        titleTemplate: (movieTitle: string) =>
          `Award Nominations Announced for "${movieTitle}"`,
        descriptionTemplate: (movieTitle: string) =>
          `"${movieTitle}" has received multiple nominations in major award categories.`,
        type: 'awards',
      },
    ];

    const authors = [
      'Entertainment Desk',
      'Film News Team',
      'Jessica Martinez',
      'Robert Taylor',
      'Linda Park',
      'Chris Johnson',
      'Cinema Insider',
    ];

    const newsItems: Partial<MovieNews>[] = [];

    // Create 2-4 news items for a subset of movies
    const moviesToFeature = faker.helpers.arrayElements(
      movies,
      Math.min(25, movies.length),
    );

    for (const movie of moviesToFeature) {
      const numberOfNews = faker.number.int({ min: 1, max: 3 });
      const selectedTemplates = faker.helpers.arrayElements(
        newsTemplates,
        numberOfNews,
      );

      for (const template of selectedTemplates) {
        const paragraphs = faker.number.int({ min: 3, max: 6 });
        let content = '';

        // Generate realistic news content
        content += `${template.descriptionTemplate(movie.title)}\n\n`;
        for (let p = 0; p < paragraphs; p++) {
          content += faker.lorem.paragraph({ min: 3, max: 6 }) + '\n\n';
        }

        newsItems.push({
          title: template.titleTemplate(movie.title),
          description: template.descriptionTemplate(movie.title),
          content: content.trim(),
          author: faker.helpers.arrayElement(authors),
          movieId: movie.id,
        });
      }
    }

    try {
      // Batch insert for better performance
      for (let i = 0; i < newsItems.length; i += 50) {
        await this.movieNewsRepository.save(newsItems.slice(i, i + 50));
      }
      this.logger.log(
        `Successfully seeded ${newsItems.length} movie news items for ${moviesToFeature.length} movies`,
      );
    } catch (error) {
      this.logger.error('Failed to seed movie news', error);
      throw error;
    }
  }

  async drop(): Promise<any> {
    return this.movieNewsRepository.delete({});
  }
}
