#!/usr/bin/env node
/**
 * MCP server for match.IA — exposes the platform's Express/MongoDB API
 * (backend/src/server.js) as MCP tools: browsing architects/materials/case
 * studies publicly, and — once logged in via matchia_login/matchia_register —
 * running matches, managing projects/portfolio, messaging, reviews and more.
 *
 * Transport: stdio (this is a local server, meant to run as a subprocess of
 * an MCP client like Claude Desktop/Code, talking to a match.IA backend
 * running on the same machine).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerAuthTools } from "./tools/auth.js";
import { registerArchitectTools } from "./tools/architects.js";
import { registerDashboardTools } from "./tools/dashboard.js";
import { registerMatchTools } from "./tools/matches.js";
import { registerMaterialTools } from "./tools/materials.js";
import { registerMessageTools } from "./tools/messages.js";
import { registerReviewTools } from "./tools/reviews.js";
import { registerMoodboardTools } from "./tools/moodboard.js";
import { registerProjectTools } from "./tools/projects.js";
import { registerValidationTools } from "./tools/validations.js";
import { registerStatsTools } from "./tools/stats.js";
import { registerNotificationTools } from "./tools/notifications.js";
import { registerFavoriteTools } from "./tools/favorites.js";
import { registerTimelineTools } from "./tools/timeline.js";
import { registerCaseStudyTools } from "./tools/caseStudies.js";
import { registerBriefTools } from "./tools/briefs.js";
import { registerCommissionTools } from "./tools/commissions.js";
import { registerStoreTools } from "./tools/stores.js";

const server = new McpServer({
  name: "matchia-mcp-server",
  version: "1.0.0",
});

registerAuthTools(server);
registerArchitectTools(server);
registerDashboardTools(server);
registerMatchTools(server);
registerMaterialTools(server);
registerMessageTools(server);
registerReviewTools(server);
registerMoodboardTools(server);
registerProjectTools(server);
registerValidationTools(server);
registerStatsTools(server);
registerNotificationTools(server);
registerFavoriteTools(server);
registerTimelineTools(server);
registerCaseStudyTools(server);
registerBriefTools(server);
registerCommissionTools(server);
registerStoreTools(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("matchia-mcp-server rodando via stdio");
}

main().catch((error) => {
  console.error("Falha ao iniciar o matchia-mcp-server:", error);
  process.exit(1);
});
