import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  toolDefinition as parseDocumentDef,
  execute as parseDocumentExec,
} from "./tools/parse-document.js";
import {
  toolDefinition as detectJurisdictionDef,
  execute as detectJurisdictionExec,
} from "./tools/detect-jurisdiction.js";
import {
  toolDefinition as segmentClausesDef,
  execute as segmentClausesExec,
} from "./tools/segment-clauses.js";
import {
  toolDefinition as classifyClauseDef,
  execute as classifyClauseExec,
} from "./tools/classify-clause.js";
import {
  toolDefinition as lookupStatuteDef,
  execute as lookupStatuteExec,
} from "./tools/lookup-statute.js";
import {
  toolDefinition as lookupTribunalDef,
  execute as lookupTribunalExec,
} from "./tools/lookup-tribunal.js";
import {
  toolDefinition as scoreRiskDef,
  execute as scoreRiskExec,
} from "./tools/score-risk.js";
import {
  toolDefinition as detectContradictionDef,
  execute as detectContradictionExec,
} from "./tools/detect-contradiction.js";
import {
  toolDefinition as checkMissingDef,
  execute as checkMissingExec,
} from "./tools/check-missing.js";
import {
  toolDefinition as benchmarkClauseDef,
  execute as benchmarkClauseExec,
} from "./tools/benchmark-clause.js";
import {
  toolDefinition as generateNegotiationDef,
  execute as generateNegotiationExec,
} from "./tools/generate-negotiation.js";
import {
  toolDefinition as generateReportDef,
  execute as generateReportExec,
} from "./tools/generate-report.js";

// Registry: maps tool name → execute function
const TOOL_REGISTRY = new Map<string, (input: unknown) => Promise<unknown>>([
  [parseDocumentDef.name, parseDocumentExec],
  [detectJurisdictionDef.name, detectJurisdictionExec],
  [segmentClausesDef.name, segmentClausesExec],
  [classifyClauseDef.name, classifyClauseExec],
  [lookupStatuteDef.name, lookupStatuteExec],
  [lookupTribunalDef.name, lookupTribunalExec],
  [scoreRiskDef.name, scoreRiskExec],
  [detectContradictionDef.name, detectContradictionExec],
  [checkMissingDef.name, checkMissingExec],
  [benchmarkClauseDef.name, benchmarkClauseExec],
  [generateNegotiationDef.name, generateNegotiationExec],
  [generateReportDef.name, generateReportExec],
]);

const ALL_TOOLS = [
  parseDocumentDef,
  detectJurisdictionDef,
  segmentClausesDef,
  classifyClauseDef,
  lookupStatuteDef,
  lookupTribunalDef,
  scoreRiskDef,
  detectContradictionDef,
  checkMissingDef,
  benchmarkClauseDef,
  generateNegotiationDef,
  generateReportDef,
];

async function main() {
  const server = new Server(
    {
      name: "leaseguard-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: ALL_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const executor = TOOL_REGISTRY.get(name);

    if (!executor) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: `Unknown tool: ${name}`,
              available_tools: [...TOOL_REGISTRY.keys()],
            }),
          },
        ],
        isError: true,
      };
    }

    try {
      const result = await executor(args);

      // Check if the result itself signals an error
      const resultObj = result as Record<string, unknown>;
      const isToolError =
        typeof resultObj === "object" &&
        resultObj !== null &&
        typeof resultObj["error"] === "string";

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: isToolError,
      };
    } catch (err) {
      // A single tool failure must not crash the server
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      const errorStack =
        err instanceof Error ? err.stack : undefined;

      console.error(`[LeaseGuard MCP] Tool '${name}' threw an error:`, err);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: `Tool execution failed: ${errorMessage}`,
              tool: name,
              stack:
                process.env.NODE_ENV === "development" ? errorStack : undefined,
            }),
          },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[LeaseGuard MCP] Server started and listening on stdio");
}

main().catch((err) => {
  console.error("[LeaseGuard MCP] Fatal startup error:", err);
  process.exit(1);
});
