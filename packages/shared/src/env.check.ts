import { env } from './env.ts';

console.log('--- PokeSearch Shared Env Check ---');
console.log('NODE_ENV:', env.NODE_ENV);
console.log('LOG_LEVEL:', env.LOG_LEVEL);
console.log('API_PORT:', env.API_PORT);
console.log('WEB_PORT:', env.WEB_PORT);
console.log('SCHEDULER_ENABLED:', env.SCHEDULER_ENABLED);
console.log('DATA_DIR:', env.DATA_DIR);
console.log('DATABASE_PATH:', env.DATABASE_PATH);
console.log('RAW_CACHE_DIR:', env.RAW_CACHE_DIR);
console.log('CARGO_TARGET_DIR:', env.CARGO_TARGET_DIR);
console.log('ENGINE_BIN:', env.ENGINE_BIN);
console.log('All artifact boundaries successfully validated outside repo and OneDrive.');
