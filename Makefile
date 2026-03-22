REGISTRY ?= ghcr.io
IMAGE_NAMESPACE ?= ainsoft-kr/aisopsflow/plugin
RELEASE_ENV_FILE ?= deploy/.env.release
CATALOG_ENV_FILE ?= deploy/.env.catalog
GH_PACKAGE_API_SCOPE ?= orgs
CATALOG_BASE_URL ?= http://127.0.0.1:3100
CATALOG_REPO ?= ../aisopsflow-plugin-catalog
CATALOG_TOKEN ?=
CATALOG_CHANNEL ?= stable
CATALOG_PLATFORM ?= linux-amd64
CATALOG_DIST_DIR ?= .dist/catalog

-include $(CATALOG_ENV_FILE)

PLUGINS = channel-slack channel-email channel-telegram kakao-provider gmail microsoft-email microsoft-office microsoft-office-graph db-query http-client command-exec internal-approval weather-openmeteo google-news

.PHONY: \
	build-all build-all-ghcr build-all-catalog \
	push-all push-all-ghcr push-all-catalog \
	delete-all delete-all-ghcr \
	plugin ghcr-login \
	catalog-server-check catalog-publish-check \
	build-% push-% delete-% \
	build-catalog-% push-catalog-%

ghcr-login:
	@bash -lc 'set -a; source "$(RELEASE_ENV_FILE)"; set +a; \
		test -n "$$REGISTRY" || { echo "Missing REGISTRY in $(RELEASE_ENV_FILE)"; exit 1; }; \
		test -n "$$GHCR_USERNAME" || { echo "Missing GHCR_USERNAME in $(RELEASE_ENV_FILE)"; exit 1; }; \
		test -n "$$GHCR_TOKEN" || { echo "Missing GHCR_TOKEN in $(RELEASE_ENV_FILE)"; exit 1; }; \
		echo "$$GHCR_TOKEN" | docker login "$$REGISTRY" -u "$$GHCR_USERNAME" --password-stdin'

build-all: build-all-ghcr

build-all-ghcr: \
	plugin-loop-build-ghcr

build-all-catalog: \
	plugin-loop-build-catalog

push-all: push-all-ghcr

push-all-ghcr: \
	plugin-loop-push-ghcr

push-all-catalog: \
	catalog-publish-check \
	plugin-loop-push-catalog

delete-all: delete-all-ghcr

delete-all-ghcr: \
	plugin-loop-delete-ghcr

catalog-server-check:
	@curl --fail --silent --show-error "$(CATALOG_BASE_URL)/healthz" >/dev/null || { \
		echo "Catalog server appears to be down: $(CATALOG_BASE_URL)"; \
		echo "Start the server first, then retry the catalog publish target."; \
		exit 1; \
	}

catalog-publish-check: \
	catalog-server-check
	@test -n "$(CATALOG_TOKEN)" || { \
		echo "Missing CATALOG_TOKEN. Set CATALOG_TOKEN=<publish-token>."; \
		exit 1; \
	}
	@test -x "$(CATALOG_REPO)/scripts/publish-and-export.sh" || { \
		echo "Catalog publish script not found: $(CATALOG_REPO)/scripts/publish-and-export.sh"; \
		exit 1; \
	}

plugin:
	@bash -lc 'set -euo pipefail; \
		test -n "$(TARGET)" || { echo "Missing TARGET. Usage: make plugin TARGET=<plugin> CATEGORY=<channel|provider> CMD=<build|push|delete>"; exit 1; }; \
		test -n "$(CATEGORY)" || { echo "Missing CATEGORY. Usage: make plugin TARGET=<plugin> CATEGORY=<channel|provider> CMD=<build|push|delete>"; exit 1; }; \
		test -n "$(CMD)" || { echo "Missing CMD. Usage: make plugin TARGET=<plugin> CATEGORY=<channel|provider> CMD=<build|push|delete>"; exit 1; }; \
		target="$(TARGET)"; \
		category="$(CATEGORY)"; \
		cmd="$(CMD)"; \
		case " $(PLUGINS) " in \
			*" $$target "*) ;; \
			*) echo "Unknown TARGET: $$target"; exit 1 ;; \
		esac; \
		case "$$category" in \
			channel|provider) ;; \
			*) echo "Unsupported CATEGORY: $$category. Use CATEGORY=channel or CATEGORY=provider"; exit 1 ;; \
		esac; \
		case "$$target" in \
			channel-slack) expected_category="channel"; image_name="slack"; dockerfile="plugins/official/channel/slack/Dockerfile" ;; \
			channel-email) expected_category="channel"; image_name="email"; dockerfile="plugins/official/channel/email/Dockerfile" ;; \
			channel-telegram) expected_category="channel"; image_name="telegram"; dockerfile="plugins/official/channel/telegram/Dockerfile" ;; \
			kakao-provider) expected_category="channel"; image_name="kakao"; dockerfile="plugins/official/channel/kakao/Dockerfile" ;; \
			gmail) expected_category="provider"; image_name="gmail"; dockerfile="plugins/official/provider/gmail/Dockerfile" ;; \
			microsoft-email) expected_category="provider"; image_name="microsoft-email"; dockerfile="plugins/official/provider/microsoft-email/Dockerfile" ;; \
			microsoft-office) expected_category="provider"; image_name="microsoft-office"; dockerfile="plugins/official/provider/microsoft-office/Dockerfile" ;; \
			microsoft-office-graph) expected_category="provider"; image_name="microsoft-office-graph"; dockerfile="plugins/official/provider/microsoft-office-graph/Dockerfile" ;; \
			db-query) expected_category="provider"; image_name="db-query"; dockerfile="plugins/official/provider/db-query/Dockerfile" ;; \
			http-client) expected_category="provider"; image_name="http-client"; dockerfile="plugins/official/provider/http-client/Dockerfile" ;; \
			command-exec) expected_category="provider"; image_name="command-exec"; dockerfile="plugins/official/provider/command-exec/Dockerfile" ;; \
			internal-approval) expected_category="provider"; image_name="internal-approval"; dockerfile="plugins/official/provider/internal-approval/Dockerfile" ;; \
			weather-openmeteo) expected_category="provider"; image_name="weather-openmeteo"; dockerfile="plugins/official/provider/weather-openmeteo/Dockerfile" ;; \
			google-news) expected_category="provider"; image_name="google-news"; dockerfile="plugins/official/provider/google-news/Dockerfile" ;; \
			*) echo "No Dockerfile mapping for $$target"; exit 1 ;; \
		esac; \
		if [ "$$category" != "$$expected_category" ]; then \
			echo "CATEGORY mismatch for $$target: expected $$expected_category, got $$category"; \
			exit 1; \
		fi; \
		image_ref="$(REGISTRY)/$(IMAGE_NAMESPACE)/$$category/$$image_name:latest"; \
		case "$$cmd" in \
			build) \
				docker build -f "$$dockerfile" -t "$$image_ref" . ;; \
			push) \
				docker push "$$image_ref" ;; \
			delete) \
				test -n "$(VERSION)" || { echo "Missing VERSION. Usage: make plugin TARGET=<plugin> CMD=delete VERSION=<tag|all>"; exit 1; }; \
				set -a; source "$(RELEASE_ENV_FILE)"; set +a; \
				test -n "$$GHCR_TOKEN" || { echo "Missing GHCR_TOKEN in $(RELEASE_ENV_FILE)"; exit 1; }; \
				test -n "$$(command -v gh)" || { echo "Missing gh CLI"; exit 1; }; \
				version_tag="$(VERSION)"; \
				namespace="$(IMAGE_NAMESPACE)"; \
				owner="$${namespace%%/*}"; \
				prefix="$${namespace#*/}"; \
				if [ "$$prefix" = "$$namespace" ]; then \
					package_name="$$category/$$image_name"; \
				else \
					package_name="$$prefix/$$category/$$image_name"; \
				fi; \
				encoded_package="$${package_name//\//%2F}"; \
				export GH_TOKEN="$$GHCR_TOKEN"; \
				if [ "$$version_tag" = "all" ]; then \
					echo "Deleting GHCR package $$package_name"; \
					gh api -X DELETE "/$(GH_PACKAGE_API_SCOPE)/$$owner/packages/container/$$encoded_package" >/dev/null; \
					exit 0; \
				fi; \
				echo "Deleting GHCR package version tagged $$version_tag from $$package_name"; \
				version_ids="$$(gh api --paginate "/$(GH_PACKAGE_API_SCOPE)/$$owner/packages/container/$$encoded_package/versions" --jq ".[] | select((.metadata.container.tags // []) | index(\"$$version_tag\")) | .id" 2>/dev/null || true)"; \
				if [ -z "$$version_ids" ]; then \
					echo "No package version found for $$package_name with tag $$version_tag"; \
					exit 0; \
				fi; \
				for version_id in $$version_ids; do \
					echo "Deleting version $$version_id tagged $$version_tag from $$package_name"; \
					gh api -X DELETE "/$(GH_PACKAGE_API_SCOPE)/$$owner/packages/container/$$encoded_package/versions/$$version_id" >/dev/null; \
				done ;; \
			*) \
				echo "Unsupported CMD: $$cmd. Use CMD=build, CMD=push, or CMD=delete"; \
				exit 1 ;; \
		esac'

plugin-loop-build-ghcr:
	@for plugin in $(PLUGINS); do \
		case "$$plugin" in \
			channel-slack|channel-email|channel-telegram|kakao-provider) category=channel ;; \
			*) category=provider ;; \
		esac; \
		$(MAKE) plugin TARGET=$$plugin CATEGORY=$$category CMD=build; \
	done

plugin-loop-push-ghcr:
	@for plugin in $(PLUGINS); do \
		case "$$plugin" in \
			channel-slack|channel-email|channel-telegram|kakao-provider) category=channel ;; \
			*) category=provider ;; \
		esac; \
		$(MAKE) plugin TARGET=$$plugin CATEGORY=$$category CMD=push; \
	done

plugin-loop-build-catalog:
	@for plugin in $(PLUGINS); do \
		$(MAKE) build-catalog-$$plugin; \
	done

plugin-loop-push-catalog:
	@for plugin in $(PLUGINS); do \
		$(MAKE) push-catalog-$$plugin; \
	done

plugin-loop-delete-ghcr:
	@for plugin in $(PLUGINS); do \
		case "$$plugin" in \
			channel-slack|channel-email|channel-telegram|kakao-provider) category=channel ;; \
			*) category=provider ;; \
		esac; \
		$(MAKE) plugin TARGET=$$plugin CATEGORY=$$category CMD=delete VERSION=all; \
	done

build-catalog-%:
	@case "$*" in \
		channel-slack) category=channel; plugin_dir="plugins/official/channel/slack" ;; \
		channel-email) category=channel; plugin_dir="plugins/official/channel/email" ;; \
		channel-telegram) category=channel; plugin_dir="plugins/official/channel/telegram" ;; \
		kakao-provider) category=channel; plugin_dir="plugins/official/channel/kakao" ;; \
		gmail) category=provider; plugin_dir="plugins/official/provider/gmail" ;; \
		microsoft-email) category=provider; plugin_dir="plugins/official/provider/microsoft-email" ;; \
		microsoft-office) category=provider; plugin_dir="plugins/official/provider/microsoft-office" ;; \
		microsoft-office-graph) category=provider; plugin_dir="plugins/official/provider/microsoft-office-graph" ;; \
		db-query) category=provider; plugin_dir="plugins/official/provider/db-query" ;; \
		http-client) category=provider; plugin_dir="plugins/official/provider/http-client" ;; \
		command-exec) category=provider; plugin_dir="plugins/official/provider/command-exec" ;; \
		internal-approval) category=provider; plugin_dir="plugins/official/provider/internal-approval" ;; \
		weather-openmeteo) category=provider; plugin_dir="plugins/official/provider/weather-openmeteo" ;; \
		google-news) category=provider; plugin_dir="plugins/official/provider/google-news" ;; \
		*) echo "Unknown plugin target: $*"; exit 1 ;; \
	esac; \
	bundle_path="$(CATALOG_DIST_DIR)/$*.tar.gz"; \
	bash scripts/build-catalog-bundle.sh "$$plugin_dir" "$$bundle_path"

push-catalog-%:
	@$(MAKE) catalog-publish-check
	@case "$*" in \
		channel-slack) category=channel; plugin_dir="plugins/official/channel/slack" ;; \
		channel-email) category=channel; plugin_dir="plugins/official/channel/email" ;; \
		channel-telegram) category=channel; plugin_dir="plugins/official/channel/telegram" ;; \
		kakao-provider) category=channel; plugin_dir="plugins/official/channel/kakao" ;; \
		gmail) category=provider; plugin_dir="plugins/official/provider/gmail" ;; \
		microsoft-email) category=provider; plugin_dir="plugins/official/provider/microsoft-email" ;; \
		microsoft-office) category=provider; plugin_dir="plugins/official/provider/microsoft-office" ;; \
		microsoft-office-graph) category=provider; plugin_dir="plugins/official/provider/microsoft-office-graph" ;; \
		db-query) category=provider; plugin_dir="plugins/official/provider/db-query" ;; \
		http-client) category=provider; plugin_dir="plugins/official/provider/http-client" ;; \
		command-exec) category=provider; plugin_dir="plugins/official/provider/command-exec" ;; \
		internal-approval) category=provider; plugin_dir="plugins/official/provider/internal-approval" ;; \
		weather-openmeteo) category=provider; plugin_dir="plugins/official/provider/weather-openmeteo" ;; \
		google-news) category=provider; plugin_dir="plugins/official/provider/google-news" ;; \
		*) echo "Unknown plugin target: $*"; exit 1 ;; \
	esac; \
	bundle_path="$(CATALOG_DIST_DIR)/$*.tar.gz"; \
	bash scripts/build-catalog-bundle.sh "$$plugin_dir" "$$bundle_path"; \
	bash scripts/publish-catalog-plugin.sh \
		"$$plugin_dir" \
		"$$bundle_path" \
		"$(CATALOG_REPO)" \
		"$(CATALOG_BASE_URL)" \
		"$(CATALOG_TOKEN)" \
		"$(CATALOG_PLATFORM)" \
		"$(CATALOG_CHANNEL)"

build-%:
	@case "$*" in \
		channel-slack|channel-email|channel-telegram|kakao-provider) category=channel ;; \
		*) category=provider ;; \
	esac; \
	$(MAKE) plugin TARGET=$* CATEGORY=$$category CMD=build

push-%:
	@case "$*" in \
		channel-slack|channel-email|channel-telegram|kakao-provider) category=channel ;; \
		*) category=provider ;; \
	esac; \
	$(MAKE) plugin TARGET=$* CATEGORY=$$category CMD=push

delete-%:
	@case "$*" in \
		channel-slack|channel-email|channel-telegram|kakao-provider) category=channel ;; \
		*) category=provider ;; \
	esac; \
	$(MAKE) plugin TARGET=$* CATEGORY=$$category CMD=delete VERSION="$(VERSION)"
