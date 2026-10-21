import 'dotenv/config';
import { configFromEnv, createApp, lanUrls } from './server/app.ts';
import { githubInfo } from './server/githubStorage.ts';

const PORT = Number(process.env.PORT) || 3000;

async function main() {
  const cfg = configFromEnv();
  const { app, corpus } = await createApp(cfg);

  const server = app.listen(PORT, '0.0.0.0', () => {
    const gh = githubInfo();
    console.log(`LARES Lexicon → http://localhost:${PORT}  (${cfg.production ? 'production' : 'development'})`);
    lanUrls(PORT).forEach((u) => console.log(`  rete locale (telefono sulla stessa Wi-Fi): ${u}`));
    console.log(`  dati:   ${cfg.dataDir} (${corpus.list().length} file)`);
    console.log(`  editor: ${cfg.editorToken ? 'protetto da EDITOR_TOKEN' : cfg.production ? 'DISATTIVATO (manca EDITOR_TOKEN)' : 'aperto (solo sviluppo)'}`);
    console.log(`  github: ${gh.configured ? `${gh.repo}@${gh.branch}/${gh.dataPath} (${gh.canWrite ? 'lettura/scrittura' : 'sola lettura'})` : 'non configurato (solo disco locale)'}`);
  });

  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
