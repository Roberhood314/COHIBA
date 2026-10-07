export const humanSignalOpenAPI = {
  "openapi": "3.1.1",
  "info": {
    "title": "COHIBA Human Signal Discovery API",
    "version": "0.1.0",
    "description": "Experimental, pre-audit discovery profile. Metadata is not execution authority. This profile describes only public protocol discovery; it does not certify MCP, ERC-4337, OAuth or generic external-effect safety."
  },
  "servers": [
    {
      "url": "/"
    }
  ],
  "paths": {
    "/api/v1/protocol": {
      "get": {
        "operationId": "getHumanSignalProtocol",
        "security": [],
        "summary": "Discover protocol metadata; does not authorize effects",
        "responses": {
          "200": {
            "description": "Protocol metadata; executionEnabled is configuration, not permission.",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Protocol"
                }
              }
            }
          },
          "503": {
            "description": "Account storage unavailable; no authorization"
          }
        }
      }
    }
  },
  "components": {
    "schemas": {
      "Protocol": {
        "type": "object",
        "required": [
          "ok",
          "protocol",
          "version",
          "milestone",
          "algorithm",
          "canonicalization",
          "executionEnabled",
          "actionNonceConsumption",
          "policyVersion",
          "developerLab"
        ],
        "properties": {
          "ok": {
            "const": true
          },
          "protocol": {
            "const": "Human Signal PoHA"
          },
          "version": {
            "const": "1"
          },
          "milestone": {
            "enum": [
              "DURABLE_AUTHORIZATION",
              "SIGNED_INSPECTION"
            ]
          },
          "algorithm": {
            "const": "Ed25519"
          },
          "canonicalization": {
            "const": "HS_RESTRICTED_JSON_V1",
            "description": "Project-specific signing format; not RFC 8785 JCS."
          },
          "executionEnabled": {
            "type": "boolean"
          },
          "actionNonceConsumption": {
            "type": "boolean"
          },
          "policyVersion": {
            "const": "PHONE_BOUND_DRAFT_V1"
          },
          "developerLab": {
            "const": "/poha-lab.html"
          }
        }
      }
    }
  }
};
