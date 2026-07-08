.PHONY: test test-backend test-frontend install-dev clean build-frontend build-exe dev

# ── Development setup ────────────────────────────────────────
install-dev:
	cd backend && pip install -r requirements.txt
	cd frontend && npm install

# ── Testing ──────────────────────────────────────────────────
test-backend:
	cd backend && python -m pytest ../tests/ -v

test-frontend:
	cd frontend && npx vitest run

test: test-backend
	@echo "All tests passed"

# ── Development server ───────────────────────────────────────
dev:
	@echo "Starting Flask backend on :5000 and Vite frontend on :5173"
	cd backend && python app.py &
	cd frontend && npm run dev

# ── Build ────────────────────────────────────────────────────
build-frontend:
	cd frontend && npm run build

build-exe: build-frontend
	mkdir -p backend/static
	cp -r frontend/dist/* backend/static/
	cd backend && pyinstaller --onefile --name AIEnglishStudio app.py
	@echo "EXE built at: backend/dist/AIEnglishStudio.exe"

# ── Clean ────────────────────────────────────────────────────
clean:
	rm -rf backend/build backend/dist backend/static
	rm -rf frontend/dist frontend/node_modules
	find . -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	rm -rf backend/data/
	@echo "Clean complete."
