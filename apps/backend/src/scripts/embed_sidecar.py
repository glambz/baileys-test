"""
Local sentence-transformers sidecar for the BAileys/Indonesian-bge-m3 model.
Exposes a tiny HTTP API matching the format the BE's embed.js expects:
  POST /v1/embeddings
  Body:    { model, texts: [string], type: "string" }
  Response: { vectors: [{ embedding: number[] }] }

The model is loaded ONCE at startup (sentence-transformers caches weights
in-memory). Each request re-uses the loaded pipeline; encoding is fast
(~10-50ms per text on CPU).

Run with:  python src/scripts/embed_sidecar.py
Or via:     pnpm embed:start   (if added to package.json)
Default listen: http://127.0.0.1:8765
"""
import os
import sys
import time
import json
import argparse
from http.server import BaseHTTPRequestHandler, HTTPServer

# Parse args FIRST so we can pre-flight config
ap = argparse.ArgumentParser(description='Local sentence-transformers sidecar (MarcoAland/Indonesian-bge-m3)')
ap.add_argument('--host', default=os.environ.get('EMBED_SIDECAR_HOST', '127.0.0.1'))
ap.add_argument('--port', type=int, default=int(os.environ.get('EMBED_SIDECAR_PORT', '8765')))
ap.add_argument('--model', default=os.environ.get('EMBEDDING_MODEL_PATH', r'C:\Users\indocyber\.cache\huggingface\hub\models--MarcoAland--Indonesian-bge-m3\snapshots\0c1c64af5c5ed01723f1ad17152e7ff813f39ba1'))
args = ap.parse_args()

t0 = time.time()
print(f'[sidecar] loading model from {args.model}', flush=True)
from sentence_transformers import SentenceTransformer
m = SentenceTransformer(args.model)
print(f'[sidecar] model loaded in {time.time()-t0:.1f}s, dim={m.get_embedding_dimension()}', flush=True)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Quieter access log
        return

    def do_POST(self):
        if self.path != '/v1/embeddings':
            self.send_response(404)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': f'not found: {self.path}'}).encode())
            return
        n = int(self.headers.get('Content-Length', '0') or 0)
        raw = self.rfile.read(n)
        try:
            body = json.loads(raw)
        except Exception as e:
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': f'bad json: {e}'}).encode())
            return

        texts = body.get('texts') or [body.get('input')]
        if not texts or not isinstance(texts, list):
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'texts (list of strings) is required'}).encode())
            return

        try:
            vecs = m.encode(texts, batch_size=8, normalize_embeddings=True, show_progress_bar=False)
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': f'encode failed: {e}'}).encode())
            return

        # Build the OpenAI/MiniMax-flavored response shape
        # The BE's embed.js accepts: { vectors: [{ embedding }, ...] } OR { data: [{ embedding }] }
        out = {
            'vectors': [
                {'embedding': [float(x) for x in v]}
                for v in vecs
            ],
            'data': [
                {'embedding': [float(x) for x in v]}
                for v in vecs
            ],
            'model': 'MarcoAland/Indonesian-bge-m3',
            'usage': {
                'prompt_tokens': sum(len(t) // 4 for t in texts),
                'total_tokens': sum(len(t) // 4 for t in texts),
            },
        }
        body_out = json.dumps(out).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body_out)))
        self.end_headers()
        self.wfile.write(body_out)

    def do_GET(self):
        if self.path == '/health':
            body = json.dumps({
                'ok': True,
                'model': 'MarcoAland/Indonesian-bge-m3',
                'dim': m.get_embedding_dimension(),
            }).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"error":"not found"}')


print(f'[sidecar] listening on http://{args.host}:{args.port}', flush=True)
HTTPServer((args.host, args.port), Handler).serve_forever()
