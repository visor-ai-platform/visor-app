# visor-app

FastAPI service + Web UI. Entrypoint for users. Submits jobs to `visor-agent`,
forwards validated DAGs to `visor-exec`, streams status via SSE.

See `../DESIGN.md` §4.1, §6.1.
