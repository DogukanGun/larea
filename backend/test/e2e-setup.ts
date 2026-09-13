// Loads .env.test before any module reads the environment.
process.loadEnvFile(new URL('../.env.test', import.meta.url).pathname);
