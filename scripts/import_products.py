#!/usr/bin/env python3
"""
Import products from market .bak (SQLite) into Dokanex Supabase.
Usage: python3 scripts/import_products.py
"""
import sqlite3
import json
import shutil
import getpass
import sys
import urllib.request
import urllib.error

BAK_PATH      = "/home/ibrahim/Downloads/market@2026-5-24#419.bak"
TMP_DB        = "/tmp/market_clean.db"
SUPABASE_URL  = "https://fntojupobuvrpryiodgh.supabase.co"
ANON_KEY      = "sb_publishable_kNmRmc-sAZNnYfX-dHzKfA_boLBaQ42"
USER_ID       = "465e1122-7401-4805-82c8-c06551d926d0"
BATCH_SIZE    = 100
HEADER_SKIP   = 47   # non-SQLite prefix bytes in .bak file


# ── Phase 1: Extract ─────────────────────────────────────────────────────────

def open_db():
    """Return a sqlite3 connection, stripping the .bak header if needed."""
    try:
        conn = sqlite3.connect(BAK_PATH)
        conn.execute("SELECT 1 FROM products LIMIT 1")
        conn.row_factory = sqlite3.Row
        return conn
    except Exception:
        pass

    # Strip header and write clean copy
    with open(BAK_PATH, "rb") as f:
        data = f.read()
    # Find SQLite magic bytes
    magic = b"SQLite format 3"
    offset = data.find(magic)
    if offset == -1:
        print("ERROR: Cannot find SQLite header in .bak file.")
        sys.exit(1)
    with open(TMP_DB, "wb") as f:
        f.write(data[offset:])
    conn = sqlite3.connect(TMP_DB)
    conn.row_factory = sqlite3.Row
    return conn


def extract_products(conn):
    cur = conn.execute(
        "SELECT name_product, price_product, whole_sale_price FROM products"
    )
    rows = cur.fetchall()
    products = []
    for r in rows:
        name = (r["name_product"] or "").strip()
        if not name:
            continue
        selling   = str(r["price_product"])    if r["price_product"]    not in (None, "") else "0"
        wholesale = str(r["whole_sale_price"]) if r["whole_sale_price"] not in (None, "") else "0"
        products.append({
            "name":            name,
            "selling_price":   selling,
            "wholesale_price": wholesale,
            "category_id":     None,
            "image_url":       None,
            "user_id":         USER_ID,
        })
    return products


# ── Phase 2: Login ────────────────────────────────────────────────────────────

def supabase_login(email, password):
    url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
    body = json.dumps({"email": email, "password": password}).encode()
    req = urllib.request.Request(
        url, data=body,
        headers={"apikey": ANON_KEY, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.load(resp)
    except urllib.error.HTTPError as e:
        msg = e.read().decode()
        print(f"Login failed ({e.code}): {msg}")
        sys.exit(1)

    token = data.get("access_token")
    if not token:
        print(f"Login failed — no access_token in response: {data}")
        sys.exit(1)
    return token


# ── Phase 3: Batch insert ─────────────────────────────────────────────────────

def insert_batch(batch, token):
    url = f"{SUPABASE_URL}/rest/v1/products"
    body = json.dumps(batch).encode("utf-8")
    req = urllib.request.Request(
        url, data=body,
        headers={
            "apikey":        ANON_KEY,
            "Authorization": f"Bearer {token}",
            "Content-Type":  "application/json",
            "Prefer":        "return=minimal",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            resp.read()
    except urllib.error.HTTPError as e:
        msg = e.read().decode()
        print(f"\nInsert error ({e.code}): {msg}")
        sys.exit(1)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=== Dokanex — Import products from .bak ===\n")

    # Phase 1
    print(f"Opening: {BAK_PATH}")
    conn = open_db()
    products = extract_products(conn)
    conn.close()
    total = len(products)
    print(f"Extracted {total} products from SQLite.\n")

    # Phase 2
    email    = input("Dokanex email: ").strip()
    password = getpass.getpass("Password: ")
    print("Logging in to Supabase...")
    token = supabase_login(email, password)
    print("Login OK.\n")

    # Phase 3
    print(f"Inserting {total} products in batches of {BATCH_SIZE}...")
    inserted = 0
    for i in range(0, total, BATCH_SIZE):
        batch = products[i : i + BATCH_SIZE]
        insert_batch(batch, token)
        inserted += len(batch)
        print(f"  {inserted}/{total}", end="\r", flush=True)

    print(f"\nDone! {inserted} products added to Dokanex.")


if __name__ == "__main__":
    main()
