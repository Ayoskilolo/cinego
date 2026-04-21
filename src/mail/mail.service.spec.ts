import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { MailService } from './mail.service';

describe('MailService', () => {
  let service: MailService;
  let httpService: { post: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    httpService = {
      post: jest.fn().mockReturnValue(of({ data: { id: 'notif-123' } })),
    };
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        const config = {
          ONESIGNAL_APP_ID: 'test-app-id',
          ONESIGNAL_API_KEY: 'test-api-key',
          ONESIGNAL_BASE_URL: 'https://api.onesignal.test',
        };
        return config[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── sendMovieRecommendationMail ────────────────────────────────────

  describe('sendMovieRecommendationMail', () => {
    const baseData = {
      recipientName: 'Jane',
      movies: [
        {
          title: 'The Matrix',
          posterUrl: 'https://img.test/matrix.jpg',
          genres: ['Action', 'Sci-Fi'],
          productionYear: '1999',
          duration: '136 min',
          synopsis: 'A computer hacker learns about the true nature of reality.',
          marketRating: 'R',
        },
      ],
    };

    it('should send email and return true on success', async () => {
      const result = await service.sendMovieRecommendationMail(
        'jane@example.com',
        baseData,
      );

      expect(result).toBe(true);
      expect(httpService.post).toHaveBeenCalledTimes(1);

      const [url, payload] = httpService.post.mock.calls[0];
      expect(url).toBe('https://api.onesignal.test/notifications?c=email');
      expect(payload.include_email_tokens).toEqual(['jane@example.com']);
      expect(payload.email_subject).toBe(
        'Jane, here are your personalized picks!',
      );
      expect(payload.email_body).toContain('The Matrix');
      expect(payload.email_body).toContain('Action');
      expect(payload.email_body).toContain('1999');
    });

    it('should return false when OneSignal API fails', async () => {
      httpService.post.mockReturnValue(
        throwError(() => ({ response: { data: 'API error' }, message: 'fail' })),
      );

      const result = await service.sendMovieRecommendationMail(
        'jane@example.com',
        baseData,
      );

      expect(result).toBe(false);
    });

    it('should strip control characters from recipientName in subject', async () => {
      const dataWithNewline = {
        ...baseData,
        recipientName: 'Jane\r\nBcc: hacker@evil.com',
      };

      await service.sendMovieRecommendationMail(
        'jane@example.com',
        dataWithNewline,
      );

      const [, payload] = httpService.post.mock.calls[0];
      expect(payload.email_subject).not.toContain('\r');
      expect(payload.email_subject).not.toContain('\n');
      expect(payload.email_subject).toBe(
        'JaneBcc: hacker@evil.com, here are your personalized picks!',
      );
    });

    it('should HTML-escape movie title in the template body', async () => {
      const dataWithXSS = {
        ...baseData,
        movies: [
          {
            ...baseData.movies[0],
            title: '<script>alert("xss")</script>',
          },
        ],
      };

      await service.sendMovieRecommendationMail(
        'jane@example.com',
        dataWithXSS,
      );

      const [, payload] = httpService.post.mock.calls[0];
      expect(payload.email_body).not.toContain('<script>');
      expect(payload.email_body).toContain('&lt;script&gt;');
    });

    it('should HTML-escape recipientName in the template body', async () => {
      const dataWithXSS = {
        ...baseData,
        recipientName: '<img onerror=alert(1) src=x>',
      };

      await service.sendMovieRecommendationMail(
        'jane@example.com',
        dataWithXSS,
      );

      const [, payload] = httpService.post.mock.calls[0];
      expect(payload.email_body).toContain('&lt;img onerror=alert(1) src=x&gt;');
      expect(payload.email_body).not.toContain('<img onerror');
    });

    it('should HTML-escape posterUrl in img src attribute', async () => {
      const dataWithBadUrl = {
        ...baseData,
        movies: [
          {
            ...baseData.movies[0],
            posterUrl: 'https://img.test/poster.jpg" onload="alert(1)',
          },
        ],
      };

      await service.sendMovieRecommendationMail(
        'jane@example.com',
        dataWithBadUrl,
      );

      const [, payload] = httpService.post.mock.calls[0];
      expect(payload.email_body).not.toContain('" onload="alert(1)');
      expect(payload.email_body).toContain('&quot; onload=&quot;alert(1)');
    });

    it('should truncate long synopses to 120 characters', async () => {
      const longSynopsis = 'A'.repeat(200);
      const dataWithLongSynopsis = {
        ...baseData,
        movies: [
          {
            ...baseData.movies[0],
            synopsis: longSynopsis,
          },
        ],
      };

      await service.sendMovieRecommendationMail(
        'jane@example.com',
        dataWithLongSynopsis,
      );

      const [, payload] = httpService.post.mock.calls[0];
      // 120 chars + '...' = 123 chars of A's content
      expect(payload.email_body).toContain('A'.repeat(120) + '...');
      expect(payload.email_body).not.toContain('A'.repeat(121) + '...');
    });

    it('should show up to 3 genres separated by bullets', async () => {
      const dataWith4Genres = {
        ...baseData,
        movies: [
          {
            ...baseData.movies[0],
            genres: ['Action', 'Sci-Fi', 'Thriller', 'Drama'],
          },
        ],
      };

      await service.sendMovieRecommendationMail(
        'jane@example.com',
        dataWith4Genres,
      );

      const [, payload] = httpService.post.mock.calls[0];
      expect(payload.email_body).toContain('Action');
      expect(payload.email_body).toContain('Sci-Fi');
      expect(payload.email_body).toContain('Thriller');
      // 4th genre should not appear in the genres line (only 3 shown)
      // Drama won't appear as part of the genre bullet line
      const genreLine = payload.email_body.match(
        /Action.*?&bull;.*?Sci-Fi.*?&bull;.*?Thriller/,
      );
      expect(genreLine).toBeTruthy();
    });

    it('should handle empty movies array gracefully', async () => {
      const dataWithNoMovies = {
        ...baseData,
        movies: [],
      };

      const result = await service.sendMovieRecommendationMail(
        'jane@example.com',
        dataWithNoMovies,
      );

      expect(result).toBe(true);
      const [, payload] = httpService.post.mock.calls[0];
      expect(payload.email_body).toContain('Hey Jane');
      // No movie cards, but the template still renders
      expect(payload.email_body).toContain('Start Watching Now');
    });

    it('should handle missing poster URL gracefully', async () => {
      const dataWithNoPoster = {
        ...baseData,
        movies: [
          {
            ...baseData.movies[0],
            posterUrl: '',
          },
        ],
      };

      await service.sendMovieRecommendationMail(
        'jane@example.com',
        dataWithNoPoster,
      );

      const [, payload] = httpService.post.mock.calls[0];
      expect(payload.email_body).toContain('src=""');
    });
  });
});
