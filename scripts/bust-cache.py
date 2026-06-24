#!/usr/bin/env python3
"""Post-build cache-buster: appends ?v=<mtime> to all local ESM imports.

Run after esbuild to ensure browsers reload all dependent modules when the
entry point changes.
"""
import glob
import os
import re
import sys

SCRIPT_JS = 'static/dist/script.js'

if not os.path.exists(SCRIPT_JS):
    print(f'bust-cache: {SCRIPT_JS} not found, skipping', file=sys.stderr)
    sys.exit(1)

cache_buster = str(int(os.path.getmtime(SCRIPT_JS)))

# Match  from "./file.js"  or  from '../sub/file.js'  (any depth)
# Also matches an existing ?v=NNNNN so we replace it idempotently
pattern = re.compile(
    r'''from\s+(["'])((?:\.\.?/)+)([^"']+\.js)(\?v=\d+)?\1'''
)

for path in glob.glob('static/dist/**/*.js', recursive=True):
    with open(path) as fh:
        original = fh.read()
    updated = pattern.sub(
        lambda m: f'from {m.group(1)}{m.group(2)}{m.group(3)}?v={cache_buster}{m.group(1)}',
        original,
    )
    if updated != original:
        with open(path, 'w') as fh:
            fh.write(updated)
        print(f'  bust-cache: {path}')
