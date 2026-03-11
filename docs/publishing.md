# Publishing Plugins

This repository is for plugin authors.

- AisOpsFlow Core and Runner images are published only from the private enterprise repository.
- Community and partner plugins are published by their owners from their own repositories or build pipelines.
- The Dockerfiles in `examples/node/` are reference packaging examples only.

## Recommended flow

1. build an OCI image
2. sign the image
3. publish by digest
4. provide a plugin manifest to the catalog repo
5. run the conformance test suite

   ```bash
   scripts/run-conformance.sh
   ```

## Recommended manifest fields

- `api_version`
- `name`
- `publisher`
- `plugin_version`
- `image`
- `compatibility`
- `capabilities`
- `security`

## Do not

- publish mutable tags as the source of truth
- skip internal auth verification
- depend on private Core implementation details
