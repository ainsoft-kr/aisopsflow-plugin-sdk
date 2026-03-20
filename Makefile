REGISTRY ?= ghcr.io
IMAGE_NAMESPACE ?= ainsoft-kr
RELEASE_ENV_FILE ?= deploy/.env.release

PLUGINS = channel-slack channel-email channel-telegram kakao-provider gmail microsoft-email microsoft-office db-query

.PHONY: build-all push-all \
	build-channel-slack push-channel-slack \
	build-channel-email push-channel-email \
	build-channel-telegram push-channel-telegram \
	build-kakao-provider push-kakao-provider \
	build-gmail push-gmail \
	build-microsoft-email push-microsoft-email \
	build-microsoft-office push-microsoft-office \
	build-db-query push-db-query

build-all: \
	build-channel-slack \
	build-channel-email \
	build-channel-telegram \
	build-kakao-provider \
	build-gmail \
	build-microsoft-email \
	build-microsoft-office \
	build-db-query

ghcr-login:
	@bash -lc 'set -a; source "$(RELEASE_ENV_FILE)"; set +a; \
		test -n "$$REGISTRY" || { echo "Missing REGISTRY in $(RELEASE_ENV_FILE)"; exit 1; }; \
		test -n "$$GHCR_USERNAME" || { echo "Missing GHCR_USERNAME in $(RELEASE_ENV_FILE)"; exit 1; }; \
		test -n "$$GHCR_TOKEN" || { echo "Missing GHCR_TOKEN in $(RELEASE_ENV_FILE)"; exit 1; }; \
		echo "$$GHCR_TOKEN" | docker login "$$REGISTRY" -u "$$GHCR_USERNAME" --password-stdin'

push-all: \
	push-channel-slack \
	push-channel-email \
	push-channel-telegram \
	push-kakao-provider \
	push-gmail \
	push-microsoft-email \
	push-microsoft-office \
	push-db-query

build-channel-slack:
	docker build -f plugins/official/channel-slack/Dockerfile -t $(REGISTRY)/$(IMAGE_NAMESPACE)/channel-slack:latest .

push-channel-slack: build-channel-slack
	docker push $(REGISTRY)/$(IMAGE_NAMESPACE)/channel-slack:latest

build-channel-email:
	docker build -f plugins/official/channel-email/Dockerfile -t $(REGISTRY)/$(IMAGE_NAMESPACE)/channel-email:latest .

push-channel-email: build-channel-email
	docker push $(REGISTRY)/$(IMAGE_NAMESPACE)/channel-email:latest

build-channel-telegram:
	docker build -f plugins/official/channel-telegram/Dockerfile -t $(REGISTRY)/$(IMAGE_NAMESPACE)/channel-telegram:latest .

push-channel-telegram: build-channel-telegram
	docker push $(REGISTRY)/$(IMAGE_NAMESPACE)/channel-telegram:latest

build-kakao-provider:
	docker build -f plugins/official/kakao-provider/Dockerfile -t $(REGISTRY)/$(IMAGE_NAMESPACE)/kakao-provider:latest .

push-kakao-provider: build-kakao-provider
	docker push $(REGISTRY)/$(IMAGE_NAMESPACE)/kakao-provider:latest

build-gmail:
	docker build -f plugins/official/gmail/Dockerfile -t $(REGISTRY)/$(IMAGE_NAMESPACE)/gmail:latest .

push-gmail: build-gmail
	docker push $(REGISTRY)/$(IMAGE_NAMESPACE)/gmail:latest

build-microsoft-email:
	docker build -f plugins/official/microsoft-email/Dockerfile -t $(REGISTRY)/$(IMAGE_NAMESPACE)/microsoft-email:latest .

push-microsoft-email: build-microsoft-email
	docker push $(REGISTRY)/$(IMAGE_NAMESPACE)/microsoft-email:latest

build-microsoft-office:
	docker build -f plugins/official/microsoft-office/Dockerfile -t $(REGISTRY)/$(IMAGE_NAMESPACE)/microsoft-office:latest .

push-microsoft-office: build-microsoft-office
	docker push $(REGISTRY)/$(IMAGE_NAMESPACE)/microsoft-office:latest

build-db-query:
	docker build -f plugins/official/db-query/Dockerfile -t $(REGISTRY)/$(IMAGE_NAMESPACE)/db-query:latest .

push-db-query: build-db-query
	docker push $(REGISTRY)/$(IMAGE_NAMESPACE)/db-query:latest
