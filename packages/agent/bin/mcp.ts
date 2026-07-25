#!/usr/bin/env tsx
/**
 * MCP entry point. Everything it does is in src/mcp.ts; this file exists so the server has a
 * path a client config can point at.
 */
import { serve } from '../src/mcp.js';

serve();
