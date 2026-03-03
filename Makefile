.PHONY: up down build index query status health clean

up:
	docker compose up -d

down:
	docker compose down

build:
	docker compose build

index:
	npx tsx src/cli/index.ts index

index-full:
	npx tsx src/cli/index.ts index --full

query:
	@test -n "$(Q)" || (echo "Usage: make query Q='search text'" && exit 1)
	npx tsx src/cli/index.ts query "$(Q)"

status:
	npx tsx src/cli/index.ts status

health:
	npx tsx src/cli/index.ts health

clean:
	docker compose down -v
