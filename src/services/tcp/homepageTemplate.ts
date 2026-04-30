export function getHomepageHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Llama.rn Local Server</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  min-height: 100vh;
  padding: 40px 20px;
}
.container { max-width: 800px; margin: 0 auto; }
h1 { font-size: 2.5em; margin-bottom: 10px; }
h2 { font-size: 1.5em; margin: 30px 0 15px; border-bottom: 2px solid rgba(255,255,255,0.3); padding-bottom: 8px; }
h3 { font-size: 1.1em; margin: 20px 0 10px; }
p { line-height: 1.6; margin-bottom: 12px; opacity: 0.9; }
code {
  background: rgba(0,0,0,0.3);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
}
pre {
  background: rgba(0,0,0,0.3);
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 12px 0;
  font-size: 0.85em;
  line-height: 1.5;
}
.nav { display: flex; gap: 10px; flex-wrap: wrap; margin: 20px 0; }
.nav a {
  color: #fff;
  text-decoration: none;
  padding: 8px 16px;
  border: 1px solid rgba(255,255,255,0.4);
  border-radius: 20px;
  font-size: 0.9em;
  transition: all 0.2s;
}
.nav a:hover { background: rgba(255,255,255,0.15); }
.endpoint {
  background: rgba(0,0,0,0.2);
  border-radius: 8px;
  padding: 16px;
  margin: 12px 0;
}
.endpoint .method {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 0.8em;
  font-weight: 700;
  margin-right: 8px;
}
.method.get { background: #61affe; }
.method.post { background: #49cc90; }
.method.delete { background: #f93e3e; }
.footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.2); font-size: 0.85em; opacity: 0.7; }
</style>
</head>
<body>
<div class="container">
  <h1>🦙 Llama.rn Local Server</h1>
  <p>On-device LLM inference API server. Compatible with OpenAI and Ollama API formats.</p>

  <div class="nav">
    <a href="#quickstart">Quick Start</a>
    <a href="#openai">OpenAI API</a>
    <a href="#chat">Chat</a>
    <a href="#models">Models</a>
    <a href="#server">Server</a>
  </div>

  <h2 id="quickstart">Quick Start</h2>
  <ol>
    <li>Start the server from the Server tab</li>
    <li>Download a model from the Models tab</li>
    <li>Configure your client to use <code>http://&lt;device-ip&gt;:8889/v1</code></li>
    <li>Send a request!</li>
  </ol>
  <pre><code>curl http://localhost:8889/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "your-model",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'</code></pre>

  <h2 id="openai">OpenAI-Compatible API</h2>

  <div class="endpoint">
    <span class="method post">POST</span> <code>/v1/chat/completions</code>
    <p style="margin-top: 8px">Chat completions with streaming support (SSE). Compatible with the OpenAI API format.</p>
    <h3>Request Body</h3>
    <pre><code>{
  "model": "model-name",
  "messages": [
    {"role": "system", "content": "You are helpful."},
    {"role": "user", "content": "Hello!"}
  ],
  "stream": true,
  "temperature": 0.7,
  "max_tokens": 2048
}</code></pre>
    <h3>Response (streaming)</h3>
    <pre><code>data: {"id":"chatcmpl-...","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}
data: {"id":"chatcmpl-...","object":"chat.completion.chunk","choices":[{"delta":{"content":"!"},"finish_reason":null}]}
data: {"id":"chatcmpl-...","object":"chat.completion.chunk","choices":[{"delta":{},"finish_reason":"stop"}]}
data: [DONE]</code></pre>
  </div>

  <div class="endpoint">
    <span class="method get">GET</span> <code>/v1/models</code>
    <p style="margin-top: 8px">List available models.</p>
  </div>

  <h2 id="chat">Chat & Completion APIs</h2>

  <div class="endpoint">
    <span class="method post">POST</span> <code>/api/chat</code>
    <p style="margin-top: 8px">Ollama-compatible chat completion with NDJSON streaming.</p>
  </div>

  <div class="endpoint">
    <span class="method post">POST</span> <code>/api/generate</code>
    <p style="margin-top: 8px">Ollama-compatible generate endpoint (supports prompt and messages).</p>
  </div>

  <h2 id="models">Model Management</h2>

  <div class="endpoint">
    <span class="method get">GET</span> <code>/api/tags</code>
    <p style="margin-top: 8px">List all downloaded models.</p>
  </div>

  <div class="endpoint">
    <span class="method get">GET</span> <code>/api/ps</code>
    <p style="margin-top: 8px">Show currently loaded model.</p>
  </div>

  <div class="endpoint">
    <span class="method post">POST</span> <code>/api/show</code>
    <p style="margin-top: 8px">Show model details.</p>
  </div>

  <h2 id="server">Server</h2>

  <div class="endpoint">
    <span class="method get">GET</span> <code>/api/status</code>
    <p style="margin-top: 8px">Server status and active model info.</p>
  </div>

  <div class="endpoint">
    <span class="method get">GET</span> <code>/api/version</code>
    <p style="margin-top: 8px">Server version.</p>
  </div>

  <div class="footer">
    <p>Llama.rn Local Server | CORS enabled | Port 8889</p>
  </div>
</div>
</body>
</html>`
}
