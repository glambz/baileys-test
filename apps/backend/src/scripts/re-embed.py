"""
Re-embed all 20 seed chunks using the locally-loaded MarcoAland/Indonesian-bge-m3 model
and update the Postgres knowledge_chunks.embedding column.

Run from the project root with:
  python src/scripts/re-embed.py

Requires:
  - Postgres reachable (DATABASE_URL or default 127.0.0.1:55432/baileys)
  - python -m pip install psycopg2-binary sentence-transformers
"""
import os
import sys
import time

import psycopg2

t0 = time.time()
MODEL_PATH = r'C:\Users\indocyber\.cache\huggingface\hub\models--MarcoAland--Indonesian-bge-m3\snapshots\0c1c64af5c5ed01723f1ad17152e7ff813f39ba1'
DSN = os.environ.get('DATABASE_URL') or 'postgres://baileys:baileys@127.0.0.1:55432/baileys'
DIM = 1024

print(f'[re-embed] starting at t+0s', flush=True)
print(f'[re-embed] model: {MODEL_PATH}', flush=True)
print(f'[re-embed] db:   {DSN}', flush=True)

print(f'[re-embed] loading model...', flush=True)
from sentence_transformers import SentenceTransformer
m = SentenceTransformer(MODEL_PATH)
print(f'[re-embed] model loaded in {time.time()-t0:.1f}s, dim={m.get_embedding_dimension()}', flush=True)

conn = psycopg2.connect(DSN)
conn.autocommit = False
cur = conn.cursor()
cur.execute('SELECT id, file_id, chunk_index, text FROM knowledge_chunks ORDER BY file_id, chunk_index')
rows = cur.fetchall()
print(f'[re-embed] fetched {len(rows)} chunks from DB', flush=True)

if len(rows) == 0:
    print('[re-embed] no chunks found — run pnpm db:seed first to insert the seed rows')
    sys.exit(1)

texts = [r[3] for r in rows]
print(f'[re-embed] encoding {len(texts)} chunks...', flush=True)
vecs = m.encode(texts, batch_size=8, normalize_embeddings=True, show_progress_bar=False)
print(f'[re-embed] encoded in {time.time()-t0:.1f}s, shape={vecs.shape}', flush=True)

import numpy as np
# Sanity check: each vector should be L2-normalized (norm ≈ 1.0)
norms = np.linalg.norm(vecs, axis=1)
print(f'[re-embed] embedding L2 norms: min={norms.min():.4f} max={norms.max():.4f} mean={norms.mean():.4f}', flush=True)

# Update the DB
print(f'[re-embed] updating DB...', flush=True)
for (id_, file_id, idx, text), vec in zip(rows, vecs):
    cur.execute(
        'UPDATE knowledge_chunks SET embedding = %s::vector, text_hash = encode(sha256(%s::bytea), \'hex\') WHERE id = %s',
        (vec.tolist(), text.encode('utf-8'), id_)
    )
conn.commit()
print(f'[re-embed] updated {len(rows)} rows in DB', flush=True)

# Verify
cur.execute('SELECT count(*), count(DISTINCT embedding) FROM knowledge_chunks')
total, distinct = cur.fetchone()
print(f'[re-embed] DB now has {total} chunks with {distinct} distinct embeddings', flush=True)

cur.close()
conn.close()
print(f'[re-embed] done in {time.time()-t0:.1f}s', flush=True)
