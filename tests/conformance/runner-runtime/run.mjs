import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

const { loadAndValidateManifest } = await import('../../../packages/js/runner-plugin-runtime/manifest.ts');
const { startRunnerPluginHost } = await import('../../../packages/js/runner-plugin-runtime/host.ts');

async function main() {
  const dbManifest = path.join(repoRoot, 'plugins/official/db-query/runner-plugin.yaml');
  const gmailManifest = path.join(repoRoot, 'plugins/official/gmail/runner-plugin.yaml');
  const exampleManifest = path.join(repoRoot, 'docs/runner-plugin-manifest-v1.example.yaml');

  await loadAndValidateManifest(exampleManifest);
  await loadAndValidateManifest(dbManifest);
  await loadAndValidateManifest(gmailManifest);

  const host = await startRunnerPluginHost({ manifestPath: dbManifest });
  try {
    const probe = await host.probe();
    assert.equal(probe.name, 'db-query');
    assert.deepEqual(probe.capabilities, ['db.read', 'db.explain']);

    if (process.env.DB_QUERY_DATASOURCES_JSON) {
      const readResult = await host.invoke('db.read', {
        datasource: 'orders-prod-ro',
        driver: 'postgres',
        statement: 'select id from orders limit 2',
        max_rows: 2
      });
      assert.equal(readResult.datasource, 'orders-prod-ro');
      assert.equal(readResult.driver, 'postgres');
      assert.equal(Array.isArray(readResult.rows), true);

      const explainResult = await host.invoke('db.explain', {
        datasource: 'orders-prod-ro',
        driver: 'postgres',
        statement: 'select id from orders limit 2',
        max_rows: 2
      });
      assert.equal(explainResult.plan.read_only, true);
    }

    await assert.rejects(
      host.invoke('db.read', {
        datasource: 'orders-prod-ro',
        driver: 'postgres',
        statement: 'delete from orders'
      }),
      /read-only|only read-only/
    );

  } finally {
    await host.close();
  }

  console.log('runner runtime conformance passed');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
