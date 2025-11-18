import agoraToken from 'agora-token';

const { RtmTokenBuilder2 } = agoraToken;

const APP_ID = 'd7a84ff10a2b408dbcf20c882df9fe00';
const APP_CERTIFICATE = '19de84eb5dc54ac98cfa72d7a6d23118';

// seconds the token should be valid for
const DEFAULT_EXPIRE_SECONDS = 7200; // 2 hours

export function generateSignalingToken(
  uid,
  expireSeconds = DEFAULT_EXPIRE_SECONDS,
) {
  if (!APP_ID || !APP_CERTIFICATE) {
    throw new Error('Missing AGORA_APP_ID or AGORA_APP_CERTIFICATE env vars');
  }

  // RtmTokenBuilder2 builds an RTM/Signaling token using AccessToken2 (v2).
  // Signature mirrors the Go/Java versions:
  //   buildToken(appId, appCertificate, userId, expireSeconds)
  const token = RtmTokenBuilder2.buildToken(
    APP_ID,
    APP_CERTIFICATE,
    uid,
    expireSeconds,
  );

  return token;
}
