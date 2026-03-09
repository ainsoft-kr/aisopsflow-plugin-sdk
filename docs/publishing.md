# Publishing Plugins

## Recommended flow

1. build an OCI image
2. sign the image
3. publish by digest
4. provide a plugin manifest to the catalog repo
5. run the conformance test suite

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
