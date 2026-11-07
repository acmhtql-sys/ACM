#!/usr/bin/env python3
"""Isolated D8 RC5 merge resolution. Never executes SQL or deploys."""
import json, pathlib, subprocess
R=pathlib.Path.cwd()
C={
"apps/api/package.json","apps/api/src/middleware/auth.ts",
"apps/api/src/modules/borrow/borrow.router.ts",
"apps/api/src/modules/borrow/borrow.service.ts",
"apps/api/src/modules/categories/categories.router.ts",
"apps/api/tests/borrow.return.unit.test.ts",
"apps/web/src/pages/BorrowReturnPage.tsx",
"package.json","packages/shared/src/validators.ts",
}
def sh(*args): return subprocess.check_output(["git",*args],text=True).strip()
def rd(p): return (R/p).read_text(encoding="utf-8")
def wr(p,s): (R/p).write_text(s,encoding="utf-8")
def exactly(s,old,new,where):
  n=s.count(old)
  if n!=1: raise ValueError(f"{where}: expected one anchor, got {n}")
  return s.replace(old,new,1)
conflicts=set(sh("diff","--name-only","--diff-filter=U").splitlines())
if conflicts!=C: raise SystemExit("D8_UNEXPECTED_CONFLICTS: "+repr(sorted(conflicts^C)))
for p in sorted(C):
  subprocess.run(["git","checkout","--ours","--",p],check=True)
  subprocess.run(["git","add","--",p],check=True)
print("D8_EXACT_RC5_CONFLICTS=",len(C))
root=json.loads(rd("package.json"))
root["overrides"]={**root.get("overrides",{}),"body-parser":"1.20.9",
  "follow-redirects":"1.16.2","qs":"6.16.2","postcss-selector-parser":"6.1.5"}
wr("package.json",json.dumps(root,indent=2,ensure_ascii=False)+"\n")
api=json.loads(rd("apps/api/package.json"))
api["dependencies"]["zod"]="4.6.7";api["devDependencies"]["vitest"]="4.1.12"
wr("apps/api/package.json",json.dumps(api,indent=2,ensure_ascii=False)+"\n")
shp=json.loads(rd("packages/shared/package.json"))
shp["dependencies"]["zod"]="4.6.7";shp["devDependencies"]["vitest"]="4.1.12"
shp["scripts"]["test"]="vitest run src";shp["scripts"]["test:unit"]="vitest run src"
wr("packages/shared/package.json",json.dumps(shp,indent=2,ensure_ascii=False)+"\n")
web=json.loads(rd("apps/web/package.json"))
web["dependencies"]["zod"]="4.6.7"
web["devDependencies"]["vite"]="7.3.7"
web["devDependencies"]["@vitejs/plugin-react"]="5.2.0"
wr("apps/web/package.json",json.dumps(web,indent=2,ensure_ascii=False)+"\n")

# Keep complete RC5 category, stock, borrow and kit validators. Zod4 only
# changes metadata arguments, issues arrays and UUID-shaped value semantics.
p="packages/shared/src/validators.ts";s=rd(p)
if s.count("required_error")!=10 or s.count("invalid_type_error")!=1 or s.count("export const ")<40:
  raise SystemExit("D8_VALIDATOR_RC5_BASELINE_CHANGED")
s=s.replace("required_error:","error:").replace("invalid_type_error:","error:")
s=s.replace(".uuid(", ".guid(")
wr(p,s)
issues=[]
for folder in ("apps/api/src","apps/api/tests","apps/web/src","packages/shared/src"):
  for ext in ("*.ts","*.tsx"):
    for q in (R/folder).rglob(ext):
      before=q.read_text(encoding="utf-8")
      after=before.replace(".error.errors",".error.issues")
      if after!=before: q.write_text(after,encoding="utf-8"); issues.append(str(q.relative_to(R)))
print("D8_ZOD4_ERROR_ISSUE_FILES",issues)

# Preserve stronger RC5 security and advanced return UX, never use the
# simplified parallel return-status protocol from PR #46.
auth=rd("apps/api/src/middleware/auth.ts")
router=rd("apps/api/src/modules/borrow/borrow.router.ts")
cat=rd("apps/api/src/modules/categories/categories.router.ts")
ui=rd("apps/web/src/pages/BorrowReturnPage.tsx")
if not all(("verifyPasswordTag" in auth,"computePasswordTag" in auth,
  "requireIdempotencyKey" in router,"return-status/:key" in router,
  len(cat.splitlines())>=130,len(ui.splitlines())>900,"return-status" in ui)):
  raise SystemExit("D8_RC5_SECURITY_OR_FEATURE_LOSS")
print("D8_RC5_AUTH_RETURN_CATEGORIES_KITS_UI_PRESERVED")

# Add row locks to RC5 existing atomic/idempotent RETURN transaction.
p="apps/api/src/modules/borrow/borrow.service.ts";s=rd(p)
i=s.index("  async returnBorrowRequest(")
j=s.index("  async listBorrowRequests(",i)
a=s[i:j]
a=exactly(a,"      const req = await tx.borrowRequest.findUnique({",
  "      // D8-P0: serialize a BorrowRequest BEFORE reading returnedQuantity.\n"
  "      await tx.$queryRaw`SELECT \"id\" FROM \"borrow_requests\"\n"
  "        WHERE \"id\" = ${id}::uuid FOR UPDATE`;\n"
  "      const req = await tx.borrowRequest.findUnique({","borrow request lock")
a=exactly(a,"        const bal = await tx.stockBalance.findUnique({",
  "        // D8-P0: source balance lock protects onHandBefore and borrowed.\n"
  "        await tx.$queryRaw`SELECT \"id\" FROM \"stock_balances\"\n"
  "          WHERE \"itemId\" = ${detail.itemId}::uuid\n"
  "          AND \"locationId\" = ${destinationLocationId}::uuid FOR UPDATE`;\n"
  "        const bal = await tx.stockBalance.findUnique({","source balance lock")
if "Chưa hỗ trợ trả linh kiện sang kho khác" not in a or "idempotencyRecord.update" not in a:
  raise SystemExit("D8_RC5_RETURN_POLICY_LOST")
wr(p,s[:i]+a+s[j:])

for p,anchor in (
  ("apps/api/tests/borrow.return.unit.test.ts","  const mockTx = {\n"),
  ("apps/api/tests/borrow.return.idempotency.phase11d.unit.test.ts","  const tx = {\n")):
  wr(p,exactly(rd(p),anchor,anchor+"    $queryRaw: vi.fn(),\n",p+" mocked row lock"))

# Existing RC5 only permits same-warehouse returns until explicit business
# approval. Do not run candidate's A->B integration fixture as if accepted.
print("D8_RETURN_CROSS_LOCATION_POLICY=DENY_409")
p=".github/workflows/p3g-mock-browser-e2e.yml"
if (R/p).exists():
  a=rd(p)
  anchor="      - codex/d8-p0-safe-return-ledger-20261107"
  if anchor in a and "      - codex/cloud-staging-p2e-readonly-deploy-20261107" not in a:
    wr(p,a.replace(anchor,anchor+"\n      - codex/cloud-staging-p2e-readonly-deploy-20261107"))
print("D8_VALIDATOR_EXPORTS",rd("packages/shared/src/validators.ts").count("export const "))
print("D8_READY_FOR_ISOLATED_BUILDS=YES")
