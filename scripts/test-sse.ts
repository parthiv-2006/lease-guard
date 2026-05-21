import { spawn } from "child_process";
import { McpClient } from "../lib/mcp-client";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

async function main() {
  const serverPort = "3005";
  console.log(`[Test SSE] Starting MCP server on port ${serverPort}...`);
  
  // Start MCP server in SSE mode by defining PORT
  const mcpServer = spawn("node", ["mcp-server/dist/start.js"], {
    env: {
      ...process.env,
      PORT: serverPort,
    },
  });

  // Log server output to check for Express start logs
  mcpServer.stdout.on("data", (data) => {
    console.log(`[Server stdout] ${data.toString().trim()}`);
  });

  mcpServer.stderr.on("data", (data) => {
    console.error(`[Server stderr] ${data.toString().trim()}`);
  });

  // Wait 1.5 seconds for the Express server to start up
  await new Promise((resolve) => setTimeout(resolve, 1500));

  try {
    process.env.MCP_SERVER_URL = `http://localhost:${serverPort}`;
    console.log(`[Test SSE] Connecting McpClient to SSE URL: ${process.env.MCP_SERVER_URL}...`);
    
    // Pass mcp-server/dist/start.js as the fallback path (unused during SSE connection)
    const client = await McpClient.create("mcp-server/dist/start.js");
    console.log("[Test SSE] McpClient successfully created and handshaked!");

    console.log("[Test SSE] Calling tool 'score_risk'...");
    const result = await client.callTool("score_risk", {
      clause_id: "clause-1",
      clause_type: "pet_fines",
      clause_text: "Tenant shall pay $50 per day for keeping any pet.",
      retrieved_statutes: [],
      retrieved_decisions: [],
      jurisdiction_code: "CA-ON",
    });

    console.log("[Test SSE] Tool call result:", JSON.stringify(result, null, 2));

    if (result && typeof result === "object" && "risk_score" in result) {
      console.log("[Test SSE] Success! Received valid response from score_risk tool.");
    } else {
      throw new Error("Invalid response format received from score_risk tool");
    }

    client.close();
    console.log("[Test SSE] Client closed.");
  } catch (error) {
    console.error("[Test SSE] Test failed:", error);
    mcpServer.kill();
    process.exit(1);
  }

  // Gracefully terminate the server
  mcpServer.kill();
  console.log("[Test SSE] Server terminated.");
  process.exit(0);
}

main();
