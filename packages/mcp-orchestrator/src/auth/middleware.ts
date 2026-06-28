import type { IncomingMessage, ServerResponse } from "node:http";
import { Authenticator } from "./authenticator.js";

export function createSSEAuthMiddleware(authenticator: Authenticator) {
  return async (
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<boolean> => {
    if (!authenticator.getConfig().enabled) {
      return true;
    }

    const result = await authenticator.validate(
      req.headers.authorization
    );

    if (!result.authenticated) {
      res.writeHead(401, {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer error="${result.error}"`,
      });
      res.end(JSON.stringify({ error: result.error }));
      return false;
    }

    return true;
  };
}

export function createOAuthMetadataEndpoint() {
  return (res: ServerResponse) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        issuer: "ai-dispatch-orchestrator",
        token_endpoint: "/token",
        token_endpoint_auth_methods_supported: [
          "client_secret_basic",
          "client_secret_post",
        ],
        response_types_supported: ["token"],
        grant_types_supported: ["client_credentials"],
      })
    );
  };
}
