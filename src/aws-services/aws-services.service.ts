import {
  GetObjectCommand,
  GetObjectCommandInput,
  ListBucketsCommand,
  ListObjectsCommand,
  ListObjectsCommandInput,
  ListObjectsV2Command,
  ListObjectsV2CommandInput,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectAws } from 'aws-sdk-v3-nest';
import { ConfigService } from '@nestjs/config';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getSignedCookies } from '@aws-sdk/cloudfront-signer';
import { readFileSync } from 'node:fs';
import { makeCookiePolicy, normalizeScope } from 'src/helpers';

@Injectable()
export class AwsServicesService {
  private readonly logger = new Logger(AwsServicesService.name);

  constructor(
    @InjectAws(S3Client) private readonly s3Client: S3Client,
    private readonly configService: ConfigService,
  ) {}

  async listBuckets() {
    try {
      // Validate AWS configuration
      const region = this.configService.get('aws.region');
      const roleArn = this.configService.get('aws.roleArn');

      if (!region || !roleArn) {
        this.logger.error('AWS configuration is incomplete', {
          region,
          roleArn,
        });
        throw new InternalServerErrorException(
          'AWS configuration is incomplete. Please check AWS_REGION and AWS_ROLE_ARN environment variables.',
        );
      }

      const command = new ListBucketsCommand({});
      const response = await this.s3Client.send(command);

      this.logger.log('Successfully retrieved S3 buckets', {
        bucketCount: response.Buckets?.length || 0,
      });

      return response.Buckets;
    } catch (error) {
      this.logger.error('Failed to list S3 buckets', error);

      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      throw new InternalServerErrorException(
        `Failed to list S3 buckets: ${error.message}`,
      );
    }
  }

  async getPresignedUrl(bucketName: string, key: string, duration: number) {
    try {
      const params: GetObjectCommandInput = {
        Bucket: bucketName,
        Key: key, //path to the movie on s3
      };
      const command = new GetObjectCommand(params);
      const expiresInSeconds = duration; // Duration of the movie

      const presignedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: expiresInSeconds,
      });

      return presignedUrl;
    } catch (error) {
      console.error('Failed to get presigned url', error);
      throw new InternalServerErrorException(error);
    }
  }

  async listObjects(bucketName: string, options?: Record<string, any>) {
    try {
      const command = new ListObjectsCommand({
        Bucket: bucketName,
        ...options,
      });
      const response = await this.s3Client.send(command);
      const { Contents, ...rest } = response;
      console.log(rest, 'response');
      return response.Contents;
    } catch (error) {
      this.logger.error('Failed to list S3 objects', error);
      throw new InternalServerErrorException(error);
    }
  }

  async listTopLevel(bucketName: string, prefix = '') {
    const params: ListObjectsV2CommandInput = {
      Bucket: bucketName,
      //   Delimiter: '/', // collapse children
      //   Prefix: prefix, // "" for bucket root, or e.g. "movies/" to scope
      MaxKeys: 1000,
    };

    const res = await this.s3Client.send(new ListObjectsV2Command(params));

    console.log(res, 'res');
    // In v3, these can be absent (undefined) depending on input/result.
    const filesAtThisLevel = (res.Contents ?? [])
      // Filter out any “directory markers” that end with “/”
      .filter((o) => o.Key && !o.Key.endsWith('/'))
      .map((o) => o.Key!);

    const foldersAtThisLevel = (res.CommonPrefixes ?? []).map((p) =>
      (p.Prefix ?? '').replace(/\/$/, ''),
    ); // strip trailing slash

    return {
      files: filesAtThisLevel,
      folders: foldersAtThisLevel,
      isTruncated: !!res.IsTruncated,
      next: res.NextContinuationToken ?? null,
      raw: res, // keep if you want to inspect full response
    };
  }

  // temporary endpoint
  async showMoviesInBucket() {
    const buckets = await this.listBuckets();
    const bucket = buckets.find((bucket) => bucket.Name === 'test-cinego');
    if (!bucket) {
      throw new NotFoundException('Bucket not found');
    }
    // const options = {
    //   Delimiter: '/',
    //   Prefix: '',
    //   //   Bucket: bucket.Name,
    // };
    // const objects = await this.listObjects(bucket.Name); //, options);
    // // console.log(objects, 'objects');

    const objects = await this.listTopLevel(bucket.Name);
    return objects;
  }

  async getPresignedUrlForMovie() {
    // const objects = await this.listTopLevel('test-cinego');

    const url = await this.getPresignedUrl(
      'test-cinego',
      'fast-6/trailer/fast6_master.m3u8',
      3600,
    );
    return url;
  }

  async getCloudFrontSignedCookies(
    scope: string = '/',
    ttlSeconds: number = 900,
  ) {
    try {
      // Normalize scope to folder format (e.g. /fast-6/trailer/*)
      const { wildcard, cookiePath } = normalizeScope(scope);
      console.log('Normalized scope', { wildcard, cookiePath });

      // Prefer namespaced config, fallback to direct env keys
      const cfDomain =
        this.configService.get<string>('aws.cfDomain') ||
        this.configService.get<string>('AWS_CF_DOMAIN');
      const keyPairId =
        this.configService.get<string>('aws.cfKeyPairId') ||
        this.configService.get<string>('AWS_CF_KEY_PAIR_ID');

      let privateKey;

      // Support reading private key from file path if provided
      if (!privateKey) {
        const privateKeyPath =
          this.configService.get<string>('aws.privateKeyPath') ||
          this.configService.get<string>('PRIVATE_KEY_PATH');
        if (privateKeyPath) {
          try {
            privateKey = readFileSync(privateKeyPath, 'utf8');
          } catch (err) {
            this.logger.error('Failed to read PRIVATE_KEY_PATH file', {
              privateKeyPath,
              error: (err as Error)?.message,
            });
          }
        }
      }

      // Normalize escaped newlines if key is provided via environment variable
      const normalizedPrivateKey = privateKey?.includes('\\n')
        ? privateKey.replace(/\\n/g, '\n')
        : privateKey;

      if (!cfDomain || !keyPairId || !normalizedPrivateKey) {
        this.logger.error('Missing CloudFront signing configuration', {
          cfDomain,
          keyPairId,
          hasPrivateKey: !!normalizedPrivateKey,
        });
        throw new InternalServerErrorException(
          'CloudFront signing configuration is missing. Ensure AWS_CF_DOMAIN, AWS_CF_KEY_PAIR_ID and PRIVATE_KEY are set (or PRIVATE_KEY_PATH).',
        );
      }

      // Basic sanity check on key format
      if (!normalizedPrivateKey.trim().startsWith('-----BEGIN')) {
        this.logger.error('PRIVATE_KEY does not appear to be a valid PEM key');
        throw new InternalServerErrorException(
          'Invalid PRIVATE_KEY format. Expected a PEM string (-----BEGIN ... KEY-----).',
        );
      }

      const ttl = Math.min(3600, Number(ttlSeconds ?? 900));
      const expires = new Date(Date.now() + ttl * 1000);

      const policyJson = makeCookiePolicy(
        `https://${cfDomain}${wildcard}`,
        expires,
      );

      const cookies = getSignedCookies({
        policy: policyJson,
        keyPairId,
        privateKey: normalizedPrivateKey,
      });

      return { cookies, expires, ttl };
    } catch (error) {
      this.logger.error('Failed to generate CloudFront signed cookies', error);
      throw new InternalServerErrorException(error);
    }
  }
}
