import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import cors from "cors";

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

function createServer(): Server {
  const server = new Server(
    { name: "leaseguard-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const executor = TOOL_REGISTRY.get(name);

    if (!executor) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: `Unknown tool: ${name}`, available_tools: [...TOOL_REGISTRY.keys()] }) }],
        isError: true,
      };
    }

    try {
      const result = await executor(args);
      const resultObj = result as Record<string, unknown>;
      const isToolError = typeof resultObj === "object" && resultObj !== null && typeof resultObj["error"] === "string";
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        isError: isToolError,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
      const errorStack = err instanceof Error ? err.stack : undefined;
      console.error(`[LeaseGuard MCP] Tool '${name}' threw an error:`, err);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: `Tool execution failed: ${errorMessage}`, tool: name, stack: process.env.NODE_ENV === "development" ? errorStack : undefined }) }],
        isError: true,
      };
    }
  });

  return server;
}

async function main() {
  process.on("uncaughtException", (err) => {
    console.error("[LeaseGuard MCP] Uncaught exception:", err.message, err.stack);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("[LeaseGuard MCP] Unhandled rejection:", reason instanceof Error ? reason.message : reason);
  });

  if (process.env.PORT) {
    const app = express();
    app.use(cors());
    app.use(express.json());

    app.get("/health", (_req, res) => {
      res.status(200).json({ status: "ok" });
    });

    // Create a fresh server+transport per POST request.
    // StreamableHTTPServerTransport stores a single _requestContext, so reusing
    // one instance across concurrent requests causes a race where the second
    // request overwrites the context and the first response is never sent.
    // Per-request creation is the correct stateless pattern per SDK docs.
    app.post("/mcp", async (req, res) => {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless — no session tracking
        enableJsonResponse: true,      // plain JSON response, no SSE streams
      });
      const mcpServer = createServer();
      mcpServer.onerror = (err) => {
        console.error("[LeaseGuard MCP] MCP error:", err instanceof Error ? err.message : err);
      };
      try {
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (err) {
        console.error("[LeaseGuard MCP] handleRequest error:", err instanceof Error ? err.message : err);
        if (!res.headersSent) {
          res.status(500).json({ error: "MCP request failed" });
        }
      }
    });

    const port = parseInt(process.env.PORT, 10) || 8080;
    app.listen(port, () => {
      console.log(`[LeaseGuard MCP] HTTP server listening on port ${port}`);
      // Heartbeat — confirms process stays alive after startup
      let tick = 0;
      const hb = setInterval(() => {
        tick++;
        console.log(`[LeaseGuard MCP] heartbeat ${tick} — alive at ${new Date().toISOString()}`);
        if (tick >= 3) clearInterval(hb); // stop after 3 × 10s = 30s
      }, 10_000);
      hb.unref(); // don't keep the process alive for the heartbeat alone
    });
  } else {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[LeaseGuard MCP] Server started and listening on stdio");
  }
}

main().catch((err) => {
  console.error("[LeaseGuard MCP] Fatal startup error:", err);
  process.exit(1);
});
