"""Generate the TRACE-X API skeleton (FastAPI) from the deployed service's openapi.json.

The deployment publishes its OpenAPI document, which fixes every route, parameter, request
body and schema. FastAPI derives operation ids from handler function names and schema names
from their defining module, so the package layout (tracex_api/routers/*.py) and handler names
are recoverable too. Handler bodies are not: they return 501 until reimplemented.

usage: python gen_api.py <openapi.json> <output dir>
"""
from __future__ import annotations

import json
import keyword
import re
import sys
from collections import defaultdict
from pathlib import Path

SPEC = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
OUT = Path(sys.argv[2])
SCHEMAS = SPEC["components"]["schemas"]
AUTH_HEADERS = {"authorization", "x-tracex-user"}
# Tags whose router module name differs from the tag (known from qualified schema names).
TAG_MODULES = {"spatial": "spatial_agent", "verification": "verify"}
HTTP_METHODS = ["get", "post", "put", "patch", "delete"]


def module_for_tag(tag: str) -> str:
    return TAG_MODULES.get(tag, tag.replace("-", "_"))


def class_name(schema_name: str) -> str:
    # tracex_api__routers__ask__AskIn -> AskIn (defined in routers/ask.py)
    return schema_name.split("__")[-1]


def schema_home(schema_name: str) -> str | None:
    m = re.match(r"tracex_api__routers__(\w+?)__\w+$", schema_name)
    return m.group(1) if m else None


def py_ident(name: str) -> str:
    ident = re.sub(r"\W", "_", name)
    return ident + "_" if keyword.iskeyword(ident) else ident


def py_type(schema: dict, refs: set[str]) -> str:
    if "$ref" in schema:
        name = schema["$ref"].split("/")[-1]
        refs.add(name)
        return class_name(name)
    if "anyOf" in schema:
        parts = [py_type(s, refs) for s in schema["anyOf"]]
        return " | ".join(dict.fromkeys(parts))
    t = schema.get("type")
    if t == "string":
        return "UploadFile" if schema.get("format") == "binary" else "str"
    if t == "integer":
        return "int"
    if t == "number":
        return "float"
    if t == "boolean":
        return "bool"
    if t == "null":
        return "None"
    if t == "array":
        return f"list[{py_type(schema.get('items', {}), refs)}]"
    if t == "object":
        extra = schema.get("additionalProperties")
        return f"dict[str, {py_type(extra, refs)}]" if isinstance(extra, dict) and extra else "dict"
    return "Any"


def py_default(value) -> str:
    return repr(value)


# ------------------------------------------------------------------------------------------
# which schemas each router uses
operations = defaultdict(list)
schema_users = defaultdict(set)
for path, methods in SPEC["paths"].items():
    for method in HTTP_METHODS:
        op = methods.get(method)
        if not op:
            continue
        module = module_for_tag((op.get("tags") or ["misc"])[0])
        operations[module].append((path, method, op))
        for ref in re.findall(r'"#/components/schemas/([^"]+)"', json.dumps(op)):
            schema_users[ref].add(module)

placement = {}
for name in SCHEMAS:
    if name in {"HTTPValidationError", "ValidationError"} or name.startswith("Body_"):
        continue
    home = schema_home(name)
    users = schema_users.get(name, set())
    placement[name] = home or (next(iter(users)) if len(users) == 1 else "schemas")


def render_model(name: str, schema: dict, refs: set[str]) -> str:
    lines = [f"class {class_name(name)}(BaseModel):"]
    required = set(schema.get("required", []))
    props = schema.get("properties", {})
    if not props:
        lines.append("    pass")
    for prop, ps in props.items():
        field = py_ident(prop)
        typ = py_type(ps, refs)
        alias = f', alias="{prop}"' if field != prop else ""
        if prop in required:
            default = "..." if not alias else f'Field(...{alias})'
        elif "default" in ps:
            default = py_default(ps["default"]) if not alias else f"Field({py_default(ps['default'])}{alias})"
        else:
            default = "None" if not alias else f"Field(None{alias})"
            if "None" not in typ:
                typ = f"{typ} | None"
        lines.append(f"    {field}: {typ} = {default}")
    return "\n".join(lines)


def write(rel: str, text: str) -> None:
    target = OUT / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text.rstrip() + "\n", encoding="utf-8")


# ------------------------------------------------------------------------------------------
# schemas.py (shared models)
shared_refs: set[str] = set()
shared = [render_model(n, SCHEMAS[n], shared_refs) for n, home in placement.items() if home == "schemas"]
write(
    "tracex_api/schemas.py",
    '"""Request/response models shared by several routers (from the deployed OpenAPI schema)."""\n'
    "from __future__ import annotations\n\nfrom typing import Any\n\nfrom pydantic import BaseModel, Field\n\n\n"
    + "\n\n\n".join(shared),
)

write(
    "tracex_api/auth.py",
    '''"""Caller identity.

Every deployed endpoint accepts `Authorization` and `X-Tracex-User` headers; the web client sends
`Authorization: Bearer <role>` (see frontend/src/lib/identity.js). How the service validated them
is not recoverable from the deployment.
"""
from __future__ import annotations

from fastapi import Header


def current_user(
    authorization: str | None = Header(None),
    x_tracex_user: str | None = Header(None),
) -> str:
    if x_tracex_user:
        return x_tracex_user
    if authorization and authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1]
    return "investigator"
''',
)

write(
    "tracex_api/not_recovered.py",
    '''from fastapi import HTTPException


def not_recovered(operation_id: str) -> HTTPException:
    """Handler logic was not recoverable from the deployment; see api/README.md."""
    return HTTPException(status_code=501, detail=f"{operation_id}: server logic not recovered")
''',
)

# ------------------------------------------------------------------------------------------
router_modules = []
for module, ops in sorted(operations.items()):
    tag = (ops[0][2].get("tags") or [module])[0]
    refs: set[str] = set()
    local_models = [render_model(n, SCHEMAS[n], refs) for n, home in placement.items() if home == module]
    handlers = []
    for path, method, op in ops:
        op_id = op["operationId"]
        suffix = re.sub(r"\W", "_", path) + "_" + method
        func = op_id[: -len(suffix)] if op_id.endswith(suffix) else op_id
        params = []
        uses_auth = False
        for p in op.get("parameters", []):
            if p["in"] == "header" and p["name"].lower() in AUTH_HEADERS:
                uses_auth = True
                continue
            name = py_ident(p["name"])
            typ = py_type(p.get("schema", {}), refs)
            kind = {"path": "Path", "query": "Query", "header": "Header"}[p["in"]]
            schema = p.get("schema", {})
            alias = f', alias="{p["name"]}"' if name != p["name"] and p["in"] != "header" else ""
            if p.get("required"):
                params.append((0, f"{name}: {typ} = {kind}(...{alias})"))
            else:
                default = py_default(schema["default"]) if "default" in schema else "None"
                if default == "None" and "None" not in typ:
                    typ = f"{typ} | None"
                params.append((1, f"{name}: {typ} = {kind}({default}{alias})"))
        body = op.get("requestBody")
        if body:
            content = body.get("content", {})
            if "multipart/form-data" in content:
                form_schema = SCHEMAS[content["multipart/form-data"]["schema"]["$ref"].split("/")[-1]]
                req = set(form_schema.get("required", []))
                for prop, ps in form_schema["properties"].items():
                    typ = py_type(ps, refs)
                    kind = "File" if typ == "UploadFile" else "Form"
                    if prop in req:
                        params.append((0, f"{py_ident(prop)}: {typ} = {kind}(...)"))
                    else:
                        default = py_default(ps["default"]) if "default" in ps else "None"
                        if default == "None" and "None" not in typ:
                            typ = f"{typ} | None"
                        params.append((1, f"{py_ident(prop)}: {typ} = {kind}({default})"))
            else:
                schema = next(iter(content.values()))["schema"]
                typ = py_type(schema, refs)
                if body.get("required"):
                    params.append((0, f"body: {typ} = Body(...)"))
                else:
                    params.append((1, f"body: {typ} | None = Body(None)"))
        if uses_auth:
            params.append((1, "user: str = Depends(current_user)"))
        params.sort(key=lambda x: x[0])
        ok = op.get("responses", {}).get("200") or op.get("responses", {}).get("201") or {}
        resp_schema = ok.get("content", {}).get("application/json", {}).get("schema", {})
        response_model = ""
        if resp_schema and resp_schema != {}:
            rt = py_type(resp_schema, refs)
            if rt not in {"Any", "dict"}:
                response_model = f", response_model={rt}"
        status = ", status_code=201" if "201" in op.get("responses", {}) else ""
        media = ok.get("content", {})
        response_class = ", response_class=PlainTextResponse" if "text/plain" in media else ""
        decorator = f'@router.{method}("{path}"{response_model}{status}{response_class}, summary="{op.get("summary", "")}")'
        doc = op.get("description", "").strip().replace('"""', "'''")
        signature = ",\n    ".join(p for _, p in params)
        handlers.append(
            f"{decorator}\n"
            f"def {func}(\n    {signature}\n){'' if not params else ''}:\n"
            + (f'    """{doc}"""\n' if doc else "")
            + f'    raise not_recovered("{op_id}")\n'
        )
    shared_imports = sorted(class_name(r) for r in refs if placement.get(r) == "schemas")
    has_upload = any("UploadFile" in h for h in handlers)
    imports = ["from __future__ import annotations", "", "from typing import Any", ""]
    fastapi_names = {"APIRouter", "Body", "Depends", "Path", "Query", "Header", "Form", "File"}
    if has_upload:
        fastapi_names.add("UploadFile")
    imports.append(f"from fastapi import {', '.join(sorted(fastapi_names))}")
    if any("PlainTextResponse" in h for h in handlers):
        imports.append("from fastapi.responses import PlainTextResponse")
    imports.append("from pydantic import BaseModel, Field")
    imports.append("")
    imports.append("from tracex_api.auth import current_user")
    imports.append("from tracex_api.not_recovered import not_recovered")
    if shared_imports:
        imports.append(f"from tracex_api.schemas import {', '.join(shared_imports)}")
    text = (
        f'"""Routes tagged "{tag}" (recovered interface; handler logic not recovered)."""\n'
        + "\n".join(imports)
        + f'\n\nrouter = APIRouter(tags=["{tag}"])\n\n\n'
        + ("\n\n\n".join(local_models) + "\n\n\n" if local_models else "")
        + "\n\n".join(handlers)
    )
    write(f"tracex_api/routers/{module}.py", text)
    router_modules.append(module)

write("tracex_api/__init__.py", "")
write("tracex_api/routers/__init__.py", "")
write(
    "tracex_api/main.py",
    f'''"""TRACE-X API application (interface recovered from the deployed OpenAPI document)."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from tracex_api.routers import {", ".join(router_modules)}

app = FastAPI(title="{SPEC["info"]["title"]}", version="{SPEC["info"]["version"]}")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in ({", ".join(router_modules)},):
    app.include_router(module.router)
''',
)
print(f"routers: {len(router_modules)}, operations: {sum(len(v) for v in operations.values())}, models: {len(placement)}")
