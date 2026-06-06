import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// The base URL of the running Silicon Nexus REST API
const NEXUS_API_URL = process.env.NEXUS_API_URL || "http://127.0.0.1:3000/api";

const server = new Server(
  {
    name: "silicon-nexus",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define the Tools exposed to the local Agent (e.g. Cursor, Claude Desktop)
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "nexus_write_memory",
        description: "Write data to the Agent's remote Memory Vault in Silicon Nexus.",
        inputSchema: {
          type: "object",
          properties: {
            agentId: { type: "string" },
            data: { type: "object", description: "Key-value pairs to store" },
          },
          required: ["agentId", "data"],
        },
      },
      {
        name: "nexus_read_memory",
        description: "Read data from the Agent's remote Memory Vault in Silicon Nexus.",
        inputSchema: {
          type: "object",
          properties: {
            agentId: { type: "string" },
            key: { type: "string", description: "Optional specific memory key to retrieve" },
          },
          required: ["agentId"],
        },
      },
      {
         name: "nexus_create_task",
         description: "Delegate a sub-task to the Nexus swarm queue.",
         inputSchema: {
           type: "object",
           properties: {
             creatorId: { type: "string", description: "Your Agent ID" },
             type: { type: "string", description: "Task classification" },
             payload: { type: "object", description: "Instructions for the task" }
           },
           required: ["creatorId", "type", "payload"]
         }
      }
    ],
  };
});

// Execute the Tools by translating them into REST HTTP calls to your Express backend
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const sysKey = process.env.NEXUS_API_KEY || process.env.API_KEY || "";

  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (sysKey) {
    headers["X-API-Key"] = sysKey;
    headers["Authorization"] = `Bearer ${sysKey}`;
  }

  try {
    if (name === "nexus_write_memory") {
      const response = await fetch(`${NEXUS_API_URL}/agent/${args.agentId}/memory`, {
        method: "POST",
        headers,
        body: JSON.stringify(args.data),
      });
      const data = await response.json();
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }

    if (name === "nexus_read_memory") {
      const keyPath = args.key ? `/${args.key}` : "";
      const response = await fetch(`${NEXUS_API_URL}/agent/${args.agentId}/memory${keyPath}`, {
        headers
      });
      const data = await response.json();
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }

    if (name === "nexus_create_task") {
      const response = await fetch(`${NEXUS_API_URL}/tasks`, {
        method: "POST",
        headers,
        body: JSON.stringify({
           creatorId: args.creatorId,
           type: args.type,
           payload: args.payload
        }),
      });
      const data = await response.json();
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error calling Silicon Nexus API: ${error.message}` }],
      isError: true,
    };
  }
});

// Start the stdio transport (Used by MCP clients like Cursor or Claude Desktop)
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Silicon Nexus MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
