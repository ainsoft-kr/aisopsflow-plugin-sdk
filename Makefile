REGISTRY ?= ghcr.io/aisopsflow

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
	docker build -f examples/node/slack/Dockerfile -t $(REGISTRY)/channel-slack:latest .

push-channel-slack: build-channel-slack
	docker push $(REGISTRY)/channel-slack:latest

build-channel-email:
	docker build -f examples/node/email/Dockerfile -t $(REGISTRY)/channel-email:latest .

push-channel-email: build-channel-email
	docker push $(REGISTRY)/channel-email:latest

build-channel-telegram:
	docker build -f examples/node/telegram/Dockerfile -t $(REGISTRY)/channel-telegram:latest .

push-channel-telegram: build-channel-telegram
	docker push $(REGISTRY)/channel-telegram:latest

build-kakao-provider-mock:
	docker build -f examples/node/kakao-provider-mock/Dockerfile -t $(REGISTRY)/kakao-provider-mock:latest .

push-kakao-provider-mock: build-kakao-provider-mock
	docker push $(REGISTRY)/kakao-provider-mock:latest

build-gmail:
	docker build -f examples/node/gmail/Dockerfile -t $(REGISTRY)/gmail:latest .

push-gmail: build-gmail
	docker push $(REGISTRY)/gmail:latest

build-microsoft-email:
	docker build -f examples/node/microsoft-email/Dockerfile -t $(REGISTRY)/microsoft-email:latest .

push-microsoft-email: build-microsoft-email
	docker push $(REGISTRY)/microsoft-email:latest

build-microsoft-office:
	docker build -f examples/node/microsoft-office/Dockerfile -t $(REGISTRY)/microsoft-office:latest .

push-microsoft-office: build-microsoft-office
	docker push $(REGISTRY)/microsoft-office:latest

build-db-query-mock:
	docker build -f examples/node/db-query-mock/Dockerfile -t $(REGISTRY)/db-query-mock:latest .

push-db-query-mock: build-db-query-mock
	docker push $(REGISTRY)/db-query-mock:latest
