REGISTRY ?= ghcr.io/aisopsflow

PLUGIN_DIR_channel_slack = examples/node/slack
PLUGIN_DIR_channel_email = examples/node/email
PLUGIN_DIR_channel_telegram = examples/node/telegram
PLUGIN_DIR_kakao_provider_mock = examples/node/kakao-provider-mock
PLUGIN_DIR_gmail = examples/node/gmail
PLUGIN_DIR_microsoft_email = examples/node/microsoft-email
PLUGIN_DIR_microsoft_office = examples/node/microsoft-office
PLUGIN_DIR_db_query_mock = examples/node/db-query-mock

IMAGE_channel_slack = $(REGISTRY)/channel-slack:latest
IMAGE_channel_email = $(REGISTRY)/channel-email:latest
IMAGE_channel_telegram = $(REGISTRY)/channel-telegram:latest
IMAGE_kakao_provider_mock = $(REGISTRY)/kakao-provider-mock:latest
IMAGE_gmail = $(REGISTRY)/gmail:latest
IMAGE_microsoft_email = $(REGISTRY)/microsoft-email:latest
IMAGE_microsoft_office = $(REGISTRY)/microsoft-office:latest
IMAGE_db_query_mock = $(REGISTRY)/db-query-mock:latest

PLUGINS = channel_slack channel_email channel_telegram kakao_provider_mock gmail microsoft_email microsoft_office db_query_mock

.PHONY: build-all push-all $(addprefix build-,$(PLUGINS)) $(addprefix push-,$(PLUGINS))

build-all: $(addprefix build-,$(PLUGINS))

push-all: $(addprefix push-,$(PLUGINS))

build-%:
	docker build -f $(PLUGIN_DIR_$*)/Dockerfile -t $(IMAGE_$*) .

push-%: build-%
	docker push $(IMAGE_$*)
