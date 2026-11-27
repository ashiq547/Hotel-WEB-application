"""Python server launcher; prefer the project's virtual environment."""
import os
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parent
python = root / '.venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
python = str(python) if python.exists() else sys.executable
if '--init-db' in sys.argv:
    args = [str(root / 'scripts/init_db.py')]
elif '--test' in sys.argv:
    args = ['-m', 'pytest', 'tests', '-q']
else:
    args = ['-m', 'uvicorn', 'app:app', '--host', '0.0.0.0', '--port', os.getenv('PORT', '5001'), '--timeout-keep-alive', '65']
    # Load server/.env before selecting PORT, matching app.py.
    from_env = root / '.env'
    if from_env.exists() and 'PORT' not in os.environ:
        for line in from_env.read_text().splitlines():
            if line.strip().startswith('PORT='):
                args[args.index('--port') + 1] = line.split('=', 1)[1].strip().strip('"\'')
    if '--reload' in sys.argv:
        args.append('--reload')
sys.exit(subprocess.call([python, *args], cwd=root))
