import os
import sys

# Ensure repository root is available on module search path for reload subprocesses.
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

try:
    import uvicorn
except ModuleNotFoundError:
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = (
        os.path.join(backend_dir, "venv", "bin", "python"),
        os.path.join(backend_dir, "venv", "Scripts", "python.exe"),
    )
    venv_python = next((path for path in candidates if os.path.exists(path)), None)
    if venv_python and os.environ.get("_BIOTELEM_VENV_EXEC") != "1":
        os.environ["_BIOTELEM_VENV_EXEC"] = "1"
        os.execv(venv_python, [venv_python, *sys.argv])
    raise

if __name__ == "__main__":
    print("Starting Space Biotelemetry Server on http://localhost:8000")
    print("Interactive API Docs available at http://localhost:8000/docs")
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)

