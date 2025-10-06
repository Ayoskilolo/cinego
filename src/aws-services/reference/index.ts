import { getSignedCookies } from '@aws-sdk/cloudfront-signer';
import type { Request, Response } from 'express';

const CF_DOMAIN = process.env.AWS_CF_DOMAIN!; // your CloudFront CNAME
const KEY_PAIR_ID = process.env.AWS_CF_KEY_PAIR_ID!; // from CloudFront "Public keys" table
const PRIVATE_KEY = process.env.PRIVATE_KEY!; // -----BEGIN PRIVATE KEY-----...

export async function createCdnSession(req: Request, res: Response) {
  // 1) AuthN/AuthZ the user here...

  const scope = req.body.scope ?? '/'; // e.g. /fast-6/trailer/*
  const ttl = Math.min(3600, Number(req.body.ttlSeconds ?? 900));
  const expires = new Date(Date.now() + ttl * 1000);

  const cookies = getSignedCookies({
    url: `https://${CF_DOMAIN}${scope}`,
    keyPairId: KEY_PAIR_ID,
    privateKey: PRIVATE_KEY,
    dateLessThan: expires,
  });

  const base = [
    'Secure',
    'HttpOnly',
    'SameSite=None', // for cross-site subdomain requests
    `Domain=.cinego.live`, // parent domain of api + media QUESTION: Would this change as we are currently on localhost?
    'Path=/',
    `Expires=${expires.toUTCString()}`,
  ].join('; ');

  res.setHeader('Set-Cookie', [
    `CloudFront-Policy=${cookies['CloudFront-Policy']}; ${base}`,
    `CloudFront-Signature=${cookies['CloudFront-Signature']}; ${base}`,
    `CloudFront-Key-Pair-Id=${cookies['CloudFront-Key-Pair-Id']}; ${base}`,
  ]);

  res.status(204).end();
}
