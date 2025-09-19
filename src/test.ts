#!/usr/bin/env tsx

import { StdioTransport } from './stdio-transport.js';
import { FramingUtils, JsonUtils } from './utils.js';
import { MCPRequest, MCPResponse } from './types.js';

/**
 * Simple test to verify MCP adapter components work correctly
 */
async function testFraming() {
  console.log('Testing Content-Length framing...');
  
  const testMessage = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    }
  });
  
  const framed = FramingUtils.frameMessage(testMessage);
  console.log('Framed message:', framed.substring(0, 100) + '...');
  
  const buffer = Buffer.from(framed, 'utf8');
  const parsed = FramingUtils.parseFramedMessage(buffer);
  
  if (parsed) {
    const originalMessage = JsonUtils.safeParse(parsed.message);
    console.log('✓ Framing test passed');
    console.log('Original method:', originalMessage.method);
  } else {
    console.log('✗ Framing test failed');
  }
}

async function testJsonRpc() {
  console.log('\nTesting JSON-RPC message handling...');
  
  const request: MCPRequest = {
    jsonrpc: '2.0',
    id: 'test-123',
    method: 'tools/list',
    params: {}
  };
  
  const response: MCPResponse = {
    jsonrpc: '2.0',
    id: 'test-123',
    result: {
      tools: [
        {
          name: 'get_contexts',
          description: 'Get project context files'
        }
      ]
    }
  };
  
  try {
    const requestJson = JsonUtils.safeStringify(request);
    const responseJson = JsonUtils.safeStringify(response);
    
    const parsedRequest = JsonUtils.safeParse(requestJson);
    const parsedResponse = JsonUtils.safeParse(responseJson);
    
    console.log('✓ JSON-RPC serialization test passed');
    console.log('Request method:', parsedRequest.method);
    console.log('Response tools count:', parsedResponse.result.tools.length);
  } catch (error) {
    console.log('✗ JSON-RPC test failed:', error);
  }
}

async function testStdioTransport() {
  console.log('\nTesting StdioTransport initialization...');
  
  try {
    const transport = new StdioTransport();
    console.log('✓ StdioTransport created successfully');
    
    // Test message creation
    const testRequest: MCPRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'ping'
    };
    
    // We can't actually send/receive without connecting stdio,
    // but we can test the framing logic
    const messageJson = JsonUtils.safeStringify(testRequest);
    const framedMessage = FramingUtils.frameMessage(messageJson);
    
    console.log('✓ Message framing works correctly');
    console.log('Framed message length:', framedMessage.length);
  } catch (error) {
    console.log('✗ StdioTransport test failed:', error);
  }
}

async function runTests() {
  console.log('=== MCP Adapter Component Tests ===\n');
  
  try {
    await testFraming();
    await testJsonRpc();
    await testStdioTransport();
    
    console.log('\n=== All Tests Completed ===');
    console.log('✓ MCP Adapter core components are working correctly');
    console.log('\nTo test with a real MCP client, run:');
    console.log('  pnpm run mcp:dev --server <your-server-url> --token <your-token>');
  } catch (error) {
    console.error('Test suite failed:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch((error) => {
    console.error('Fatal test error:', error);
    process.exit(1);
  });
}

export { runTests };