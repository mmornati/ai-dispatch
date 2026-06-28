import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { createSecretKey } from "node:crypto";

export interface OAuth2Config {
  enabled: boolean;
  issuer?: string;
  audience?: string;
  jwksUrl?: string;
  secretKey?: string;
}

export interface AuthResult {
  authenticated: boolean;
  claims?: JWTPayload;
  error?: string;
}

export class Authenticator {
  private config: OAuth2Config;
  private jwksGetKey?: ReturnType<typeof createRemoteJWKSet>;
  private secretKey?: ReturnType<typeof createSecretKey>;

  constructor(config: OAuth2Config) {
    this.config = config;

    if (config.jwksUrl) {
      this.jwksGetKey = createRemoteJWKSet(new URL(config.jwksUrl));
    }

    if (config.secretKey) {
      this.secretKey = createSecretKey(Buffer.from(config.secretKey, "utf-8"));
    }
  }

  async validate(authorizationHeader?: string): Promise<AuthResult> {
    if (!this.config.enabled) {
      return { authenticated: true };
    }

    if (!authorizationHeader) {
      return {
        authenticated: false,
        error: "Missing Authorization header",
      };
    }

    const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader);
    if (!match) {
      return {
        authenticated: false,
        error: "Invalid Authorization format — expected Bearer token",
      };
    }

    return this.verifyToken(match[1]);
  }

  private async verifyToken(token: string): Promise<AuthResult> {
    try {
      const options: Record<string, unknown> = {};
      if (this.config.issuer) options.issuer = this.config.issuer;
      if (this.config.audience) options.audience = this.config.audience;

      let result;
      if (this.jwksGetKey) {
        result = await jwtVerify(token, this.jwksGetKey as never, options as never);
      } else if (this.secretKey) {
        result = await jwtVerify(token, this.secretKey as never, options as never);
      } else {
        return {
          authenticated: false,
          error:
            "No verification key configured — set jwksUrl or secretKey in auth config",
        };
      }

      return { authenticated: true, claims: result.payload };
    } catch (err) {
      return {
        authenticated: false,
        error: `Token verification failed: ${(err as Error).message}`,
      };
    }
  }

  getConfig(): OAuth2Config {
    return this.config;
  }
}
