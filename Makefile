REGISTRY ?= ghcr.io
IMAGE_NAMESPACE ?= ainsoft-kr
RELEASE_ENV_FILE ?= deploy/.env.release

PLUGINS = channel-slack channel-email channel-telegram kakao-provider-mock gmail microsoft-email microsoft-office db-query-mock

.PHONY: build-all push-all \
	build-channel-slack push-channel-slack \
	build-channel-email push-channel-email \
	build-channel-telegram push-channel-telegram \
	build-kakao-provider-mock push-kakao-provider-mock \
	build-gmail push-gmail \
	build-microsoft-email push-microsoft-email \
	build-microsoft-office push-microsoft-office \
	build-db-query-mock push-db-query-mock

build-all: \
	build-channel-slack \
	build-channel-email \
	build-channel-telegram \
	build-kakao-provider-mock \
	build-gmail \
	build-microsoft-email \
	build-microsoft-office \
	build-db-query-mock

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
	push-kakao-provider-mock \
	push-gmail \
	push-microsoft-email \
	push-microsoft-office \
	push-db-query-mock

build-channel-slack:
	docker build -f examples/node/slack/Dockerfile -t $(REGISTRY)/$(IMAGE_NAMESPACE)/channel-slack:latest .

push-channel-slack: build-channel-slack
	docker push $(REGISTRY)/$(IMAGE_NAMESPACE)/channel-slack:latest

build-channel-email:
	docker build -f examples/node/email/Dockerfile -t $(REGISTRY)/$(IMAGE_NAMESPACE)/channel-email:latest .

push-channel-email: build-channel-email
	docker push $(REGISTRY)/$(IMAGE_NAMESPACE)/channel-email:latest

build-channel-telegram:
	docker build -f examples/node/telegram/Dockerfile -t $(REGISTRY)/$(IMAGE_NAMESPACE)/channel-telegram:latest .

push-channel-telegram: build-channel-telegram
	docker push $(REGISTRY)/$(IMAGE_NAMESPACE)/channel-telegram:latest

build-kakao-provider-mock:
	docker build -f examples/node/kakao-provider-mock/Dockerfile -t $(REGISTRY)/$(IMAGE_NAMESPACE)/kakao-provider-mock:latest .

push-kakao-provider-mock: build-kakao-provider-mock
	docker push $(REGISTRY)/$(IMAGE_NAMESPACE)/kakao-provider-mock:latest

build-gmail:
	docker build -f examples/node/gmail/Dockerfile -t $(REGISTRY)/$(IMAGE_NAMESPACE)/gmail:latest .

push-gmail: build-gmail
	docker push $(REGISTRY)/$(IMAGE_NAMESPACE)/gmail:latest

build-microsoft-email:
	docker build -f examples/node/microsoft-email/Dockerfile -t $(REGISTRY)/$(IMAGE_NAMESPACE)/microsoft-email:latest .

push-microsoft-email: build-microsoft-email
	docker push $(REGISTRY)/$(IMAGE_NAMESPACE)/microsoft-email:latest

build-microsoft-office:
	docker build -f examples/node/microsoft-office/Dockerfile -t $(REGISTRY)/$(IMAGE_NAMESPACE)/microsoft-office:latest .

push-microsoft-office: build-microsoft-office
	docker push $(REGISTRY)/$(IMAGE_NAMESPACE)/microsoft-office:latest

build-db-query-mock:
	docker build -f examples/node/db-query-mock/Dockerfile -t $(REGISTRY)/$(IMAGE_NAMESPACE)/db-query-mock:latest .

push-db-query-mock: build-db-query-mock
	docker push $(REGISTRY)/$(IMAGE_NAMESPACE)/db-query-mock:latest
