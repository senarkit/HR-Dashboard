"""
Validates the HR-Dashboard codebase for common build/deployment errors.
Checks TypeScript files for structural issues without needing Node.js.
"""
import re
import sys
import os
import json

ROOT = os.path.dirname(os.path.abspath(__file__))
ERRORS = []
WARNINGS = []

def err(msg): ERRORS.append(f"  ❌ {msg}")
def warn(msg): WARNINGS.append(f"  ⚠  {msg}")
def ok(msg): print(f"  ✅ {msg}")

def read(path):
    with open(os.path.join(ROOT, path), encoding='utf-8') as f:
        return f.read()

print("\n══════════════════════════════════════════")
print("  HR-Dashboard Build Validation")
print("══════════════════════════════════════════\n")

# ── 1. Check key files exist ────────────────────────────────────
print("[ 1 ] Checking required files exist...")
required = [
    "api/dashboard-data.ts",
    "netlify/functions/dashboard-data.ts",
    "netlify/functions/kpi-config.ts",
    "src/routes/index.tsx",
    "src/routes/__root.tsx",
    "src/router.tsx",
    "src/styles.css",
    "netlify.toml",
    "vercel.json",
    "package.json",
    "vite.config.ts",
    "tsconfig.json",
]
for f in required:
    if os.path.exists(os.path.join(ROOT, f)):
        ok(f)
    else:
        err(f"MISSING: {f}")

# ── 2. api/dashboard-data.ts — must have no TS imports ─────────
print("\n[ 2 ] Checking api/dashboard-data.ts has no cross-file imports...")
api_src = read("api/dashboard-data.ts")
imports = re.findall(r'^import .+ from .+', api_src, re.MULTILINE)
if imports:
    err(f"api/dashboard-data.ts has forbidden imports (Vercel can't resolve them):")
    for i in imports: err(f"  → {i.strip()}")
else:
    ok("No imports — file is self-contained (required for Vercel)")

# ── 3. api/dashboard-data.ts — must export default handler ─────
print("\n[ 3 ] Checking api/dashboard-data.ts exports default handler...")
if "export default async function handler" in api_src:
    ok("Exports default async handler")
else:
    err("Missing 'export default async function handler' in api/dashboard-data.ts")

# ── 4. DashboardData interface in index.tsx ─────────────────────
print("\n[ 4 ] Checking DashboardData interface completeness in index.tsx...")
index_src = read("src/routes/index.tsx")

required_fields = [
    "offerAcceptanceRate",
    "topOfferDropReasons",
    "timeToFillByBU",
    "avgTimeToFill",
    "offersExtended",
]
# Find the full interface block (handles nested braces)
iface_start = index_src.find("interface DashboardData {")
iface_block = ""
if iface_start != -1:
    depth, i = 0, iface_start
    while i < len(index_src):
        if index_src[i] == '{': depth += 1
        elif index_src[i] == '}':
            depth -= 1
            if depth == 0:
                iface_block = index_src[iface_start:i+1]
                break
        i += 1
for field in required_fields:
    if field in iface_block:
        ok(f"DashboardData.{field} declared")
    else:
        err(f"DashboardData missing field: {field}")

# ── 5. Frontend fetch URL ───────────────────────────────────────
print("\n[ 5 ] Checking frontend API endpoint...")
if '`/api/dashboard-data' in index_src:
    ok("Frontend calls /api/dashboard-data (works on Vercel natively)")
else:
    err("Cannot find /api/dashboard-data fetch call in index.tsx")

# ── 6. netlify.toml has API redirect ───────────────────────────
print("\n[ 6 ] Checking netlify.toml redirects...")
netlify_toml = read("netlify.toml")
if "/.netlify/functions/dashboard-data" in netlify_toml:
    ok("Redirect /api/dashboard-data → /.netlify/functions/dashboard-data present")
else:
    err("netlify.toml missing redirect for /api/dashboard-data")
if "/index.html" in netlify_toml:
    ok("SPA fallback /* → /index.html present")
else:
    warn("netlify.toml missing SPA fallback /* → /index.html")

# ── 7. vercel.json exists ───────────────────────────────────────
print("\n[ 7 ] Checking vercel.json...")
vercel_json = read("vercel.json")
vercel_data = json.loads(vercel_json)
if "/index.html" in vercel_json:
    err("vercel.json has SPA rewrite to /index.html — WRONG for TanStack Start SSR, causes 404")
else:
    ok("No bad SPA rewrites in vercel.json")
if vercel_data.get("buildCommand"):
    ok(f"buildCommand: {vercel_data['buildCommand']}")
else:
    warn("vercel.json missing buildCommand (Vercel may not use correct command)")

# ── 8. vite.config.ts — no Netlify-specific plugin ─────────────
print("\n[ 8 ] Checking vite.config.ts...")
vite_cfg = read("vite.config.ts")
if "@netlify/vite-plugin" in vite_cfg:
    err("vite.config.ts imports @netlify/vite-plugin — remove for Vercel compatibility")
else:
    ok("No Netlify-specific Vite plugin (compatible with both platforms)")
if "tanstackStart" in vite_cfg:
    ok("tanstackStart() plugin registered")

# ── 9. Netlify function has proper Handler export ───────────────
print("\n[ 9 ] Checking netlify/functions/dashboard-data.ts...")
netlify_fn = read("netlify/functions/dashboard-data.ts")
if "export const handler: Handler" in netlify_fn:
    ok("Netlify handler exported correctly")
else:
    err("netlify/functions/dashboard-data.ts missing 'export const handler: Handler'")
if "from '@netlify/functions'" in netlify_fn:
    ok("Imports from @netlify/functions")
else:
    err("netlify/functions/dashboard-data.ts missing @netlify/functions import")

# ── 10. AnalyticsTab destructuring ─────────────────────────────
print("\n[ 10 ] Checking AnalyticsTab for bad destructuring...")
# Old bad pattern: const { ..., topOfferDropReasons } = data
# It's now split into two lines
match = re.search(
    r'const \{[^}]*topOfferDropReasons[^}]*\} = data',
    index_src
)
if match:
    err(f"AnalyticsTab still destructures topOfferDropReasons from data directly (type error in old interface)")
else:
    ok("AnalyticsTab accesses topOfferDropReasons via data.topOfferDropReasons")

# ── 11. package.json scripts ───────────────────────────────────
print("\n[ 11 ] Checking package.json...")
import json
pkg = json.loads(read("package.json"))
if pkg.get("scripts", {}).get("build"):
    ok(f"build script: {pkg['scripts']['build']}")
else:
    err("No 'build' script in package.json")
if pkg.get("scripts", {}).get("dev"):
    ok(f"dev script: {pkg['scripts']['dev']}")

# ── Summary ─────────────────────────────────────────────────────
print("\n══════════════════════════════════════════")
print("  RESULTS")
print("══════════════════════════════════════════")
if WARNINGS:
    print("\nWarnings:")
    for w in WARNINGS: print(w)
if ERRORS:
    print(f"\nErrors ({len(ERRORS)}):")
    for e in ERRORS: print(e)
    print(f"\n🔴 {len(ERRORS)} error(s) found — fix before deploying.\n")
    sys.exit(1)
else:
    print(f"\n🟢 All checks passed! Ready to deploy.\n")
    if WARNINGS:
        print(f"   ({len(WARNINGS)} warning(s) — review above)\n")
