#!/usr/bin/env python3
"""Lädt einen Redaktionsplan (posts.json) inkl. Dateien in den CRM-Bereich "Social Media".

Nutzung:
  python3 social_ingest.py posts.json [--env /workspace/.secrets/marky-social-ingest.env] [--no-assets]

posts.json: Liste von Posts (Schema siehe docs/social-ingest.md). Dateien aus "asset_pfade"
(Liste oder '|'-getrennt) werden in Reihenfolge hochgeladen. Nur Standardbibliothek.
"""
import json, mimetypes, os, sys, urllib.request, urllib.error

def load_env(path):
    env = {}
    for line in open(path, encoding="utf-8"):
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.strip().split("=", 1)
            env[k] = v.strip().strip('"')
    return env

def call(url, secret, payload):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "x-webhook-secret": secret})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise SystemExit(f"HTTP {e.code}: {e.read().decode()[:500]}")

def put(url, headers, path):
    with open(path, "rb") as f:
        data = f.read()
    req = urllib.request.Request(url, data=data, method="PUT", headers=headers)
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.status

def main():
    args = sys.argv[1:]
    if not args:
        raise SystemExit(__doc__)
    env_path = "/workspace/.secrets/marky-social-ingest.env"
    if "--env" in args:
        env_path = args[args.index("--env") + 1]
    env = load_env(env_path)
    url, secret = env["SOCIAL_INGEST_URL"], env["SOCIAL_INGEST_SECRET"]
    posts = json.load(open(args[0], encoding="utf-8"))
    if isinstance(posts, dict):
        posts = posts.get("posts", [posts])
    for i in range(0, len(posts), 50):
        res = call(url, secret, {"action": "upsert", "posts": posts[i:i + 50]})
        print(f"Posts upserted: {res.get('upserted')}")
    if "--no-assets" in args:
        return
    for p in posts:
        paths = p.get("asset_pfade") or []
        if isinstance(paths, str):
            paths = [s for s in paths.split("|") if s.strip()]
        for order, fp in enumerate(paths, 1):
            if not os.path.isfile(fp):
                print(f"  ! fehlt: {fp}")
                continue
            ctype = mimetypes.guess_type(fp)[0] or "application/octet-stream"
            meta = call(url, secret, {"action": "asset-upload-url", "external_id": p["id"], "filename": os.path.basename(fp),
                                      "content_type": ctype, "size": os.path.getsize(fp), "order": order})
            status = put(meta["upload_url"], meta["headers"], fp)
            print(f"  {p['id']}/{os.path.basename(fp)} -> {status}")

if __name__ == "__main__":
    main()
